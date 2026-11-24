import { type Palette, type ResolvedTheme, fontStack, googleFontsUrl } from "./themes.js";

/**
 * HTML for quote cards and carousel slides. Every piece of user text goes
 * through esc(); images are data: URIs; a strict CSP allows nothing but
 * inline styles, data: images and Google Fonts. Elements marked data-fit
 * are shrunk to fit by fit.ts after fonts load.
 */

export const WIDTH = 1080;

export interface Author {
  name?: string;
  handle?: string;
  /** data: URI */
  headshot?: string;
}

export interface Look {
  theme: ResolvedTheme;
  /** data: URI */
  logo?: string;
  webFonts: boolean;
}

export function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Paragraphs from blank-line-separated text; single line breaks are kept. */
function paragraphs(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p>${esc(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** A data-fit attribute set: shrink between min and max px, in `order` (lower first). */
function fit(label: string, min: number, max: number, order = 0): string {
  return `data-fit data-label="${esc(label)}" data-min="${min}" data-max="${max}" data-order="${order}"`;
}

function vars(p: Palette): string {
  return `--bg:${p.bg};--text:${p.text};--muted:${p.muted};--accent:${p.accent};--accent-text:${p.accentText};`;
}

function styles(look: Look, height: number): string {
  const t = look.theme;
  return `
@page { size: ${WIDTH}px ${height}px; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #000; }
body { -webkit-font-smoothing: antialiased; text-rendering: geometricPrecision; font-family: ${fontStack(t.bodyFont)}; }
.slide { width: ${WIDTH}px; height: ${height}px; position: relative; overflow: hidden; display: flex; flex-direction: column;
  padding: 92px 88px 84px; background: var(--bg); color: var(--text); break-after: page; page-break-after: always; }
.slide:last-child { break-after: auto; page-break-after: auto; }
.hero { background: radial-gradient(900px 700px at 105% -5%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%), var(--bg); }
[data-fit] { overflow: hidden; overflow-wrap: break-word; hyphens: manual; min-height: 0; text-wrap: pretty; }
.fit-inner { display: block; flex: 0 0 auto; }
.h { font-family: ${fontStack(t.headingFont)}; font-weight: ${t.headingWeight}; letter-spacing: ${t.headingTracking}em; line-height: 1.04; text-wrap: balance; }
/* Tight leading puts descenders below the box; let them show instead of clipping. */
.h[data-fit], .big[data-fit] { overflow: clip; overflow-clip-margin: 0.22em; }
.top { display: flex; align-items: center; justify-content: space-between; min-height: 56px; margin-bottom: 40px; flex: 0 0 auto; }
.kicker { font-size: 24px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent-text); }
.logo { height: 56px; max-width: 240px; object-fit: contain; margin-left: auto; }
.num { font-family: ${fontStack(t.headingFont)}; font-size: 40px; font-weight: 700; color: var(--accent-text); letter-spacing: 0.02em; }
.byline { display: flex; align-items: center; gap: 24px; flex: 0 0 auto; margin-top: 44px; min-height: 96px; }
.headshot { width: 96px; height: 96px; border-radius: 50%; object-fit: cover; box-shadow: 0 0 0 4px var(--bg), 0 0 0 8px var(--accent); flex: 0 0 auto; }
.who { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.name { font-size: 32px; font-weight: 700; line-height: 1.15; }
.handle { font-size: 26px; color: var(--muted); line-height: 1.2; }
.swipe { margin-left: auto; font-size: 26px; font-weight: 700; padding: 16px 28px; border-radius: 999px; background: var(--accent); color: var(--bg); white-space: nowrap; }
/* quote card */
.qmark { font-family: ${fontStack(t.headingFont)}; font-size: 240px; line-height: 0.75; height: 120px; color: var(--accent); flex: 0 0 auto; }
.quote { flex: 1 1 0; display: flex; flex-direction: column; justify-content: center; line-height: 1.16; }
/* title slide */
.title { flex: 1 1 0; display: flex; flex-direction: column; justify-content: flex-end; line-height: 1.0; }
.subtitle { margin-top: 32px; color: var(--muted); line-height: 1.3; max-height: 270px; flex: 0 0 auto; }
/* content slides */
.big { color: var(--accent-text); font-family: ${fontStack(t.headingFont)}; font-weight: ${Math.max(700, t.headingWeight)}; letter-spacing: -0.04em; line-height: 0.95; max-height: 360px; flex: 0 0 auto; margin-bottom: 28px; }
.heading { max-height: 420px; flex: 0 0 auto; }
.rule { width: 88px; height: 8px; border-radius: 4px; background: var(--accent); margin: 40px 0 44px; flex: 0 0 auto; }
.body { flex: 1 1 0; line-height: 1.42; }
.body p + p { margin-top: 0.7em; }
.body ul { list-style: none; }
.body li { position: relative; padding-left: 1.35em; }
.body li + li { margin-top: 0.6em; }
.body li::before { content: ""; position: absolute; left: 0; top: 0.5em; width: 0.5em; height: 0.5em; border-radius: 3px; background: var(--accent); }
.body p + ul { margin-top: 0.8em; }
.foot { display: flex; justify-content: space-between; align-items: center; font-size: 24px; color: var(--muted); margin-top: 36px; flex: 0 0 auto; }
.progress { position: absolute; left: 88px; right: 88px; bottom: 44px; height: 6px; border-radius: 3px; background: color-mix(in srgb, var(--text) 12%, transparent); }
.progress i { display: block; height: 100%; border-radius: 3px; background: var(--accent); }
/* end slide */
.cta { flex: 1 1 0; display: flex; flex-direction: column; justify-content: center; min-height: 0; }
.cta .headshot.large { width: 168px; height: 168px; margin-bottom: 48px; }
.cta-heading { max-height: 560px; flex: 0 1 auto; }
.cta-body { margin-top: 32px; color: var(--muted); line-height: 1.35; max-height: 280px; flex: 0 0 auto; }
.button { align-self: flex-start; margin-top: 48px; font-size: 32px; font-weight: 700; padding: 22px 40px; border-radius: 999px; background: var(--accent); color: var(--bg); flex: 0 0 auto; }
`;
}

function document(look: Look, height: number, body: string): string {
  const fontsUrl = look.webFonts ? googleFontsUrl(look.theme) : null;
  const csp = [
    "default-src 'none'",
    "img-src data:",
    `style-src 'unsafe-inline'${fontsUrl ? " https://fonts.googleapis.com" : ""}`,
    `font-src data:${fontsUrl ? " https://fonts.gstatic.com" : ""}`,
  ].join("; ");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
${fontsUrl ? `<link rel="stylesheet" href="${esc(fontsUrl)}" data-fonts>` : ""}
<style>${styles(look, height)}</style></head><body>${body}</body></html>`;
}

function byline(author: Author, extra = ""): string {
  if (!author.name && !author.handle && !author.headshot && !extra) return "";
  return `<footer class="byline">
  ${author.headshot ? `<img class="headshot" src="${author.headshot}" alt="">` : ""}
  <div class="who">${author.name ? `<div class="name">${esc(author.name)}</div>` : ""}${author.handle ? `<div class="handle">${esc(author.handle)}</div>` : ""}</div>
  ${extra}
</footer>`;
}

// ---- quote card ----

export interface QuoteCardInput {
  quote: string;
  author: Author;
  height: 1350 | 1080;
}

export function quoteCardHtml(input: QuoteCardInput, look: Look): string {
  const portrait = input.height === 1350;
  const logo = look.logo ? `<img class="logo" src="${look.logo}" alt="">` : "";
  const body = `<section class="slide hero card" style="${vars(look.theme.hero)}">
  <div class="qmark">&ldquo;</div>
  <blockquote class="quote h" ${fit("quote", portrait ? 40 : 34, portrait ? 92 : 80)}><div class="fit-inner">${esc(input.quote.trim()).replace(/\n/g, "<br>")}</div></blockquote>
  ${byline(input.author, logo) || (logo ? `<footer class="byline">${logo}</footer>` : "")}
</section>`;
  return document(look, input.height, body);
}

// ---- carousel ----

export interface ContentSlide {
  heading: string;
  body?: string;
  bullets?: string[];
  big_number?: string;
}

export interface CarouselInput {
  title: string;
  subtitle?: string;
  kicker?: string;
  slides: ContentSlide[];
  cta: { heading: string; body?: string; button?: string };
  author: Author;
}

export const SLIDE_HEIGHT = 1350;

function two(n: number): string {
  return String(n).padStart(2, "0");
}

export function carouselHtml(input: CarouselInput, look: Look): string {
  const total = input.slides.length + 2;
  const logo = look.logo ? `<img class="logo" src="${look.logo}" alt="">` : "";
  const footName = [input.author.name, input.author.handle].filter(Boolean).map((s) => esc(s!)).join(" &middot; ");

  const title = `<section class="slide hero" style="${vars(look.theme.hero)}">
  <header class="top">${input.kicker ? `<span class="kicker">${esc(input.kicker)}</span>` : "<span></span>"}${logo}</header>
  <div class="title h" ${fit("title slide: title", 64, 132, 2)}><div class="fit-inner">${esc(input.title.trim())}</div></div>
  ${input.subtitle ? `<div class="subtitle" ${fit("title slide: subtitle", 28, 40, 1)}><div class="fit-inner">${esc(input.subtitle.trim())}</div></div>` : ""}
  ${byline(input.author, `<span class="swipe">Swipe &rarr;</span>`)}
</section>`;

  const content = input.slides
    .map((s, i) => {
      const n = i + 2;
      const label = `slide ${n}`;
      const big = s.big_number ? `<div class="big" ${fit(`${label}: big number`, 120, 300, 0)}><div class="fit-inner">${esc(s.big_number.trim())}</div></div>` : "";
      const bullets = s.bullets?.length ? `<ul>${s.bullets.map((b) => `<li>${esc(b.trim())}</li>`).join("")}</ul>` : "";
      const text = s.body?.trim() ? paragraphs(s.body) : "";
      const body = text || bullets ? `<div class="body" ${fit(`${label}: body`, 26, 44, 2)}><div class="fit-inner">${text}${bullets}</div></div>` : `<div class="body"></div>`;
      return `<section class="slide base" style="${vars(look.theme.base)}">
  <header class="top"><span class="num">${two(n)}</span>${logo}</header>
  ${big}
  <h2 class="heading h" ${fit(`${label}: heading`, 44, big ? 64 : 84, 1)}><div class="fit-inner">${esc(s.heading.trim())}</div></h2>
  <div class="rule"></div>
  ${body}
  <div class="foot"><span>${footName}</span><span>${n} / ${total}</span></div>
  <div class="progress"><i style="width:${((n / total) * 100).toFixed(2)}%"></i></div>
</section>`;
    })
    .join("\n");

  const handle = input.author.handle?.startsWith("@") ? input.author.handle : undefined;
  const button = input.cta.button ?? (handle ? `Follow ${handle}` : input.author.name ? `Follow ${input.author.name}` : "");
  const end = `<section class="slide hero" style="${vars(look.theme.hero)}">
  <header class="top"><span></span>${logo}</header>
  <div class="cta">
    ${input.author.headshot ? `<img class="headshot large" src="${input.author.headshot}" alt="">` : ""}
    <h2 class="cta-heading h" ${fit("end slide: heading", 56, 112, 2)}><div class="fit-inner">${esc(input.cta.heading.trim())}</div></h2>
    ${input.cta.body ? `<div class="cta-body" ${fit("end slide: body", 28, 40, 1)}><div class="fit-inner">${esc(input.cta.body.trim())}</div></div>` : ""}
    ${button ? `<span class="button">${esc(button)}</span>` : ""}
  </div>
  ${footName ? `<div class="foot"><span>${footName}</span><span>${total} / ${total}</span></div>` : ""}
</section>`;

  return document(look, SLIDE_HEIGHT, [title, content, end].join("\n"));
}
