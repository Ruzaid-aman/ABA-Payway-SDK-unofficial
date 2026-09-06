import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createCheckoutPayload } from '../../docs/examples/backend/checkout-signing.ts';
import {
  createPaymentLink,
  getPaymentLinkDetails,
} from '../../docs/examples/backend/payment-link-create.ts';
import { extractWebhookSignature, removeHashField } from '../../docs/examples/backend/webhook-verification.ts';

describe('Documentation examples', () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(currentDir, '..', '..');

  const khqrDocs = [
    'README.md',
    'docs/07-qr-code-handling.md',
    'docs/11-callbacks-and-webhooks.md',
    'docs/16-webhook-setup-guide.md',
    'skills/aba-payway-offline-qr/SKILL.md',
  ].map((path) => readFileSync(join(repoRoot, path), 'utf8'));
  const readDoc = (path: string) => readFileSync(join(repoRoot, path), 'utf8');

  it('documents webhook verification using X-PAYWAY-HMAC-SHA512 header', () => {
    const webhookExample = readFileSync(join(repoRoot, 'docs', 'examples', 'backend', 'webhook-receiver.js'), 'utf8');

    expect(webhookExample).toContain('x-payway-hmac-sha512');
    expect(webhookExample).toContain('crypto');
    expect(webhookExample).not.toMatch(/req\.body\.hash\b/);
  });

  it('documents webhook verification correctly in the appendix snippets', () => {
    const appendix = readFileSync(join(repoRoot, 'docs', '14-appendix-code-snippets.md'), 'utf8');

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

  it('documents official offline KHQR format, configuration, local-only behavior, and migration in README', () => {
    const readme = readDoc('README.md');
    const offlineSection = readme.slice(
      readme.indexOf('### 3.1 Offline QR Generation'),
      readme.indexOf('### 4. Payment Link'),
    );

    expect(readme).toContain('payway.khqr.validateConfiguration()');
    expect(readme).toContain('62.68');
    expect(readme).toContain('dynamic (`01=12`');
    expect(readme).toContain('static (`01=11`)');
    expect(readme).toContain('without a PayWay API call');
    expect(readme).toContain('Earlier SDK releases emitted a private offline TLV format');
    expect(offlineSection).toContain('merchantId: process.env.PAYWAY_MERCHANT_ID!');
    expect(offlineSection).toContain('apiKey: process.env.PAYWAY_API_KEY!');
  });

  it('documents official offline KHQR configuration, static/dynamic modes, no-network limit, and migration in the QR guide', () => {
    const qrGuide = readDoc('docs/07-qr-code-handling.md');
    const offlineSection = qrGuide.slice(
      qrGuide.indexOf('## Official ABA KHQR Offline Generation'),
      qrGuide.indexOf('## QR Lifecycle'),
    );

    expect(qrGuide).toContain('PAYWAY_KHQR_PAYWAY_DATA');
    expect(qrGuide).toContain('62.68');
    expect(qrGuide).toContain('static QR (`01=11`)');
    expect(qrGuide).toContain('dynamic QR (`01=12`');
    expect(qrGuide).toContain('no HTTP request');
    expect(qrGuide).toContain('Earlier SDK versions used a private offline format');
    expect(offlineSection).toContain('merchantId: process.env.PAYWAY_MERCHANT_ID!');
    expect(offlineSection).toContain('apiKey: process.env.PAYWAY_API_KEY!');
  });

  it('keeps the offline QR skill on the public amount/currency/reference contract', () => {
    const skill = readDoc('skills/aba-payway-offline-qr/SKILL.md');
    const call = skill.match(/generateOfflineQR\(\{([^}]*)\}\)/s)?.[1] ?? '';

    expect(call).toContain('amount:');
    expect(call).toContain('currency:');
    expect(call).toContain('merchantRef:');
    expect(call).not.toContain('merchantId:');
    expect(call).not.toContain('transactionId:');
  });

  it('scopes online HMAC guidance and documents offline KHQR callback provisioning and reconciliation', () => {
    const callbacks = readDoc('docs/11-callbacks-and-webhooks.md');

    expect(callbacks).toContain('Online checkout callback');
    expect(callbacks).toContain('Offline ABA KHQR notification');
    expect(callbacks).toContain('/aba-payway-khqr-webhook');
    expect(callbacks).toContain('configure and whitelist');
    expect(callbacks).toContain('raw body');
    expect(callbacks).toContain('`transaction_id` only as a deduplication key');
    expect(callbacks).toContain('`merchant_ref`');
    expect(callbacks).toContain('do **not** assume it has the online HMAC contract');
    expect(callbacks).toContain('must never decide that an order is paid');
    expect(callbacks).not.toContain('PayWay signs every callback');
    expect(callbacks).not.toContain('Only the callback is cryptographically signed and trustworthy');
  });

  it('scopes the CLI listener documentation by callback type and preserves offline KHQR safety constraints', () => {
    const setupGuide = readDoc('docs/16-webhook-setup-guide.md');

    expect(setupGuide).toContain('/aba-payway-khqr-webhook');
    expect(setupGuide).toContain('configure and whitelist');
    expect(setupGuide).toContain('raw body');
    expect(setupGuide).toContain('Deduplicate on `transaction_id`');
    expect(setupGuide).toContain('`merchant_ref`');
    expect(setupGuide).toContain('no assumed online HMAC contract');
    expect(setupGuide).toContain('does not mean a payment is verified or an order is paid');
    expect(setupGuide).toContain('online checkout callback');
    expect(setupGuide).not.toContain('The server extracts the `X-PAYWAY-HMAC-SHA512` header');
  });

  it('documents the payment-link lifecycle in the dedicated chapter (docs/17)', () => {
    const chapter = readDoc('docs/17-payment-link.md');
    expect(chapter).toContain('paymentLink.create');
    expect(chapter).toContain('getDetails');
    expect(chapter).toContain('{acc, amt}');
    expect(chapter).toContain('PTL04');
    expect(chapter).toContain('pushback');
  });

  it('keeps the payment-link pushback receivers on the live no-hash contract (C7)', () => {
    for (const file of ['payment-link-pushback-receiver.js', 'payment-link-pushback-receiver.php']) {
      const example = readFileSync(join(currentDir, '../../docs/examples/backend', file), 'utf-8');
      // The contract: no hash, notification-only, verify via check-transaction.
      expect(example).toContain('NO `hash` field');
      expect(example).toContain('check-transaction');
      expect(example).toContain('verifyCallback');
      // The learned status values: numeric 0 live, "00" official — both accepted.
      expect(example).toContain("'00'");
      // Never verify via HMAC: the receivers must not import verifyCallback logic.
      expect(example).not.toContain('createHmac');
    }
  });

  it('keeps the payment-link example file on the public param contract', () => {
    const example = readFileSync(
      join(currentDir, '../../docs/examples/backend/payment-link-create.ts'),
      'utf-8',
    );
    // Purchase-path payout keys — NOT the payout domain's {account, amount}.
    expect(example).toContain("payout?: { acc: string; amt: number }[]");
    expect(example).not.toContain('account:');
    // The detail helper must document the opaque-Link-ID rule.
    expect(example).toContain('data.id');
  });

  it('exposes payment-link example helpers that build SDK params (no network at import)', () => {
    // Module-level import already succeeded above (constructing PayWay with
    // placeholder credentials throws only on blank/whitespace values, which
    // the example does not use); calling create would hit the network, so the
    // wiring test asserts the exported shapes instead.
    expect(typeof createPaymentLink).toBe('function');
    expect(typeof getPaymentLinkDetails).toBe('function');
  });
});
