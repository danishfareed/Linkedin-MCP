/** Recognise image bytes by their magic numbers, and read their pixel size. */

export type ImageType = "png" | "jpeg" | "gif" | "webp";

export function sniffImage(b: Buffer): ImageType | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 6 && /^GIF8[79]a/.test(b.subarray(0, 6).toString("latin1"))) return "gif";
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

/** Types LinkedIn accepts as post images (see safety/files.ts). */
export const POSTABLE: ReadonlySet<ImageType> = new Set(["png", "jpeg", "gif"]);

export const EXTENSION: Record<ImageType, string> = { png: ".png", jpeg: ".jpg", gif: ".gif", webp: ".webp" };
export const MIME: Record<ImageType, string> = { png: "image/png", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

/** Width and height from the file header, or null when it can't be read. */
export function imageSize(b: Buffer): { width: number; height: number } | null {
  const type = sniffImage(b);
  if (type === "png" && b.length >= 24) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (type === "gif" && b.length >= 10) return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  if (type === "jpeg") {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = b.readUInt16BE(i + 2);
      // Start-of-frame markers, except DHT (C4), JPG (C8) and DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
  }
  return null;
}
