import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join, sep } from "node:path";
import { invalidInput } from "../errors.js";

/**
 * Upload validation. A file only reaches LinkedIn if it is a real image or
 * document by both extension and content, within size limits, outside
 * sensitive folders, and unchanged since the user saw the preview.
 *
 * The linkedin-mcp data folder is protected (browser profile, state, config),
 * with one narrow exception: the media folder, where generated images and
 * carousels are saved. The exception is decided on resolved paths, so a
 * symlink in media that points at the profile is still refused.
 */

export type UploadKind = "image" | "document";

export interface UploadFile {
  path: string;
  name: string;
  size_bytes: number;
  sha256: string;
}

const MB = 1024 * 1024;

const RULES: Record<UploadKind, { exts: Record<string, (head: Buffer) => boolean>; maxBytes: number }> = {
  image: {
    exts: {
      ".jpg": isJpeg,
      ".jpeg": isJpeg,
      ".png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
      ".gif": (b) => /^GIF8[79]a/.test(b.subarray(0, 6).toString("latin1")),
    },
    maxBytes: 10 * MB,
  },
  document: {
    exts: {
      ".pdf": (b) => b.subarray(0, 5).toString("latin1") === "%PDF-",
      ".pptx": isZip,
      ".docx": isZip,
      ".ppt": isOle,
      ".doc": isOle,
    },
    maxBytes: 100 * MB,
  },
};

function isJpeg(b: Buffer): boolean {
  return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}
function isZip(b: Buffer): boolean {
  return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
}
function isOle(b: Buffer): boolean {
  return b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
}

/** Name of the media folder inside the data folder; matches Paths.mediaDir in config.ts. */
export const MEDIA_DIR_NAME = "media";

/** Folders whose contents must never be uploaded, whatever the extension. */
export function deniedRoots(linkedinMcpHome: string): string[] {
  const home = homedir();
  return [linkedinMcpHome, ...[".ssh", ".aws", ".gnupg", ".config/gcloud", ".kube", ".docker", ".npmrc"].map((p) => join(home, p))];
}

export function isInside(path: string, root: string): boolean {
  return path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);
}

/**
 * The real path of the media folder, but only when it really is
 * `<data folder>/media`. If media is itself a symlink (to the profile, say),
 * there is no exception and everything in the data folder stays refused.
 */
async function realMediaDir(linkedinMcpHome: string, mediaDir: string): Promise<string | null> {
  try {
    const [home, media] = await Promise.all([fs.realpath(linkedinMcpHome), fs.realpath(mediaDir)]);
    return media === join(home, MEDIA_DIR_NAME) ? media : null;
  } catch {
    return null;
  }
}

/**
 * Why a resolved path must not be uploaded, or null when it may be. Inside
 * the data folder only files under the real media folder are allowed.
 */
export async function protectedReason(realPath: string, linkedinMcpHome: string, mediaDir = join(linkedinMcpHome, MEDIA_DIR_NAME)): Promise<string | null> {
  const home = await fs.realpath(linkedinMcpHome).catch(() => linkedinMcpHome);
  const others = await Promise.all(deniedRoots(linkedinMcpHome).slice(1).map((r) => fs.realpath(r).catch(() => r)));
  if (others.some((root) => isInside(realPath, root))) return "protected folder";
  if (isInside(realPath, home)) {
    const media = await realMediaDir(linkedinMcpHome, mediaDir);
    if (!media || realPath === media || !isInside(realPath, media)) return "protected folder";
  }
  return null;
}

async function sha256File(path: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(path)).digest("hex");
}

export async function validateUpload(input: string, kind: UploadKind, linkedinMcpHome: string): Promise<UploadFile> {
  if (!isAbsolute(input)) throw invalidInput(`Use an absolute file path, got "${input}".`);
  let real: string;
  try {
    real = await fs.realpath(input);
  } catch {
    throw invalidInput(`File not found: ${input}`);
  }
  if (await protectedReason(real, linkedinMcpHome)) {
    throw invalidInput(`Refusing to upload a file from a protected folder: ${input}`);
  }
  const stat = await fs.stat(real);
  if (!stat.isFile()) throw invalidInput(`Not a regular file: ${input}`);

  const rule = RULES[kind];
  const ext = extname(real).toLowerCase();
  const check = rule.exts[ext];
  if (!check) {
    throw invalidInput(`${kind === "image" ? "Images" : "Documents"} must be ${Object.keys(rule.exts).join(", ")}. Got "${ext || "no extension"}".`);
  }
  if (stat.size === 0) throw invalidInput(`File is empty: ${input}`);
  if (stat.size > rule.maxBytes) {
    throw invalidInput(`${basename(real)} is ${(stat.size / MB).toFixed(1)} MB; the limit is ${rule.maxBytes / MB} MB.`);
  }
  const handle = await fs.open(real, "r");
  const head = Buffer.alloc(16);
  try {
    await handle.read(head, 0, 16, 0);
  } finally {
    await handle.close();
  }
  if (!check(head)) throw invalidInput(`${basename(real)} does not look like a real ${ext} file.`);

  return { path: real, name: basename(real), size_bytes: stat.size, sha256: await sha256File(real) };
}

/** Right before upload: the file must still be the exact file the user approved. */
export async function assertUnchanged(file: UploadFile, kind: UploadKind, linkedinMcpHome: string): Promise<void> {
  const now = await validateUpload(file.path, kind, linkedinMcpHome);
  if (now.sha256 !== file.sha256) {
    throw invalidInput(`${file.name} changed after you approved the preview. Preview the post again.`);
  }
}
