import { execFile } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import { hostname as osHostname } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { Paths } from "../config.js";
import { LinkedInMcpError } from "../errors.js";
import { readJson, writeJsonAtomic, withFileLock } from "../state/store.js";
import { majorOf, maxVersion } from "../util/version.js";

/**
 * Housekeeping for the persistent Chromium profile: stale locks left by a
 * crashed browser, and which browser version last opened the profile.
 */

// --- Stale lock -----------------------------------------------------------------

const SINGLETON_FILES = ["SingletonLock", "SingletonSocket", "SingletonCookie"] as const;

/** Chromium's SingletonLock (macOS, Linux) is a symlink to "<hostname>-<pid>". */
export function parseSingletonTarget(target: string): { host: string; pid: number } | null {
  const i = target.lastIndexOf("-");
  if (i <= 0) return null;
  const pidText = target.slice(i + 1);
  if (!/^\d+$/.test(pidText)) return null;
  const pid = Number(pidText);
  return pid > 0 ? { host: target.slice(0, i), pid } : null;
}

/** False only when the process is known not to exist (ESRCH). */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

export type LockState = "none" | "live" | "other_host" | "unknown" | "removed";

/**
 * Removes a lock left by a Chromium that crashed, so the next launch doesn't
 * fail with "profile in use". Only when the lock names this machine and its
 * process is gone. A lock held by a live process, by another machine, or in a
 * shape we don't recognise is left alone. Windows releases its lock when the
 * process exits, so there is nothing to do there.
 */
export async function clearStaleProfileLock(
  profileDir: string,
  opts: { hostname?: string; isAlive?: (pid: number) => boolean; platform?: NodeJS.Platform } = {},
): Promise<LockState> {
  if ((opts.platform ?? process.platform) === "win32") return "none";
  let target: string;
  try {
    target = await fs.readlink(join(profileDir, "SingletonLock"));
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ENOENT" ? "none" : "unknown";
  }
  const owner = parseSingletonTarget(target);
  if (!owner) return "unknown";
  if (owner.host !== (opts.hostname ?? osHostname())) return "other_host";
  if ((opts.isAlive ?? processAlive)(owner.pid)) return "live";
  for (const name of SINGLETON_FILES) await fs.unlink(join(profileDir, name)).catch(() => undefined);
  return "removed";
}

// --- Browser version ------------------------------------------------------------

/**
 * Chromium drops the saved cookies (and with them the LinkedIn sign-in) when
 * an older browser opens a profile last used by a newer one. We record the
 * newest version that opened the profile and refuse older major versions.
 */
export interface BrowserRecord {
  /** Highest browser version that has opened the profile. */
  version: string;
  last_version: string;
  last_channel: string;
  updated_at: string;
}

export function browserRecordFile(paths: Paths): string {
  return join(paths.state, "browser.json");
}

/** Chromium writes "Local State" and "Default/" on first launch. Without them there is nothing to lose. */
export function profileInUse(profileDir: string): boolean {
  return existsSync(join(profileDir, "Local State")) || existsSync(join(profileDir, "Default"));
}

export async function readBrowserRecord(paths: Paths): Promise<BrowserRecord | null> {
  const record = await readJson<Partial<BrowserRecord> | null>(browserRecordFile(paths), null).catch(() => null);
  return record?.version ? (record as BrowserRecord) : null;
}

/**
 * The newest browser version known to have opened the profile: our record,
 * or Chromium's own "Last Version" file for profiles made before we kept one.
 * Null for a fresh profile.
 */
export async function profileBrowserVersion(paths: Paths): Promise<string | null> {
  if (!profileInUse(paths.profile)) return null;
  const record = await readBrowserRecord(paths);
  const last = await fs
    .readFile(join(paths.profile, "Last Version"), "utf8")
    .then((s) => s.trim())
    .catch(() => null);
  return maxVersion([record?.version, last]);
}

export async function recordBrowserVersion(paths: Paths, version: string, channel: string, now: Date = new Date()): Promise<BrowserRecord> {
  const file = browserRecordFile(paths);
  return withFileLock(file, async () => {
    const previous = await readBrowserRecord(paths);
    const next: BrowserRecord = {
      version: maxVersion([previous?.version, version]) ?? version,
      last_version: version,
      last_channel: channel,
      updated_at: now.toISOString(),
    };
    if (previous && previous.version === next.version && previous.last_version === version && previous.last_channel === channel) return previous;
    await writeJsonAtomic(file, next);
    return next;
  });
}

/** True when `candidate` has a lower major version than `recorded`. */
export function isOlderMajor(candidate: string, recorded: string): boolean {
  const a = majorOf(candidate);
  const b = majorOf(recorded);
  return a !== null && b !== null && a < b;
}

export function browserTooOld(candidate: string, recorded: string, channel: string): LinkedInMcpError {
  const need = majorOf(recorded) ?? recorded;
  const update =
    channel === "chromium"
      ? "Update linkedin-mcp, then run `npx @danishfareed/linkedin-mcp install-browser`"
      : channel === "chrome"
        ? `Update Google Chrome to version ${need} or newer`
        : `Use a browser at version ${need} or newer`;
  return new LinkedInMcpError(
    "BROWSER_UNAVAILABLE",
    `The browser linkedin-mcp would start (${channel} ${candidate}) is older than the one that last used your LinkedIn profile (${recorded}). An older browser would discard the saved sign-in, so linkedin-mcp didn't start it.`,
    `${update}, or set LINKEDIN_MCP_BROWSER_CHANNEL to the browser you signed in with. To start over with this browser instead, run \`npx @danishfareed/linkedin-mcp logout\`, then sign in again.`,
    { browser_version: candidate, profile_version: recorded, channel },
  );
}

const DOTTED = /\d+\.\d+\.\d+\.\d+/;

/** CFBundleShortVersionString from an XML Info.plist. */
export function plistVersion(xml: string): string | null {
  const m = /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(xml);
  return m && DOTTED.test(m[1]!) ? m[1]!.trim() : null;
}

/** Chrome on Windows keeps its files in a folder named after the version, next to chrome.exe. */
export function newestVersionIn(names: readonly string[]): string | null {
  return maxVersion(names.map((n) => /^(\d+\.\d+\.\d+\.\d+)(\.manifest)?$/.exec(n)?.[1]));
}

const execFileAsync = promisify(execFile);

/**
 * Reads a Chromium-based browser's version without starting it: the app's
 * Info.plist on macOS, the version folder on Windows (`chrome.exe --version`
 * would open a window there), `--version` on Linux. Null when unknown.
 */
export async function executableVersion(executable: string, platform: NodeJS.Platform = process.platform): Promise<string | null> {
  try {
    if (platform === "darwin") {
      const app = /^(.*?\.app)\//.exec(executable)?.[1];
      return app ? plistVersion(await fs.readFile(join(app, "Contents", "Info.plist"), "utf8")) : null;
    }
    if (platform === "win32") return newestVersionIn(await fs.readdir(dirname(executable)));
    const { stdout } = await execFileAsync(executable, ["--version"], { timeout: 5000 });
    return DOTTED.exec(stdout)?.[0] ?? null;
  } catch {
    return null;
  }
}
