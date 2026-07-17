import { describe, expect, it } from 'vitest';
import { isTerminalPayWayStatus } from './payments.js';

describe('merchant QR POS status reconciliation', () => {
  it.each(['APPROVED', 'PRE-AUTH', 'REFUNDED', 'DECLINED', 'CANCELLED'])('TC-010 stops polling for %s', (status) => {
    expect(isTerminalPayWayStatus(status)).toBe(true);
  });

  it('TC-010 continues polling only while the transaction is pending', () => {
    expect(isTerminalPayWayStatus('PENDING')).toBe(false);
  });
});
