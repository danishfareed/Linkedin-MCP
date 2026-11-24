/** Numeric parts of a dotted version ("158.0.8127.37", "v0.2.1-beta.1" → [0, 2, 1]). Null if it has none. */
export function versionParts(version: string): number[] | null {
  const m = /(\d+(?:\.\d+)*)/.exec(version);
  return m ? m[1]!.split(".").map(Number) : null;
}

export function majorOf(version: string): number | null {
  return versionParts(version)?.[0] ?? null;
}

/**
 * Compares dotted versions numerically: negative if a < b, 0 if equal,
 * positive if a > b. A pre-release ("1.2.0-beta") sorts before its release.
 * Unreadable versions sort first.
 */
export function compareVersions(a: string, b: string): number {
  const pa = versionParts(a);
  const pb = versionParts(b);
  if (!pa || !pb) return (pa ? 1 : 0) - (pb ? 1 : 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return (/-/.test(b) ? 1 : 0) - (/-/.test(a) ? 1 : 0);
}

/** The highest of the given versions, ignoring empty values. */
export function maxVersion(versions: readonly (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const v of versions) {
    if (!v || !versionParts(v)) continue;
    if (best === null || compareVersions(v, best) > 0) best = v;
  }
  return best;
}
