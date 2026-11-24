import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * Facts about the patchright package linkedin-mcp depends on. Everything is
 * resolved from our own dependency tree, never from whatever version
 * `npx patchright` would download.
 */

const require = createRequire(import.meta.url);

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function patchrightPackageDir(): string {
  return dirname(require.resolve("patchright/package.json"));
}

export function patchrightVersion(): string | null {
  try {
    return readJsonFile<{ version?: string }>(join(patchrightPackageDir(), "package.json")).version ?? null;
  } catch {
    return null;
  }
}

/** Absolute path to our patchright's command-line script. */
export function patchrightCliPath(): string {
  const dir = patchrightPackageDir();
  const { bin } = readJsonFile<{ bin?: string | Record<string, string> }>(join(dir, "package.json"));
  const script = typeof bin === "string" ? bin : (bin?.patchright ?? "cli.js");
  return join(dir, script);
}

/**
 * Arguments for `install-browser`. The headless shell is skipped because
 * linkedin-mcp always runs full Chromium, headless or not, so sign-in and
 * tools use the same browser.
 */
export const INSTALL_BROWSER_ARGS: readonly string[] = ["install", "chromium", "--no-shell"];

function coreRequire(): NodeJS.Require {
  return createRequire(join(patchrightPackageDir(), "package.json"));
}

/** The Chromium version our patchright downloads, from patchright-core's browsers.json. */
export function bundledChromiumVersion(): string | null {
  try {
    const coreDir = dirname(coreRequire().resolve("patchright-core/package.json"));
    const json = readJsonFile<{ browsers?: { name: string; browserVersion?: string }[] }>(join(coreDir, "browsers.json"));
    return json.browsers?.find((b) => b.name === "chromium")?.browserVersion ?? null;
  } catch {
    return null;
  }
}

type Registry = { findExecutable(name: string): { executablePath(sdkLanguage?: string): string | undefined } | undefined };

/**
 * Best effort: where patchright looks for a branded browser channel ("chrome",
 * "msedge"). This reads an internal API, so any surprise returns null and the
 * caller falls back to checking the version after launch.
 */
export function channelExecutablePath(channel: string): string | null {
  try {
    const core = coreRequire()("patchright-core/lib/coreBundle") as { registry?: { registry?: Registry } };
    return core.registry?.registry?.findExecutable(channel)?.executablePath("javascript") ?? null;
  } catch {
    return null;
  }
}
