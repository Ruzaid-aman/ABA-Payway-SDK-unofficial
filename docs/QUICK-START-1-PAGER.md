# PayWay SDK — 1-Pager Quick Start

Take a PayWay payment in production with **3 SDK calls**. The SDK auto-detects PayWay's response type (deeplink, KHQR string, QR image URL, checkout URL, HTML page) and performs the correct UX action for you. **The merchant never writes `if deeplink do X, if HTML do Y`.**

---

## The whole flow

```ts
import { sdk } from 'aba-payway-ts';

// 1. Server: initiate a purchase.
const session = await sdk.initiate(
  { transactionId: 'order-123', amount: 10, paymentOption: 'abapay_khqr_deeplink' },
  { merchantId: process.env.PAYWAY_MERCHANT_ID!, apiKey: process.env.PAYWAY_API_KEY!, environment: 'sandbox' },
);

// 2. Client: hand the session to the SDK. It auto-renders whatever PayWay returned.
await sdk.handle(session, { target: '#payway-container' });

// 3. (optional) Verify wiring end-to-end with a real HTTP mock — zero merchant code.
await sdk.runTestSuiteAndPrint();
```

That's it. No `switch` on `responseType`, no `fetch`, no HMAC hashing, no QR library wiring.

---

## Environment setup and diagnostics

For the `PayWay` domain client, export credentials once and let the SDK discover them:

```bash
PAYWAY_MERCHANT_ID=your-merchant-id
PAYWAY_API_KEY=your-api-key
PAYWAY_SANDBOX=true
```

```ts
import { PayWay } from 'aba-payway-ts';

const payway = new PayWay({ debug: true });
```

Constructor options override environment variables. Debug output is written through `console.debug` with sensitive values redacted as `***HIDDEN***`.

---

## The contract

Every PayWay purchase response is normalised into one shape — `TransactionSession`:

```ts
interface TransactionSession {
  sessionId: string;                                       // SDK-generated
  status: 'pending' | 'completed' | 'failed';
  responseType: 'deeplink' | 'qr_string' | 'qr_image' | 'checkout_qr_url' | 'url' | 'html';
  responsePayload: string;                                 // shape depends on responseType
  expiresAt: string;                                       // ISO-8601
  raw?: unknown;                                           // original PayWay body
}
```

Every module in the SDK — server, client, test — communicates through this contract and nothing else. See [`src/schema.ts`](../src/schema.ts).

---

## What `sdk.handle()` does for each response type

| `responseType` | What the SDK does | Merchant configures |
|---|---|---|
| `deeplink`   | `window.location.href = payload` (or `window.open` if `openInNewTab: true`, with same-tab fallback if popup is blocked). | `openInNewTab?` |
| `qr_string`  | Renders a QR canvas into `target`. Falls back to a PNG download prompt when `target` is omitted. | `target` |
| `qr_image`   | Renders an `<img>` into `target`. Opens the image URL in a new tab when `target` is omitted. | `target` |
| `checkout_qr_url` | Renders the hosted QR image into `target`. Opens it in a new tab when `target` is omitted. | `target` |
| `url`        | `window.location.href = payload` (or new tab). | `openInNewTab?` |
| `html`       | Embeds the payload in a sandboxed `<iframe srcdoc>` inside `target`. **Refuses** to render without a `target` (never overwrites `document.body`). Sandbox tokens: `allow-scripts allow-forms allow-popups` — deliberately no `allow-same-origin`. | `target` (required) |

All actions dispatch through a single function — [`client.handleResponse()`](../src/client-handler/index.ts). No merchant branching required.

---

## Architecture (why this is safe to trust)

```
┌────────────────────┐          ┌────────────────────┐          ┌────────────────────┐
│  Module 1 — Server │          │  Module 2 — Client │          │  Module 3 — Test   │
│  src/server/       │          │  src/client-handler│          │  src/test/         │
│                    │          │                    │          │                    │
│  initiateTransaction│  ──►    │  handleResponse    │   ◄──    │  runTestSuite      │
│  test              │          │                    │          │  startMockServer   │
│  normalizeResponse │          │                    │          │  validateContract  │
└────────┬───────────┘          └──────────┬─────────┘          └──────────┬─────────┘
         │                                 │                                │
         └─────────────────► TransactionSession contract ◄──────────────────┘
                                    (src/schema.ts)
```

- **No module imports another.** They communicate only via the `TransactionSession` contract or injected dependencies.
- The **facade** [`src/sdk.ts`](../src/sdk.ts) is the only file that wires the three modules together.
- The **test harness** accepts `initiate` and `handle` as injected dependencies (`TestHarnessDeps`), so you can plug in mocks or the real thing.

---

## Zero-code test suite

```bash
# CLI
npx payway-sdk test

# or programmatically
await sdk.runTestSuiteAndPrint();
```

What it does:

1. Spins up a real local HTTP mock PayWay server on an ephemeral port.
2. Calls the **real** `server.initiateTransaction()` against it for 4 of the 5 default response types (`deeplink`, `qr_string`, `qr_image`, `url`).
3. Feeds a raw HTML body directly to `normalizePaywayResponse()` for the `html` case (bypasses the JSON-only PayWay HTTP client).
4. Hands each resulting `TransactionSession` to the real `client.handleResponse()`.
5. Prints a pass/fail table.

Expected output:

```
  ✅ Deeplink redirect        deeplink_skipped_no_dom
  ✅ QR string render         qr_download_prompted
  ✅ QR image render          qr_image_skipped_no_dom
  ✅ Checkout URL redirect    url_redirect_skipped_no_dom
  ✅ HTML snippet embed       html_embed_skipped_no_dom
  Result: ✅ ALL PASSED
```

(In Node, DOM-bound actions report `*_skipped_no_dom` — the correct branch was still taken. Browser-environment assertions live in [`src/__tests__/client-handler.test.ts`](../src/__tests__/client-handler.test.ts).)

The default suite covers five core flows. To exercise a hosted `checkout_qr_url`, pass a custom `TestCase` with `responseType: 'checkout_qr_url'` to `runTestSuite()`.

---

## Advanced usage

### Access the modules directly

```ts
import { server, client, runTestSuite } from 'aba-payway-ts';

const session = await server.initiateTransaction(payload, config);
await client.handleResponse(session, { target: myElement });
```

### Simulate responses without hitting PayWay

```ts
import { sdk } from 'aba-payway-ts';

// Generate a mock session for any response type.
const session = sdk.test('qr_string', { transactionId: 'demo', amount: 10 });
await sdk.handle(session, { target: '#preview' });
```

### Callbacks

```ts
await sdk.handle(session, {
  target: '#payway-container',
  onHandled: (s, action) => console.log('rendered', action),
  onError:   (err, s)    => console.error('failed', err),
});
```

User-callback exceptions never break SDK execution.

---

## Full API surface

| Function | Purpose |
|---|---|
| `sdk.initiate(payload, config)`         | Real purchase — hits PayWay. |
| `sdk.handle(session, options?)`         | Render / redirect / embed based on `responseType`. |
| `sdk.test(responseType, payload?)`      | Generate a mock session (no HTTP). |
| `sdk.runTestSuite()`                    | Run the 5-case end-to-end suite. |
| `sdk.runTestSuiteAndPrint()`            | Same, plus formatted console output. |
| `sdk.server.initiateTransaction`        | Direct access to Module 1. |
| `sdk.client.handleResponse`             | Direct access to Module 2. |

Types: `TransactionSession`, `InitiateTransactionPayload`, `HandleResponseOptions`, `HandleResponseResult`, `ResponseType`, `SessionStatus`, `TestSuiteReport`.

---

## Security notes

- HTML embed uses a strict sandbox (`allow-scripts allow-forms allow-popups`) with **no** `allow-same-origin`, so PayWay's checkout scripts can never reach into your page's origin.
- `sdk.handle()` never overwrites `document.body`. If you pass a `html` response with no `target`, the SDK returns `{ success: false, action: 'error' }` and invokes `onError`.
- Signature verification for PayWay callbacks is available separately via `verifyCallbackSignature()`.

---

## Where to look next

- [`src/schema.ts`](../src/schema.ts) — the `TransactionSession` contract.
- [`src/sdk.ts`](../src/sdk.ts) — the facade.
- [`src/__tests__/client-handler.test.ts`](../src/__tests__/client-handler.test.ts) — browser-environment assertions for each response type.
- [`src/__tests__/server-and-contract.test.ts`](../src/__tests__/server-and-contract.test.ts) — end-to-end tests through the mock PayWay server.
- [`scripts/zero-logic-purchase-flow.ts`](../scripts/zero-logic-purchase-flow.ts) — runnable demo (`npm run demo`).
- [`docs/16-webhook-setup-guide.md`](./16-webhook-setup-guide.md) — CLI webhook setup for local development.

---

## CLI Commands

| Command | Purpose |
|---|---|
| `payway-sdk init` | Initialize PayWay integration in your project |
| `payway-sdk doctor` | Validate environment configuration |
| `payway-sdk test` | Run the sandbox test suite |
| `payway-sdk get-transactions-by-ref --merchant-ref <reference>` | Retrieve up to 50 transactions for a merchant reference |
| `payway-sdk profiles add\|list\|use\|current\|remove` | Manage up to eight saved credential profiles |
| `payway-sdk generate-qr` | Generate a QR code (online or offline). Saves the PNG and opens it in the OS default viewer on interactive terminals. Use `--non-interactive` (`-y`) to skip prompts for scripts/CI. |
| `payway-sdk generate-checkout` | Create a checkout, save its QR PNG, and optionally poll (`--payment-gate 0` requests the hosted QR URL) |
| `payway-sdk check-transaction -t <id>` | One-shot payment status check |
| `payway-sdk transaction-detail -t <id>` | Full transaction detail (PayWay limit: 10/min) |
| `payway-sdk transaction-list --from "YYYY-MM-DD HH:mm:ss" --to ...` | List transactions in a window (strict date format) |
| `payway-sdk close-transaction -t <id> [-y]` | Void/close an unpaid transaction (prompts unless `-y/--force`) |
| `payway-sdk refund -t <id> -a <amount> [-c USD]` | Refund with pre-flight balance check and confirmation by default (`--no-preflight` skips only the detail lookup; `-y/--force` skips both the lookup and the prompt) |
| `payway-sdk exchange-rate` | Live USD/KHR exchange rate |
| `payway-sdk setup-webhook` | Start a local webhook server for callback testing |

**Exit codes (all commands):** `0` success · `1` validation/input error · `2` PayWay API failure · `3` network/timeout/rate-limit. Scripts and agents can branch on `$?` without parsing output. For creation flows, use `--output json` for one versioned final result or `--output ndjson` for creation, polling, and final records. The existing `--json` flags keep their raw-response behavior.

```bash
payway-sdk generate-qr -a 3.31 -t order-123 --callback-url https://example.com/payway --output json --no-polling
payway-sdk generate-checkout -a 3.31 -t order-124 --output ndjson --save-image ./checkout.png
```

### Transaction lifecycle from the terminal

```bash
payway-sdk doctor
payway-sdk generate-qr -a 3.31 -c USD
payway-sdk check-transaction -t qrabc123
payway-sdk transaction-detail -t qrabc123
payway-sdk close-transaction -t qrabc123 -y
payway-sdk refund -t order-123 -a 5.00 -c USD -y
```

For the fastest manual QR test:

- `doctor` should show the callback row ready before online QR creation.
- `generate-qr` saves the PNG automatically to `payway-output/<transaction-id>.png` and opens it in your OS default image viewer (interactive terminals only).
- Use `--save-image <path>` to override the PNG path.
- Use `--no-save-image` to disable the default PNG write for one run.
- Use `--open-image` / `--no-open-image` to force or suppress the viewer.
- If the callback row is missing, run `payway-sdk setup-webhook --tunnel`.

### Refund follow-up

For the fastest verified refund check:

```bash
payway-sdk refund -t <id> -a 1.11 -c USD
payway-sdk transaction-detail -t <id>
```

Read the detail response in this order:

- `refund_amount`: authoritative refunded total so far
- `transaction_operations`: refund history
- `payment_status`: coarse lifecycle only; `REFUNDED` can still appear after a partial refund

Sandbox-verified gotchas: duplicate `tran_id` is silently accepted on purchase (generate unique IDs), closed-but-unpaid transactions keep reporting `PENDING`, and list dates must be `"YYYY-MM-DD HH:mm:ss"` or PayWay rejects with code 49. See [SANDBOX-FINDINGS §8](./SANDBOX-FINDINGS.md).

### Get transactions by merchant reference

With `PAYWAY_MERCHANT_ID` and `PAYWAY_API_KEY` configured, retrieve the matching PayWay transaction records as JSON:

```bash
payway-sdk get-transactions-by-ref --merchant-ref INV-12345678
```

PayWay returns at most 50 matching historical transactions and limits this endpoint to 10 requests per minute.

### Credential profiles

Run `payway-sdk profiles add` to create a named `sandbox` or `production` profile. Each profile accepts an optional note up to 300 characters; the CLI supports a maximum of eight profiles total. Set the default with `payway-sdk profiles use <name>` or override it once with `payway-sdk --profile <name> <command>`. The CLI announces the selected profile and environment before an API request, while masking secrets.

Profile storage is plaintext at `%APPDATA%\aba-payway-sdk\profiles.json`; do not commit it, and restrict access to it. Use an OS or cloud secret manager for production SDK deployments.

---

## Agentic PayWay CLI

Let a supported provider propose and run PayWay actions through a risk-gated pipeline. Full detail lives in the skill guides: [aba-payway-agent](../skills/aba-payway-agent/SKILL.md) and [aba-payway-first-payment](../skills/aba-payway-first-payment/SKILL.md).

### Provider setup

```bash
export PAYWAY_AGENT_API_KEY=sk-...        # the ONLY place the key lives — never stored
payway-sdk agent setup --provider openai --model gpt-4o --capability-mode strict-json-plan --acknowledge-privacy

# PayWay credentials must be saved as a PROFILE (env vars alone fail agent readiness):
payway-sdk profiles add && payway-sdk profiles use <name>

# Online QR needs a PUBLIC HTTPS callback (set PAYWAY_CALLBACK_URL or run `setup-webhook --tunnel`):
payway-sdk agent doctor                   # print the capability matrix — all rows green before `ask`
payway-sdk ask "Generate a $3 online QR for sandbox" --yolo
```

The provider **API key is supplied only via `PAYWAY_AGENT_API_KEY`** — it is never accepted as a CLI argument and never persisted. `agent setup` stores only a plaintext config (provider, model, mode); secrets are never written.

> Field-tested setup path, troubleshooting table, and known pitfalls: [AGENT-SETUP-PLAYBOOK.md](./AGENT-SETUP-PLAYBOOK.md).

### Guided onboarding (recommended)

The `payway-sdk onboard` command runs the whole flow above in one interactive wizard: it scans
state, shows what is missing, configures the inference provider (with a live connectivity check),
saves the PayWay profile, validates the callback URL, and acknowledges privacy — then re-prints
the capability matrix. In a non-TTY it emits a structured `blocked` JSON plan instead of prompts.

```bash
payway-sdk onboard          # interactive guided setup
payway-sdk onboard --stage provider   # jump to a single stage
```

### Privacy acknowledgement

Before any plan is proposed, a privacy acknowledgement gate must be satisfied (`privacyAcknowledgedAt` set). Until then the CLI returns `blocked` with `PRIVACY_ACK_REQUIRED`. This protects against sending customer data to a provider without explicit consent.

### First-payment selection

The agent picks one of four routes — checkout, online QR, offline KHQR, or payment link — based on readiness (credentials, callback URL, RSA key, KHQR merchant data). See the [first-payment decision matrix](../skills/aba-payway-first-payment/SKILL.md) for required inputs and result handling per route.

### Polling vs. webhook

- **Webhook** is the trusted, signed source of truth for payment confirmation.
- **Polling** (`poll_transaction` / `check_transaction`) is read-only and useful for sandbox verification only. The agent *offers* polling after an online QR is created and **never auto-polls**.

### Artifacts & sessions (plaintext)

- Artifacts are written to `<cwd>/payway-output` (e.g. QR bundles).
- Sessions are plaintext JSON under `~/.config/aba-payway-sdk/agent/sessions` (or `%APPDATA%\aba-payway-sdk\agent\sessions`), **not encrypted**.

> ⚠️ **Plaintext risk:** restrict filesystem access and never commit session files. For deployed SDK use, prefer an OS/cloud secret manager or CI/CD secret storage; never store provider or PayWay secrets in agent config or sessions.

### Manual escape paths

Every agent action maps to a fully-supported manual SDK/CLI command. If the agentic path is unavailable, use the underlying call directly — nothing is gated behind the agent. See [aba-payway-purchase](../skills/aba-payway-purchase/SKILL.md) for the checkout contract (`createTransaction()` builds a LOCAL signed payload; `purchase()` performs the NETWORK request).
