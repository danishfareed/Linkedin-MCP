import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { invalidInput } from "../../errors.js";

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

// --- Keys from user input ---------------------------------------------------
//
// Patches, appends and dotted paths come from the assistant, so they are
// treated as untrusted. Keys that reach an object's prototype are refused,
// walks follow own properties only, and every document is parsed through its
// zod schema (which drops unknown keys and builds fresh objects) before it is
// written.

/** Keys that would reach or replace an object's prototype. */
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/** One segment of a dotted field path: a lower-case field name. */
export const PATH_SEGMENT = /^[a-z][a-z0-9_]*$/;

export function isSafeKey(key: string): boolean {
  return !FORBIDDEN_KEYS.has(key);
}

function assertSafeKey(key: string, where: string): void {
  if (!isSafeKey(key)) throw invalidInput(`"${key}" isn't allowed as a field name${where ? ` (in ${where})` : ""}.`);
}

/** Throws if any object key anywhere inside `value` is a prototype key. */
export function assertSafeKeys(value: unknown, where = ""): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertSafeKeys(item, `${where}[${i}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, inner] of Object.entries(value)) {
    assertSafeKey(key, where);
    assertSafeKeys(inner, where ? `${where}.${key}` : key);
  }
}

/** A dotted path is valid when every segment is a lower-case field name and none is a prototype key. */
export function isFieldPath(path: string): boolean {
  return path.split(".").every((p) => PATH_SEGMENT.test(p) && isSafeKey(p));
}

/** Strips optional, nullable and default wrappers. */
function unwrap(schema: z.ZodType): z.ZodType {
  let s = schema;
  while (s instanceof z.ZodOptional || s instanceof z.ZodNullable || s instanceof z.ZodDefault) s = s.unwrap() as z.ZodType;
  return s;
}

/** Whether `parts` names a field of `schema`, through nested objects (not into lists). */
export function schemaHasPath(schema: z.ZodType, parts: string[]): boolean {
  let s = unwrap(schema);
  for (const part of parts) {
    if (!(s instanceof z.ZodObject)) return false;
    const shape = s.shape as Record<string, z.ZodType>;
    if (!Object.hasOwn(shape, part)) return false;
    s = unwrap(shape[part]!);
  }
  return true;
}

/** Splits and checks a dotted path; with a schema, it must name one of the schema's fields. */
export function parseFieldPath(path: string, schema?: z.ZodType): string[] {
  if (!isFieldPath(path)) throw invalidInput(`"${path}" isn't a valid field path. Use lower-case field names separated by dots, e.g. voice.banned_words.`);
  const parts = path.split(".");
  if (schema && !schemaHasPath(schema, parts)) throw invalidInput(`"${path}" isn't a field that can be removed.`);
  return parts;
}

/**
 * Deep merge for patches: objects merge key by key, arrays and scalars in the
 * patch replace what was there, and undefined leaves a field alone. Builds new
 * plain objects, copies only own properties, and refuses prototype keys.
 */
export function deepMerge<T>(base: T, patch: unknown, where = ""): T {
  if (!isPlainObject(patch)) {
    if (patch === undefined) return base;
    assertSafeKeys(patch, where);
    return patch as T;
  }
  const out: Record<string, unknown> = {};
  if (isPlainObject(base)) for (const [k, v] of Object.entries(base)) if (isSafeKey(k)) out[k] = v;
  for (const [key, value] of Object.entries(patch)) {
    assertSafeKey(key, where);
    if (value === undefined) continue;
    const here = where ? `${where}.${key}` : key;
    const current = Object.hasOwn(out, key) ? out[key] : undefined;
    out[key] = isPlainObject(value) ? deepMerge(isPlainObject(current) ? current : {}, value, here) : deepMerge(current, value, here);
  }
  return out as T;
}

/**
 * Removes a dotted path ("voice.banned_words") from an object, following own
 * properties only. With a schema, the path must be one of its fields. Returns
 * whether something was removed.
 */
export function unsetPath(target: Record<string, unknown>, path: string, schema?: z.ZodType): boolean {
  const parts = parseFieldPath(path, schema);
  let node: unknown = target;
  for (const part of parts.slice(0, -1)) {
    if (!isPlainObject(node) || !Object.hasOwn(node, part)) return false;
    node = node[part];
  }
  const last = parts[parts.length - 1]!;
  if (!isPlainObject(node) || !Object.hasOwn(node, last)) return false;
  delete node[last];
  return true;
}

/** Drops empty objects left behind after removing fields, and any prototype keys. */
export function pruneEmpty<T>(value: T): T {
  if (Array.isArray(value)) return value;
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (!isSafeKey(k)) continue;
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
