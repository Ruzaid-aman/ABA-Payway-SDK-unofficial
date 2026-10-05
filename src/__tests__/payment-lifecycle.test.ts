import { describe, expect, it } from 'vitest';
import { paymentArtifact, paymentLifecycle, paymentNextStep } from '../payment-lifecycle.js';
import { server } from '../server/index.js';

describe('first-payment boundary', () => {
  it.each(['APPROVED', 'approved'])('recognizes verified payment status %s', (status) => {
    expect(paymentLifecycle(status)).toBe('approved');
  });
  it.each([undefined, null, 0, '00', 'PRE-AUTH', 'PRE_AUTH', 'REFUNDED', 'EXPIRED', 'CLOSED', 'completed', {}])(
    'does not infer approval or failure from %s',
    (status) => {
      expect(paymentLifecycle(status)).toBe('unknown');
    },
  );
  it('distinguishes pending and rejected payments', () => {
    expect(paymentLifecycle('PENDING')).toBe('pending');
    expect(paymentLifecycle('DECLINED')).toBe('failed');
    // Gateway typo (acknowledged by ABA 2026-09-12, still observed live in
    // transaction-list output) must classify as failed, not unknown.
    expect(paymentLifecycle('DECLINDED')).toBe('failed');
    expect(paymentLifecycle('CANCELLED')).toBe('failed');
    expect(paymentNextStep('unknown')).toContain('existing transaction');
    expect(paymentNextStep('approved')).toContain('fulfill once atomically');
  });
  it('does not forward raw gateway data or future session fields to the customer', () => {
    const session = { ...server.test(), raw: { apiKey: 'secret', customer: 'private' }, extra: 'private' };
    expect(Object.keys(paymentArtifact(session)).sort()).toEqual([
      'expiresAt',
      'responsePayload',
      'responseType',
      'sessionId',
    ]);
    expect(JSON.stringify(paymentArtifact(session))).not.toContain('private');
    expect(paymentArtifact(session).responsePayload).toBe(session.responsePayload);
  });
});
