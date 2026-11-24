/**
 * List results carry a completeness flag, so an assistant can tell "that's
 * everything" from "we stopped early".
 */
export interface ListResult<T> {
  items: T[];
  /** False when we stopped before reaching `limit` while LinkedIn may have more. */
  complete: boolean;
  note?: string;
}

export interface ListProgress {
  /** Load-more clicks and scrolls done after the first read. */
  rounds: number;
  maxRounds: number;
  /** LinkedIn showed no load-more button and a scroll added nothing: the list ended. */
  exhausted: boolean;
}

/** Pure: trims to `limit` and decides whether the list is complete. */
export function finishList<T>(items: T[], limit: number, progress: ListProgress, what: string): ListResult<T> {
  if (items.length >= limit) return { items: items.slice(0, limit), complete: true };
  if (progress.exhausted) return { items, complete: true };
  return {
    items,
    complete: false,
    note: `Stopped after ${progress.rounds} attempt${progress.rounds === 1 ? "" : "s"} to load more ${what}, with ${items.length} of the ${limit} requested. LinkedIn may have more.`,
  };
}

/**
 * What a list tool returns: `{ [key]: items, complete, note? }`, e.g.
 * `listPayload("people", await searchPeopleResult(...))`.
 */
export function listPayload<K extends string, T>(key: K, r: ListResult<T>): Record<K, T[]> & { complete: boolean; note?: string } {
  return { [key]: r.items, complete: r.complete, ...(r.note ? { note: r.note } : {}) } as Record<K, T[]> & { complete: boolean; note?: string };
}

/** Pure: a round "made progress" when it added items or LinkedIn offered more. */
export function listEnded(countBefore: number, countAfter: number, offeredMore: boolean): boolean {
  return !offeredMore && countAfter <= countBefore;
}
