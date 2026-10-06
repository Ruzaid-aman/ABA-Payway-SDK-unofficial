/**
 * Advisory records (WP-19): every gateway advisory carries a machine-readable
 * rule id, a severity, and a source. Emitted advisories are deduped per rule
 * id per session, collectable for machine output, suppressible by rule id, and
 * escalate to PayWayConfigError under strictValidation (unless marked
 * strictEscalable: false).
 */
import { PayWayConfigError } from '../errors.js';

export type AdvisorySource = 'official' | 'sandbox' | 'docs' | 'repository';
export type AdvisorySeverity = 'info' | 'warning';

export interface AdvisoryRecord {
  ruleId: string; // e.g. 'QR-016', or 'GW-CAP-EMAIL' for gateway caps without a registry rule
  message: string;
  severity: AdvisorySeverity;
  source: AdvisorySource;
}

export interface AdvisoryOptions {
  ruleId: string;
  source?: AdvisorySource; // default 'docs'
  severity?: AdvisorySeverity; // default 'warning'
  /** strictValidation escalates ONLY when true (default true — preserves
   * today's behavior for every existing advisory). */
  strictEscalable?: boolean;
}

export function isAdvisoryIgnored(record: AdvisoryRecord): boolean {
  const raw = process.env.PAYWAY_ADVISORY_IGNORE;
  if (!raw) return false;
  const ignored = raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
  return ignored.includes(record.ruleId.trim().toLowerCase());
}

// One rule id warns once per session (dedupe moved here from utils.ts).
const advisoryWarnedRuleIds = new Set<string>();
// Everything emitted this session (post-ignore), for collector consumers.
const advisorySession: AdvisoryRecord[] = [];

export function resetAdvisoryDedupeForTests(): void {
  advisoryWarnedRuleIds.clear();
  advisorySession.length = 0;
}

/** Everything emitted this session (post-ignore). */
export function collectAdvisories(): AdvisoryRecord[] {
  return [...advisorySession];
}

export function emitAdvisory(
  config: { strictValidation?: boolean } | undefined,
  message: string,
  options: AdvisoryOptions,
): void {
  const record: AdvisoryRecord = {
    ruleId: options.ruleId,
    message,
    severity: options.severity ?? 'warning',
    source: options.source ?? 'docs',
  };
  if (isAdvisoryIgnored(record)) return;

  if (options.strictEscalable !== false && config?.strictValidation === true) {
    throw new PayWayConfigError(`${message} (rule ${record.ruleId})`);
  }

  advisorySession.push(record);
  if (!advisoryWarnedRuleIds.has(record.ruleId)) {
    advisoryWarnedRuleIds.add(record.ruleId);
    console.warn(`[payway] ${message}`);
  }
}
