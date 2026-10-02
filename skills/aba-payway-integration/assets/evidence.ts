export type Gate = 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7';
export interface GateRecord {
  gate: Gate;
  status: 'passed' | 'failed' | 'blocked' | 'pending' | 'not-applicable';
  environment: 'sandbox' | 'production';
  operation: string;
  owner: string;
  checkedAt: string;
  evidence: string[];
  reason?: string;
  approvedPolicyRef?: string;
}
export interface IntegrationProfile {
  role: 'merchant' | 'partner';
  stack: string;
  database: string;
  environment: 'sandbox' | 'production';
  merchantRef: string;
  tenantRef: string;
  operations: string[];
  entitlements: Record<string, 'enabled' | 'disabled' | 'unverified'>;
  callbackUrls: Record<string, string>;
  customerReturnUrls: string[];
  // References only: env/secret-store identifiers, never credential/account values.
  credentialRefs: string[];
  accountRefs: string[];
  owners: Record<string, string>;
  contracts: {
    operation: string;
    source: string;
    version: string;
    verifiedAt: string;
    reviewer: string;
    status: 'confirmed' | 'unconfirmed';
  }[];
  questions: string[];
}
export function validateGate(record: GateRecord): void {
  if (
    !/^G[0-7]$/.test(record.gate) ||
    !['passed', 'failed', 'blocked', 'pending', 'not-applicable'].includes(record.status) ||
    !['sandbox', 'production'].includes(record.environment) ||
    !record.operation ||
    !record.owner ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(record.checkedAt) ||
    !Number.isFinite(Date.parse(record.checkedAt))
  )
    throw new Error('Incomplete gate record');
  if (record.status === 'passed' && !record.evidence.some((item) => item.trim()))
    throw new Error('Unrun gate cannot pass');
  if (['blocked', 'failed', 'not-applicable'].includes(record.status) && !record.reason?.trim())
    throw new Error('Gate disposition requires a reason');
  if (
    ['G5', 'G6'].includes(record.gate) &&
    record.status === 'passed' &&
    (record.environment !== 'production' || !record.approvedPolicyRef?.trim())
  )
    throw new Error('ABA production rule and actual production evidence required');
}
