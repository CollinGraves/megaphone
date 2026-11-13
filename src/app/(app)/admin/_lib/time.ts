const DAY_MS = 24 * 60 * 60 * 1000;

/** A Date `days` before now (kept out of components so render bodies stay lint-pure). */
export const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);
