import { type Browser, type Page, chromium } from "patchright";
import { launchAttempts } from "../../browser/session.js";
import type { Config } from "../../config.js";
import { LinkedInMcpError } from "../../errors.js";
import { FIT_SCRIPT, type FitResult, fontWaitScript } from "./fit.js";

/**
 * A throwaway headless browser for rendering. It is launched with a
 * temporary profile (chromium.launch, never launchPersistentContext), so it
 * never touches the LinkedIn profile, its cookies or its lock. Every render
 * gets its own fresh browser context; pages are set from strings and all
 * network traffic except Google Fonts is blocked.
 *
 * Starting and stopping Chrome can take seconds, so the renderer stays up
 * between renders and closes itself after a minute without use.
 */

const FONT_HOSTS = ["https://fonts.googleapis.com/", "https://fonts.gstatic.com/"];
const IDLE_CLOSE_MS = 60_000;

export async function launchRenderer(config: Config): Promise<Browser> {
  let last: unknown;
  for (const attempt of launchAttempts(config)) {
    try {
      return await chromium.launch({
        headless: true,
        ...(attempt.executablePath ? { executablePath: attempt.executablePath } : { channel: attempt.channel }),
        args: ["--disable-extensions", "--no-first-run", "--disable-sync", "--mute-audio"],
        timeout: 30_000,
      });
    } catch (err) {
      last = err;
    }
  }
  const msg = last instanceof Error ? last.message.split("\n")[0] : String(last);
  throw new LinkedInMcpError(
    "BROWSER_UNAVAILABLE",
    `Couldn't start a headless browser to render the image: ${msg}`,
    "Install Google Chrome (https://www.google.com/chrome/), or run `npx @danishfareed/linkedin-mcp install-browser`, then try again.",
  );
}

interface Shared {
  browser: Promise<Browser>;
  users: number;
  idle?: NodeJS.Timeout;
}

let shared: Shared | null = null;

async function acquire(config: Config): Promise<{ browser: Browser; entry: Shared }> {
  if (shared) {
    const entry = shared;
    clearTimeout(entry.idle);
    entry.users++;
    const browser = await entry.browser.catch(() => null);
    if (browser?.isConnected()) return { browser, entry };
    entry.users--;
    if (shared === entry) shared = null;
  }
  const entry: Shared = { browser: launchRenderer(config), users: 1 };
  shared = entry;
  try {
    const browser = await entry.browser;
    browser.on("disconnected", () => {
      if (shared === entry) shared = null;
    });
    return { browser, entry };
  } catch (err) {
    if (shared === entry) shared = null;
    throw err;
  }
}

function release(entry: Shared): void {
  entry.users = Math.max(0, entry.users - 1);
  if (entry.users > 0 || shared !== entry) return;
  entry.idle = setTimeout(() => {
    if (shared === entry && entry.users === 0) void closeRenderer();
  }, IDLE_CLOSE_MS);
  entry.idle.unref();
}

/** Start the renderer ahead of use and leave it warm. False when no browser can be launched. */
export async function warmRenderer(config: Config): Promise<boolean> {
  try {
    const { entry } = await acquire(config);
    release(entry);
    return true;
  } catch {
    return false;
  }
}

/** Close the renderer now (on idle, and in tests). */
export async function closeRenderer(): Promise<void> {
  const entry = shared;
  shared = null;
  if (!entry) return;
  clearTimeout(entry.idle);
  const browser = await entry.browser.catch(() => null);
  await browser?.close().catch(() => undefined);
}

export interface RenderedPage {
  page: Page;
  fits: FitResult[];
  /** Web font families that were requested but didn't load (offline, blocked). */
  missingFonts: string[];
}

/** Open an isolated page, set the HTML, wait for fonts, fit the text, and hand the page to `use`. */
export async function withRenderedPage<T>(
  browser: Browser,
  html: string,
  viewport: { width: number; height: number },
  webFamilies: string[],
  use: (r: RenderedPage) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, acceptDownloads: false, serviceWorkers: "block", locale: "en-US", colorScheme: "light" });
  try {
    await context.route("**/*", (route) => (FONT_HOSTS.some((h) => route.request().url().startsWith(h)) ? route.continue() : route.abort()));
    const page = await context.newPage();
    let cssSettled: () => void = () => undefined;
    const css = new Promise<void>((resolve) => (cssSettled = resolve));
    const onRequestDone = (req: { url(): string }) => {
      if (req.url().startsWith(FONT_HOSTS[0]!)) cssSettled();
    };
    page.on("requestfinished", onRequestDone);
    page.on("requestfailed", onRequestDone);
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 15_000 });
    let missingFonts: string[] = [];
    if (webFamilies.length) {
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([css, new Promise((r) => (timer = setTimeout(r, 4000)))]);
      clearTimeout(timer);
      const loaded = (await page.evaluate(fontWaitScript(webFamilies))) as string[];
      missingFonts = webFamilies.filter((f) => !loaded.includes(f));
    }
    const fits = (await page.evaluate(FIT_SCRIPT)) as FitResult[];
    return await use({ page, fits, missingFonts });
  } finally {
    await context.close().catch(() => undefined);
  }
}

/** Run `fn` with the renderer within `timeoutMs`. */
export async function withRenderer<T>(config: Config, timeoutMs: number, fn: (browser: Browser) => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LinkedInMcpError("TIMEOUT", "Rendering took too long.", "Try again with fewer slides or shorter text.")), timeoutMs);
  });
  const acquiring = acquire(config);
  try {
    return await Promise.race([acquiring.then(({ browser }) => fn(browser)), deadline]);
  } finally {
    clearTimeout(timer);
    // Release even when the deadline won the race before the browser was ready.
    acquiring.then(({ entry }) => release(entry), () => undefined);
  }
}
