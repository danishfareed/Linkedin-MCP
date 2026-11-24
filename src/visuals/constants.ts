/**
 * Names shared by the visuals code and config.ts. Kept free of imports so
 * config.ts can use them without pulling in the providers or the renderer.
 */

/** AI image providers, in the order one is picked when several are set up and none is chosen. */
export const IMAGE_PROVIDERS = ["higgsfield", "openai", "gemini", "fal", "replicate", "ideogram"] as const;
export type ImageProviderId = (typeof IMAGE_PROVIDERS)[number];

/** Aspect ratios that suit LinkedIn: square, portrait feed, landscape, and link-preview landscape. */
export const ASPECT_RATIOS = ["1:1", "4:5", "16:9", "1.91:1"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

/** Built-in looks for quote cards and carousels. */
export const THEME_NAMES = ["midnight", "paper", "cobalt", "mono"] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

/** Fonts a brand may pick. Web fonts come from Google Fonts at render time, with a system fallback. */
export const FONT_KEYS = [
  "inter",
  "manrope",
  "space-grotesk",
  "ibm-plex-sans",
  "dm-sans",
  "fraunces",
  "playfair-display",
  "source-serif-4",
  "lora",
  "system-sans",
  "system-serif",
] as const;
export type FontKey = (typeof FONT_KEYS)[number];

export const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
