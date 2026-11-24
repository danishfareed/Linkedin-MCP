import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  browserRecordFile,
  browserTooOld,
  clearStaleProfileLock,
  executableVersion,
  isOlderMajor,
  newestVersionIn,
  parseSingletonTarget,
  plistVersion,
  processAlive,
  profileBrowserVersion,
  recordBrowserVersion,
} from "../../src/browser/profile.js";
import { resolvePaths } from "../../src/config.js";
import { compareVersions, majorOf, maxVersion } from "../../src/util/version.js";
import { tempDir } from "./helpers.js";

const posixOnly = it.skipIf(process.platform === "win32");

function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** A profile dir with Chromium's three singleton symlinks pointing at host-pid. */
function lockedProfile(host: string, pid: number): string {
  const dir = tempDir();
  symlinkSync(`${host}-${pid}`, join(dir, "SingletonLock"));
  symlinkSync("/tmp/fake-socket-dir/SingletonSocket", join(dir, "SingletonSocket"));
  symlinkSync("1234567890", join(dir, "SingletonCookie"));
  return dir;
}

describe("parseSingletonTarget", () => {
  it("splits hostname and pid at the last dash", () => {
    expect(parseSingletonTarget("my-mac-book.local-4242")).toEqual({ host: "my-mac-book.local", pid: 4242 });
    expect(parseSingletonTarget("host-0")).toBeNull();
    expect(parseSingletonTarget("nodash")).toBeNull();
    expect(parseSingletonTarget("host-abc")).toBeNull();
  });
});

describe("processAlive", () => {
  it("knows this process is alive", () => {
    expect(processAlive(process.pid)).toBe(true);
  });
});

describe("clearStaleProfileLock", () => {
  posixOnly("removes all three singleton files when the owning process is gone", async () => {
    const dir = lockedProfile("box", 999_999);
    expect(await clearStaleProfileLock(dir, { hostname: "box", isAlive: () => false })).toBe("removed");
    for (const f of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) expect(exists(join(dir, f))).toBe(false);
  });

  posixOnly("never removes a lock held by a live process", async () => {
    const dir = lockedProfile("box", process.pid);
    expect(await clearStaleProfileLock(dir, { hostname: "box" })).toBe("live");
    expect(exists(join(dir, "SingletonLock"))).toBe(true);
    expect(exists(join(dir, "SingletonSocket"))).toBe(true);
  });

  posixOnly("leaves a lock from another machine alone", async () => {
    const dir = lockedProfile("other-host", 999_999);
    expect(await clearStaleProfileLock(dir, { hostname: "box", isAlive: () => false })).toBe("other_host");
    expect(exists(join(dir, "SingletonLock"))).toBe(true);
  });

  posixOnly("leaves an unrecognised lock alone", async () => {
    const dir = tempDir();
    symlinkSync("not-a-pid", join(dir, "SingletonLock"));
    expect(await clearStaleProfileLock(dir, { hostname: "not-a", isAlive: () => false })).toBe("unknown");
    expect(exists(join(dir, "SingletonLock"))).toBe(true);
  });

  it("does nothing without a lock, or on Windows", async () => {
    const dir = tempDir();
    expect(await clearStaleProfileLock(dir)).toBe("none");
    expect(await clearStaleProfileLock(dir, { platform: "win32" })).toBe("none");
  });
});

describe("version helpers", () => {
  it("compares dotted versions numerically", () => {
    expect(compareVersions("158.0.8127.37", "156.0.8078.4")).toBeGreaterThan(0);
    expect(compareVersions("0.1.0", "0.10.0")).toBeLessThan(0);
    expect(compareVersions("1.2.0", "1.2")).toBe(0);
    expect(compareVersions("1.2.0-beta.1", "1.2.0")).toBeLessThan(0);
    expect(majorOf("156.0.8078.4")).toBe(156);
    expect(maxVersion([null, "120.0.1.2", "", "130.0.0.1", undefined])).toBe("130.0.0.1");
  });

  it("refuses only an older major version", () => {
    expect(isOlderMajor("156.0.8078.4", "158.0.8127.37")).toBe(true);
    expect(isOlderMajor("158.0.1.1", "158.0.8127.37")).toBe(false);
    expect(isOlderMajor("160.0.0.0", "158.0.8127.37")).toBe(false);
  });

  it("explains the downgrade and how to get out of it", () => {
    const err = browserTooOld("156.0.8078.4", "158.0.8127.37", "chromium");
    expect(err.code).toBe("BROWSER_UNAVAILABLE");
    expect(err.message).toMatch(/older than the one that last used your LinkedIn profile/);
    expect(err.nextStep).toMatch(/install-browser/);
    expect(err.nextStep).toMatch(/LINKEDIN_MCP_BROWSER_CHANNEL/);
    expect(browserTooOld("150.0.0.0", "158.0.0.0", "chrome").nextStep).toMatch(/Update Google Chrome to version 158/);
  });

  it("reads versions without starting the browser", async () => {
    expect(plistVersion("<dict>\n\t<key>CFBundleShortVersionString</key>\n\t<string>158.0.8127.37</string>\n</dict>")).toBe("158.0.8127.37");
    expect(plistVersion("<dict></dict>")).toBeNull();
    expect(newestVersionIn(["chrome.exe", "131.0.6778.86", "130.0.6723.117", "156.0.8078.4.manifest", "Dictionaries"])).toBe("156.0.8078.4");

    const app = join(tempDir(), "Google Chrome.app");
    mkdirSync(join(app, "Contents", "MacOS"), { recursive: true });
    writeFileSync(join(app, "Contents", "Info.plist"), "<key>CFBundleShortVersionString</key><string>158.0.8127.37</string>");
    expect(await executableVersion(join(app, "Contents", "MacOS", "Google Chrome"), "darwin")).toBe("158.0.8127.37");

    const win = tempDir();
    mkdirSync(join(win, "131.0.6778.86"));
    expect(await executableVersion(join(win, "chrome.exe"), "win32")).toBe("131.0.6778.86");
    expect(await executableVersion(join(win, "missing", "chrome.exe"), "win32")).toBeNull();
  });
});

describe("profile browser record", () => {
  function setup() {
    const paths = resolvePaths({ LINKEDIN_MCP_HOME: tempDir() });
    mkdirSync(paths.profile, { recursive: true });
    return paths;
  }

  it("ignores a fresh profile, even with a stale record", async () => {
    const paths = setup();
    await recordBrowserVersion(paths, "158.0.8127.37", "chrome");
    expect(await profileBrowserVersion(paths)).toBeNull();
  });

  it("keeps the highest version that opened the profile", async () => {
    const paths = setup();
    writeFileSync(join(paths.profile, "Local State"), "{}");
    await recordBrowserVersion(paths, "156.0.8078.4", "chromium");
    await recordBrowserVersion(paths, "158.0.8127.37", "chrome");
    await recordBrowserVersion(paths, "158.0.8000.1", "chrome");
    const record = JSON.parse(readFileSync(browserRecordFile(paths), "utf8"));
    expect(record).toMatchObject({ version: "158.0.8127.37", last_version: "158.0.8000.1", last_channel: "chrome" });
    expect(await profileBrowserVersion(paths)).toBe("158.0.8127.37");
  });

  it("falls back to Chromium's own Last Version file for older profiles", async () => {
    const paths = setup();
    mkdirSync(join(paths.profile, "Default"));
    writeFileSync(join(paths.profile, "Last Version"), "157.0.8100.2\n");
    expect(existsSync(browserRecordFile(paths))).toBe(false);
    expect(await profileBrowserVersion(paths)).toBe("157.0.8100.2");
  });
});
