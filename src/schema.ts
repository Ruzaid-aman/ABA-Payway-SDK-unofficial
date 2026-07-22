/**
 * TransactionSession — The strict JSON contract between Server (Module 1),
 * Client (Module 2), and Test Harness (Module 3).
 *
 * No module imports another module directly. They communicate ONLY through
 * this contract (or configuration objects). Changing this schema is a
 * breaking change for all three modules.
 *
 * @example
 * {
 *   "sessionId": "tx_1719900000_abc123",
 *   "status": "pending",
 *   "responseType": "qr_string",
 *   "responsePayload": "000201010212...",
 *   "expiresAt": "2025-07-18T01:45:00.000Z",
 *   "raw": { "qr_string": "000201010212..." }
 * }
 */

/**
 * The type of payload PayWay can return for a purchase initiation.
 *
 * - `deeplink`        : A URL scheme that launches a native app (e.g. ABA Mobile).
 * - `qr_string`       : A raw KHQR payload string to be rendered as a QR code.
 * - `qr_image`        : A URL pointing to a pre-rendered QR image.
 * - `checkout_qr_url` : A hosted URL that renders the QR code as an image/page (from payment_gate=0).
 * - `url`             : A hosted checkout URL to redirect/open.
 * - `html`            : An HTML snippet (hosted checkout page) to embed.
 */
export type ResponseType = 'deeplink' | 'qr_string' | 'qr_image' | 'checkout_qr_url' | 'url' | 'html';

/**
 * The lifecycle status of a transaction session.
 *
 * - `pending`   : Initiated, awaiting customer action.
 * - `completed` : Customer has paid (confirmed via callback/check).
 * - `failed`    : Rejected, expired, or cancelled.
 */
export type SessionStatus = 'pending' | 'completed' | 'failed';

/**
 * The canonical contract object produced by the Server module and consumed
 * by the Client module. The Test Harness generates mock variations of this
 * object.
 */
export interface TransactionSession {
  /** Merchant/SDK-generated unique session identifier. */
  sessionId: string;
  /** Current lifecycle status of the session. */
  status: SessionStatus;
  /** Discriminator the client uses to pick the correct rendering strategy. */
  responseType: ResponseType;
  /**
   * The payload to render. Shape depends on `responseType`:
   * - `deeplink`  : string (the deeplink URL scheme)
   * - `qr_string` : string (raw KHQR payload)
   * - `qr_image`  : string (URL to the QR image)
   * - `url`       : string (checkout URL)
   * - `html`      : string (HTML snippet)
   */
  responsePayload: string;
  /** ISO-8601 timestamp when this session expires. */
  expiresAt: string;
  /** The original, unmodified PayWay response for advanced/debug use. */
  raw?: unknown;
}

/**
 * Input payload accepted by `server.initiateTransaction()`.
 * This is a merchant-friendly subset of PayWay's PurchaseRequest.
 */
export interface InitiateTransactionPayload {
  /** Merchant-generated unique transaction identifier. */
  transactionId: string;
  /** Payment amount in the given currency. */
  amount: number;
  /** Currency code. Defaults to 'USD'. */
  currency?: 'USD' | 'KHR';
  /** Optional buyer first name. */
  firstname?: string;
  /** Optional buyer last name. */
  lastname?: string;
  /** Optional buyer email. */
  email?: string;
  /** Optional buyer phone. */
  phone?: string;
  /**
   * Payment option. When omitted, PayWay auto-displays all supported options
   * and returns an HTML hosted checkout page. Use `abapay_khqr_deeplink` to
   * receive a JSON payload with qr_string + deeplink.
   */
  paymentOption?:
    | 'cards'
    | 'abapay_khqr'
    | 'abapay_khqr_deeplink'
    | 'alipay'
    | 'wechat'
    | 'google_pay'
    | string;
  /** Optional shipping fee (additive to amount). */
  shipping?: number;
  /** Optional items list (descriptive only). */
  items?: Array<{ name: string; quantity: number; price: number }>;
  /** Optional base64-friendly return URL. */
  returnUrl?: string;
  /** Optional cancel URL. */
  cancelUrl?: string;
  /** Optional view type for hosted checkout. */
  viewType?: 'hosted_view' | 'popup';
  /** Optional lifetime in minutes (min 3, max 43200). */
  lifetime?: number;
}

/**
 * Options for the client response handler.
 */
export interface HandleResponseOptions {
  /**
   * CSS selector or HTMLElement where QR/HTML should be rendered.
   * If omitted for QR types, a download prompt is generated instead.
   */
  target?: string | HTMLElement;
  /**
   * If true, opens URL/deeplink in a new tab. If false (default for url),
   * performs a same-tab redirect via `window.location.href`.
   */
  openInNewTab?: boolean;
  /**
   * Optional callback invoked after the handler performs its action.
   * Receives the resolved `TransactionSession` and a description of the
   * action taken.
   */
  onHandled?: (session: TransactionSession, action: string) => void;
  /**
   * Optional callback invoked if the handler cannot process the response.
   */
  onError?: (error: Error, session: TransactionSession) => void;
}

/**
 * Result returned by `client.handleResponse()`.
 */
export interface HandleResponseResult {
  /** The action that was taken, e.g. "redirect", "qr_rendered", "html_embedded". */
  action: string;
  /** Whether the action succeeded. */
  success: boolean;
  /** The session that was processed. */
  session: TransactionSession;
}

/**
 * A test case definition used by the Test Harness (Module 3).
 */
export interface TestCase {
  /** Human-readable name of the scenario. */
  name: string;
  /** The response type this case simulates. */
  responseType: ResponseType;
  /** A human-readable description of what the test verifies. */
  description: string;
}

/**
 * The result of running a single test case.
 */
export interface TestResult {
  /** The test case that was run. */
  name: string;
  /** Whether the UX flow passed. */
  passed: boolean;
  /** A human-readable message describing the outcome. */
  message: string;
  /** Duration in milliseconds. */
  durationMs: number;
}

/**
 * The aggregate report produced by `runTestSuite()`.
 */
export interface TestSuiteReport {
  /** Total number of test cases run. */
  total: number;
  /** Number of tests that passed. */
  passed: number;
  /** Number of tests that failed. */
  failed: number;
  /** Per-case results. */
  results: TestResult[];
  /** Overall pass/fail. */
  success: boolean;
}