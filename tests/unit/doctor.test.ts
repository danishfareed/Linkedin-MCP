import { describe, expect, it } from "vitest";
import { describeBrowser, fetchLatestVersion, updateCheck } from "../../src/doctor.js";

describe("doctor update check", () => {
  it("reports when a newer version is on npm", () => {
    expect(updateCheck("0.1.0", "0.2.0")).toMatchObject({ level: "warn" });
    expect(updateCheck("0.1.0", "0.2.0").detail).toMatch(/0\.2\.0 is available/);
    expect(updateCheck("0.2.0", "0.2.0")).toMatchObject({ level: "ok" });
    expect(updateCheck("0.3.0", "0.2.0")).toMatchObject({ level: "ok" });
    expect(updateCheck("0.1.0", null)).toMatchObject({ level: "skip" });
  });

  it("fetches the latest version with a plain GET and no user data", async () => {
    const seen: { url: string; init: RequestInit | undefined }[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ name: "@danishfareed/linkedin-mcp", version: "0.4.2" }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await fetchLatestVersion(fake)).toBe("0.4.2");
    expect(seen[0]!.url).toBe("https://registry.npmjs.org/@danishfareed/linkedin-mcp/latest");
    expect(seen[0]!.init?.method ?? "GET").toBe("GET");
    expect(seen[0]!.init?.body).toBeUndefined();
    expect(seen[0]!.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("ignores failures", async () => {
    const failing = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const notFound = (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
    const garbage = (async () => new Response("not json", { status: 200 })) as unknown as typeof fetch;
    expect(await fetchLatestVersion(failing)).toBeNull();
    expect(await fetchLatestVersion(notFound)).toBeNull();
    expect(await fetchLatestVersion(garbage)).toBeNull();
  });
});

describe("doctor browser line", () => {
  it("names the browser, version and channel", () => {
    expect(describeBrowser({ channel: "chrome", version: "158.0.8127.37" }, "1.64.3")).toBe("Google Chrome 158.0.8127.37 (channel: chrome)");
    expect(describeBrowser({ channel: "chromium", version: "156.0.8078.4" }, "1.64.3")).toBe("Chromium 156.0.8078.4 (channel: chromium, installed for patchright 1.64.3)");
    expect(describeBrowser({ channel: "custom", version: null, executablePath: "/opt/chrome/chrome" }, null)).toMatch(/Custom browser \(version unknown\).*\/opt\/chrome\/chrome/);
  });
});
