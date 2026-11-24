import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INSTALL_BROWSER_ARGS, bundledChromiumVersion, patchrightCliPath, patchrightVersion } from "../../src/browser/patchright.js";

describe("bundled patchright", () => {
  it("resolves our own patchright CLI and the Chromium build it expects", () => {
    expect(existsSync(patchrightCliPath())).toBe(true);
    expect(patchrightVersion()).toMatch(/^\d+\.\d+\.\d+/);
    expect(bundledChromiumVersion()).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });

  it("installs full Chromium only, not the headless shell", () => {
    expect(INSTALL_BROWSER_ARGS).toEqual(["install", "chromium", "--no-shell"]);
  });
});
