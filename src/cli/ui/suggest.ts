/**
 * Fuzzy "did you mean" suggestions for typos in commands, flags, and enum
 * values. Pure functions — no terminal I/O.
 */

/** Classic Levenshtein edit distance (insert/delete/substitute). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Single rolling row of distances.
  let previous: number[] = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) previous[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    const current: number[] = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1, // deletion
        current[j - 1] + 1, // insertion
        previous[j - 1] + substitutionCost, // substitution
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Closest candidate to `value` within `maxDistance` edits, case-insensitive.
 * Exact (case-insensitive) matches always win; ties prefer the candidate with
 * the smaller distance, then the lexicographically smaller one for stability.
 */
export function suggest<T extends string>(value: string, candidates: readonly T[], maxDistance = 2): T | undefined {
  const needle = value.toLowerCase();
  let best: { candidate: T; distance: number } | undefined;
  for (const candidate of candidates) {
    const hay = candidate.toLowerCase();
    if (hay === needle) return candidate;
    const distance = levenshtein(needle, hay);
    if (distance > maxDistance) continue;
    if (!best || distance < best.distance || (distance === best.distance && candidate < best.candidate)) {
      best = { candidate, distance };
    }
  }
  return best?.candidate;
}

/**
 * A ready-to-print hint line, or undefined when nothing is close enough.
 * Example: `Unknown currency 'US'. Did you mean 'USD'?`
 */
export function suggestMessage(value: string, candidates: readonly string[], kind: string, maxDistance = 2): string | undefined {
  const match = suggest(value, candidates, maxDistance);
  if (!match) return undefined;
  return `Unknown ${kind} '${value}'. Did you mean '${match}'?`;
}
