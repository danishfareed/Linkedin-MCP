import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Files in the growth folder (config.paths.growthDir). All are written
 * owner-only (0600, folders 0700) and are plain, readable JSON so the user
 * can open them. strategy.md is an export for reading; it is never read back.
 */
export interface GrowthFiles {
  dir: string;
  profile: string;
  strategy: string;
  strategyMarkdown: string;
  ideas: string;
  calendar: string;
  history: string;
}

export function growthFiles(growthDir: string): GrowthFiles {
  return {
    dir: growthDir,
    profile: join(growthDir, "profile.json"),
    strategy: join(growthDir, "strategy.json"),
    strategyMarkdown: join(growthDir, "strategy.md"),
    ideas: join(growthDir, "ideas.json"),
    calendar: join(growthDir, "calendar.json"),
    history: join(growthDir, "analytics", "history.jsonl"),
  };
}

export async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 });
}

/** Write a text file atomically (temp file in the same folder, then rename), owner-only. */
export async function writeTextAtomic(path: string, content: string): Promise<void> {
  await ensureDir(path);
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, content, { mode: 0o600 });
  try {
    await fs.rename(tmp, path);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

/** Plain objects only (not arrays, not null). */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Deep merge for patches: objects merge key by key, arrays and scalars in the
 * patch replace what was there, and undefined leaves a field alone.
 */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = isPlainObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? deepMerge(out[key], value) : value;
  }
  return out as T;
}

/** Removes a dotted path ("voice.banned_words") from an object. Returns whether something was removed. */
export function unsetPath(target: Record<string, unknown>, path: string): boolean {
  const parts = path.split(".").filter(Boolean);
  let node: unknown = target;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isPlainObject(node)) return false;
    node = node[parts[i]!];
  }
  const last = parts[parts.length - 1];
  if (!last || !isPlainObject(node) || !(last in node)) return false;
  delete node[last];
  return true;
}

/** Drops empty objects left behind after removing fields. */
export function pruneEmpty<T>(value: T): T {
  if (Array.isArray(value)) return value;
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const pruned = pruneEmpty(v);
    if (isPlainObject(pruned) && Object.keys(pruned).length === 0) continue;
    if (pruned === undefined) continue;
    out[k] = pruned;
  }
  return out as T;
}

/** Next free short id with this prefix: p1, p2… given the ids already used. */
export function nextId(prefix: string, used: Iterable<string | undefined>): string {
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const id of used) {
    const m = id ? re.exec(id) : null;
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}
