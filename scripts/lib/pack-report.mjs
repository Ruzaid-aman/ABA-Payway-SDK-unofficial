/**
 * Shared normalizer for `npm pack --json` output (audit R02).
 *
 * npm ≤ 11 emits an ARRAY of pack reports; npm 12 emits an OBJECT keyed by
 * package name. Consumers that blindly index `[0]` read `undefined` under
 * npm 12 and fail with an opaque TypeError — normalize through this helper
 * instead, and keep npm's version in the release evidence.
 */

/**
 * @param {unknown} parsed the JSON.parse'd stdout of `npm pack --json`
 * @returns {{ filename: string, files?: Array<{ path: string, size: number }>, size: number }} a single pack report
 */
export function normalizePackReport(parsed) {
  const report = Array.isArray(parsed)
    ? parsed[0]
    : parsed && typeof parsed === 'object'
      ? typeof parsed.filename === 'string'
        ? parsed // defensive: a bare single-report object
        : Object.values(parsed)[0]
      : undefined;
  if (!report || typeof report !== 'object' || typeof report.filename !== 'string') {
    throw new Error(
      'npm pack --json returned an unrecognized shape — expected an array of reports (npm ≤11) or an object keyed by package name (npm 12)',
    );
  }
  return report;
}
