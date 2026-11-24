/**
 * A snapshot is what we read from the page for one item (a post, a comment, a
 * search result): its visible text, links, ARIA labels and a few named
 * sub-element texts. Parsers are pure functions over snapshots, which is what
 * makes them unit-testable against saved fixtures.
 */
export interface SnapshotLink {
  href: string;
  text: string;
  label: string | null;
}

export interface Snapshot {
  urn: string | null;
  /** How many matched containers enclose this one (0 = top level). */
  depth: number;
  /** innerText of the container, capped. */
  text: string;
  links: SnapshotLink[];
  /** aria-label values found inside the container. */
  labels: string[];
  fields: Record<string, string | null>;
  attrs: Record<string, string | null>;
  /** innerText of top-level list items, when the spec asks for them. */
  items: string[];
}

export function emptySnapshot(partial: Partial<Snapshot> = {}): Snapshot {
  return { urn: null, depth: 0, text: "", links: [], labels: [], fields: {}, attrs: {}, items: [], ...partial };
}
