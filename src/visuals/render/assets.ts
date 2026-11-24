import { promises as fs } from "node:fs";
import { basename, isAbsolute } from "node:path";
import { invalidInput } from "../../errors.js";
import { protectedReason } from "../../safety/files.js";
import { MIME, sniffImage } from "../image-file.js";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * A local headshot or logo as a data: URI, so the renderer never loads a
 * file:// URL. The same folder rules as uploads apply: nothing from the
 * browser profile, state or credential folders.
 */
export async function loadLocalImage(input: string, what: string, linkedinMcpHome: string): Promise<string> {
  if (!isAbsolute(input)) throw invalidInput(`The ${what} must be an absolute file path, got "${input}".`);
  let real: string;
  try {
    real = await fs.realpath(input);
  } catch {
    throw invalidInput(`The ${what} file wasn't found: ${input}`);
  }
  if (await protectedReason(real, linkedinMcpHome)) throw invalidInput(`Refusing to read the ${what} from a protected folder: ${input}`);
  const stat = await fs.stat(real);
  if (!stat.isFile()) throw invalidInput(`The ${what} is not a regular file: ${input}`);
  if (stat.size > MAX_BYTES) throw invalidInput(`The ${what} ${basename(real)} is over 5 MB; use a smaller image.`);
  const data = await fs.readFile(real);
  const type = sniffImage(data);
  if (!type) throw invalidInput(`The ${what} ${basename(real)} isn't a PNG, JPEG, GIF or WebP image.`);
  return `data:${MIME[type]};base64,${data.toString("base64")}`;
}
