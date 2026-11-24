import { describe, expect, it } from "vitest";
import { loginProgress } from "../../src/browser/login.js";

describe("loginProgress", () => {
  const LOGIN = "https://www.linkedin.com/login";
  const FEED = "https://www.linkedin.com/feed/";
  const RESTRICTED = "https://www.linkedin.com/flagship-web/login/login-restriction/";

  it("waits until the session cookie is set and a tab is on a signed-in page", () => {
    expect(loginProgress([LOGIN], false)).toEqual({ state: "waiting" });
    expect(loginProgress([FEED], false)).toEqual({ state: "waiting" });
    expect(loginProgress([LOGIN], true)).toEqual({ state: "waiting" });
    expect(loginProgress([FEED], true)).toEqual({ state: "signed_in", url: FEED });
  });

  it("accepts a signed-in page in any tab, not just the first", () => {
    expect(loginProgress(["about:blank", LOGIN, "https://www.linkedin.com/in/jane-doe/"], true)).toEqual({
      state: "signed_in",
      url: "https://www.linkedin.com/in/jane-doe/",
    });
  });

  it("stops on the restriction route instead of waiting out the timeout", () => {
    expect(loginProgress([RESTRICTED], false)).toEqual({ state: "restricted", url: RESTRICTED });
    expect(loginProgress([FEED, RESTRICTED], true)).toEqual({ state: "restricted", url: RESTRICTED });
  });

  it("ignores look-alike URLs on other sites", () => {
    expect(loginProgress(["https://example.com/?next=linkedin.com/feed/"], true)).toEqual({ state: "waiting" });
    expect(loginProgress(["https://example.com/login-restriction/"], false)).toEqual({ state: "waiting" });
  });
});
