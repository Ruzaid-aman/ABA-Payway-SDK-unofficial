/**
 * Payment engine for the first-payment reference app.
 *
 * One interface, two modes:
 *
 *  - `sandbox` — the real `PayWay` SDK client against PayWay's sandbox
 *    gateway. Payment creation uses `retryPolicy: 'none'`: a network-failed
 *    create has an UNKNOWN outcome (the transaction may exist), so the SDK
 *    must not transparently re-send it; the operator reconciles the ID before
 *    trying again (plan §3.3 / Task 4 contract).
 *  - `demo` — a local, credential-free simulator that speaks the same
 *    gateway wire shapes as the sandbox (snake_case envelopes, base64-encoded
 *    callback URLs) and POSTs real HMAC-SHA512-signed callbacks to this
 *    app's own callback endpoint. The verification + reconciliation code
 *    paths are therefore IDENTICAL in both modes; only the gateway differs.
 *    Every demo response is labelled `simulated: true`.
 *
 * Pushback rule (both modes): a verified callback is a *signal*, never the
 * fulfillment proof. Amount and status are taken from a server-side
 * `checkTransaction` read, so a pushback that omits or mangles amount fields
 * cannot over/under-fulfill an order, and replaying a callback is harmless.
 */

import { createHmac } from 'node:crypto';
import { PayWay, verifyCallbackDetailed } from 'aba-payway-ts';
import { OrderStore, newTransactionId } from './store.ts';

export type EngineMode = 'demo' | 'sandbox';

export interface EngineOptions {
  mode: EngineMode;
  /** HTTP base URL of THIS app (for callback_url / return_url). */
  publicBaseUrl: string;
  /** Required in sandbox mode: PayWay credentials. */
  sandboxConfig?: {
    merchantId: string;
    apiKey: string;
    environment: 'sandbox' | 'production';
    /**
     * Explicit opt-in for loopback/private callback hosts (local sandbox
     * testing where PayWay cannot reach you anyway). The SDK refuses
     * private callback URLs by default — for good reason: in production
     * the gateway must be able to deliver pushbacks. Only set this when the
     * callback target is genuinely local-only (e.g. a tunnel forwards the
     * real traffic).
     */
    allowPrivateCallbackHosts?: boolean;
  };
  store: OrderStore;
  /** Demo simulator knobs (ignored in sandbox mode). */
  demo?: {
    /** Signing key shared by the simulated gateway and this app. */
    apiKey?: string;
    /** Called with each simulated callback delivery for test assertions. */
    onCallback?: (delivery: { transactionId: string; status: string }) => void;
  };
}

export interface CreateQrResult {
  simulated: boolean;
  transactionId: string;
  qrString: string;
  qrImage?: string;
  expiresAtMs: number;
}

export interface CreateHostedFormResult {
  simulated: boolean;
  transactionId: string;
  /** Complete, signed, standalone HTML form — serve as-is. */
  html: string;
  expiresAtMs: number;
}

export interface StatusResult {
  simulated: boolean;
  gatewayStatus: string;
  /** True for APPROVED / REFUNDED / DECLINED / CANCELLED — stop polling. */
  terminal: boolean;
  paidAmount?: number;
  currency?: string;
  refundedTotal?: number;
}

export type CallbackVerdict =
  | { kind: 'verified'; transactionId: string; status: string }
  | { kind: 'rejected'; reason: string };

/** What a verified pushback did once applied. */
export interface CallbackApplication {
  verdict: CallbackVerdict;
  /** The authoritative status read taken because the pushback said paid. */
  reconciledStatus?: StatusResult;
  applied: boolean;
  /** Store's explanation when a verified signal did not fulfill the order. */
  rejectedReason?: string;
}

export interface PaymentEngine {
  readonly mode: EngineMode;
  createQrPayment(input: { orderId: string; product: string; amount: number; currency: 'USD' | 'KHR' }): Promise<CreateQrResult>;
  createHostedCardForm(input: { orderId: string; product: string; amount: number; currency: 'USD' | 'KHR' }): Promise<CreateHostedFormResult>;
  checkStatus(transactionId: string): Promise<StatusResult>;
  closeTransaction(transactionId: string): Promise<void>;
  refund(transactionId: string, amount: number, currency: 'USD' | 'KHR'): Promise<void>;
  /**
   * Verify a pushback body and apply it. Status '0' (paid) triggers a
   * server-side status read; the order is fulfilled from THAT amount and
   * currency, never from the pushback body. Idempotent: replays apply once.
   */
  applyCallback(body: Record<string, unknown>, signature: string): Promise<CallbackApplication>;
  /** Signature check only — for tests and the audit log. */
  verifyCallback(body: Record<string, unknown>, signature: string): CallbackVerdict;
  /**
   * Re-point where callbacks/deliveries go (tests bind an ephemeral port
   * first; deployers may swap in a tunnel URL at runtime).
   */
  setCallbackBaseUrl(baseUrl: string): void;
}

const DEMO_API_KEY = 'demo-shared-signing-key';
const QR_LIFETIME_SECONDS = 300;
const HOSTED_LIFETIME_MINUTES = 10;
const TERMINAL = new Set(['APPROVED', 'PRE-AUTH', 'REFUNDED', 'DECLINED', 'CANCELLED']);
/** Pushback status codes that definitively mean the payment failed ('3' declined, '7' cancelled). */
const DECLINE_PUSHBACK_STATUSES = new Set(['3', '7']);

export function createPaymentEngine(options: EngineOptions): PaymentEngine {
  return options.mode === 'sandbox' ? createSandboxEngine(options) : createDemoEngine(options);
}

// ────────────────────────── sandbox mode ──────────────────────────

function createSandboxEngine(options: EngineOptions): PaymentEngine {
  if (!options.sandboxConfig) {
    throw new Error('sandbox mode requires sandboxConfig (merchantId + apiKey + environment)');
  }
  const { publicBaseUrl, store } = options;
  const apiKey = options.sandboxConfig.apiKey;
  const payway = new PayWay({
    merchantId: options.sandboxConfig.merchantId,
    apiKey,
    environment: options.sandboxConfig.environment,
    allowPrivateCallbackHosts: options.sandboxConfig.allowPrivateCallbackHosts === true,
  });
  let callbackUrl = `${publicBaseUrl}/api/payway/callback`;

  return {
    mode: 'sandbox',

    async createQrPayment({ orderId, product, amount, currency }) {
      const transactionId = freshAttempt(store, orderId, QR_LIFETIME_SECONDS);
      const response = (await payway.qr.generateQr({
        transactionId,
        amount,
        currency,
        paymentOption: 'abapay_khqr',
        callbackUrl,
        lifetime: QR_LIFETIME_SECONDS,
        items: [{ name: product, quantity: 1, price: amount }],
        // A create failure here is UNKNOWN (the transaction may exist at
        // the gateway). Do not auto-retry; reconcile this ID before creating
        // another payment.
      })) as Record<string, unknown>;
      // The live gateway answers snake_case keys; the shipped type and the
      // CLI read both spellings — do the same.
      const qrString = response.qr_string ?? response.qrString;
      if (typeof qrString !== 'string' || qrString.length === 0) {
        const status = response.status as { code?: string; message?: string } | undefined;
        throw new Error(
          `gateway create response carried no QR payload (status code ${status?.code ?? 'unknown'}: ${status?.message ?? 'no message'})`,
        );
      }
      return {
        simulated: false,
        transactionId,
        qrString,
        qrImage: qrDataUrl(response.qr_image ?? response.qrImage),
        expiresAtMs: store.getAttempt(transactionId)!.expiresAtMs,
      };
    },

    async createHostedCardForm({ orderId, product, amount, currency }) {
      const transactionId = freshAttempt(store, orderId, HOSTED_LIFETIME_MINUTES * 60);
      // getCheckoutFormHtml builds the full signed purchase payload locally
      // (no network call): the browser submits it to the gateway, so the
      // hosted page keeps the gateway's origin (§3.1 hosted route). The
      // transaction exists at the gateway only after the browser submits;
      // if the customer never does, the attempt simply expires.
      const html = payway.checkout.getCheckoutFormHtml(
        {
          transactionId,
          amount,
          currency,
          paymentOption: 'cards',
          // returnUrl is callback/pushback configuration — the gateway
          // reports the outcome here; it is NOT a guaranteed browser
          // redirect of the customer's tab.
          returnUrl: callbackUrl,
          skipSuccessPage: 1,
          lifetime: HOSTED_LIFETIME_MINUTES,
          items: [{ name: product, quantity: 1, price: amount }],
        },
        { autoSubmit: true },
      );
      return {
        simulated: false,
        transactionId,
        html,
        expiresAtMs: store.getAttempt(transactionId)!.expiresAtMs,
      };
    },

    async checkStatus(transactionId: string): Promise<StatusResult> {
      const response = (await payway.checkout.checkTransaction(transactionId)) as {
        data?: Record<string, unknown>;
      };
      const data = response.data ?? {};
      const gatewayStatus = typeof data.payment_status === 'string' ? data.payment_status : 'PENDING';
      return {
        simulated: false,
        gatewayStatus,
        terminal: TERMINAL.has(gatewayStatus),
        paidAmount: num(data.payment_amount),
        currency: str(data.payment_currency),
        refundedTotal: num(data.refund_amount),
      };
    },

    async closeTransaction(transactionId: string) {
      await payway.checkout.closeTransaction(transactionId);
      store.closeAttempt({ transactionId });
    },

    async refund(transactionId: string, amount: number, currency: 'USD' | 'KHR') {
      await payway.checkout.refund(transactionId, amount, currency);
      store.recordRefund({ transactionId, amount, currency });
    },

    async applyCallback(body, signature) {
      const verdict = verifyPushback(store, apiKey, body, signature);
      if (verdict.kind === 'rejected') {
        return { verdict, applied: false };
      }
      if (DECLINE_PUSHBACK_STATUSES.has(verdict.status)) {
        // A verified decline pushback: apply the decline locally (idempotent
        // per source) without a status read — a decline cannot over-fulfill.
        const result = store.applyDeclined({
          transactionId: verdict.transactionId,
          gatewayStatus: 'DECLINED',
          source: 'webhook',
        });
        return { verdict, applied: result.applied };
      }
      if (verdict.status !== '0') {
        // Other non-zero pushbacks are informational only; authoritative
        // status comes from check-transaction reads.
        return { verdict, applied: false };
      }
      const status = await this.checkStatus(verdict.transactionId);
      return applyPaidRead(store, verdict, status, 'webhook');
    },

    verifyCallback(body, signature) {
      return verifyPushback(store, apiKey, body, signature);
    },

    setCallbackBaseUrl(baseUrl: string) {
      callbackUrl = `${baseUrl.replace(/\/$/, '')}/api/payway/callback`;
    },
  };
}

// ─────────────────────────── demo mode ────────────────────────────

/**
 * The demo gateway state machine. One simulated transaction per ID. The
 * PRODUCT name drives outcomes for teaching and tests (transaction IDs must
 * stay gateway-legal, so control words live in the product):
 *
 *   - default       → PENDING forever (the customer never acts)
 *   - "approve"     → APPROVED shortly after creation, with a signed
 *                     callback delivered to this app's callback endpoint
 *   - "decline"     → DECLINED quickly, with a signed callback
 *   - "late"        → PENDING while open; approves a moment after the
 *                     merchant closes the attempt (late payment after
 *                     closure → needs_resolution teaching)
 *   - "no-callback" → APPROVED but never delivers a callback; only a
 *                     server-side status read reveals it (missed-callback
 *                     reconciliation teaching)
 */
interface DemoTransaction {
  transactionId: string;
  amount: number;
  currency: string;
  product: string;
  status: 'PENDING' | 'APPROVED' | 'DECLINED';
  closedLocally: boolean;
  deliverCallback: boolean;
  isLate: boolean;
}

type DemoOutcome = 'approve' | 'decline' | 'late' | 'no-callback' | 'pending';

function outcomeFor(product: string): DemoOutcome {
  const p = product.toLowerCase();
  if (p.includes('decline')) return 'decline';
  if (p.includes('late')) return 'late';
  if (p.includes('no-callback')) return 'no-callback';
  if (p.includes('approve')) return 'approve';
  return 'pending';
}

function createDemoEngine(options: EngineOptions): PaymentEngine {
  const apiKey = options.demo?.apiKey ?? DEMO_API_KEY;
  const { store } = options;
  let callbackBaseUrl = options.publicBaseUrl.replace(/\/$/, '');
  const transactions = new Map<string, DemoTransaction>();

  function deliverSignedCallback(tx: DemoTransaction): void {
    // Wire shape mirrors the purchase-flow pushback: tran_id, numeric
    // status, amount/currency, apex mark. Approvals push '0'; declines
    // push '3' (the sandbox decline code). The signature travels in the
    // x-payway-hmac-sha512 header (the same header the SDK's webhook
    // utilities read).
    const body: Record<string, string> = {
      tran_id: tx.transactionId,
      status: tx.status === 'DECLINED' ? '3' : '0',
      payway_amount: String(tx.amount),
      payway_currency: tx.currency,
      apex_mark: '000000',
    };
    const signature = createHmac('sha512', apiKey).update(sortAndConcat(body)).digest('base64');
    options.demo?.onCallback?.({ transactionId: tx.transactionId, status: body.status });
    fetch(`${callbackBaseUrl}/api/payway/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-payway-hmac-sha512': signature },
      body: JSON.stringify(body),
    }).catch(() => {
      // Delivery failure is survivable by design: the missed-callback
      // reconciliation path (server-side status reads) covers it.
    });
  }

  function maybeApprove(tx: DemoTransaction): void {
    if (tx.status !== 'PENDING') return;
    const outcome = outcomeFor(tx.product);
    const shouldApprove = outcome === 'late' ? tx.closedLocally : outcome === 'approve' || outcome === 'no-callback';
    if (!shouldApprove) return;
    tx.status = 'APPROVED';
    if (outcome === 'approve' || outcome === 'late') {
      // 'approve' pays the customer normally; 'late' is the hosted-card
      // session that completes AFTER the merchant closed the attempt — the
      // gateway still pushes back (H7), which routes the order to
      // needs_resolution instead of fulfillment.
      deliverSignedCallback(tx);
    }
  }

  return {
    mode: 'demo',

    async createQrPayment({ orderId, product, amount, currency }) {
      const transactionId = freshAttempt(store, orderId, QR_LIFETIME_SECONDS);
      const outcome = outcomeFor(product);
      const tx: DemoTransaction = {
        transactionId,
        amount,
        currency,
        product,
        status: 'PENDING',
        closedLocally: false,
        deliverCallback: outcome === 'approve' || outcome === 'decline',
        isLate: outcome === 'late',
      };
      transactions.set(transactionId, tx);
      if (outcome === 'approve' || outcome === 'decline') {
        // Resolve quickly so the teaching loop is short.
        setTimeout(() => {
          if (tx.status === 'PENDING') {
            tx.status = outcome === 'approve' ? 'APPROVED' : 'DECLINED';
            deliverSignedCallback(tx);
          }
        }, 300);
      }
      return {
        simulated: true,
        transactionId,
        qrString: simulatedKhqrPayload(transactionId, amount, currency),
        qrImage: simulatedQrPng(),
        expiresAtMs: store.getAttempt(transactionId)!.expiresAtMs,
      };
    },

    async createHostedCardForm({ orderId, product, amount, currency }) {
      const transactionId = freshAttempt(store, orderId, HOSTED_LIFETIME_MINUTES * 60);
      const outcome = outcomeFor(product);
      const tx: DemoTransaction = {
        transactionId,
        amount,
        currency,
        product,
        status: 'PENDING',
        closedLocally: false,
        deliverCallback: outcome === 'approve' || outcome === 'decline',
        isLate: outcome === 'late',
      };
      transactions.set(transactionId, tx);
      // The simulated hosted page "runs" the card flow: paying there is
      // simulated by the same outcome timers as the QR flow.
      if (outcome === 'approve' || outcome === 'decline') {
        setTimeout(() => {
          if (tx.status === 'PENDING') {
            tx.status = outcome === 'approve' ? 'APPROVED' : 'DECLINED';
            if (tx.deliverCallback) deliverSignedCallback(tx);
          }
        }, 1200);
      }
      return {
        simulated: true,
        transactionId,
        html: simulatedHostedForm(transactionId, amount, currency),
        expiresAtMs: store.getAttempt(transactionId)!.expiresAtMs,
      };
    },

    async checkStatus(transactionId) {
      const tx = transactions.get(transactionId);
      if (!tx) {
        // Unknown to the simulator = still pending at the "gateway" (the
        // same grace period real check-transaction reads show).
        return { simulated: true, gatewayStatus: 'PENDING', terminal: false };
      }
      maybeApprove(tx);
      return {
        simulated: true,
        gatewayStatus: tx.status,
        terminal: TERMINAL.has(tx.status),
        paidAmount: tx.status === 'APPROVED' ? tx.amount : undefined,
        currency: tx.status === 'APPROVED' ? tx.currency : undefined,
      };
    },

    async closeTransaction(transactionId) {
      const tx = transactions.get(transactionId);
      if (tx) {
        tx.closedLocally = true;
        if (tx.isLate) {
          // The "late" teaching case: approval lands a moment AFTER the
          // merchant closed the attempt — money moved anyway.
          setTimeout(() => maybeApprove(tx), 200);
        }
      }
      store.closeAttempt({ transactionId });
    },

    async refund(transactionId, amount, currency) {
      store.recordRefund({ transactionId, amount, currency });
    },

    async applyCallback(body, signature) {
      const verdict = verifyPushback(store, apiKey, body, signature);
      if (verdict.kind === 'rejected') {
        return { verdict, applied: false };
      }
      if (DECLINE_PUSHBACK_STATUSES.has(verdict.status)) {
        const result = store.applyDeclined({
          transactionId: verdict.transactionId,
          gatewayStatus: 'DECLINED',
          source: 'webhook',
        });
        return { verdict, applied: result.applied };
      }
      if (verdict.status !== '0') {
        return { verdict, applied: false };
      }
      const status = await this.checkStatus(verdict.transactionId);
      return applyPaidRead(store, verdict, status, 'webhook');
    },

    verifyCallback(body, signature) {
      return verifyPushback(store, apiKey, body, signature);
    },

    setCallbackBaseUrl(baseUrl: string) {
      callbackBaseUrl = baseUrl.replace(/\/$/, '');
    },
  };
}

// ─────────────────────────── shared helpers ───────────────────────

/**
 * Wire a NEW attempt for the order and return its unique transaction ID.
 * Fails when the order is already paid/refunded/needs_resolution, or when
 * an earlier attempt used the same ID (the gateway treats tran_id as the
 * idempotency surface; duplicates get overwritten, not rejected).
 */
function freshAttempt(store: OrderStore, orderId: string, lifetimeSeconds: number): string {
  const order = store.get(orderId);
  if (!order) throw new Error(`unknown order ${orderId}`);
  if (order.status === 'paid' || order.status === 'refunded') {
    throw new Error(`order ${orderId} is already ${order.status}`);
  }
  const transactionId = newTransactionId();
  store.recordAttempt(orderId, transactionId, lifetimeSeconds);
  return transactionId;
}

/**
 * Shared fulfillment gate: a verified paid signal (pushback OR poll) is
 * converted into a store application using the AUTHORITATIVE status read's
 * amount and currency.
 */
function applyPaidRead(
  store: OrderStore,
  verdict: Extract<CallbackVerdict, { kind: 'verified' }>,
  status: StatusResult,
  source: 'webhook' | 'status-check',
): CallbackApplication {
  if (status.gatewayStatus !== 'APPROVED') {
    // The pushback said paid but the gateway read disagrees — trust the
    // read, log the discrepancy, fulfill nothing.
    store.recordUnverifiedNotification({
      transactionId: verdict.transactionId,
      reason: `pushback said paid but gateway reads ${status.gatewayStatus}`,
    });
    return { verdict, reconciledStatus: status, applied: false, rejectedReason: 'gateway status disagrees with pushback' };
  }
  const result = store.applyVerifiedPayment({
    transactionId: verdict.transactionId,
    source,
    amount: status.paidAmount ?? 0,
    currency: status.currency ?? 'USD',
  });
  return {
    verdict,
    reconciledStatus: status,
    applied: result.applied,
    rejectedReason: result.rejectedReason,
  };
}

/**
 * Signature check shared by both modes. A rejected pushback is logged to the
 * audit trail but never mutates order state.
 */
function verifyPushback(store: OrderStore, apiKey: string, body: Record<string, unknown>, signature: string): CallbackVerdict {
  const result = verifyCallbackDetailed(body, signature, apiKey);
  if (!result.valid) {
    store.recordUnverifiedNotification({
      transactionId: typeof body.tran_id === 'string' ? body.tran_id : undefined,
      reason: `signature invalid (${result.reason})`,
    });
    return { kind: 'rejected', reason: result.reason ?? 'signature invalid' };
  }
  const transactionId = typeof body.tran_id === 'string' ? body.tran_id : undefined;
  if (!transactionId) {
    store.recordUnverifiedNotification({ reason: 'verified callback without tran_id' });
    return { kind: 'rejected', reason: 'missing tran_id' };
  }
  return { kind: 'verified', transactionId, status: String(body.status ?? '') };
}

/** Sorted-key value concatenation, matching verifyCallbackDetailed's canonical form for flat string bodies. */
function sortAndConcat(body: Record<string, string>): string {
  return Object.keys(body)
    .sort()
    .map((key) => body[key])
    .join('');
}

/** qr_image may arrive as a data URL or bare base64 — normalize to a data URL the <img> can consume. */
function qrDataUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
}

function num(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// ─────────────────────── demo wire-shape helpers ───────────────────

/**
 * A structurally valid EMVCo KHQR payload for the simulated QR (tag 53
 * currency, 54 amount, 58 country, 59/60 merchant). This is a FIXTURE, not
 * a real merchant: scanning it with a banking app does nothing. The QR
 * channel's real integrity check lives at the gateway.
 */
function simulatedKhqrPayload(transactionId: string, amount: number, currency: 'USD' | 'KHR'): string {
  const currencyCode = currency === 'USD' ? '840' : '116';
  const amountStr = currency === 'USD' ? amount.toFixed(2) : String(Math.round(amount));
  const tl = (tag: string, value: string) => `${tag}${value.length.toString().padStart(2, '0')}${value}`;
  const merchant = `ABA PAYWAYDEMO${transactionId.slice(0, 6).toUpperCase()}`;
  return (
    tl('00', '01') +
    tl('01', '12') +
    tl('26', tl('00', 'ABA PAYWAY') + tl('01', merchant) + tl('02', 'DEMO123')) +
    tl('52', '5999') +
    tl('53', currencyCode) +
    tl('54', amountStr) +
    tl('58', 'KH') +
    tl('59', 'Demo Merchant') +
    tl('60', 'Phnom Penh') +
    '6304DEMO'
  );
}

/** 1×1 transparent PNG — keeps the UI's <img> pipeline identical in both modes. */
function simulatedQrPng(): string {
  return (
    'data:image/png;base64,' +
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII='
  );
}

/**
 * The simulated hosted form. Same shape the SDK's getCheckoutFormHtml
 * produces (hidden signed fields, auto-submit), posting to this app's own
 * simulated hosted page. A SIMULATED banner makes the demo boundary
 * impossible to miss.
 */
function simulatedHostedForm(transactionId: string, amount: number, currency: string): string {
  const fields: Record<string, string> = {
    tran_id: transactionId,
    amount: amount.toFixed(2),
    currency,
    hash: createHmac('sha512', DEMO_API_KEY).update(transactionId).digest('base64'),
  };
  const inputs = Object.entries(fields)
    .map(([k, v]) => `      <input type="hidden" name="${k}" value="${v}"/>`)
    .join('\n');
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>Simulated PayWay hosted checkout</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 26rem; margin: 3rem auto; padding: 0 1rem; }
      .banner { background: #fff3cd; border: 1px solid #ffe08a; padding: .75rem 1rem; border-radius: 6px; }
    </style>
  </head>
  <body>
    <div class="banner"><strong>SIMULATED</strong> — demo mode: this page stands in for the gateway's hosted card page. No real payment happens.</div>
    <form method="POST" action="/demo/hosted-page" id="aba_merchant_request">
${inputs}
      <button type="submit" id="aba_merchant_request-submit">Pay ${amount.toFixed(2)} ${currency} (simulated)</button>
    </form>
    <script>setTimeout(function () { document.getElementById('aba_merchant_request').submit(); }, 1500);</script>
  </body>
</html>
`;
}
