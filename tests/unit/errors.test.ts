import { describe, expect, it } from "vitest";
import { LinkedInMcpError, rateLimited, toMcpError } from "../../src/errors.js";

describe("toMcpError", () => {
  it("passes LinkedInMcpError through unchanged", () => {
    const err = rateLimited(600);
    expect(toMcpError(err)).toBe(err);
  });

  it("maps a redirect loop to RATE_LIMITED", () => {
    const err = toMcpError(new Error("page.goto: net::ERR_TOO_MANY_REDIRECTS at https://www.linkedin.com/feed/\nCall log: ..."));
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.details?.retry_after_seconds).toBeGreaterThan(0);
  });

  it("maps connection failures to NETWORK", () => {
    expect(toMcpError(new Error("page.goto: net::ERR_INTERNET_DISCONNECTED")).code).toBe("NETWORK");
    expect(toMcpError(new Error("net::ERR_NAME_NOT_RESOLVED at https://www.linkedin.com/")).code).toBe("NETWORK");
  });

  it("maps playwright timeouts to TIMEOUT and everything else to INTERNAL", () => {
    const timeout = new Error("locator.click: Timeout 30000ms exceeded.");
    expect(toMcpError(timeout).code).toBe("TIMEOUT");
    const other = toMcpError(new Error("boom\nstack"));
    expect(other).toBeInstanceOf(LinkedInMcpError);
    expect(other.code).toBe("INTERNAL");
    expect(other.message).toBe("Unexpected error: boom");
  });
});
