"""Assemble rendered PNG frames into an animated GIF.

Usage: python3 gif.py <frames-dir> <out.gif> <comma-separated durations in ms>

Called by scripts/assets/render.mjs. Uses one shared palette for every frame
so colours don't shift between frames, and no dithering so UI text stays crisp.
Identical consecutive frames are merged by Pillow, so long holds cost nothing.
"""

import sys
from pathlib import Path

from PIL import Image


def main() -> None:
    frames_dir, out, durations = Path(sys.argv[1]), Path(sys.argv[2]), [int(d) for d in sys.argv[3].split(",")]
    paths = sorted(frames_dir.glob("*.png"))
    if len(paths) != len(durations):
        raise SystemExit(f"{len(paths)} frames but {len(durations)} durations")

    frames = [Image.open(p).convert("RGB") for p in paths]

    # Build the palette from a strip of evenly spaced frames, so every state is represented.
    picks = frames[:: max(1, len(frames) // 8)] + [frames[-1]]
    w, h = frames[0].size
    strip = Image.new("RGB", (w, h * len(picks)))
    for i, f in enumerate(picks):
        strip.paste(f, (0, h * i))
    palette = strip.quantize(colors=255, method=Image.Quantize.MEDIANCUT)

    quantized = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    quantized[0].save(
        out,
        save_all=True,
        append_images=quantized[1:],
        duration=durations,
        loop=0,
        disposal=1,
        optimize=False,
    )
    print(f"{out.name}: {len(frames)} frames, {out.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
