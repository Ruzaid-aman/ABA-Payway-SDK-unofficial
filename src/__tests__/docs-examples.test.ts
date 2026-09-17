import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createCheckoutPayload, createHostedCheckoutForm } from '../../docs/examples/backend/checkout-signing.ts';
import { createWebhookServer } from 'aba-payway-ts';
import {
  createPaymentLink,
  getPaymentLinkDetails,
} from '../../docs/examples/backend/payment-link-create.ts';
import { extractWebhookSignature, removeHashField } from '../../docs/examples/backend/webhook-verification.ts';

describe('Documentation examples', () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(currentDir, '..', '..');

  const readSkill = (name: string) => readFileSync(join(repoRoot, 'skills', name, 'SKILL.md'), 'utf8');

  const khqrDocs = [
    'README.md',
    'docs/guides/07-qr-code-handling.md',
    'docs/guides/11-callbacks-and-webhooks.md',
    'docs/guides/16-webhook-setup-guide.md',
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
    const appendix = readFileSync(join(repoRoot, 'docs', 'guides', '14-appendix-code-snippets.md'), 'utf8');

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

  // Docs acceptance bar (2026-09-12): link health is checked for EVERY numbered
  // guide chapter plus the diagram library, not just the three entry documents.
  const linkCheckedDocs = [
    'README.md',
    'docs/README.md',
    'docs/guides/QUICK-START-1-PAGER.md',
    ...readdirSync(join(repoRoot, 'docs', 'guides'))
      .filter((f) => /^\d{2}-.*\.md$/.test(f))
      .sort()
      .map((f) => `docs/guides/${f}`),
    ...readdirSync(join(repoRoot, 'docs', 'diagrams'))
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => `docs/diagrams/${f}`),
  ];

  it.each(linkCheckedDocs)('resolves repository-relative links from %s', (docPath) => {
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
    const onboarding = ['QUICKSTART.md', 'docs/guides/QUICK-START-1-PAGER.md']
      .map(readDoc)
      .join('\n');

    expect(onboarding).toContain('payway-sdk demo --check');
    expect(onboarding).toContain('payway-sdk init --mode sandbox --template first-payment');
    expect(onboarding).toContain('payway-sdk doctor --route online-qr');
    expect(onboarding).toContain('-y --no-polling --no-open-image --output json');
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
    const suppliedConfigPath = ['example-khqr-config.json', 'khqr-config.json']
      .map((name) => join(repoRoot, 'payway-boilerplate', 'ABA KHQR onsite generation', name))
      .find(existsSync);
    expect(suppliedConfigPath).toBeDefined();
    const suppliedConfig = JSON.parse(
      readFileSync(suppliedConfigPath as string, 'utf8'),
    ) as Record<string, string>;
    const documentation = khqrDocs.join('\n');

    for (const key of ['t30_00', 't30_01', 't30_02', 't52', 't59', 't60', 't62_68']) {
      const value = suppliedConfig[key];
      expect(documentation).not.toContain(value);
    }
  });

  it('keeps the README concise and retains the official offline KHQR reference', () => {
    const readme = readDoc('README.md');
    const reference = readDoc('docs/reference/SDK-AND-CLI-REFERENCE.md');
    const offlineSection = reference.slice(
      reference.indexOf('### 3.1 Offline QR Generation'),
      reference.indexOf('### 4. Payment Link'),
    );

    expect(readme).toContain('SDK and CLI reference');
    expect(reference).toContain('payway.khqr.validateConfiguration()');
    expect(reference).toContain('62.68');
    expect(reference).toContain('dynamic (`01=12`');
    expect(reference).toContain('static (`01=11`)');
    expect(reference).toContain('without a PayWay API call');
    expect(reference).toContain('Earlier SDK releases emitted a private offline TLV format');
    expect(offlineSection).toContain('merchantId: process.env.PAYWAY_MERCHANT_ID!');
    expect(offlineSection).toContain('apiKey: process.env.PAYWAY_API_KEY!');
  });

  it('documents official offline KHQR configuration, static/dynamic modes, no-network limit, and migration in the QR guide', () => {
    const qrGuide = readDoc('docs/guides/07-qr-code-handling.md');
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
    const callbacks = readDoc('docs/guides/11-callbacks-and-webhooks.md');

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
    const setupGuide = readDoc('docs/guides/16-webhook-setup-guide.md');

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
    const chapter = readDoc('docs/guides/17-payment-link.md');
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

  // ─── F12 per-skill drift guards (audit 2026-09-07) ─────────────────────────
  // Each applicable skill is checked INDIVIDUALLY — one guide's correct
  // wording can never mask another guide's contradiction.
  it('each skill individually avoids known drift classes (F05–F07/F10/F13)', () => {
    const skillsRoot = join(repoRoot, 'skills');
    const skillNames = readdirSync(skillsRoot).filter((name) => name.startsWith('aba-payway-'));
    expect(skillNames.length).toBe(34); // 34 skills since the 2026-09-12 knowledge wave.

    const readSkill = (name: string) => readFileSync(join(skillsRoot, name, 'SKILL.md'), 'utf8');

    for (const name of skillNames) {
      const content = readSkill(name);

      // F06: request IDs/ctids must match the gateway rule [a-zA-Z0-9]{5,24}
      // — hyphenated example IDs fail local validation before fetch. The -r
      // rule applies to the cof family only (payment-link -r is a merchant
      // ref with different constraints).
      for (const match of content.matchAll(/requestId: '([^']+)'/g)) {
        expect(match[1], `${name}: requestId "${match[1]}"`).toMatch(/^[a-zA-Z0-9]{5,24}$/);
      }
      for (const match of content.matchAll(/cof\s+\S+\s+-r ([a-zA-Z0-9-]+)/g)) {
        expect(match[1], `${name}: cof -r flag id "${match[1]}"`).toMatch(/^[a-zA-Z0-9]{5,24}$/);
      }

      // F13: sandbox examples must not present 000999888 as a valid
      // beneficiary (it is not in the sandbox whitelist) — neither via the
      // whitelist commands nor as a payout destination.
      expect(content, `${name}: 000999888`).not.toContain("payee: '000999888'");
      expect(content, `${name}: 000999888 cli`).not.toContain('beneficiary add 000999888');
      expect(content, `${name}: 000999888 payout`).not.toMatch(/acc['"]?\s*:\s*'?000999888/);
      expect(content, `${name}: 000999888 payout account`).not.toMatch(/account['"]?\s*:\s*'?000999888/);

      // F13: bulk detail quick starts must not normalize --pace 0.
      expect(content, `${name}: --pace 0`).not.toMatch(/--pace 0\s+--json/);

      // F10: no dead versioned-tag documentation URLs (v1.5.0 tag unpublished).
      expect(content, `${name}: dead tag URL`).not.toContain('blob/v1.5.0/');

      // F13: the valid IANA zone for the gateway clock.
      expect(content, `${name}: Asia/Phnom_Cambodia`).not.toContain('Asia/Phnom_Cambodia');
    }
  });

  it('the refund guide reconciles money in one currency and separates confirmation from validation (F02)', () => {
    const refund = readSkill('aba-payway-refund');
    expect(refund).toContain('computeRefundableBalance');
    expect(refund).not.toMatch(/payment_amount\)\s*-\s*Number\(d\.refund_amount/);
    // -y skips ONLY the prompt; --no-preflight skips ONLY validation.
    expect(refund).toContain('skips ONLY the confirmation');
    expect(refund).toContain('still runs');
  });

  it('the purchase guide matches the live hosted-response contract and CLI flags (F05)', () => {
    const purchase = readSkill('aba-payway-purchase');
    // The as-any checkout_qr_url workaround must not come back.
    expect(purchase).not.toContain('as any');
    // The CLI DOES expose --payment-gate; claiming deliberate absence is drift.
    expect(purchase).not.toMatch(/deliberately omits a --payment-gate/i);
    expect(purchase).not.toMatch(/--payment-gate.*deliberately absent/i);
    // Both hosted routes are documented with their request shapes.
    expect(purchase).toMatch(/abapay_khqr_deeplink.*viewType: 'hosted_view'/s);
    expect(purchase).toContain('purchaseHosted');
  });

  it('the offline-qr guide distinguishes local generation from downstream notifications (F07)', () => {
    const offline = readSkill('aba-payway-offline-qr');
    expect(offline).toContain('validateCallbackSetup');
    expect(offline).toContain('parseKhqrPaymentNotification');
    expect(offline).not.toMatch(/no webhook or automatic reconciliation/i);
    expect(offline).not.toMatch(/has no webhook/i);
    // Second-pass audit F07 follow-up: the blanket "unlike a locally built
    // offline QR" routing distinction contradicts the capability guidance
    // above it (callback reach depends on ABA routing/enrollment, not on
    // which tool produced the QR string) — it must not come back.
    expect(offline).not.toContain('unlike a locally built offline QR');
  });

  it('documents the offline KHQR expiry contract for invoice batches', () => {
    const offline = readSkill('aba-payway-offline-qr');
    const reference = readDoc('docs/reference/SDK-AND-CLI-REFERENCE.md');
    const qrGuide = readDoc('docs/guides/07-qr-code-handling.md');

    for (const content of [offline, reference, qrGuide]) {
      expect(content).toContain('15 minutes');
      expect(content).toContain('createdAt');
      expect(content).toContain('expiresAt');
      expect(content).toMatch(/batch/i);
    }
    expect(offline).toContain('`--lifetime` does not configure offline KHQR expiry');
  });

  it('documents repeat-payment accounting and separates payment identity from invoice reconciliation', () => {
    const offline = readSkill('aba-payway-offline-qr');
    const callbacks = readDoc('docs/guides/11-callbacks-and-webhooks.md');

    for (const content of [offline, callbacks]) {
      expect(content).toContain('can be paid multiple times');
      expect(content).toContain('`transaction_id`');
      expect(content).toContain('`merchant_ref`');
      expect(content).toMatch(/overpayment/i);
    }
  });

  it('documents the safe merchant-reference intersection for generation and inquiry', () => {
    const offline = readSkill('aba-payway-offline-qr');
    const reference = readDoc('docs/reference/SDK-AND-CLI-REFERENCE.md');

    for (const content of [offline, reference]) {
      expect(content).toContain('25 UTF-8 bytes');
      expect(content).toContain('20 ASCII characters');
      expect(content).toContain('get-transactions-by-mc-ref');
    }
  });

  it('uses the byte-aware exported inspector instead of teaching a character-index KHQR parser', () => {
    const qrGuide = readDoc('docs/guides/07-qr-code-handling.md');

    expect(qrGuide).toContain('inspectKhqrPayload');
    expect(qrGuide).toContain('validateKhqrCrc');
    expect(qrGuide).not.toContain('function parseKhqrString');
  });

  it('the token-lifecycle examples pass local request-id validation (F06)', () => {
    const lifecycle = readSkill('aba-payway-token-lifecycle');
    expect(lifecycle).not.toContain('req-renew-1');
    expect(lifecycle).not.toContain('req-detail-1');
    for (const match of lifecycle.matchAll(/requestId: '([^']+)'/g)) {
      expect(match[1]).toMatch(/^[a-zA-Z0-9]{5,24}$/);
    }
  });

  // S4 (second-pass audit): the guide computed `expiresAt` and then passed
  // the LINKING date to daysUntilTokenExpiry — returning 0 days for a fresh
  // token. The guide must pass the DERIVED expiry; this executes the guide's
  // own snippet shape against a frozen clock for fresh/near-expiry/expired.
  it('the token-lifecycle expiry example derives the expiry before counting days (S4)', async () => {
    const lifecycle = readSkill('aba-payway-token-lifecycle');
    // Phrase pin: the wrong call shape must not come back.
    expect(lifecycle).not.toMatch(/daysUntilTokenExpiry\(\s*linkedAt\s*,?\s*\)/);
    expect(lifecycle).toMatch(/daysUntilTokenExpiry\(\s*expiresAt\s*\)/);

    const { computeTokenExpiry, daysUntilTokenExpiry } = await import('../utils.js');
    const { TOKEN_VALIDITY_DAYS } = await import('../constants.js');
    expect(TOKEN_VALIDITY_DAYS).toBe(90);
    const linkedAt = new Date('2026-09-08T00:00:00Z');
    const now = linkedAt;
    // The guide's expression: derive expiry from the linking event, then count.
    const expiresAt = computeTokenExpiry(linkedAt);
    const daysLeft = daysUntilTokenExpiry(expiresAt, now);
    expect(daysLeft).toBe(90); // fresh token — the audit's failing case returned 0
    expect(daysUntilTokenExpiry(expiresAt, new Date(linkedAt.getTime() + 83 * 24 * 3600 * 1000))).toBe(7); // near-expiry
    expect(daysUntilTokenExpiry(expiresAt, new Date(linkedAt.getTime() + 91 * 24 * 3600 * 1000))).toBe(-1); // expired
    // The old wrong shape, executed, proves the difference the audit measured:
    expect(daysUntilTokenExpiry(linkedAt, now)).toBe(0);
  });

  it('the transaction-close guide presents the conflicting not-found evidence as dated (F13)', () => {
    const close = readSkill('aba-payway-transaction-close');
    expect(close).toContain('conflicting dated evidence');
    expect(close).not.toMatch(/Nonexistent `tran_id` → HTTP \*\*403\*\*/);
  });

  it('the customer-qr example guards state, obligation, and dedupe before fulfillment (F04)', () => {
    const customerQr = readSkill('aba-payway-customer-qr');
    // R2 (second-pass audit): the handler must read the route's REAL fields —
    // payment_status + original_* money — not a status/amount/currency shape
    // this route never sends (guards would silently pass at 200 with no jobs).
    expect(customerQr).toContain("String(req.body.payment_status ?? '')");
    expect(customerQr).toContain('Number(req.body.original_amount)');
    expect(customerQr).toContain("req.body.original_currency ?? ''");
    expect(customerQr).not.toMatch(/const \{[^}]*status[^}]*amount[^}]*currency[^}]*\}\s*=\s*req\.body/);
    expect(customerQr).toContain('tx.fulfillments.claim(tran_id');
    expect(customerQr).toContain('expectsExactly');
    // The unsupported pagination promise must not return.
    expect(customerQr).not.toMatch(/latest 50 per request; paginate/);
  });

  it('the transaction-by-merchant-ref guide documents the saturation gap (F03)', () => {
    const byRef = readSkill('aba-payway-transaction-by-merchant-ref');
    expect(byRef).toContain('NO pagination parameter');
    expect(byRef).toContain('GAP:');
  });
});
