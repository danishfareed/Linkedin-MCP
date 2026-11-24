import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertUnchanged, validateUpload } from "../../src/safety/files.js";
import { tempDir } from "./helpers.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
const PDF = Buffer.from("%PDF-1.7\n%....\n");

function setup() {
  const dir = tempDir();
  const home = join(dir, ".linkedin-mcp");
  mkdirSync(join(home, "profile"), { recursive: true });
  return { dir, home };
}

describe("validateUpload", () => {
  it("accepts a real PNG and returns its hash", async () => {
    const { dir, home } = setup();
    const file = join(dir, "chart.png");
    writeFileSync(file, PNG);
    const v = await validateUpload(file, "image", home);
    expect(v.name).toBe("chart.png");
    expect(v.size_bytes).toBe(16);
    expect(v.sha256).toHaveLength(64);
  });

  it("accepts a real PDF document", async () => {
    const { dir, home } = setup();
    const file = join(dir, "deck.pdf");
    writeFileSync(file, PDF);
    await expect(validateUpload(file, "document", home)).resolves.toMatchObject({ name: "deck.pdf" });
  });

  it("rejects relative paths, missing files and directories", async () => {
    const { dir, home } = setup();
    await expect(validateUpload("chart.png", "image", home)).rejects.toThrow(/absolute/);
    await expect(validateUpload(join(dir, "nope.png"), "image", home)).rejects.toThrow(/not found/);
    mkdirSync(join(dir, "folder.png"));
    await expect(validateUpload(join(dir, "folder.png"), "image", home)).rejects.toThrow(/regular file/);
  });

  it("rejects wrong extensions and content that does not match the extension", async () => {
    const { dir, home } = setup();
    const txt = join(dir, "notes.txt");
    writeFileSync(txt, "hello");
    await expect(validateUpload(txt, "image", home)).rejects.toThrow(/must be/);
    const fake = join(dir, "fake.png");
    writeFileSync(fake, "not really a png at all");
    await expect(validateUpload(fake, "image", home)).rejects.toThrow(/does not look like/);
    const pdfAsImage = join(dir, "deck.pdf");
    writeFileSync(pdfAsImage, PDF);
    await expect(validateUpload(pdfAsImage, "image", home)).rejects.toThrow(/must be/);
  });

  it("refuses anything inside the linkedin-mcp home, even through a symlink", async () => {
    const { dir, home } = setup();
    const cookie = join(home, "profile", "Cookies.png");
    writeFileSync(cookie, PNG);
    await expect(validateUpload(cookie, "image", home)).rejects.toThrow(/protected folder/);
    const link = join(dir, "innocent.png");
    symlinkSync(cookie, link);
    await expect(validateUpload(link, "image", home)).rejects.toThrow(/protected folder/);
  });

  it("detects a file swapped after the preview", async () => {
    const { dir, home } = setup();
    const file = join(dir, "photo.png");
    writeFileSync(file, PNG);
    const approved = await validateUpload(file, "image", home);
    await expect(assertUnchanged(approved, "image", home)).resolves.toBeUndefined();
    writeFileSync(file, Buffer.concat([PNG, Buffer.from("changed")]));
    await expect(assertUnchanged(approved, "image", home)).rejects.toThrow(/changed after you approved/);
  });
});
