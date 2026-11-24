import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LinkedInMcpError } from "../../src/errors.js";
import {
  AUTO_TRIP_MS,
  CircuitBreaker,
  RATE_LIMIT_COOLDOWN_S,
  checkpointError,
  classifyPage,
  isRedirectLoop,
  isRestrictionUrl,
  isThrottleStatus,
  retryAfterSeconds,
  throttleFromResponse,
} from "../../src/safety/guard.js";
import { fakeClock, tempDir } from "./helpers.js";

describe("classifyPage", () => {
  it("passes normal signed-in pages", () => {
    expect(classifyPage({ url: "https://www.linkedin.com/feed/", title: "Feed | LinkedIn", hasGlobalNav: true })).toBe("ok");
  });

  it("detects checkpoints and challenges by URL", () => {
    expect(classifyPage({ url: "https://www.linkedin.com/checkpoint/challenge/AgF..." })).toBe("captcha");
    expect(classifyPage({ url: "https://www.linkedin.com/checkpoint/lg/login-submit" })).toBe("checkpoint");
    expect(classifyPage({ url: "https://www.linkedin.com/checkpoint/rp/request-password-reset" })).toBe("checkpoint");
  });

  it("detects login walls", () => {
    expect(classifyPage({ url: "https://www.linkedin.com/authwall?trk=x" })).toBe("login_wall");
    expect(classifyPage({ url: "https://www.linkedin.com/login" })).toBe("login_wall");
    expect(classifyPage({ url: "https://www.linkedin.com/uas/login?session_redirect=x" })).toBe("login_wall");
    expect(
      classifyPage({ url: "https://www.linkedin.com/in/someone/", title: "Sign In | LinkedIn", text: "Sign in to view full profile", hasGlobalNav: false }),
    ).toBe("login_wall");
  });

  it("detects challenge copy on pages without the signed-in nav", () => {
    expect(
      classifyPage({ url: "https://www.linkedin.com/feed/", title: "Security Verification", text: "Let's do a quick security check", hasGlobalNav: false }),
    ).toBe("captcha");
    expect(
      classifyPage({ url: "https://www.linkedin.com/feed/", text: "We noticed some unusual activity on your account", hasGlobalNav: false }),
    ).toBe("unusual_activity");
    expect(
      classifyPage({ url: "https://www.linkedin.com/feed/", text: "Your account has been temporarily restricted", hasGlobalNav: false }),
    ).toBe("restricted");
  });

  it("does not trip on a feed post that mentions those words", () => {
    expect(
      classifyPage({
        url: "https://www.linkedin.com/feed/",
        title: "Feed | LinkedIn",
        text: "Home My Network Jobs Messaging Notifications\nJane Doe\nWe saw unusual activity on our servers and added a CAPTCHA.",
        hasGlobalNav: true,
      }),
    ).toBe("ok");
  });

  it("reports pages on another site as offsite instead of parsing them", () => {
    expect(classifyPage({ url: "https://example.com/checkpoint/challenge" })).toBe("offsite");
    expect(classifyPage({ url: "http://captive.portal.example/login?orig=linkedin.com", title: "Hotel Wi-Fi", hasGlobalNav: false })).toBe("offsite");
    expect(classifyPage({ url: "https://www.linkedin.com.evil.example/feed/" })).toBe("offsite");
    expect(classifyPage({ url: "chrome-error://chromewebdata/" })).toBe("offsite");
    // subdomains of linkedin.com are still LinkedIn
    expect(classifyPage({ url: "https://de.linkedin.com/feed/", title: "Feed | LinkedIn", hasGlobalNav: true })).toBe("ok");
  });

  it("checks the restriction route before the sign-in rules", () => {
    // A restricted account has no session cookie and lands under /login/.
    expect(classifyPage({ url: "https://www.linkedin.com/flagship-web/login/login-restriction/" })).toBe("restricted");
    expect(classifyPage({ url: "https://www.linkedin.com/flagship-web/login/login-restriction/?trk=x" })).toBe("restricted");
    expect(classifyPage({ url: "https://www.linkedin.com/m/restricted" })).toBe("restricted");
    expect(classifyPage({ url: "https://www.linkedin.com/login" })).toBe("login_wall");
  });

  it("treats the Welcome back account picker as a login wall in any language", () => {
    expect(
      classifyPage({ url: "https://www.linkedin.com/feed/", title: "LinkedIn", text: "Willkommen zurück", hasGlobalNav: false, rememberMe: true }),
    ).toBe("login_wall");
    // without the element, the same page is fine
    expect(classifyPage({ url: "https://www.linkedin.com/feed/", title: "LinkedIn", text: "Willkommen zurück", hasGlobalNav: false })).toBe("ok");
  });

  it("still trips on a challenge URL even when the account picker is shown", () => {
    expect(classifyPage({ url: "https://www.linkedin.com/checkpoint/challenge/x", rememberMe: true })).toBe("captcha");
  });
});

describe("isRestrictionUrl", () => {
  it("matches only the restriction routes", () => {
    expect(isRestrictionUrl("https://www.linkedin.com/flagship-web/login/login-restriction/")).toBe(true);
    expect(isRestrictionUrl("https://www.linkedin.com/login")).toBe(false);
    expect(isRestrictionUrl("https://www.linkedin.com/feed/?q=restricted")).toBe(false);
  });
});

describe("rate limit signals", () => {
  const now = new Date("2026-11-24T10:00:00Z");

  it("counts 429 and LinkedIn's 999 as throttling, nothing else", () => {
    expect(isThrottleStatus(429)).toBe(true);
    expect(isThrottleStatus(999)).toBe(true);
    for (const s of [200, 302, 403, 404, 500, 503]) expect(isThrottleStatus(s)).toBe(false);
  });

  it("reads Retry-After as seconds or an HTTP date, with a 4 hour default", () => {
    expect(retryAfterSeconds("120", now)).toBe(120);
    expect(retryAfterSeconds(new Date(now.getTime() + 30 * 60_000).toUTCString(), now)).toBe(1800);
    expect(retryAfterSeconds(undefined, now)).toBe(RATE_LIMIT_COOLDOWN_S);
    expect(retryAfterSeconds("soon", now)).toBe(RATE_LIMIT_COOLDOWN_S);
    expect(RATE_LIMIT_COOLDOWN_S).toBe(4 * 3600);
  });

  it("keeps the cooldown between a minute and a day", () => {
    expect(retryAfterSeconds("0", now)).toBe(60);
    expect(retryAfterSeconds(String(7 * 24 * 3600), now)).toBe(24 * 3600);
    expect(retryAfterSeconds(new Date(now.getTime() - 60_000).toUTCString(), now)).toBe(60);
  });

  it("only treats LinkedIn responses as LinkedIn throttling", () => {
    expect(throttleFromResponse({ status: 999, url: "https://www.linkedin.com/feed/" }, now)).toEqual({
      status: 999,
      url: "https://www.linkedin.com/feed/",
      retryAfterSeconds: RATE_LIMIT_COOLDOWN_S,
    });
    expect(throttleFromResponse({ status: 429, url: "https://www.linkedin.com/in/x/", retryAfter: "600" }, now)?.retryAfterSeconds).toBe(600);
    expect(throttleFromResponse({ status: 429, url: "https://proxy.example/blocked" }, now)).toBeNull();
    expect(throttleFromResponse({ status: 200, url: "https://www.linkedin.com/feed/" }, now)).toBeNull();
  });

  it("recognises a redirect loop", () => {
    expect(isRedirectLoop("page.goto: net::ERR_TOO_MANY_REDIRECTS at https://www.linkedin.com/feed/")).toBe(true);
    expect(isRedirectLoop("net::ERR_CONNECTION_RESET")).toBe(false);
  });
});

describe("CircuitBreaker", () => {
  function setup() {
    const t = fakeClock(new Date("2026-11-24T10:00:00Z"));
    const breaker = new CircuitBreaker(join(tempDir(), "breaker.json"), t.clock);
    return { t, breaker };
  }

  it("is closed by default", async () => {
    const { breaker } = setup();
    await expect(breaker.assertClosed()).resolves.toBeUndefined();
  });

  it("auto trips for 24 hours, then closes", async () => {
    const { t, breaker } = setup();
    await breaker.trip("captcha", { url: "https://www.linkedin.com/checkpoint/challenge/x" });
    await expect(breaker.assertClosed()).rejects.toMatchObject({ code: "CIRCUIT_OPEN" });
    t.advance(AUTO_TRIP_MS - 1000);
    await expect(breaker.assertClosed()).rejects.toMatchObject({ code: "CIRCUIT_OPEN" });
    t.advance(2000);
    await expect(breaker.assertClosed()).resolves.toBeUndefined();
  });

  it("manual pause stays until reset", async () => {
    const { t, breaker } = setup();
    await breaker.trip("manual");
    t.advance(7 * AUTO_TRIP_MS);
    await expect(breaker.assertClosed()).rejects.toMatchObject({ code: "CIRCUIT_OPEN" });
    await breaker.reset();
    await expect(breaker.assertClosed()).resolves.toBeUndefined();
  });

  it("clears only login-wall pauses after sign-in", async () => {
    const { breaker } = setup();
    await breaker.trip("checkpoint");
    expect(await breaker.clearIfLoginWall()).toBe(false);
    await expect(breaker.assertClosed()).rejects.toBeTruthy();
    await breaker.trip("login_wall");
    expect(await breaker.clearIfLoginWall()).toBe(true);
    await expect(breaker.assertClosed()).resolves.toBeUndefined();
  });

  it("explains how to recover", async () => {
    const { breaker } = setup();
    await breaker.trip("restricted");
    try {
      await breaker.assertClosed();
    } catch (err) {
      expect((err as LinkedInMcpError).nextStep).toMatch(/resolve the check on LinkedIn yourself/);
    }
  });

  it("pauses for a rate-limit cooldown, then reopens on its own", async () => {
    const { t, breaker } = setup();
    const state = await breaker.tripRateLimited(600, { url: "https://www.linkedin.com/feed/", note: "HTTP 999" });
    expect(state).toMatchObject({ open: true, reason: "rate_limited", note: "HTTP 999", until: "2026-11-24T10:10:00.000Z" });
    const err = (await breaker.assertClosed().catch((e: unknown) => e)) as LinkedInMcpError;
    expect(err.code).toBe("CIRCUIT_OPEN");
    expect(err.message).toMatch(/limiting requests/);
    expect(err.nextStep).toMatch(/don't retry/);
    expect(err.nextStep).not.toMatch(/login/);
    t.advance(601_000);
    await expect(breaker.assertClosed()).resolves.toBeUndefined();
  });

  it("can be resumed early from a rate-limit pause, and sign-in doesn't clear it", async () => {
    const { breaker } = setup();
    await breaker.tripRateLimited(RATE_LIMIT_COOLDOWN_S);
    expect(await breaker.clearIfLoginWall()).toBe(false);
    await breaker.reset();
    await expect(breaker.assertClosed()).resolves.toBeUndefined();
  });
});

describe("checkpointError", () => {
  it("maps login walls to NOT_LOGGED_IN and challenges to CHECKPOINT", () => {
    expect(checkpointError("login_wall", "u").code).toBe("NOT_LOGGED_IN");
    expect(checkpointError("captcha", "u").code).toBe("CHECKPOINT");
  });

  it("tells a restricted account that signing in again won't help", () => {
    const err = checkpointError("restricted", "https://www.linkedin.com/flagship-web/login/login-restriction/");
    expect(err.code).toBe("CHECKPOINT");
    expect(err.nextStep).toMatch(/restore the account/);
  });
});
