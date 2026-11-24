import { promises as fs } from "node:fs";
import { basename, extname, join } from "node:path";

/**
 * The media folder: everything linkedin-mcp creates lands in
 * `<data folder>/media/<yyyy-mm>/` with a readable, timestamped name. Files
 * are created exclusively, so nothing is ever overwritten.
 */

const pad = (n: number) => String(n).padStart(2, "0");

export function monthKey(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

function stamp(now: Date): string {
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/** A short file-name-safe slug from free text: "Hello, World!" -> "hello-world". */
export function slugify(text: string, max = 40): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= max) return slug || "untitled";
  const cut = slug.slice(0, max);
  if (slug[max] === "-") return cut;
  const lastDash = cut.lastIndexOf("-");
  // Cut at a word boundary when one is reasonably close to the limit.
  return (lastDash > max / 2 ? cut.slice(0, lastDash) : cut).replace(/-+$/, "") || "untitled";
}

/** Save bytes as `<month>/<timestamp>-<name><ext>`. Returns the absolute path. */
export async function saveMedia(mediaDir: string, now: Date, name: string, ext: string, data: Buffer): Promise<string> {
  const dir = join(mediaDir, monthKey(now));
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const base = `${stamp(now)}-${name}`;
  for (let n = 1; n < 100; n++) {
    const path = join(dir, `${base}${n > 1 ? `-${n}` : ""}${ext}`);
    try {
      await fs.writeFile(path, data, { flag: "wx", mode: 0o600 });
      return path;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }
  throw new Error(`Could not find a free file name for ${base}${ext} in ${dir}`);
}

/** A path for a file that a renderer writes itself (PDFs, screenshots). Reserves the name by creating it empty. */
export async function reserveMediaPath(mediaDir: string, now: Date, name: string, ext: string): Promise<string> {
  return saveMedia(mediaDir, now, name, ext, Buffer.alloc(0));
}

const KINDS: Record<string, "image" | "document"> = { ".png": "image", ".jpg": "image", ".jpeg": "image", ".gif": "image", ".pdf": "document" };

export interface MediaFile {
  path: string;
  name: string;
  kind: "image" | "document";
  size_kb: number;
  modified_at: string;
}

/**
 * Recent files in the media folder, newest first. Only regular files in
 * `<yyyy-mm>` folders are listed; symlinks and empty placeholders are skipped.
 */
export async function listMedia(mediaDir: string, limit: number, kind?: "image" | "document"): Promise<{ files: MediaFile[]; total: number }> {
  let months: string[];
  try {
    months = (await fs.readdir(mediaDir)).filter((d) => /^\d{4}-\d{2}$/.test(d));
  } catch {
    return { files: [], total: 0 };
  }
  const found: (MediaFile & { mtime: number })[] = [];
  for (const month of months) {
    const dir = join(mediaDir, month);
    const st = await fs.lstat(dir).catch(() => null);
    if (!st?.isDirectory()) continue;
    for (const entry of await fs.readdir(dir).catch(() => [] as string[])) {
      const k = KINDS[extname(entry).toLowerCase()];
      if (!k || (kind && k !== kind)) continue;
      const path = join(dir, entry);
      const f = await fs.lstat(path).catch(() => null);
      if (!f?.isFile() || f.size === 0) continue;
      found.push({ path, name: basename(path), kind: k, size_kb: Math.max(1, Math.round(f.size / 1024)), modified_at: f.mtime.toISOString(), mtime: f.mtimeMs });
    }
  }
  found.sort((a, b) => b.mtime - a.mtime || b.name.localeCompare(a.name));
  return { files: found.slice(0, limit).map(({ mtime: _mtime, ...rest }) => rest), total: found.length };
}
