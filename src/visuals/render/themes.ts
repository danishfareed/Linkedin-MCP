import type { FontKey, ThemeName } from "../constants.js";

/**
 * Built-in looks and brand overrides. Every theme has a base palette for
 * content slides and a hero palette for title/end slides and quote cards.
 * Text colors on brand colors are picked for contrast, never taken blindly.
 */

export interface Palette {
  bg: string;
  text: string;
  muted: string;
  /** Decorative accent: bars, markers, quote marks. */
  accent: string;
  /** Accent used for text (numbers, kickers); falls back to the text color when the accent is too faint to read. */
  accentText: string;
}

export interface Theme {
  name: ThemeName;
  label: string;
  description: string;
  base: Palette;
  hero: Palette;
  headingFont: FontKey;
  bodyFont: FontKey;
  headingWeight: number;
  /** Letter spacing for headings, in em. */
  headingTracking: number;
}

const SANS = `-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Helvetica, Arial, "Noto Sans", sans-serif`;
const SERIF = `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", "Noto Serif", serif`;
const EMOJI = `"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"`;

/** The safe font list. `google` is the Google Fonts css2 family spec; system fonts have none. */
export const FONTS: Record<FontKey, { family: string | null; google: string | null; fallback: string }> = {
  inter: { family: "Inter", google: "Inter:wght@400;500;600;700;800", fallback: SANS },
  manrope: { family: "Manrope", google: "Manrope:wght@400;500;600;700;800", fallback: SANS },
  "space-grotesk": { family: "Space Grotesk", google: "Space+Grotesk:wght@400;500;600;700", fallback: SANS },
  "ibm-plex-sans": { family: "IBM Plex Sans", google: "IBM+Plex+Sans:wght@400;500;600;700", fallback: SANS },
  "dm-sans": { family: "DM Sans", google: "DM+Sans:wght@400;500;600;700;800", fallback: SANS },
  fraunces: { family: "Fraunces", google: "Fraunces:wght@400;500;600;700;800", fallback: SERIF },
  "playfair-display": { family: "Playfair Display", google: "Playfair+Display:wght@400;500;600;700;800", fallback: SERIF },
  "source-serif-4": { family: "Source Serif 4", google: "Source+Serif+4:wght@400;500;600;700", fallback: SERIF },
  lora: { family: "Lora", google: "Lora:wght@400;500;600;700", fallback: SERIF },
  "system-sans": { family: null, google: null, fallback: SANS },
  "system-serif": { family: null, google: null, fallback: SERIF },
};

export function fontStack(key: FontKey): string {
  const f = FONTS[key];
  return `${f.family ? `"${f.family}", ` : ""}${f.fallback}, ${EMOJI}`;
}

function palette(bg: string, text: string, muted: string, accent: string): Palette {
  return { bg, text, muted, accent, accentText: contrast(accent, bg) >= 3 ? accent : text };
}

export const THEMES: Record<ThemeName, Theme> = {
  midnight: {
    name: "midnight",
    label: "Midnight",
    description: "Near-black with warm amber highlights and a geometric sans. Confident and modern.",
    base: palette("#0E1116", "#F2F4F7", "#98A2B3", "#F5B544"),
    hero: palette("#0E1116", "#F2F4F7", "#98A2B3", "#F5B544"),
    headingFont: "space-grotesk",
    bodyFont: "inter",
    headingWeight: 700,
    headingTracking: -0.025,
  },
  paper: {
    name: "paper",
    label: "Paper",
    description: "Warm cream pages, an editorial serif and burnt-orange accents, with dark title slides.",
    base: palette("#F6F1E8", "#1C1917", "#6B645C", "#B8461B"),
    hero: palette("#1C1917", "#F6F1E8", "#B5ADA3", "#F0A35E"),
    headingFont: "fraunces",
    bodyFont: "inter",
    headingWeight: 600,
    headingTracking: -0.02,
  },
  cobalt: {
    name: "cobalt",
    label: "Cobalt",
    description: "Bold cobalt-blue title slides with a yellow highlight; clean white content slides.",
    base: palette("#FFFFFF", "#0B1B3F", "#5B6B8C", "#1D3FD8"),
    hero: palette("#1D3FD8", "#FFFFFF", "#C7D2FE", "#FFD447"),
    headingFont: "manrope",
    bodyFont: "manrope",
    headingWeight: 800,
    headingTracking: -0.03,
  },
  mono: {
    name: "mono",
    label: "Mono",
    description: "Black and off-white only, generous space, tight type. Lets the words carry it.",
    base: palette("#FAFAF9", "#0A0A0A", "#737373", "#0A0A0A"),
    hero: palette("#0A0A0A", "#FAFAF9", "#A3A3A3", "#FAFAF9"),
    headingFont: "dm-sans",
    bodyFont: "dm-sans",
    headingWeight: 700,
    headingTracking: -0.035,
  },
};

// ---- color math (WCAG 2 relative luminance) ----

function rgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const n = Number.parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Mix two colors; t=0 gives a, t=1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const ca = rgb(a);
  const cb = rgb(b);
  return `#${ca.map((v, i) => Math.round(v + (cb[i]! - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

function readableOn(bg: string): string {
  return contrast("#FFFFFF", bg) >= contrast("#0A0A0A", bg) ? "#FFFFFF" : "#0A0A0A";
}

export interface BrandOverrides {
  theme?: ThemeName;
  primaryColor?: string;
  accentColor?: string;
  font?: FontKey;
}

export interface ResolvedTheme extends Theme {
  warnings: string[];
}

/**
 * The theme with brand colors and font applied. The primary color becomes
 * the hero background (title and end slides, quote cards); the accent
 * replaces the theme's accent where it stays readable.
 */
export function resolveTheme(o: BrandOverrides): ResolvedTheme {
  const t = THEMES[o.theme ?? "midnight"];
  const warnings: string[] = [];
  let hero = { ...t.hero };
  let base = { ...t.base };
  if (o.primaryColor) {
    const text = readableOn(o.primaryColor);
    hero = palette(o.primaryColor, text, mix(text, o.primaryColor, 0.35), hero.accent);
    if (contrast(hero.accent, o.primaryColor) < 2) hero = palette(o.primaryColor, text, hero.muted, text);
  }
  if (o.accentColor) {
    base = palette(base.bg, base.text, base.muted, o.accentColor);
    hero = palette(hero.bg, hero.text, hero.muted, contrast(o.accentColor, hero.bg) >= 2 ? o.accentColor : hero.accent);
    if (contrast(o.accentColor, base.bg) < 3) {
      warnings.push(`The accent color ${o.accentColor} is hard to read on the ${t.label} background, so it's used only for decoration there.`);
    }
  }
  const font = o.font;
  return { ...t, base, hero, headingFont: font ?? t.headingFont, bodyFont: font ?? t.bodyFont, warnings };
}

/** The Google Fonts stylesheet URL for a theme, or null when it only uses system fonts. */
export function googleFontsUrl(theme: Pick<Theme, "headingFont" | "bodyFont">): string | null {
  const specs = [...new Set([theme.headingFont, theme.bodyFont])].map((k) => FONTS[k].google).filter((g): g is string => g !== null);
  if (!specs.length) return null;
  return `https://fonts.googleapis.com/css2?${specs.map((s) => `family=${s}`).join("&")}&display=swap`;
}

export function fontFamilies(theme: Pick<Theme, "headingFont" | "bodyFont">): string[] {
  return [...new Set([theme.headingFont, theme.bodyFont])].map((k) => FONTS[k].family).filter((f): f is string => f !== null);
}
