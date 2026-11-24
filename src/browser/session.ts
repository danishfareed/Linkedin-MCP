import { existsSync, mkdirSync } from "node:fs";
import { type BrowserContext, type Page, type Request, type Response, chromium } from "patchright";
import type { Config } from "../config.js";
import { LinkedInMcpError, networkError, notLoggedIn, rateLimited } from "../errors.js";
import { readPageSignals, waitForAny } from "../linkedin/dom.js";
import type { AuditLog } from "../safety/audit.js";
import {
  type CircuitBreaker,
  RATE_LIMIT_COOLDOWN_S,
  type ThrottleHit,
  checkpointError,
  classifyPage,
  isLinkedInUrl,
  isRedirectLoop,
  throttleFromResponse,
} from "../safety/guard.js";
import type { Limits } from "../safety/limits.js";
import { localLocale, localTimeZone } from "../util/time.js";
import { Deadline, deadlineExceeded, runWithDeadline } from "./deadline.js";
import type { Pacer } from "./human.js";
import { bundledChromiumVersion, channelExecutablePath } from "./patchright.js";
import { browserTooOld, clearStaleProfileLock, executableVersion, isOlderMajor, profileBrowserVersion, recordBrowserVersion } from "./profile.js";

export interface SessionDeps {
  config: Config;
  breaker: CircuitBreaker;
  limits: Limits;
  audit: AuditLog;
  pacer: Pacer;
}

const INSTALL_HINT = "Install Google Chrome (https://www.google.com/chrome/), or run `npx @danishfareed/linkedin-mcp install-browser`, then try again.";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isMissingBrowser(msg: string): boolean {
  return /Executable doesn't exist|is not found|not installed|Chromium distribution/i.test(msg);
}

function launchError(err: unknown): LinkedInMcpError {
  if (err instanceof LinkedInMcpError) return err;
  const msg = errorMessage(err);
  if (/ProcessSingleton|SingletonLock|user data directory is already in use|profile .* in use/i.test(msg)) {
    return new LinkedInMcpError(
      "BROWSER_UNAVAILABLE",
      "The LinkedIn browser profile is already open in another process (another MCP client, or a login window).",
      "Close the other window or MCP client that is using linkedin-mcp, then try again.",
    );
  }
  if (isMissingBrowser(msg)) {
    return new LinkedInMcpError("BROWSER_UNAVAILABLE", "No usable browser was found. linkedin-mcp uses Google Chrome when installed, otherwise its own Chromium.", INSTALL_HINT);
  }
  return new LinkedInMcpError("BROWSER_UNAVAILABLE", `Could not start the browser: ${msg.split("\n")[0]}`, "Run `npx @danishfareed/linkedin-mcp doctor` for details.");
}

export interface LaunchAttempt {
  /** "chrome", "chromium", "msedge", or "custom" for an explicit executable path. */
  channel: string;
  executablePath?: string;
}

/**
 * Which browsers to try, in order. The bundled fallback names the "chromium"
 * channel on purpose: without a channel, Patchright starts its stripped-down
 * headless shell for headless launches but full Chromium for the visible
 * login window, so a session would be created in one browser and used in
 * another (the shell also skips Chromium's own profile lock).
 */
export function launchAttempts(config: Config): LaunchAttempt[] {
  if (config.browser.executablePath) return [{ channel: "custom", executablePath: config.browser.executablePath }];
  switch (config.browser.channel) {
    case "auto":
      return [{ channel: "chrome" }, { channel: "chromium" }];
    case "chromium":
      return [{ channel: "chromium" }];
    default:
      return [{ channel: config.browser.channel }];
  }
}

/** The version a launch attempt would start, found without starting it. Null when unknown. */
async function versionBeforeLaunch(attempt: LaunchAttempt): Promise<string | null> {
  if (attempt.channel === "chromium") return bundledChromiumVersion();
  const exe = attempt.executablePath ?? channelExecutablePath(attempt.channel);
  return exe && existsSync(exe) ? executableVersion(exe) : null;
}

export interface BrowserInfo {
  channel: string;
  version: string | null;
  executablePath?: string;
}

export interface LaunchedBrowser extends BrowserInfo {
  context: BrowserContext;
}

/**
 * Launch the persistent profile. Uses installed Chrome when present, else
 * Patchright's Chromium. Before launching it clears a lock left by a crashed
 * browser and refuses a browser older than the one that last used the profile.
 */
export async function launchBrowser(config: Config, opts: { headless: boolean }): Promise<LaunchedBrowser> {
  const profile = config.paths.profile;
  mkdirSync(profile, { recursive: true, mode: 0o700 });
  if ((await clearStaleProfileLock(profile)) === "removed") {
    console.error("linkedin-mcp: removed a browser profile lock left behind by a browser that had stopped.");
  }
  const profileVersion = await profileBrowserVersion(config.paths);
  const base = {
    headless: opts.headless,
    viewport: opts.headless ? config.browser.viewport : null,
    locale: localLocale(),
    timezoneId: localTimeZone(),
  } as const;

  let lastErr: unknown;
  let tooOld: LinkedInMcpError | null = null;
  for (const attempt of launchAttempts(config)) {
    if (profileVersion) {
      const expected = await versionBeforeLaunch(attempt);
      if (expected && isOlderMajor(expected, profileVersion)) {
        tooOld ??= browserTooOld(expected, profileVersion, attempt.channel);
        continue;
      }
    }
    let context: BrowserContext;
    try {
      context = await chromium.launchPersistentContext(profile, {
        ...base,
        ...(attempt.executablePath ? { executablePath: attempt.executablePath } : { channel: attempt.channel }),
      });
    } catch (err) {
      lastErr = err;
      // Only fall through to the next option when the browser itself is missing.
      if (!isMissingBrowser(errorMessage(err))) break;
      continue;
    }
    const version = context.browser()?.version() ?? null;
    if (profileVersion && version && isOlderMajor(version, profileVersion)) {
      // The version couldn't be read before launch. Close before LinkedIn is opened.
      await context.close().catch(() => undefined);
      tooOld ??= browserTooOld(version, profileVersion, attempt.channel);
      continue;
    }
    if (version) await recordBrowserVersion(config.paths, version, attempt.channel).catch(() => undefined);
    return { context, channel: attempt.channel, version, ...(attempt.executablePath ? { executablePath: attempt.executablePath } : {}) };
  }
  if (tooOld && (lastErr === undefined || isMissingBrowser(errorMessage(lastErr)))) throw tooOld;
  throw launchError(lastErr);
}

/** Launch the persistent profile and return just the context. */
export async function launchContext(config: Config, opts: { headless: boolean }): Promise<BrowserContext> {
  return (await launchBrowser(config, opts)).context;
}

export async function hasSessionCookie(context: BrowserContext): Promise<boolean> {
  const cookies = await context.cookies("https://www.linkedin.com");
  return cookies.some((c) => c.name === "li_at" && c.value.length > 0 && (c.expires === -1 || c.expires * 1000 > Date.now()));
}

/** What the page listeners saw during the current call. */
export interface PageWatch {
  /** LinkedIn answered a main-frame document with 429/999, or looped redirects. */
  throttle: ThrottleHit | null;
  /** The tab crashed or the browser went away mid-call. */
  lost: "crash" | "disconnected" | null;
}

function noteResponse(watch: PageWatch, res: Response): void {
  const hit = throttleFromResponse({ status: res.status(), url: res.url(), retryAfter: res.headers()["retry-after"] }, new Date());
  if (hit) watch.throttle = hit;
}

function noteRedirectLoop(watch: PageWatch, url: string): void {
  if (isLinkedInUrl(url)) watch.throttle ??= { status: null, url, retryAfterSeconds: RATE_LIMIT_COOLDOWN_S };
}

/** Trips the breaker for the throttling cooldown, logs it, and returns the error to throw. */
async function recordThrottle(deps: SessionDeps, watch: PageWatch): Promise<LinkedInMcpError> {
  const hit = watch.throttle!;
  watch.throttle = null;
  const cause = hit.status === null ? "redirect loop" : `HTTP ${hit.status}`;
  await deps.breaker.tripRateLimited(hit.retryAfterSeconds, { url: hit.url, note: cause });
  await deps.audit.record({ tool: "guard", target: hit.url, text_hash: null, result: "guard_tripped", detail: `rate_limited (${cause})` });
  return rateLimited(hit.retryAfterSeconds, { url: hit.url, cause });
}

function browserLost(kind: "crash" | "disconnected"): LinkedInMcpError {
  return new LinkedInMcpError(
    "BROWSER_UNAVAILABLE",
    kind === "crash"
      ? "The LinkedIn tab crashed during this call. linkedin-mcp closed the browser and starts a fresh one on the next call."
      : "The browser closed during this call. linkedin-mcp starts a fresh one on the next call.",
    "Try again. If this was a post, comment or message, check LinkedIn first to see whether it went through.",
    { reason: kind },
  );
}

function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || /Timeout \d+ms exceeded/i.test(err.message));
}

/**
 * What page objects get: the page, plus guarded navigation. Every navigation
 * counts as a page load, pauses like a person would, and runs the guard.
 * `deadline` is this call's time budget; check it before slow steps.
 */
export class Nav {
  /** Pacing bound to this call's deadline. */
  readonly pacer: Pacer;

  constructor(
    readonly page: Page,
    private readonly deps: SessionDeps,
    readonly deadline: Deadline = Deadline.unlimited(),
    private readonly watch: PageWatch = { throttle: null, lost: null },
  ) {
    this.pacer = deps.pacer.withDeadline(deadline);
  }

  async goto(url: string, opts: { waitFor?: readonly string[]; timeout?: number } = {}): Promise<void> {
    this.deadline.check("navigation");
    await this.deps.breaker.assertClosed();
    await this.deps.limits.consume("page_load");
    try {
      const response = await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: this.budgeted(opts.timeout ?? 45_000) });
      if (response) noteResponse(this.watch, response);
    } catch (err) {
      if (isRedirectLoop(errorMessage(err))) noteRedirectLoop(this.watch, url);
      await this.throwIfThrottled();
      if (isTimeoutError(err) && this.deadline.expired()) throw deadlineExceeded("navigation", this.deadline.budgetMs);
      throw err;
    }
    await this.throwIfThrottled();
    let paused: unknown = null;
    try {
      await this.pacer.afterNavigation();
    } catch (err) {
      paused = err;
    }
    // A checkpoint matters more than running out of time, so the guard always runs.
    await this.guard();
    if (paused) throw paused;
    if (opts.waitFor) {
      this.deadline.check("page_wait");
      const found = await waitForAny(this.page, opts.waitFor, this.budgeted(15_000, 1));
      // A wait cut short by the budget is a timeout, not a missing element.
      if (!found) this.deadline.check("page_wait");
    }
  }

  /**
   * Checks the current page. Throttling and challenges trip the breaker and
   * throw; landing on another site (a Wi-Fi sign-in page, say) throws NETWORK
   * without pausing anything.
   */
  async guard(): Promise<void> {
    await this.throwIfThrottled();
    const signals = await readPageSignals(this.page);
    const verdict = classifyPage(signals);
    if (verdict === "ok") return;
    if (verdict === "offsite") throw networkError("offsite", { url: signals.url });
    await this.deps.breaker.trip(verdict, { url: signals.url });
    await this.deps.audit.record({ tool: "guard", target: signals.url, text_hash: null, result: "guard_tripped", detail: verdict });
    throw checkpointError(verdict, signals.url);
  }

  /** Throws NOT_LOGGED_IN without navigating if the session cookie is missing. */
  async requireSessionCookie(): Promise<void> {
    if (!(await hasSessionCookie(this.page.context()))) throw notLoggedIn();
  }

  private async throwIfThrottled(): Promise<void> {
    if (this.watch.throttle) throw await recordThrottle(this.deps, this.watch);
  }

  /** A Playwright timeout that fits in the remaining budget (never 0, which means "no timeout"). */
  private budgeted(ms: number, floor = 1000): number {
    return Math.max(floor, Math.round(this.deadline.clamp(ms)));
  }
}

/**
 * One browser per process. Tool calls run one at a time through a queue, so
 * LinkedIn sees a single person, not parallel tabs. The browser closes after
 * the idle timeout, or when the tab crashes or the browser dies, and
 * relaunches on the next call.
 */
export class BrowserSession {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private info: BrowserInfo | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private idleTimer: NodeJS.Timeout | null = null;
  private launching: Promise<Page> | null = null;
  private readonly watched = new WeakSet<Page>();
  private readonly watch: PageWatch = { throttle: null, lost: null };

  constructor(
    private readonly deps: SessionDeps,
    private readonly launch: typeof launchBrowser = launchBrowser,
  ) {}

  /**
   * Run `fn` with exclusive use of the browser, within a time budget of
   * `config.toolTimeoutMs` that starts now (time spent queued counts, as it
   * does for the client). `quiet` skips the breaker check and pacing; it is
   * only for status checks that never navigate.
   */
  run<T>(fn: (nav: Nav) => Promise<T>, opts: { quiet?: boolean } = {}): Promise<T> {
    const deadline = new Deadline(this.deps.config.toolTimeoutMs);
    const task = this.queue.catch(() => undefined).then(async () => {
      this.clearIdle();
      try {
        deadline.check("queue");
        if (!opts.quiet) {
          await this.deps.breaker.assertClosed();
          await this.deps.pacer.withDeadline(deadline).betweenActions();
        }
        const page = await this.ensurePage();
        deadline.check("launch");
        this.watch.throttle = null;
        this.watch.lost = null;
        let result: T;
        try {
          result = await runWithDeadline(deadline, () => fn(new Nav(page, this.deps, deadline, this.watch)));
        } catch (err) {
          if (this.watch.lost) throw browserLost(this.watch.lost);
          if (this.watch.throttle) throw await recordThrottle(this.deps, this.watch);
          throw err;
        }
        // Throttling seen after the work finished still pauses later calls.
        if (this.watch.throttle) await recordThrottle(this.deps, this.watch).catch(() => undefined);
        return result;
      } finally {
        this.scheduleIdle();
      }
    });
    this.queue = task;
    return task;
  }

  isOpen(): boolean {
    return this.context !== null;
  }

  /** The browser started most recently: channel and version. Null before the first launch. */
  browserInfo(): BrowserInfo | null {
    return this.info;
  }

  private connected(): boolean {
    return this.context?.browser()?.isConnected() ?? this.context !== null;
  }

  private async ensurePage(): Promise<Page> {
    if (this.page && !this.page.isClosed() && this.connected()) return this.page;
    if (this.launching) return this.launching;
    this.launching = (async () => {
      if (this.context && !this.connected()) await this.close();
      if (!this.context) {
        const { context, ...info } = await this.launch(this.deps.config, { headless: this.deps.config.headless });
        this.context = context;
        this.info = info;
        const forget = () => {
          if (this.context !== context) return; // closed on purpose by close()
          this.context = null;
          this.page = null;
          this.watch.lost ??= "disconnected";
        };
        context.on("close", forget);
        context.browser()?.on("disconnected", forget);
      }
      const existing = this.context.pages().find((p) => !p.isClosed());
      const page = existing ?? (await this.context.newPage());
      page.setDefaultTimeout(20_000);
      this.watchPage(page);
      this.page = page;
      return page;
    })();
    try {
      return await this.launching;
    } finally {
      this.launching = null;
    }
  }

  /** Listens for crashes and for throttled main-frame documents, including ones opened by clicks. */
  private watchPage(page: Page): void {
    if (this.watched.has(page)) return;
    this.watched.add(page);
    page.on("crash", () => {
      this.watch.lost = "crash";
      // A crashed tab can't be trusted again: close the browser so the next call starts clean.
      void this.close();
    });
    const isMainDocument = (req: Request): boolean => {
      try {
        return req.resourceType() === "document" && req.frame() === page.mainFrame();
      } catch {
        return false; // e.g. service worker requests have no frame
      }
    };
    page.on("response", (res) => {
      if (isMainDocument(res.request())) noteResponse(this.watch, res);
    });
    page.on("requestfailed", (req) => {
      if (isMainDocument(req) && isRedirectLoop(req.failure()?.errorText ?? "")) noteRedirectLoop(this.watch, req.url());
    });
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private scheduleIdle(): void {
    this.clearIdle();
    this.idleTimer = setTimeout(() => {
      void this.close();
    }, this.deps.config.idleTimeoutMs);
    this.idleTimer.unref();
  }

  async close(): Promise<void> {
    this.clearIdle();
    const ctx = this.context;
    this.context = null;
    this.page = null;
    if (ctx) await ctx.close().catch(() => undefined);
  }
}
