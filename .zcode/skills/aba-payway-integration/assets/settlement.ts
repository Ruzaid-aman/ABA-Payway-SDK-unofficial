// Synthetic/report adapter helper, not an ABA report schema or download API.
// Input must come from authenticated complete exports with approved joins.
export interface ReportRow {
  scope: string;
  operationId: string;
  batchId: string;
  currency: string;
  signedMinor: number;
}
export interface Booking {
  scope: string;
  batchId: string;
  currency: string;
  signedMinor: number;
  bankReference: string;
}
export function reconcileBatch(rows: ReportRow[], booking: Booking, approvedToleranceMinor: number) {
  if (!rows.length || !booking.scope?.trim() || !booking.batchId?.trim() || !booking.currency?.trim())
    throw new Error('Nonempty scoped report batch required');
  if (!Number.isSafeInteger(approvedToleranceMinor) || approvedToleranceMinor < 0)
    throw new Error('Finance-approved integer tolerance required');
  const seen = new Map<string, string>();
  let expected = 0n;
  for (const row of rows) {
    if (
      !row.operationId ||
      !row.batchId ||
      row.scope !== booking.scope ||
      row.batchId !== booking.batchId ||
      row.currency !== booking.currency ||
      !Number.isSafeInteger(row.signedMinor)
    )
      throw new Error('Report scope/schema mismatch');
    const key = JSON.stringify([row.scope, row.operationId]);
    const fingerprint = JSON.stringify([row.scope, row.operationId, row.batchId, row.currency, row.signedMinor]);
    if (seen.has(key)) {
      if (seen.get(key) !== fingerprint) throw new Error('Conflicting duplicate report operation');
      continue;
    }
    seen.set(key, fingerprint);
    expected += BigInt(row.signedMinor);
  }
  if (!booking.bankReference?.trim() || !Number.isSafeInteger(booking.signedMinor))
    throw new Error('Bank booking evidence required');
  const difference = BigInt(booking.signedMinor) - expected;
  const magnitude = difference < 0n ? -difference : difference;
  return {
    expectedMinor: expected.toString(),
    bookedMinor: String(booking.signedMinor),
    differenceMinor: difference.toString(),
    matches: magnitude <= BigInt(approvedToleranceMinor),
    uniqueOperations: seen.size,
  };
}
