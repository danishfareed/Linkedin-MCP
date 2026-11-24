#!/usr/bin/env node
// Renders the README images from docs/assets/src/*.html with headless Chrome.
//
//   node scripts/assets/render.mjs            # every image
//   node scripts/assets/render.mjs hero tools # just these
//
// Static images are written as <name>.png (or <name>-light.png and
// <name>-dark.png when the source supports both themes). The demo is
// rendered frame by frame into a temp folder and assembled into
// docs/assets/demo.gif by scripts/assets/gif.py (needs Python 3 + Pillow).

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "patchright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const src = join(root, "docs/assets/src");
const out = join(root, "docs/assets");

// themes: which colour schemes to render. One theme means no suffix.
const IMAGES = {
  hero: { themes: ["dark"], scale: 2 },
  social: { themes: ["dark"], scale: 1, from: "hero" },
  "how-it-works": { themes: ["light", "dark"], scale: 2 },
  tools: { themes: ["light", "dark"], scale: 2 },
  safety: { themes: ["light", "dark"], scale: 2 },
  demo: { gif: true, scale: 1.25 },
};

const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(IMAGES);

const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
try {
  for (const name of names) {
    const spec = IMAGES[name];
    if (!spec) throw new Error(`Unknown image "${name}". Known: ${Object.keys(IMAGES).join(", ")}`);
    if (spec.gif) await renderGif(name);
    else for (const theme of spec.themes) await renderStill(name, spec, theme);
  }
} finally {
  await browser.close();
}

async function open(file, theme, scale) {
  const context = await browser.newContext({ colorScheme: theme, deviceScaleFactor: scale, viewport: { width: 1700, height: 1200 } });
  const page = await context.newPage();
  await page.goto(pathToFileURL(join(src, `${file}.html`)).href);
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

async function renderStill(name, spec, theme) {
  const { context, page } = await open(spec.from ?? name, theme, spec.scale);
  const file = spec.themes.length > 1 ? `${name}-${theme}.png` : `${name}.png`;
  await page.locator("#shot").screenshot({ path: join(out, file), omitBackground: true });
  await context.close();
  console.log(`wrote docs/assets/${file}`);
}

async function renderGif(name) {
  const { context, page } = await open(name, "dark", IMAGES[name].scale);
  const frames = await page.evaluate(() => window.demo.frames(), undefined, undefined, false); // 4th arg: main world (patchright isolates by default)
  const dir = mkdtempSync(join(tmpdir(), "linkedin-mcp-demo-"));
  try {
    const shot = page.locator("#shot");
    for (let i = 0; i < frames.length; i++) {
      await page.evaluate((t) => window.demo.seek(t), frames[i].t, undefined, false);
      await shot.screenshot({ path: join(dir, `${String(i).padStart(4, "0")}.png`) });
    }
    const durations = frames.map((f) => f.hold).join(",");
    mkdirSync(out, { recursive: true });
    execFileSync("python3", ["-I", join(root, "scripts/assets/gif.py"), dir, join(out, `${name}.gif`), durations], { stdio: "inherit" });
    console.log(`wrote docs/assets/${name}.gif (${frames.length} frames)`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    await context.close();
  }
}
