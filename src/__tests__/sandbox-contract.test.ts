/**
 * Sandbox contract suite — opt-in, live-network integration tests.
 *
 * Purpose: pin the sandbox-verified gateway facts from
 * `docs/SANDBOX-FINDINGS.md` §1–§13 (summarized in HANDOFF.md §7) as
 * executable tests, so gateway behavior drift surfaces here instead of
 * in a merchant's production integration.
 *
 * Gate: SANDBOX_CONTRACT_TESTS=1 — deliberately NOT PAYWAY_-prefixed,
 * because `src/test/vitest-hermetic-env.ts` scrubs every PAYWAY_* var at
 * test-file load, before this module evaluates. Credentials come from the
 * repo-root `.env` (parsed directly, never `process.env`, for the same
 * reason). Without both, the suite skips — so plain `npx vitest run`
 * and CI stay fully hermetic.
 *
 * Run explicitly: `npm run test:sandbox`. The standard `npm test` command
 * excludes this suite, including when credentials and the gate are present.
 *
 * Rate-limit awareness (SANDBOX-FINDINGS §4): transaction-detail 10/min,
 * transaction-list 50/min. This suite makes 1 detail call, 1 list call,
 * ~4 check-transaction calls and ~7 generate-qr calls, all sequential
 * (vitest runs tests in a file serially). Residue: sandbox transactions
 * with 180 s lifetimes that expire on their own.
 *
 * TLS: the sandbox presents a self-signed chain. `NODE_TLS_REJECT_UNAUTHORIZED`
 * is set inside `beforeAll` and restored in `afterAll` — scoped to this
 * file's worker only, per the workspace rule against setting it globally.
 * Node's fetch (undici) evaluates the variable lazily at connect time, so
 * this is effective without a shell prefix.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PayWay } from '../client.js';
import { PayWayAPIError, PayWayBusinessError, PayWayConfigError } from '../errors.js';

const LIVE_TIMEOUT = 30_000;
const DETAIL_PROPAGATION_TIMEOUT = 45_000;

const gate = process.env.SANDBOX_CONTRACT_TESTS === '1' || process.env.SANDBOX_CONTRACT_TESTS === 'true';

function parseDotenv(): Record<string, string> {
  const envPath = path.resolve(import.meta.dirname ?? '.', '../../.env');
  if (!fs.existsSync(envPath)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = gate ? parseDotenv() : {};
const merchantId = env.PAYWAY_MERCHANT_ID ?? '';
const apiKey = env.PAYWAY_API_KEY ?? '';
const callbackUrl = env.PAYWAY_CALLBACK_URL || 'https://example.com/payway-callback';
const hasCredentials = merchantId.length > 0 && apiKey.length > 0;

const suite = describe.skipIf(!gate || !hasCredentials);

let client: PayWay;
let previousTlsReject: string | undefined;

beforeAll(() => {
  if (!gate || !hasCredentials) return;
  previousTlsReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  client = new PayWay({ merchantId, apiKey, environment: 'sandbox' });
});

afterAll(() => {
  if (previousTlsReject === undefined) {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  } else {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTlsReject;
  }
});

/** Asserts the QR payload is a well-formed EMVCo KHQR string and the image is a PNG. */
function expectValidQr(qr: { qrString?: string; qrImage?: string }): void {
  expect(typeof qr.qrString).toBe('string');
  expect(qr.qrString?.startsWith('000201')).toBe(true);
  expect(typeof qr.qrImage).toBe('string');
  const image = qr.qrImage ?? '';
  const decoded = image.startsWith('data:image')
    ? Buffer.from(image.slice(image.indexOf(',') + 1), 'base64')
    : Buffer.from(image, 'base64');
  // PNG magic bytes: 89 50 4E 47
  expect(decoded.subarray(0, 4).toString('hex')).toBe('89504e47');
}

function uniqueId(label: string): string {
  return `${label}${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

suite('sandbox contract (SANDBOX-FINDINGS §1–§13; opt-in via SANDBOX_CONTRACT_TESTS=1)', () => {
  it(
    'exchange-rate succeeds with status.code "00" (§2: sandbox reachable, GET-only endpoint)',
    async () => {
      const res = await client.checkout.getExchangeRate();
      expect(res.status?.code).toBe('00');
      expect(res.exchange_rates?.usd?.sell).toBeDefined();
    },
    LIVE_TIMEOUT,
  );

  it(
    'generate-qr accepts exactly the 180 s lifetime minimum (§3: boundary 180 accepted)',
    async () => {
      const res = await client.qr.generateQr({
        transactionId: uniqueId('sbmin'),
        amount: 6.12,
        currency: 'USD',
        paymentOption: 'abapay_khqr',
        callbackUrl,
        lifetime: 180,
      });
      expectValidQr(res);
    },
    LIVE_TIMEOUT,
  );

  it(
    'QR lifetime 179 s is rejected locally before any network call (EC-17 contract; gateway boundary 179 → 400 "04" pinned in SANDBOX-FINDINGS §3)',
    async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      let caught: unknown;
      try {
        await client.qr.generateQr({
          transactionId: uniqueId('sblow'),
          amount: 1,
          currency: 'USD',
          paymentOption: 'abapay_khqr',
          callbackUrl,
          lifetime: 179,
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(PayWayConfigError);
      expect((caught as Error).message).toContain('180');
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    },
    LIVE_TIMEOUT,
  );

  it(
    'duplicate tran_id is silently accepted across two QRs with different amounts (§1)',
    async () => {
      const sharedId = uniqueId('sbdup');
      const first = await client.qr.generateQr({
        transactionId: sharedId,
        amount: 1.11,
        currency: 'USD',
        paymentOption: 'abapay_khqr',
        callbackUrl,
        lifetime: 180,
      });
      const second = await client.qr.generateQr({
        transactionId: sharedId,
        amount: 2.22,
        currency: 'USD',
        paymentOption: 'abapay_khqr',
        callbackUrl,
        lifetime: 180,
      });
      expectValidQr(first);
      expectValidQr(second);
    },
    LIVE_TIMEOUT,
  );

  it(
    'check-transaction sees a fresh transaction as PENDING within seconds (§5: <1 s propagation)',
    async () => {
      const tranId = uniqueId('sbchk');
      await client.qr.generateQr({
        transactionId: tranId,
        amount: 3.5,
        currency: 'USD',
        paymentOption: 'abapay_khqr',
        callbackUrl,
        lifetime: 180,
      });
      const res = await client.checkout.checkTransaction(tranId);
      expect(res.data?.payment_status_code).toBe(2);
      expect(res.data?.payment_status).toBe('PENDING');
    },
    LIVE_TIMEOUT,
  );

  it(
    'check-transaction on unknown tran_id → 200-wrapped business error, code 6 (§7 error shape)',
    async () => {
      let caught: unknown;
      try {
        await client.checkout.checkTransaction('sbunknown0000000');
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(PayWayBusinessError);
      const businessError = caught as PayWayBusinessError;
      expect(String(businessError.paywayCode)).toBe('6');
      expect(businessError.message).toContain('tran_id not found');
    },
    LIVE_TIMEOUT,
  );

  it(
    'transaction-detail reflects the amount after the ~5 s propagation delay (§5, §6 shape)',
    async () => {
      const tranId = uniqueId('sbdet');
      await client.qr.generateQr({
        transactionId: tranId,
        amount: 6.12,
        currency: 'USD',
        paymentOption: 'abapay_khqr',
        callbackUrl,
        lifetime: 180,
      });
      await new Promise((resolve) => setTimeout(resolve, 6000));
      const res = await client.checkout.getTransactionDetail(tranId);
      expect(res.data?.payment_status_code).toBe(2);
      expect(String(res.data?.original_amount)).toBe('6.12');
    },
    DETAIL_PROPAGATION_TIMEOUT,
  );

  it(
    'transaction-list omits unpaid QR-only transactions that check-transaction sees (§6 shape; sandbox finding 2026-08-31)',
    async () => {
      const tranId = uniqueId('sblst');
      await client.qr.generateQr({
        transactionId: tranId,
        amount: 1.5,
        currency: 'USD',
        paymentOption: 'abapay_khqr',
        callbackUrl,
        lifetime: 180,
      });
      // check-transaction sees the fresh unpaid transaction (<1 s propagation).
      const check = await client.checkout.checkTransaction(tranId);
      expect(check.data?.payment_status_code).toBe(2);
      // transaction-list does NOT contain the unpaid QR-only transaction,
      // while checkout-created ones in the same window appear (observed
      // 2026-08-31; see SANDBOX-FINDINGS §14). Window must be ≤ 3 days.
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const list = await client.checkout.getTransactionList({
        fromDate: `${fmt(yesterday)} 00:00:00`,
        toDate: `${fmt(now)} 23:59:59`,
      });
      const rows = Array.isArray(list)
        ? (list as { transaction_id?: string }[])
        : (((list as { data?: unknown }).data as { transaction_id?: string }[]) ?? []);
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.some((t) => t.transaction_id === tranId)).toBe(false);
    },
    LIVE_TIMEOUT,
  );

  it(
    'transaction-list rejects a date range wider than 3 days with HTTP 403 (sandbox finding 2026-08-31)',
    async () => {
      let caught: unknown;
      try {
        await client.checkout.getTransactionList({
          fromDate: '2026-01-01 00:00:00',
          toDate: '2030-01-01 23:59:59',
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(PayWayAPIError);
      const apiError = caught as PayWayAPIError;
      expect(apiError.statusCode).toBe(403);
      expect(apiError.message).toContain('3 days');
    },
    LIVE_TIMEOUT,
  );

  it(
    'amount lower bound: 0.01 USD accepted (§2)',
    async () => {
      const res = await client.qr.generateQr({
        transactionId: uniqueId('sblo'),
        amount: 0.01,
        currency: 'USD',
        paymentOption: 'abapay_khqr',
        callbackUrl,
        lifetime: 180,
      });
      expectValidQr(res);
    },
    LIVE_TIMEOUT,
  );

  it(
    'amount upper bound: 100000 USD accepted (§2)',
    async () => {
      const res = await client.qr.generateQr({
        transactionId: uniqueId('sbhi'),
        amount: 100_000,
        currency: 'USD',
        paymentOption: 'abapay_khqr',
        callbackUrl,
        lifetime: 180,
      });
      expectValidQr(res);
    },
    LIVE_TIMEOUT,
  );

  it(
    'KHR amounts: 4000 KHR accepted (§2)',
    async () => {
      const res = await client.qr.generateQr({
        transactionId: uniqueId('sbkhr'),
        amount: 4000,
        currency: 'KHR',
        paymentOption: 'abapay_khqr',
        callbackUrl,
        lifetime: 180,
      });
      expectValidQr(res);
    },
    LIVE_TIMEOUT,
  );

  it(
    'close-transaction is advisory: closed unpaid transaction stays PENDING (§8)',
    async () => {
      const tranId = uniqueId('sbcls');
      await client.qr.generateQr({
        transactionId: tranId,
        amount: 2,
        currency: 'USD',
        paymentOption: 'abapay_khqr',
        callbackUrl,
        lifetime: 180,
      });
      const close = await client.checkout.closeTransaction(tranId);
      expect(close.status?.code).toBe('00');
      const after = await client.checkout.checkTransaction(tranId);
      expect(after.data?.payment_status_code).toBe(2);
      expect(after.data?.payment_status).toBe('PENDING');
    },
    LIVE_TIMEOUT,
  );
});
