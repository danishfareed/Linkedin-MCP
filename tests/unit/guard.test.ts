import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LinkedInMcpError } from "../../src/errors.js";
import { AUTO_TRIP_MS, CircuitBreaker, checkpointError, classifyPage } from "../../src/safety/guard.js";
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

  it("ignores non-LinkedIn hosts", () => {
    expect(classifyPage({ url: "https://example.com/checkpoint/challenge" })).toBe("ok");
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
});

describe("checkpointError", () => {
  it("maps login walls to NOT_LOGGED_IN and challenges to CHECKPOINT", () => {
    expect(checkpointError("login_wall", "u").code).toBe("NOT_LOGGED_IN");
    expect(checkpointError("captcha", "u").code).toBe("CHECKPOINT");
  });
});
