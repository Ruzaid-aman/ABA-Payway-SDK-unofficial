import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractWebhookSignature, removeHashField } from '../../docs/examples/backend/webhook-verification.ts';
import { createCheckoutPayload } from '../../docs/examples/backend/checkout-signing.ts';

describe('Documentation examples', () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(currentDir, '..', '..');

  it('documents webhook verification using X-PAYWAY-HMAC-SHA512 header', () => {
    const webhookExample = readFileSync(
      join(repoRoot, 'docs', 'examples', 'backend', 'webhook-receiver.js'),
      'utf8',
    );

    expect(webhookExample).toContain('x-payway-hmac-sha512');
    expect(webhookExample).toContain('crypto');
    expect(webhookExample).not.toMatch(/req\.body\.hash\b/);
  });

  it('documents webhook verification correctly in the appendix snippets', () => {
    const appendix = readFileSync(
      join(repoRoot, 'docs', '14-appendix-code-snippets.md'),
      'utf8',
    );

    expect(appendix).toContain('x-payway-hmac-sha512');
    expect(appendix).toContain('verifyCallback');
    expect(appendix).not.toMatch(/req\.body\.hash\b/);
  });

  it('verifies webhook example helper functions work', () => {
    const body = { tran_id: 'T123', amount: '10.00', status: '0' };
    const signature = 'test-signature';

    expect(extractWebhookSignature({ 'x-payway-hmac-sha512': signature })).toBe(signature);
    expect(removeHashField({ ...body, hash: 'ignored' })).toEqual(body);
  });

  it('creates a checkout payload with a valid hash field', () => {
    const payload = createCheckoutPayload({
      transactionId: 'order-123',
      amount: 15.0,
      currency: 'USD',
      returnUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
      continueSuccessUrl: 'https://example.com/continue',
    });

    expect(payload).toHaveProperty('tran_id', 'order-123');
    expect(payload).toHaveProperty('hash');
    expect(typeof payload.hash).toBe('string');
    expect(payload).toHaveProperty('merchant_id', 'SANDBOX_MERCHANT');
  });
});
