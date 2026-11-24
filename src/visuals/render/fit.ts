/**
 * Auto-fit text. Each [data-fit] box gets the largest font size between
 * data-min and data-max at which its content fits; boxes run in data-order
 * so a capped box is sized before the flexible box that takes the rest.
 *
 * The in-page code is a plain JavaScript string, not a TypeScript function:
 * transpilers (tsx, esbuild keepNames) can inject helpers into functions,
 * and those don't exist inside the page.
 */

export interface FitResult {
  label: string;
  size: number;
  max: number;
  min: number;
  /** Still too long at the minimum size; the end is cut off. */
  overflow: boolean;
  /** Visible share of the content when it overflows (1 when it fits). */
  shown: number;
  chars: number;
}

export const FIT_SCRIPT = `(() => {
  const boxes = Array.from(document.querySelectorAll("[data-fit]"));
  boxes.sort((a, b) => Number(a.dataset.order || 0) - Number(b.dataset.order || 0));
  const results = [];
  for (const box of boxes) {
    const min = Number(box.dataset.min);
    const max = Number(box.dataset.max);
    // Measure the block wrapper's height, not scrollHeight: with tight line-height,
    // glyph ink past the line boxes would count as overflow.
    const inner = box.querySelector(":scope > .fit-inner") || box;
    const fits = () => inner.offsetHeight <= box.clientHeight + 1 && inner.scrollWidth <= inner.clientWidth + 2;
    const set = (px) => { box.style.fontSize = px + "px"; };
    let size = max;
    set(max);
    if (!fits()) {
      set(min);
      size = min;
      if (fits()) {
        let lo = min, hi = max;
        while (hi - lo > 0.5) {
          const mid = (lo + hi) / 2;
          set(mid);
          if (fits()) lo = mid; else hi = mid;
        }
        size = Math.floor(lo * 2) / 2;
        set(size);
      }
    }
    const overflow = !fits();
    results.push({
      label: box.dataset.label || "",
      size, max, min, overflow,
      shown: overflow ? Math.max(0, Math.min(1, box.clientHeight / Math.max(1, inner.offsetHeight))) : 1,
      chars: (box.textContent || "").replace(/\\s+/g, " ").trim().length,
    });
  }
  return results;
})()`;

/** Wait (at most 4 s) for the given web font families, then report which loaded. */
export function fontWaitScript(families: string[]): string {
  return `(async () => {
  const families = ${JSON.stringify(families)};
  const load = Promise.all(families.flatMap((f) => ["400", "700"].map((w) => document.fonts.load(w + ' 40px "' + f + '"').catch(() => []))))
    .then(() => document.fonts.ready);
  await Promise.race([load, new Promise((r) => setTimeout(r, 4000))]);
  return Array.from(document.fonts).filter((f) => f.status === "loaded").map((f) => f.family.replace(/^["']|["']$/g, ""));
})()`;
}

/** Human warnings for text that didn't fit. */
export function fitWarnings(results: FitResult[]): string[] {
  return results
    .filter((r) => r.overflow)
    .map((r) => {
      const target = Math.max(10, Math.floor(r.chars * r.shown * 0.9));
      return `${r.label}: too long to fit even at the smallest text size (${r.min}px), so the end is cut off. Shorten it to about ${target} characters.`;
    });
}
