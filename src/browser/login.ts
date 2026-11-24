import type { AppContext } from "../context.js";
import { LinkedInMcpError } from "../errors.js";
import { urls } from "../linkedin/urls.js";
import { hasSessionCookie, launchContext } from "./session.js";

const SIGNED_IN_PATH = /linkedin\.com\/(feed|in\/|mynetwork|notifications|messaging|jobs)/;
const NOT_DONE_PATH = /\/(login|checkpoint|authwall|uas\/|signup)/;

export interface LoginResult {
  name: string | null;
  profile_url: string | null;
  already_signed_in: boolean;
}

/**
 * Opens a visible browser window on the persistent profile and waits for the
 * user to sign in themselves (including 2FA or app confirmation). Nothing is
 * typed or clicked for them.
 */
export async function interactiveLogin(ctx: AppContext, opts: { timeoutMs?: number; keepOpen?: boolean; log?: (msg: string) => void } = {}): Promise<LoginResult> {
  const log = opts.log ?? ((m: string) => console.error(m));
  const timeoutMs = opts.timeoutMs ?? 10 * 60_000;
  const context = await launchContext(ctx.config, { headless: false });
  let closed = false;
  context.on("close", () => {
    closed = true;
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    const alreadySignedIn = await hasSessionCookie(context);
    await page.goto(alreadySignedIn ? urls.feed() : urls.login(), { waitUntil: "domcontentloaded" });
    log(alreadySignedIn ? "A browser window is open on LinkedIn. Resolve anything LinkedIn asks for there." : "Sign in to LinkedIn in the browser window that just opened. Complete any 2FA or verification there.");

    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (closed || page.isClosed()) {
        throw new LinkedInMcpError("NOT_LOGGED_IN", "The browser window was closed before sign-in finished.", "Run the login command again and finish signing in before closing the window.");
      }
      const url = page.url();
      if ((await hasSessionCookie(context).catch(() => false)) && SIGNED_IN_PATH.test(url) && !NOT_DONE_PATH.test(url)) break;
      if (Date.now() > deadline) {
        throw new LinkedInMcpError("TIMEOUT", "Sign-in did not finish within 10 minutes.", "Run the login command again.");
      }
      await new Promise((r) => setTimeout(r, 1500));
    }

    await page.goto(urls.me(), { waitUntil: "domcontentloaded" });
    await page.waitForSelector("main h1", { timeout: 20_000 }).catch(() => undefined);
    const id = /\/in\/([^/?#]+)/.exec(page.url())?.[1] ?? null;
    const name = (await page.locator("main h1").first().innerText().catch(() => "")).trim() || null;
    const profileUrl = id ? `https://www.linkedin.com/in/${id}/` : null;

    const now = ctx.clock().toISOString();
    await ctx.account.update({ name, profile_url: profileUrl, public_id: id ? decodeURIComponent(id) : null, first_login_at: now, last_verified_at: now });
    await ctx.limits.startWarmupIfNeeded();
    await ctx.breaker.clearIfLoginWall();

    if (opts.keepOpen) {
      log("Signed in. Close the browser window when you're done.");
      await new Promise<void>((resolve) => (closed ? resolve() : context.once("close", () => resolve())));
    }
    return { name, profile_url: profileUrl, already_signed_in: alreadySignedIn };
  } finally {
    if (!closed) await context.close().catch(() => undefined);
  }
}
