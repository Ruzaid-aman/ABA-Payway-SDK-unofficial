/**
 * DX-SEC-002 (audit P0-04): shared scanner enforcing that the unsafe
 * TLS-verification bypass (`NODE_TLS_REJECT_UNAUTHORIZED`) never re-enters
 * the repository as instructional content. The safe mechanism is
 * `tlsCaFile` / `PAYWAY_TLS_CA_FILE` (DX-SEC-001). Consumed by the
 * no-tls-bypass test (blocking gate) and reusable by doctor (DX-SEC-003).
 *
 * Allow-list discipline: entries are directory prefixes or exact paths, kept
 * minimal, and every entry documents WHY the string is legitimate there.
 * New instructional text must use the CA-bundle mechanism instead — a fresh
 * occurrence in a non-allow-listed file fails the gate.
 */

export const TLS_BYPASS_FORBIDDEN = 'NODE_TLS_REJECT_UNAUTHORIZED';

export interface AllowListEntry {
  /** Directory prefix (ends with `/`) or exact file path. */
  readonly pattern: string;
  readonly reason: string;
}

export const TLS_BYPASS_ALLOW_LIST: readonly AllowListEntry[] = [
  {
    // The agent-instructions TLS caveat keeps ONE defensive line telling
    // agents NOT to use the bypass and pointing at the CA-file mechanism.
    pattern: 'AGENTS.md',
    reason: 'intentional defensive line: Sandbox TLS caveat forbids the bypass and names the CA fix',
  },
  {
    // The handoff anti-checklist keeps ONE defensive "don't do this" line.
    pattern: 'HANDOFF.md',
    reason: 'intentional defensive line: anti-checklist forbids the bypass and names the CA fix',
  },
  {
    // Append-only findings dossiers (SANDBOX-FINDINGS, ABA-OPEN-QUESTIONS):
    // historical probe records — rewriting them would falsify evidence.
    pattern: 'docs/internal/',
    reason: 'append-only historical findings dossiers (never packaged)',
  },
  {
    // The DX audit reports describe the bypass problem itself (19 AGENTS.md
    // occurrences etc.); the report is a dated evidence document.
    pattern: 'docs/project/2026-10-05-dx-platform-audit-pass1.md',
    reason: 'dated audit report — describes the bypass problem (evidence)',
  },
  {
    pattern: 'docs/project/2026-10-05-dx-platform-audit-pass2.md',
    reason: 'dated audit report — describes the bypass problem (evidence)',
  },
  {
    // Dated plan archives: snapshots of what was planned at that time.
    pattern: 'docs/superpowers/plans/',
    reason: 'dated plan archive (historical snapshot)',
  },
  {
    // Competitive analysis quote capturing the pre-DX-SEC-001 state.
    pattern: 'docs/strategy/competitive-analysis-cli-stripe-razorpay.md',
    reason: 'dated competitive-analysis snapshot (pre-purge state)',
  },
  {
    // Archived audit evidence trees (dimension reports, handoffs).
    pattern: 'audit-results/',
    reason: 'archived audit evidence (historical record)',
  },
  {
    // Local issue tracker / probe evidence: append-only working notes.
    pattern: '.scratch/',
    reason: 'local issue tracker and probe evidence (append-only notes)',
  },
  {
    // Archived agent session plans (historical).
    pattern: '.zcode/plans/',
    reason: 'archived agent session plans (historical)',
  },
  {
    // The transport error message deliberately names the forbidden bypass so
    // integrators get the fix (CA bundle) AND the warning not to use it.
    pattern: 'src/client.ts',
    reason: 'intentional defensive mention: transport TLS-failure error names the fix and forbids the bypass',
  },
  {
    // This scanner module itself: the forbidden-string constant + allow-list.
    pattern: 'src/cli/tls-bypass-scan.ts',
    reason: 'the scanner itself: forbidden-string constant + allow-list enforcement',
  },
] as const;

/** Pure matcher (no I/O) — returns the paths whose content carries the
 * forbidden string without an allow-list entry covering them. */
export function findBypassOccurrences(
  files: ReadonlyArray<{ path: string; content: string }>,
  allowList: readonly AllowListEntry[] = TLS_BYPASS_ALLOW_LIST,
): string[] {
  const isAllowed = (filePath: string): boolean =>
    allowList.some((entry) =>
      entry.pattern.endsWith('/') ? filePath.startsWith(entry.pattern) : filePath === entry.pattern,
    );
  return files
    .filter((file) => file.content.includes(TLS_BYPASS_FORBIDDEN))
    .map((file) => file.path)
    .filter((filePath) => !isAllowed(filePath));
}
