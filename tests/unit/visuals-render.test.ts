import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { validateUpload } from "../../src/safety/files.js";
import { imageSize, sniffImage } from "../../src/visuals/image-file.js";
import { loadLocalImage } from "../../src/visuals/render/assets.js";
import { closeRenderer, warmRenderer } from "../../src/visuals/render/browser.js";
import { fitWarnings } from "../../src/visuals/render/fit.js";
import { createCarousel, createQuoteCard } from "../../src/visuals/render/index.js";
import { carouselHtml, esc, quoteCardHtml } from "../../src/visuals/render/templates.js";
import { THEMES, contrast, googleFontsUrl, resolveTheme } from "../../src/visuals/render/themes.js";
import { tempDir } from "./helpers.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

describe("themes", () => {
  it("has four distinct built-in themes with readable text", () => {
    expect(Object.keys(THEMES)).toEqual(["midnight", "paper", "cobalt", "mono"]);
    for (const t of Object.values(THEMES)) {
      expect(contrast(t.base.text, t.base.bg), `${t.name} base`).toBeGreaterThanOrEqual(7);
      expect(contrast(t.hero.text, t.hero.bg), `${t.name} hero`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.base.accentText, t.base.bg), `${t.name} accent text`).toBeGreaterThanOrEqual(3);
    }
    expect(new Set(Object.values(THEMES).map((t) => `${t.headingFont}/${t.base.bg}`)).size).toBe(4);
  });

  it("applies brand colors with readable text, and warns about a faint accent", () => {
    const light = resolveTheme({ theme: "cobalt", primaryColor: "#FFE14D", accentColor: "#0F766E", font: "lora" });
    expect(light.hero.bg).toBe("#FFE14D");
    expect(light.hero.text).toBe("#0A0A0A");
    expect(light.base.accent).toBe("#0F766E");
    expect(light.headingFont).toBe("lora");
    expect(light.warnings).toEqual([]);

    const dark = resolveTheme({ primaryColor: "#14213D" });
    expect(dark.hero.text).toBe("#FFFFFF");

    const faint = resolveTheme({ theme: "paper", accentColor: "#FFF7D6" });
    expect(faint.base.accentText).toBe(faint.base.text);
    expect(faint.warnings[0]).toMatch(/hard to read/);
  });

  it("loads only the fonts a theme uses, and none for system fonts", () => {
    expect(googleFontsUrl(THEMES.paper)).toBe("https://fonts.googleapis.com/css2?family=Fraunces:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap");
    expect(googleFontsUrl({ headingFont: "system-serif", bodyFont: "system-sans" })).toBeNull();
  });
});

describe("templates", () => {
  const look = { theme: resolveTheme({}), webFonts: true };

  it("escapes every piece of user text and allows no scripts or remote images", () => {
    const evil = `<script>alert(1)</script><img src="https://evil.example/x.png">`;
    const card = quoteCardHtml({ quote: evil, author: { name: evil, handle: evil }, height: 1350 }, look);
    expect(card).not.toContain("<script>");
    expect(card).not.toContain('<img src="https://evil');
    expect(card).toContain(esc(evil));
    expect(card).toContain("default-src 'none'");
    expect(card).toContain("img-src data:");

    const deck = carouselHtml({ title: evil, kicker: evil, subtitle: evil, slides: [{ heading: evil, body: evil, bullets: [evil], big_number: evil }], cta: { heading: evil, body: evil, button: evil }, author: { name: evil } }, look);
    expect(deck).not.toContain("<script>");
    expect(deck.match(/<img /g) ?? []).toHaveLength(0);
  });

  it("numbers slides and builds title, content and end slides", () => {
    const deck = carouselHtml(
      { title: "T", slides: [{ heading: "A" }, { heading: "B", bullets: ["x", "y"] }, { heading: "C", big_number: "62%" }], cta: { heading: "Follow" }, author: { name: "Ada", handle: "@ada" } },
      look,
    );
    expect(deck.match(/<section class="slide/g)).toHaveLength(5);
    expect(deck).toContain('<span class="num">04</span>');
    expect(deck).toContain("4 / 5");
    expect(deck).toContain("Follow @ada");
    expect(deck).toContain("<li>y</li>");
  });

  it("drops the web font link and CSP allowance when web fonts are off", () => {
    const html = quoteCardHtml({ quote: "Hi", author: {}, height: 1080 }, { ...look, webFonts: false });
    expect(html).not.toContain("fonts.googleapis.com");
  });

  it("turns fit overflow into an actionable warning", () => {
    const warnings = fitWarnings([
      { label: "slide 3: body", size: 26, max: 44, min: 26, overflow: true, shown: 0.5, chars: 800 },
      { label: "slide 2: heading", size: 60, max: 84, min: 44, overflow: false, shown: 1, chars: 30 },
    ]);
    expect(warnings).toEqual(["slide 3: body: too long to fit even at the smallest text size (26px), so the end is cut off. Shorten it to about 360 characters."]);
  });
});

describe("local images for headshots and logos", () => {
  it("reads real images as data URIs and refuses protected folders and non-images", async () => {
    const dir = tempDir();
    const home = join(dir, "home");
    mkdirSync(join(home, "profile"), { recursive: true });
    const face = join(dir, "face.png");
    writeFileSync(face, PNG);
    expect(await loadLocalImage(face, "headshot", home)).toMatch(/^data:image\/png;base64,/);
    await expect(loadLocalImage("face.png", "headshot", home)).rejects.toThrow(/absolute/);
    writeFileSync(join(home, "profile", "Cookies.png"), PNG);
    await expect(loadLocalImage(join(home, "profile", "Cookies.png"), "logo", home)).rejects.toThrow(/protected folder/);
    writeFileSync(join(dir, "notes.png"), "not an image");
    await expect(loadLocalImage(join(dir, "notes.png"), "logo", home)).rejects.toThrow(/isn't a PNG/);
  });
});

// Real rendering needs Chrome or patchright's Chromium; skip cleanly without one.
function renderConfig(home: string) {
  return loadConfig({ LINKEDIN_MCP_HOME: home, LINKEDIN_MCP_WEB_FONTS: "false" });
}
const browserAvailable = await warmRenderer(renderConfig(tempDir()));

describe.skipIf(!browserAvailable)("rendering in a separate headless browser", { timeout: 60_000 }, () => {
  afterAll(async () => {
    await closeRenderer();
  });

  function env() {
    const home = join(tempDir(), "home");
    mkdirSync(home, { recursive: true });
    return { home, env: { config: renderConfig(home), now: new Date(2026, 10, 24, 9, 0, 0), timeoutMs: 30_000, fallbackName: "Ada Lovelace" } };
  }

  it("renders a portrait quote card PNG that create_post would accept", async () => {
    const { home, env: e } = env();
    const headshot = join(dirname(home), "face.png");
    writeFileSync(headshot, PNG);
    const card = await createQuoteCard({ quote: "Ship the smallest thing that teaches you something.", author: { handle: "@ada", headshot_path: headshot }, size: "portrait", theme: "paper" }, e);
    expect(card).toMatchObject({ width: 1080, height: 1350, theme: "paper", warnings: [] });
    expect(dirname(card.path)).toBe(join(e.config.paths.mediaDir, "2026-11"));
    expect(basename(card.path)).toMatch(/^20261124-090000-quote-ship-the-smallest-thing-that\.png$/);
    const png = readFileSync(card.path);
    expect(sniffImage(png)).toBe("png");
    expect(imageSize(png)).toEqual({ width: 1080, height: 1350 });
    await expect(validateUpload(card.path, "image", home)).resolves.toMatchObject({ name: basename(card.path) });
    // The LinkedIn browser profile was never created or touched.
    expect(existsSync(e.config.paths.profile)).toBe(false);
  });

  it("renders a square card and warns when the quote is too long", async () => {
    const { env: e } = env();
    const card = await createQuoteCard({ quote: "Words that keep going ".repeat(80).trim(), size: "square", theme: "mono", brand: { primary_color: "#FFE14D" } }, e);
    expect(card).toMatchObject({ width: 1080, height: 1080 });
    expect(card.warnings.join(" ")).toMatch(/quote: too long to fit/);
  });

  it("renders a carousel PDF with one page per slide, plus PNG previews", async () => {
    const { home, env: e } = env();
    const deck = await createCarousel(
      {
        title: "Three lessons from our first hires",
        kicker: "Founder notes",
        slides: [
          { heading: "Hire for slope, not intercept", body: "The fastest learner beats the most experienced." },
          { heading: "Write the job down first", bullets: ["What will they own?", "Which decisions are theirs?"] },
          { heading: "of our best hires were referrals", big_number: "62%" },
          { heading: "This one is far too long", body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(45) },
        ],
        cta: { heading: "Hiring soon?", body: "Follow for weekly notes." },
        theme: "cobalt",
        preview_count: 2,
      },
      e,
    );
    expect(deck.pages).toBe(6);
    expect(deck.document).toEqual({ path: deck.pdf, title: "Three lessons from our first hires" });
    expect(deck.previews).toHaveLength(2);
    expect(deck.previews.map((p) => basename(p))).toEqual([
      "20261124-090000-carousel-three-lessons-from-our-first-slide-01.png",
      "20261124-090000-carousel-three-lessons-from-our-first-slide-02.png",
    ]);
    for (const p of deck.previews) expect(imageSize(readFileSync(p))).toEqual({ width: 1080, height: 1350 });
    const pdf = readFileSync(deck.pdf);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)).toHaveLength(6);
    await expect(validateUpload(deck.pdf, "document", home)).resolves.toMatchObject({ name: basename(deck.pdf) });
    expect(deck.warnings).toHaveLength(1);
    expect(deck.warnings[0]).toMatch(/^slide 5: body: too long/);
  });
});
