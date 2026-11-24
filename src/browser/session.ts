import { mkdirSync } from "node:fs";
import { type BrowserContext, type Page, chromium } from "patchright";
import type { Config } from "../config.js";
import { LinkedInMcpError, notLoggedIn } from "../errors.js";
import { readPageSignals, waitForAny } from "../linkedin/dom.js";
import type { AuditLog } from "../safety/audit.js";
import { type CircuitBreaker, checkpointError, classifyPage } from "../safety/guard.js";
import type { Limits } from "../safety/limits.js";
import { localLocale, localTimeZone } from "../util/time.js";
import type { Pacer } from "./human.js";

export interface SessionDeps {
  config: Config;
  breaker: CircuitBreaker;
  limits: Limits;
  audit: AuditLog;
  pacer: Pacer;
}

function launchError(err: unknown): LinkedInMcpError {
  const msg = err instanceof Error ? err.message : String(err);
  if (/ProcessSingleton|SingletonLock|user data directory is already in use|profile .* in use/i.test(msg)) {
    return new LinkedInMcpError(
      "BROWSER_UNAVAILABLE",
      "The LinkedIn browser profile is already open in another process (another MCP client, or a login window).",
      "Close the other window or MCP client that is using linkedin-mcp, then try again.",
    );
  }
  if (/Executable doesn't exist|is not found|not installed|Chromium distribution/i.test(msg)) {
    return new LinkedInMcpError(
      "BROWSER_UNAVAILABLE",
      "No usable browser was found. linkedin-mcp uses Google Chrome when installed, otherwise its own Chromium.",
      "Install Google Chrome (https://www.google.com/chrome/), or run `npx patchright install chromium`, then try again.",
    );
  }
  return new LinkedInMcpError("BROWSER_UNAVAILABLE", `Could not start the browser: ${msg.split("\n")[0]}`, "Run `npx @danishfareed/linkedin-mcp doctor` for details.");
}

/** Launch the persistent profile. Uses installed Chrome when present, else Patchright's Chromium. */
export async function launchContext(config: Config, opts: { headless: boolean }): Promise<BrowserContext> {
  mkdirSync(config.paths.profile, { recursive: true, mode: 0o700 });
  const base = {
    headless: opts.headless,
    viewport: opts.headless ? config.browser.viewport : null,
    locale: localLocale(),
    timezoneId: localTimeZone(),
  } as const;

  const attempts: { channel?: string; executablePath?: string }[] = [];
  if (config.browser.executablePath) attempts.push({ executablePath: config.browser.executablePath });
  else if (config.browser.channel === "auto") attempts.push({ channel: "chrome" }, {});
  else if (config.browser.channel === "chromium") attempts.push({});
  else attempts.push({ channel: config.browser.channel });

  let lastErr: unknown;
  for (const attempt of attempts) {
    try {
      return await chromium.launchPersistentContext(config.paths.profile, { ...base, ...attempt });
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      // Only fall through to the next option when the browser itself is missing.
      if (!/Executable doesn't exist|is not found|not installed|Chromium distribution/i.test(msg)) break;
    }
  }
  throw launchError(lastErr);
}

export async function hasSessionCookie(context: BrowserContext): Promise<boolean> {
  const cookies = await context.cookies("https://www.linkedin.com");
  return cookies.some((c) => c.name === "li_at" && c.value.length > 0 && (c.expires === -1 || c.expires * 1000 > Date.now()));
}

/**
 * What page objects get: the page, plus guarded navigation. Every navigation
 * counts as a page load, pauses like a person would, and runs the guard.
 */
export class Nav {
  constructor(
    readonly page: Page,
    private readonly deps: SessionDeps,
  ) {}

  get pacer(): Pacer {
    return this.deps.pacer;
  }

  async goto(url: string, opts: { waitFor?: readonly string[]; timeout?: number } = {}): Promise<void> {
    await this.deps.breaker.assertClosed();
    await this.deps.limits.consume("page_load");
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: opts.timeout ?? 45_000 });
    await this.deps.pacer.afterNavigation();
    await this.guard();
    if (opts.waitFor) await waitForAny(this.page, opts.waitFor, 15_000);
  }

  /** Checks the current page for challenges. Trips the breaker and throws on a hit. */
  async guard(): Promise<void> {
    const signals = await readPageSignals(this.page);
    const verdict = classifyPage(signals);
    if (verdict === "ok") return;
    await this.deps.breaker.trip(verdict, { url: signals.url });
    await this.deps.audit.record({ tool: "guard", target: signals.url, text_hash: null, result: "guard_tripped", detail: verdict });
    throw checkpointError(verdict, signals.url);
  }

  /** Throws NOT_LOGGED_IN without navigating if the session cookie is missing. */
  async requireSessionCookie(): Promise<void> {
    if (!(await hasSessionCookie(this.page.context()))) throw notLoggedIn();
  }
}

/**
 * One browser per process. Tool calls run one at a time through a queue, so
 * LinkedIn sees a single person, not parallel tabs. The browser closes after
 * the idle timeout and relaunches on the next call.
 */
export class BrowserSession {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private idleTimer: NodeJS.Timeout | null = null;
  private launching: Promise<Page> | null = null;

  constructor(private readonly deps: SessionDeps) {}

  /**
   * Run `fn` with exclusive use of the browser. `quiet` skips the breaker
   * check and pacing; it is only for status checks that never navigate.
   */
  run<T>(fn: (nav: Nav) => Promise<T>, opts: { quiet?: boolean } = {}): Promise<T> {
    const task = this.queue.catch(() => undefined).then(async () => {
      this.clearIdle();
      try {
        if (!opts.quiet) {
          await this.deps.breaker.assertClosed();
          await this.deps.pacer.betweenActions();
        }
        const page = await this.ensurePage();
        return await fn(new Nav(page, this.deps));
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

  private async ensurePage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    if (this.launching) return this.launching;
    this.launching = (async () => {
      if (!this.context) {
        this.context = await launchContext(this.deps.config, { headless: this.deps.config.headless });
        this.context.on("close", () => {
          this.context = null;
          this.page = null;
        });
      }
      const existing = this.context.pages().find((p) => !p.isClosed());
      this.page = existing ?? (await this.context.newPage());
      this.page.setDefaultTimeout(20_000);
      return this.page;
    })();
    try {
      return await this.launching;
    } finally {
      this.launching = null;
    }
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
