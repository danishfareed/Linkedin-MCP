import type { Config } from "../../config.js";
import { LinkedInMcpError } from "../../errors.js";
import type { FontKey, ThemeName } from "../constants.js";
import { imageSize, sniffImage } from "../image-file.js";
import { saveMedia, slugify } from "../media.js";
import { loadLocalImage } from "./assets.js";
import { withRenderedPage, withRenderer } from "./browser.js";
import { type FitResult, fitWarnings } from "./fit.js";
import { type Author, type ContentSlide, type Look, SLIDE_HEIGHT, WIDTH, carouselHtml, quoteCardHtml } from "./templates.js";
import { fontFamilies, resolveTheme } from "./themes.js";

/**
 * Branded visuals made locally: quote cards (PNG) and carousels (PDF plus
 * PNG previews). No AI and no account needed; brand defaults come from
 * config.json and can be overridden per call.
 */

export interface BrandInput {
  primary_color?: string;
  accent_color?: string;
  font?: FontKey;
  logo_path?: string;
}

export interface AuthorInput {
  /** An empty string leaves the name off. */
  name?: string;
  handle?: string;
  headshot_path?: string;
}

export interface RenderEnv {
  config: Config;
  now: Date;
  timeoutMs: number;
  /** Used when neither the call nor config.json names the author (the signed-in LinkedIn name). */
  fallbackName?: string;
}

async function lookFor(env: RenderEnv, theme: ThemeName | undefined, brand: BrandInput | undefined): Promise<Look> {
  const b = env.config.brand;
  const resolved = resolveTheme({
    theme: theme ?? b.theme,
    primaryColor: brand?.primary_color ?? b.primaryColor,
    accentColor: brand?.accent_color ?? b.accentColor,
    font: brand?.font ?? b.font,
  });
  const logoPath = brand?.logo_path ?? b.logoPath;
  const logo = logoPath ? await loadLocalImage(logoPath, "logo", env.config.paths.home) : undefined;
  return { theme: resolved, logo, webFonts: b.webFonts };
}

async function authorFor(env: RenderEnv, a: AuthorInput | undefined): Promise<Author> {
  const b = env.config.brand;
  const pick = (given: string | undefined, fallback: string | undefined) => (given !== undefined ? given.trim() || undefined : fallback);
  const headshotPath = pick(a?.headshot_path, b.headshotPath);
  return {
    name: pick(a?.name, b.name ?? env.fallbackName),
    handle: pick(a?.handle, b.handle),
    headshot: headshotPath ? await loadLocalImage(headshotPath, "headshot", env.config.paths.home) : undefined,
  };
}

function renderWarnings(look: Look, fits: FitResult[], missingFonts: string[]): string[] {
  const warnings = [...look.theme.warnings, ...fitWarnings(fits)];
  if (missingFonts.length) warnings.push(`Couldn't load ${missingFonts.join(" and ")} from Google Fonts (offline?), so a system font was used instead.`);
  return warnings;
}

function checkPng(buf: Buffer): Buffer {
  if (sniffImage(buf) !== "png") throw new LinkedInMcpError("INTERNAL", "The renderer didn't produce a PNG.", "Try again.");
  return buf;
}

// ---- quote card ----

export interface QuoteCardOptions {
  quote: string;
  author?: AuthorInput;
  size: "portrait" | "square";
  theme?: ThemeName;
  brand?: BrandInput;
}

export interface QuoteCardResult {
  path: string;
  width: number;
  height: number;
  theme: ThemeName;
  warnings: string[];
}

export async function createQuoteCard(opts: QuoteCardOptions, env: RenderEnv): Promise<QuoteCardResult> {
  const look = await lookFor(env, opts.theme, opts.brand);
  const author = await authorFor(env, opts.author);
  const height = opts.size === "square" ? 1080 : 1350;
  const html = quoteCardHtml({ quote: opts.quote, author, height }, look);
  const { png, fits, missingFonts } = await withRenderer(env.config, env.timeoutMs, (browser) =>
    withRenderedPage(browser, html, { width: WIDTH, height }, look.webFonts ? fontFamilies(look.theme) : [], async ({ page, fits, missingFonts }) => ({
      png: checkPng(await page.locator("section.slide").first().screenshot({ type: "png" })),
      fits,
      missingFonts,
    })),
  );
  const path = await saveMedia(env.config.paths.mediaDir, env.now, `quote-${slugify(opts.quote, 32)}`, ".png", png);
  const size = imageSize(png) ?? { width: WIDTH, height };
  return { path, ...size, theme: look.theme.name, warnings: renderWarnings(look, fits, missingFonts) };
}

// ---- carousel ----

export interface CarouselOptions {
  title: string;
  subtitle?: string;
  kicker?: string;
  slides: ContentSlide[];
  cta?: { heading?: string; body?: string; button?: string };
  author?: AuthorInput;
  theme?: ThemeName;
  brand?: BrandInput;
  document_title?: string;
  preview_count: number;
}

export interface CarouselResult {
  pdf: string;
  pages: number;
  previews: string[];
  document: { path: string; title: string };
  theme: ThemeName;
  warnings: string[];
}

export async function createCarousel(opts: CarouselOptions, env: RenderEnv): Promise<CarouselResult> {
  const look = await lookFor(env, opts.theme, opts.brand);
  const author = await authorFor(env, opts.author);
  const cta = { heading: opts.cta?.heading?.trim() || "Found this useful?", body: opts.cta?.body ?? (opts.cta?.heading ? undefined : "Follow for more, and repost to share it with your network."), button: opts.cta?.button };
  const html = carouselHtml({ title: opts.title, subtitle: opts.subtitle, kicker: opts.kicker, slides: opts.slides, cta, author }, look);
  const pages = opts.slides.length + 2;
  const previewCount = Math.min(pages, opts.preview_count);

  const out = await withRenderer(env.config, env.timeoutMs, (browser) =>
    withRenderedPage(browser, html, { width: WIDTH, height: SLIDE_HEIGHT }, look.webFonts ? fontFamilies(look.theme) : [], async ({ page, fits, missingFonts }) => {
      const previews: Buffer[] = [];
      const slides = page.locator("section.slide");
      for (let i = 0; i < previewCount; i++) previews.push(checkPng(await slides.nth(i).screenshot({ type: "png" })));
      await page.emulateMedia({ media: "screen" });
      const pdf = await page.pdf({ width: `${WIDTH}px`, height: `${SLIDE_HEIGHT}px`, printBackground: true, preferCSSPageSize: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
      return { pdf, previews, fits, missingFonts };
    }),
  );
  if (out.pdf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new LinkedInMcpError("INTERNAL", "The renderer didn't produce a PDF.", "Try again.");

  const slug = `carousel-${slugify(opts.title, 32)}`;
  const pdf = await saveMedia(env.config.paths.mediaDir, env.now, slug, ".pdf", out.pdf);
  const previews: string[] = [];
  for (const [i, png] of out.previews.entries()) previews.push(await saveMedia(env.config.paths.mediaDir, env.now, `${slug}-slide-${String(i + 1).padStart(2, "0")}`, ".png", png));
  const title = (opts.document_title ?? opts.title).trim().slice(0, 100);
  return { pdf, pages, previews, document: { path: pdf, title }, theme: look.theme.name, warnings: renderWarnings(look, out.fits, out.missingFonts) };
}
