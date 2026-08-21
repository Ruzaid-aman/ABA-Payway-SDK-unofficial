import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractWebhookSignature, removeHashField } from '../../docs/examples/backend/webhook-verification.ts';
import { createCheckoutPayload } from '../../docs/examples/backend/checkout-signing.ts';

describe('Documentation examples', () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(currentDir, '..', '..');

  const khqrDocs = [
    'README.md',
    'docs/07-qr-code-handling.md',
    'docs/11-callbacks-and-webhooks.md',
    'docs/16-webhook-setup-guide.md',
  ].map((path) => readFileSync(join(repoRoot, path), 'utf8'));

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

  it('documents official offline ABA KHQR configuration and its dedicated callback route', () => {
    const documentation = khqrDocs.join('\n');

    expect(documentation).toContain('payway.khqr.validateConfiguration()');
    expect(documentation).toContain('62.68');
    expect(documentation).toContain('/aba-payway-khqr-webhook');
    expect(documentation).not.toContain('Not official Bakong KHQR');
  });

  it('does not copy supplied ABA merchant values into published documentation', () => {
    const suppliedConfig = JSON.parse(
      readFileSync(join(repoRoot, 'payway-boilerplate', 'ABA KHQR onsite generation', 'khqr-config.json'), 'utf8'),
    ) as Record<string, string>;
    const documentation = khqrDocs.join('\n');

    for (const key of ['t30_00', 't30_01', 't30_02', 't52', 't59', 't60', 't62_68']) {
      const value = suppliedConfig[key];
      expect(documentation).not.toContain(value);
    }
  });
});
