# ABA PayWay Merchant Scenario Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver evidence-backed coverage for all 28 merchant cases, reinforce SDK-controlled behavior with tests and validation, and provide an executable QR-POS reference integration backed by a durable local order store.

**Architecture:** The published SDK remains the boundary for package behavior; `src/` validates and signs PayWay requests, while the merchant sample owns durable order state, webhook idempotency, status reconciliation, and POS QR display. A documentation chapter and two reports share the case-to-evidence mapping, including ABA-managed and contradictory requirements.

**Tech Stack:** TypeScript, Node.js 18+, Vitest 4, Biome, tsup, Next.js 16 reference app, Express, SQLite (`better-sqlite3`), mocked `fetch`, optional sandbox probe via environment variables.

## Global Constraints

- SDK code is `src/`; `src/__tests__/` is the only source of automated SDK evidence.
- `README.md`, `docs/`, and `payway-boilerplate/` may provide documentation/example evidence; boilerplate never proves an SDK feature.
- Do not edit `test-cases/`; it is audit input only.
- No production PayWay request may be made. Sandbox probing is optional, requires environment variables, and must not log credentials.
- Never commit credentials, personal data, private keys, or generated sandbox output containing sensitive payloads.
- Label chat-derived or profile-specific material exactly as **Confirm with ABA**, **Merchant-profile dependent**, **Commercial configuration required**, **Guidance observed during integration**, or **Not enforced by the SDK**.
- Preserve existing repository changes: `test-cases/` is untracked and `dist/` is modified from the baseline build.
- Do not create a git commit unless the user explicitly requests one.

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/utils.ts` | Publicly testable input validators for positive checkout lifetime and safe public HTTPS callback URLs. |
| `src/client.ts` | Calls validators before signing or sending checkout and QR API requests. |
| `src/__tests__/merchant-scenario-coverage.test.ts` | Test-case-ID-labelled package behavior tests. |
| `payway-boilerplate/merchant-qr-pos/` | Standalone merchant reference app: SQLite order store, webhook handler, status reconciliation endpoint, and QR-only POS screen. |
| `scripts/verify-sandbox-profile.ts` | Explicit opt-in sandbox probe that avoids printing secrets. |
| `docs/15-merchant-scenario-requirements.md` | SDK-external guidance for the 28 cases. |
| `docs/README.md` | Navigation link for Chapter 15 and the coverage report. |
| `docs/aba-payway-test-case-coverage.md` | Human-readable evidence report. |
| `aba-payway-coverage-report.json` | Machine-readable case classifications and evidence. |

## Task 1: Test and add SDK-controlled validation

**Files:**
- Create: `src/__tests__/merchant-scenario-coverage.test.ts`
- Modify: `src/utils.ts:39-96`
- Modify: `src/client.ts:663-665,1055-1079`

**Interfaces:**
- Produces `validateLifetime(lifetime?: number): void`.
- Produces `validatePublicHttpsUrl(url: string, fieldName: string): void`.
- `PayWay.checkout.createTransaction(params)` throws `PayWayConfigError` for non-positive/non-integer `lifetime`.
- `PayWay.qr.generateQr(params)` throws `PayWayConfigError` before `fetch` for blank/whitespace-prefixed/non-HTTPS callback URLs and invalid QR transaction/amount/currency values.

- [ ] **Step 1: Write failing behavior tests with case IDs**

```ts
// src/__tests__/merchant-scenario-coverage.test.ts
it('TC-001 forwards payment_gate=0 in the signed checkout form payload', () => {
  const fields = payway.checkout.createTransaction({
    transactionId: 'TC001-CHECKOUT', amount: 12, paymentOption: 'cards', paymentGate: 0,
  });
  expect(fields).toMatchObject({ payment_gate: 0, payment_option: 'cards' });
  expect(fields).toHaveProperty('hash');
  expect(fields).not.toHaveProperty('api_key');
});

it.each([0, -1, 1.5])('TC-008 rejects invalid checkout lifetime %s', (lifetime) => {
  expect(() => payway.checkout.createTransaction({ transactionId: 'TC008', amount: 1, lifetime }))
    .toThrow('lifetime must be a positive whole number of seconds');
});

it.each([' https://merchant.example/callback', 'http://merchant.example/callback', 'not-a-url'])
  ('TC-025 rejects unsafe callback URL %s before calling PayWay', async (callbackUrl) => {
    await expect(payway.qr.generateQr({
      transactionId: 'TC025', amount: 1, paymentOption: 'abapay_khqr', callbackUrl,
    })).rejects.toThrow('callbackUrl must be a public HTTPS URL without surrounding whitespace');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

it('TC-002/TC-003 sends signed request fields but never apiKey to request hooks', async () => {
  const onRequest = vi.fn();
  const client = new PayWay({ ...TEST_CONFIG, onRequest });
  fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: '00' } }));
  await client.checkout.checkTransaction('TC002');
  expect(onRequest.mock.calls[0][1]).not.toContain(TEST_CONFIG.apiKey);
});
```

- [ ] **Step 2: Run the focused test to prove the new validation is absent**

Run: `npx vitest run src/__tests__/merchant-scenario-coverage.test.ts`

Expected: the `TC-008` and `TC-025` assertions fail because `createTransaction` accepts invalid lifetime and `generateQr` either encodes the invalid callback or calls mocked `fetch`.

- [ ] **Step 3: Add minimal validators**

```ts
// src/utils.ts
export function validateLifetime(lifetime: number | undefined): void {
  if (lifetime !== undefined && (!Number.isInteger(lifetime) || lifetime <= 0)) {
    throw new PayWayConfigError('lifetime must be a positive whole number of seconds');
  }
}

export function validatePublicHttpsUrl(url: string, fieldName: string): void {
  if (typeof url !== 'string' || url.trim() !== url) {
    throw new PayWayConfigError(`${fieldName} must be a public HTTPS URL without surrounding whitespace`);
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.hostname === 'localhost') throw new Error();
  } catch {
    throw new PayWayConfigError(`${fieldName} must be a public HTTPS URL without surrounding whitespace`);
  }
}
```

```ts
// src/client.ts imports
import { /* existing imports */, validateLifetime, validatePublicHttpsUrl } from './utils.js';

// first lines of checkout.createTransaction
validateLifetime(params.lifetime);

// first lines of qr.generateQr
validateTransactionId(params.transactionId);
validatePositiveAmount(params.amount, params.currency || 'USD');
validateCurrency(params.currency);
validatePublicHttpsUrl(params.callbackUrl, 'callbackUrl');
```

- [ ] **Step 4: Run focused tests and the existing SDK tests**

Run: `npx vitest run src/__tests__/merchant-scenario-coverage.test.ts src/__tests__/client.test.ts src/__tests__/utils.test.ts`

Expected: PASS; no HTTP call occurs for validation failures and existing QR payload tests retain base64 callback encoding.

## Task 2: Add regression evidence for request, callback, retry, and redaction behavior

**Files:**
- Modify: `src/__tests__/merchant-scenario-coverage.test.ts`

**Interfaces:**
- Consumes public `PayWay` methods and mocked `fetch`; no new production API.
- Produces repeatable evidence for case IDs TC-001, TC-002, TC-010, TC-012, TC-014, TC-016, and TC-025.

- [ ] **Step 1: Add tests for existing controllable behavior**

```ts
it('TC-012 verifies a pushback-shaped payload only with its valid signature', () => {
  const body = { tran_id: 'TC012', apv: 'APV-1', status: '0' };
  const hash = crypto.createHmac('sha512', TEST_CONFIG.apiKey)
    .update('APV-10TC012').digest('base64');
  expect(payway.verifyCallback(body, hash)).toBe(true);
  expect(payway.verifyCallback(body, 'invalid')).toBe(false);
});

it('TC-016 retries a 429 according to Retry-After without leaking secrets in hooks', async () => {
  const onRequest = vi.fn();
  const client = new PayWay({ ...TEST_CONFIG, maxRetries: 1, retryDelayMs: 1, onRequest });
  const limited = mockJsonResponse({ message: 'Too many requests' }, 429, 'Too Many Requests');
  limited.headers.set('retry-after', '0');
  fetchSpy.mockResolvedValueOnce(limited).mockResolvedValueOnce(mockJsonResponse({ status: { code: '00' } }));
  await expect(client.checkout.checkTransaction('TC016')).resolves.toEqual({ status: { code: '00' } });
  expect(onRequest.mock.calls.flat().join('')).not.toContain(TEST_CONFIG.apiKey);
});
```

- [ ] **Step 2: Run the regression tests**

Run: `npx vitest run src/__tests__/merchant-scenario-coverage.test.ts`

Expected: PASS. These tests document existing public behavior and require no additional production implementation after Task 1.

## Task 3: Build the QR-only merchant POS reference sample

**Files:**
- Create: `payway-boilerplate/merchant-qr-pos/package.json`
- Create: `payway-boilerplate/merchant-qr-pos/tsconfig.json`
- Create: `payway-boilerplate/merchant-qr-pos/src/store.ts`
- Create: `payway-boilerplate/merchant-qr-pos/src/payments.ts`
- Create: `payway-boilerplate/merchant-qr-pos/src/server.ts`
- Create: `payway-boilerplate/merchant-qr-pos/public/index.html`
- Create: `payway-boilerplate/merchant-qr-pos/src/store.test.ts`
- Create: `payway-boilerplate/merchant-qr-pos/.env.example`
- Create: `payway-boilerplate/merchant-qr-pos/README.md`

**Interfaces:**
- `OrderStore.recordPaidOnce(transactionId: string, source: 'webhook' | 'status-check'): { applied: boolean }` persists a unique payment event in SQLite.
- `POST /api/orders` creates a pending order and calls `PayWay.qr.generateQr` using environment-backed sandbox credentials.
- `POST /api/payway-webhook` verifies the PayWay signature, idempotently records success, and returns HTTP 200 for valid duplicate notifications.
- `GET /api/orders/:transactionId/status` calls `checkTransaction`, stops returning `pending` after a terminal payment status, and reconciles through `recordPaidOnce`.

The sample package manifest must include the following exact scripts and development dependencies:

```json
{
  "scripts": { "build": "tsc --noEmit", "start": "tsx src/server.ts", "test": "vitest run" },
  "dependencies": { "better-sqlite3": "^12.6.2", "express": "^4.18.2" },
  "devDependencies": { "@types/better-sqlite3": "^7.6.13", "@types/express": "^5.0.6", "tsx": "^4.23.1", "typescript": "^5.9.3", "vitest": "^4.1.10" }
}
```

- [ ] **Step 1: Write the failing durable-idempotency test**

```ts
it('TC-015 applies a paid event once when webhook and status check race', () => {
  const store = createOrderStore(':memory:');
  store.createPending('TC015');
  expect(store.recordPaidOnce('TC015', 'webhook')).toEqual({ applied: true });
  expect(store.recordPaidOnce('TC015', 'status-check')).toEqual({ applied: false });
  expect(store.get('TC015')).toMatchObject({ status: 'PAID', paid_event_count: 1 });
});
```

- [ ] **Step 2: Run the test to prove the order store does not exist**

Run: `cd payway-boilerplate/merchant-qr-pos; npx vitest run src/store.test.ts`

Expected: FAIL because `createOrderStore` is not implemented.

- [ ] **Step 3: Implement SQLite schema and atomic idempotency**

```ts
// src/store.ts
database.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    transaction_id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'PAID', 'DECLINED', 'CANCELLED', 'EXPIRED')),
    paid_event_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS payment_events (
    transaction_id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const recordPaidOnce = database.transaction((transactionId: string, source: 'webhook' | 'status-check') => {
  const inserted = database.prepare('INSERT OR IGNORE INTO payment_events (transaction_id, source) VALUES (?, ?)')
    .run(transactionId, source).changes === 1;
  if (inserted) database.prepare("UPDATE orders SET status = 'PAID', paid_event_count = paid_event_count + 1 WHERE transaction_id = ?").run(transactionId);
  return { applied: inserted };
});
```

- [ ] **Step 4: Implement server routes and QR-only browser screen**

```ts
// src/server.ts: webhook route ordering
app.post('/api/payway-webhook', express.json(), (req, res) => {
  const { hash, tran_id: transactionId, status } = req.body as Record<string, string>;
  const payload = { ...req.body }; delete payload.hash;
  if (!hash || !payway.verifyCallback(payload, hash)) return res.status(401).json({ error: 'invalid signature' });
  if (status === '0') store.recordPaidOnce(transactionId, 'webhook');
  return res.status(200).json({ acknowledged: true });
});
```

`public/index.html` must create an order, render only the returned QR image/string and transaction ID, poll `/api/orders/:transactionId/status` every three seconds, stop on `PAID`, `DECLINED`, `CANCELLED`, or `EXPIRED`, and stop at the selected lifetime. It must never receive the API key or signed HMAC request body.

- [ ] **Step 5: Add sandbox configuration and sample instructions**

```dotenv
# .env.example
PAYWAY_MERCHANT_ID=
PAYWAY_API_KEY=
PAYWAY_ENVIRONMENT=sandbox
PUBLIC_BASE_URL=https://replace-with-a-public-https-domain.example
```

The sample README must state that a real sandbox call is opt-in, `PUBLIC_BASE_URL` must be registered/accessible, sandbox credentials are never pasted in source, and profile payment options are validated only by the explicit sandbox probe.

- [ ] **Step 6: Run sample tests and build**

Run: `cd payway-boilerplate/merchant-qr-pos; npm install; npm test; npm run build`

Expected: idempotency test passes and the POS server/client build completes. If credentials are absent, no external request is attempted.

## Task 4: Add an opt-in sandbox profile verifier

**Files:**
- Create: `scripts/verify-sandbox-profile.ts`
- Create: `scripts/verify-sandbox-profile.test.ts`
- Modify: `package.json:24-30`
- Modify: `README.md:340-350`

**Interfaces:**
- `runProfileProbe(options: { env: NodeJS.ProcessEnv; paymentOption?: string }): Promise<{ paymentOption: string; accepted: boolean; responseStatus: string }>` validates configuration and performs the sandbox request.
- `npm run verify:sandbox-profile -- --payment-option=abapay_khqr` exits 0 only after a sandbox QR request returns success.
- Required secrets are read only from `PAYWAY_MERCHANT_ID` and `PAYWAY_API_KEY` environment variables.

- [ ] **Step 1: Write a test for missing configuration**

```ts
it('TC-021 refuses to probe a sandbox profile without environment credentials', async () => {
  await expect(runProfileProbe({ env: {} })).rejects.toThrow('PAYWAY_MERCHANT_ID and PAYWAY_API_KEY are required');
});
```

- [ ] **Step 2: Run it and confirm the helper does not exist**

Run: `npx vitest run scripts/verify-sandbox-profile.test.ts`

Expected: FAIL with module/helper-not-found.

- [ ] **Step 3: Implement a redacted, explicit probe**

```ts
export async function runProfileProbe({ env, paymentOption = 'abapay_khqr' }: { env: NodeJS.ProcessEnv; paymentOption?: string }) {
const merchantId = env.PAYWAY_MERCHANT_ID;
const apiKey = env.PAYWAY_API_KEY;
if (!merchantId || !apiKey) throw new Error('PAYWAY_MERCHANT_ID and PAYWAY_API_KEY are required');

const payway = new PayWay({ merchantId, apiKey, environment: 'sandbox' });
const response = await payway.qr.generateQr({
  transactionId: `profile-check-${Date.now()}`,
  amount: 0.01,
  currency: 'USD',
  paymentOption,
  callbackUrl: env.PAYWAY_CALLBACK_URL!,
});
return { paymentOption, accepted: true, responseStatus: String(response.status?.code ?? 'unknown') };
}

const paymentOption = process.argv.find((arg) => arg.startsWith('--payment-option='))?.split('=')[1];
runProfileProbe({ env: process.env, paymentOption }).then((result) => console.log(JSON.stringify(result)));
```

The implementation must require `PAYWAY_CALLBACK_URL`, redact error objects before logging, and state that a successful probe only confirms the supplied sandbox profile at that time, not all production profiles.

- [ ] **Step 4: Add the script entry and run its safe-path test**

```json
"verify:sandbox-profile": "tsx scripts/verify-sandbox-profile.ts"
```

Run: `npx vitest run scripts/verify-sandbox-profile.test.ts; npm run verify:sandbox-profile -- --payment-option=abapay_khqr`

Expected: test passes; the second command exits with the explicit missing-environment error when no credentials were supplied and makes no network request.

## Task 5: Write merchant-owned guidance and case coverage reports

**Files:**
- Create: `docs/15-merchant-scenario-requirements.md`
- Create: `docs/aba-payway-test-case-coverage.md`
- Create: `aba-payway-coverage-report.json`
- Modify: `docs/README.md`

**Interfaces:**
- The guide has a named heading for every case ID and clearly assigns SDK vs. integrator/ABA responsibility.
- The Markdown and JSON reports use the same classification and evidence for every ID TC-001 through TC-028.

- [ ] **Step 1: Create the documentation-only guidance before reporting it covered**

Use exact sections and labels:

```md
## TC-013 — Callback requirement

**Confirm with ABA.** The supplied acceptance material contains conflicting statements about whether QR callbacks are mandatory when Check Transaction API is used. Configure and verify the callback requirement for the merchant profile; do not rely on this SDK to decide it.

**SDK responsibility:** `PayWay.checkout.checkTransaction()` can query status and `PayWay.verifyCallback()` can verify a callback signature.

**Integrator responsibility:** Keep a durable, idempotent order record and reconcile callback and status results.
```

Cover TC-001–TC-028 in grouped sections: checkout/display (001–007), QR lifetime/polling/status (008–016), domain/sandbox/configuration (017–023), and reconciliation/POS/onboarding (024–028). Include concrete configuration ranges only as **Guidance observed during integration**, not guarantees.

- [ ] **Step 2: Classify each case with line-specific evidence**

For each case, search `src/`, `src/__tests__/`, `README.md`, `docs/`, and `payway-boilerplate/`, then create a report section exactly as:

```md
## TC-001: Purchase returns QR JSON instead of checkout HTML

Status: COVERED_BY_CODE_AND_DOCUMENTATION

Evidence:
- `src/client.ts:<line>` — `CreateTransactionParams.paymentGate` serializes `payment_gate`.
- `src/__tests__/merchant-scenario-coverage.test.ts:<line>` — TC-001 regression test.
- `docs/15-merchant-scenario-requirements.md:<line>` — explains `payment_gate: 0` and marks profile routing as Confirm with ABA.

Verification: `npx vitest run src/__tests__/merchant-scenario-coverage.test.ts` passed.

SDK responsibility: Builds and signs the checkout form fields.

Integrator responsibility: Posts the signed fields from a browser to the PayWay checkout endpoint.

Gap: ABA-profile routing remains externally configured.

Confidence: High
```

The JSON object must follow the requested `summary` and `cases` schema exactly, use arrays of file/line evidence, lowercase confidence values, and report `CONTRADICTORY_REQUIREMENT` for TC-013 unless fresh official PayWay evidence resolves it.

- [ ] **Step 3: Add navigation**

Add a Part 5 table row in `docs/README.md`:

```md
| 15. Merchant Scenario Requirements | [15-merchant-scenario-requirements.md](15-merchant-scenario-requirements.md) | Reference |
| Coverage Report | [aba-payway-test-case-coverage.md](aba-payway-test-case-coverage.md) | Audit |
```

- [ ] **Step 4: Validate report integrity**

Run:

```powershell
@'
const report = JSON.parse(require('fs').readFileSync('aba-payway-coverage-report.json', 'utf8'));
if (report.cases.length !== 28) throw new Error(`expected 28 cases, got ${report.cases.length}`);
if (new Set(report.cases.map((c) => c.id)).size !== 28) throw new Error('duplicate case ID');
console.log('coverage report has 28 unique cases');
'@ | node -
```

Expected: `coverage report has 28 unique cases`.

## Task 6: Run final verification and record actual results

**Files:**
- Modify: `docs/aba-payway-test-case-coverage.md` final-validation section only after commands complete.

- [ ] **Step 1: Run package verification**

Run: `npm test; npm run lint; npm run typecheck; npm run build`

Expected: tests/typecheck/build exit 0. Preserve the lint result exactly; either remediate warnings introduced by this work or report remaining pre-existing warnings without claiming lint is clean.

- [ ] **Step 2: Run documentation and report checks**

Run: `rg -n '## TC-0(0[1-9]|1[0-9]|2[0-8])' docs/aba-payway-test-case-coverage.md | Measure-Object; node -e "JSON.parse(require('fs').readFileSync('aba-payway-coverage-report.json','utf8')); console.log('JSON valid')"`

Expected: 28 case headings and `JSON valid`.

- [ ] **Step 3: Update final report values from fresh command output**

Replace every provisional count, line reference, and test total in the coverage report with actual output. Do not state that the lint is clean unless its fresh command exits 0.

## Plan Self-Review

- Spec coverage: Tasks 1–2 cover SDK-controlled behavior; Task 3 covers the user-added merchant database/webhook/POS scope; Task 4 covers opt-in sandbox validation; Task 5 produces all requested documentation/reports; Task 6 performs requested validation.
- Placeholder scan: no implementation placeholders or deferred requirements remain; sandbox runtime results are intentionally recorded only after credentials are explicitly supplied.
- Type consistency: `validateLifetime`, `validatePublicHttpsUrl`, `OrderStore.recordPaidOnce`, and the sample endpoints have one defined signature each and are used consistently.
