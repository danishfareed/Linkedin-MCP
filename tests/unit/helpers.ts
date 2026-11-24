import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";

const dirs: string[] = [];

/** A fresh temp dir per test, removed afterwards. */
export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "linkedin-mcp-test-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

/** A clock the test can move. */
export function fakeClock(start: Date) {
  let now = new Date(start);
  const clock = () => new Date(now);
  return {
    clock,
    set(d: Date) {
      now = new Date(d);
    },
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
  };
}

/** Deterministic RNG (mulberry32). */
export function seededRng(seed = 42): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
