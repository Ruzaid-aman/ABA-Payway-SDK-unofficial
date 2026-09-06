import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createCheckoutPayload, createHostedCheckoutForm } from '../../docs/examples/backend/checkout-signing.ts';
import { extractWebhookSignature, removeHashField } from '../../docs/examples/backend/webhook-verification.ts';
import { createWebhookServer } from 'aba-payway-ts';

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

  it('builds the documented hosted checkout with the public package API and purchase form route', () => {
    const html = createHostedCheckoutForm({
      transactionId: 'order-123',
      amount: 15,
      currency: 'USD',
      returnUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    });

    expect(html).toContain('action="https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase"');
    expect(html).toContain('name="payment_gate" value="0"');
    expect(html).toContain("document.getElementById('aba_merchant_request').submit()");
    expect(createWebhookServer).toBeTypeOf('function');
  });

  it.each(['README.md', 'docs/README.md', 'docs/QUICK-START-1-PAGER.md'])('resolves repository-relative links from %s', (docPath) => {
    const markdown = readDoc(docPath);
    const docDir = dirname(join(repoRoot, docPath));
    const missing = [...markdown.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)]
      .map((match) => match[1].trim().replace(/^<|>$/g, ''))
      .filter((target) => !/^(?:[a-z][a-z\d+.-]*:|#)/i.test(target))
      .map((target) => decodeURIComponent(target.split('#', 1)[0].split('?', 1)[0]))
      .filter((target) => target.length > 0)
      .filter((target) => !existsSync(resolve(docDir, target)));

    expect(missing).toEqual([]);
  });

  it('keeps the public onboarding path executable and credential safe', () => {
    const onboarding = ['README.md', 'QUICKSTART.md', 'docs/QUICK-START-1-PAGER.md']
      .map(readDoc)
      .join('\n');

    expect(onboarding).toContain('payway-sdk demo --check');
    expect(onboarding).toContain('payway-sdk init --mode sandbox --template first-payment');
    expect(onboarding).toContain('payway-sdk doctor --route online-qr');
    expect(onboarding).toContain('-y --no-polling --output json');
    expect(onboarding).toContain('PowerShell');
    expect(onboarding).toContain('fulfill');
    expect(onboarding).not.toMatch(/^\s*npx payway-sdk\b/gm);
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
});
