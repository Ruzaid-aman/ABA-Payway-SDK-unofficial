<!-- GENERATED STUB: copy of docs/guides/16-webhook-setup-guide.md for compatibility. Do not edit here. -->

# Chapter 16 — Webhook Setup with the CLI

This chapter explains how to receive ABA PayWay online checkout callbacks and offline ABA KHQR notifications using the built-in `setup-webhook` CLI command. It starts a local HTTP server that logs and persists every incoming delivery, with optional Cloudflare Tunnel integration for exposing the server to the public internet during development.

> **When to use this guide:** You are a developer who wants to test webhook callbacks locally during development, or you need a quick way to capture and inspect callback payloads without setting up your own Express/Node.js server from scratch.

---

## Overview

When a payment is completed, PayWay can send a server-to-server HTTP POST callback to a URL configured for your merchant. The `setup-webhook` command:

1. **Starts a local HTTP server** on a configurable port (default `8443`)
2. **Logs every incoming callback** with timestamp, source IP, headers, and body
3. **For online checkout only, verifies the HMAC-SHA512 signature** and logs the result (never rejects — you always see the payload)
4. **Persists callbacks** to disk in JSONL format (or SQLite if available), including raw ABA KHQR notifications
5. **Optionally starts a Cloudflare Tunnel** to expose the local server via a public `trycloudflare.com` URL

---

## Quick Start

Coming from the [first-payment quickstart](../../QUICKSTART.md#4-prepare-a-callback-and-check-your-route)? Run the tunnel command below in a separate terminal and leave it running. Copy the complete printed HTTPS URL including `/aba-payway-webhook` into `PAYWAY_CALLBACK_URL` in your payment terminal, then return to the quickstart. See [Cloudflare Tunnel](#cloudflare-tunnel) for prerequisites. The receiver captures test notifications; payment verification and durable fulfillment belong in your application.

```bash
# Basic — starts server on port 8443, saves callbacks to the data root's webhook_data/callbacks.jsonl
npm exec -- payway-sdk setup-webhook

# With Cloudflare Tunnel (auto-generates a public URL)
npm exec -- payway-sdk setup-webhook --tunnel

# Custom port and storage
npm exec -- payway-sdk setup-webhook --port 3000 --storage json

# Use a pre-existing public URL (e.g., ngrok, localtunnel, or your own tunnel)
npm exec -- payway-sdk setup-webhook --url https://your-tunnel-url.ngrok.io

# Forward every captured callback to your local app while capturing (test your
# receiver's full handling path without the ABA Simulator)
npm exec -- payway-sdk setup-webhook --tunnel --forward-to http://localhost:3000/webhooks/aba
```

---

## Command Options

| Option | Default | Description |
|---|---|---|
| `--port <number>` | `8443` | Local port for the webhook server |
| `--storage <type>` | `auto` | Storage backend: `auto` (SQLite → JSON), `json`, or `sqlite` |
| `--tunnel` | `false` | Start a Cloudflare Tunnel for a public URL |
| `--url <string>` | — | Use an existing public URL (skips tunnel startup) |
| `--journal` | `false` | Also set `PAYWAY_JOURNAL=1` in `.env` so `journal reconcile` works out of the box |
| `--forward-to <url>` | — | Re-POST every captured callback (all three routes) to this local app URL in the background after capture — the ACK never waits on forwarding (each delivery is bounded by a 5 s timeout; a saturated queue drops the forward, never the capture), and forward failures never reject or lose the original callback |
| `--forward-headers <headers>` | — | Extra headers on forwarded deliveries: `"Key1:Value1, Key2:Value2"` |
| `--host <host>` | `127.0.0.1` | Bind interface. The listener captures raw callback bodies (customer PII, signatures) — bind wider (e.g. `0.0.0.0`) only when you accept exposing them beyond this machine; the log warns on any non-loopback bind |

---

## Online Checkout Authentication

For the online checkout route only, the command reads your API key from the `PAYWAY_API_KEY` environment variable to log HMAC signature verification results.

```bash
export PAYWAY_API_KEY="your-api-key"
npm exec -- payway-sdk setup-webhook
```

> **Note:** If `PAYWAY_API_KEY` is not set, the server still accepts and logs all deliveries. Online HMAC verification is logged as "skipped" rather than "verified"; this says nothing about offline KHQR notification authenticity.

---

## Webhook URLs and ABA Provisioning

By default, callbacks are expected at:

```
POST http://localhost:8443/aba-payway-webhook
```

When using the `--tunnel` option, a public URL is generated:

```
https://random-name.trycloudflare.com/aba-payway-webhook
```

Copy this URL into your PayWay merchant dashboard or pass it as the `callbackUrl` in QR API requests for the online checkout flow.

For offline ABA KHQR notifications, use the distinct route instead:

```
POST https://your-public-host/aba-payway-khqr-webhook
```

Publish a stable HTTPS URL, then ask ABA to configure and whitelist that exact route for your merchant. The CLI and SDK cannot perform or prove this external ABA operation. Declare the result in the optional KHQR callback configuration only after your merchant has confirmed it, and use `payway.khqr.validateCallbackSetup()` as a local readiness check—not as evidence of provisioning.

---

## Storage Backends

### JSON (default fallback)

Appends each callback as a JSONL (JSON Lines) record to the data root's `webhook_data/callbacks.jsonl` (`PAYWAY_WEBHOOK_DIR` or `PAYWAY_DATA_DIR` override; default `<APPDATA|~/.config>/aba-payway-sdk/data/webhook_data/`). Zero dependencies — works everywhere.

```bash
npm exec -- payway-sdk setup-webhook --storage json
```

**Online checkout record format:**

```json
{
  "id": "a1b2c3d4",
  "receivedAt": "2026-07-21T10:30:00.000Z",
  "headers": { "x-payway-hmac-sha512": "...", "content-type": "application/json" },
  "body": { "status": "APPROVED", "transaction_id": "...", "amount": 10.00 },
  "sourceIp": "203.0.113.42"
}
```

### SQLite (optional)

If `better-sqlite3` is installed, uses a local SQLite database with WAL journal mode for better performance:

```bash
npm install better-sqlite3  # Optional peer dependency
npm exec -- payway-sdk setup-webhook --storage sqlite
```

Storage path: the data root's `webhook_data/callbacks.db`

---

## Cloudflare Tunnel

The `--tunnel` option requires [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-local-tunnel/) to be installed and available in your PATH.

```bash
# Check if cloudflared is installed
which cloudflared    # macOS/Linux
where cloudflared    # Windows

# Start with tunnel
npm exec -- payway-sdk setup-webhook --tunnel
```

**How it works:**

1. Spawns `cloudflared tunnel --url http://localhost:8443` as a subprocess
2. Parses the generated `*.trycloudflare.com` URL from cloudflared output
3. Displays the public URL for you to copy into PayWay settings
4. Stops the tunnel when you press `Ctrl+C`

**Troubleshooting:**

| Problem | Solution |
|---|---|
| `cloudflared not found` | Install from [developers.cloudflare.com](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-local-tunnel/) |
| Tunnel URL not appearing | Ensure cloudflared can reach the internet; check firewall settings |
| Port already in use | Use `--port <number>` to specify a different port |

---

## Server Behavior

### Callback Endpoint

The listener accepts two independent POST routes. All other routes return `404`; non-POST methods return `405`.

| Route | Purpose | Handling |
|---|---|---|
| `/aba-payway-webhook` | Existing online checkout callback | Logs optional online HMAC verification and stores the delivery. |
| `/aba-payway-khqr-webhook` | Offline ABA KHQR notification | Stores raw data first, then best-effort parses metadata; it does not require or verify the online HMAC. |

### Response

The server always responds with:

```json
HTTP/1.1 200 OK
Content-Type: application/json

{ "acknowledged": true }
```

### Payment Link pushbacks (`return_url`)

Payment links do NOT use the checkout webhook contract: PayWay POSTs the
payment notification directly to the link's decoded `return_url` as
`Content-Type: application/json`. The webhook server now exposes a matching
**`/aba-payway-pushback`** route — set your link's `return_url` to
`<your-public-url>/aba-payway-pushback` and the delivery lands in the same
storage as every other callback (`parsePaymentLinkPushback()` metadata included):

```json
{ "tran_id": "123456789", "status": "00", "merchant_ref_no": "ref0001" }
```

Differences from checkout webhooks (live-captured 2026-09-06, real payment):

- **The pushback carries NO `hash` field — live-confirmed** (`User-Agent: PayWayApp/3.0`,
  `Content-Type: application/json; charset=utf-8`, body
  `{"tran_id":"…","status":0,"merchant_ref_no":"…"}`). Treat it as a
  notification and verify the payment itself via `checkTransaction(tran_id)`
  before fulfilling — `verifyCallback()` does not apply.
- `status` arrives as the **numeric `0`** (APPROVED), not the `"00"` string
  the official sample shows — accept both.
- The receiver must accept **POST + `application/json`** and answer 200.
- A multi-payment link (`payment_limit > 1`) fires one pushback **per
  completed payment**.

```sh
# Receiver smoke test once your URL is live:
curl -X POST https://your-host/payway/pushback   -H 'Content-Type: application/json'   -d '{"tran_id":"123456789","status":"00","merchant_ref_no":"ref0001"}'
```

Full lifecycle: [17. Payment Link API](17-payment-link.md) §17.7.

### Online Checkout Signature Logging and Offline KHQR Notifications

For the **online checkout route**, the server extracts the `X-PAYWAY-HMAC-SHA512` header and the `hash` field from the body, then logs HMAC-SHA512 verification using sorted-key concatenation (matching the algorithm in [`src/auth.ts`](../../src/auth.ts)).

- ✅ **Signature valid** → logs `✓ Signature verified`
- ❌ **Signature invalid** → logs `✗ Signature mismatch (expected: ...)` but still saves the record
- ⏭️ **No API key** → logs `⊘ Signature verification skipped (no API key)`

#### Verdict mode: rejecting invalid signatures (TD-09)

The capture server above is intentionally always-200 — it is a **sink**, not a
verdict. For deployments that need the webhook itself to refuse tampered
deliveries, pass `rejectInvalidSignature` when creating the listener:

```typescript
import { createWebhookServer, createStorage } from 'aba-payway-ts';

// createStorage is an async factory — await it before handing the adapter to
// the server, then start the listener explicitly.
const storage = await createStorage('json');
const listener = createWebhookServer(storage, {
  port: 8443,
  apiKey: process.env.PAYWAY_API_KEY, // required for verification
  rejectInvalidSignature: true, // ← 401 on invalid signatures (default: false)
});
await listener.start(); // resolves when the port is bound

// ... later, on shutdown:
await listener.stop();
```

Semantics in verdict mode:

| Delivery | Stored? | Response |
|---|---|---|
| Valid signature | ✅ | `200 { acknowledged: true }` |
| **Invalid signature** | ✅ (audit trail kept) | **`401 { error: 'invalid signature' }`** |
| No signature header | ✅ | `200` (unsigned is not trusted: the record is captured for reconciliation but can never fulfill anything on its own) |

Capture-vs-verdict separation is an operational choice, not a retry mechanism:
a capture sink never rejects a delivery, while a 401-verdict endpoint explicitly
refuses tampered ones. PayWay callbacks are **single best-effort** — the gateway
does not redeliver when your endpoint rejects or misses one — so pair verdict
mode with your own reconciliation (an inquiry by merchant reference for missed
or failed deliveries) and keep business handlers idempotent. When in doubt, keep
the default and enforce verdicts inside your own handler after persisting the
payload.

> **Important:** In the default capture mode the listener never rejects either route based on its capture processing (the verdict mode above is the deliberate exception for invalid online signatures). Production online checkout handling must reject invalid HMACs; offline KHQR handling must use only an ABA-confirmed verification contract.

The offline KHQR route has no assumed online HMAC contract. The listener retains its raw body, headers, source IP, parsed `transaction_id`, unknown fields, and parse errors. Receiving or parsing it does not mean a payment is verified or an order is paid. Deduplicate on `transaction_id`, reconcile against your own `merchant_ref`, and only fulfil after implementing the verification mechanism ABA actually supplies for your merchant.

### Error Handling

| Scenario | Behavior |
|---|---|
| Malformed JSON body | Logged as warning, saved as raw text, server returns 200 |
| Port already in use (EADDRINUSE) | Prints the port and exits; non-TTY output includes the scoped cleanup command |
| Background run without `--url` or `--tunnel` | Fails with exit code 2 instead of waiting for an interactive prompt |
| Public tunnel origin unavailable | Listener is stopped and callback URL is not persisted |
| Transient quick-tunnel startup failure | One retry is attempted; a second failure shuts down cleanly |
| Receiver cleanup | `npm exec -- payway-sdk webhook stop` verifies the running receiver's instance id against the saved state, then triggers that receiver's own graceful shutdown (tunnel stop, `.env` restore, listener close) — it never signals a PID; a reused PID or a foreign receiver is reported (`pid-reused`) and left untouched |
| Receiver ignores shutdown | `webhook stop` reports `shutdown-not-confirmed` instead of success; check the receiver terminal and stop it manually |
| Oversized delivery | Bodies over 2 MiB are refused with HTTP 413 and not stored (bounded memory) |
| Capture growth | The JSON capture store compacts to the newest 1,000 records |
| Missing `PAYWAY_API_KEY` | Online HMAC verification skipped; both routes are still saved |
| SIGINT / SIGTERM | Graceful shutdown — finishes processing current request, stops server |

---

## Lifecycle

```
$ npm exec -- payway-sdk setup-webhook --tunnel

  Starting webhook server on port 8443…
  Storage: <data root>/webhook_data/callbacks.jsonl

  Starting Cloudflare Tunnel…

  ✓ Webhook server listening on http://localhost:8443
  ✓ Cloudflare Tunnel active

    Online callback URL: https://abc-123.trycloudflare.com/aba-payway-webhook
    Local online route:  http://localhost:8443/aba-payway-webhook
    Callbacks directory: <data root>/webhook_data/

    Press Ctrl+C to stop.

   [10:30:15] POST /aba-payway-webhook (online checkout) from 203.0.113.42
             ✓ Signature verified
             Body: { "status": "APPROVED", "transaction_id": "order-001", "amount": 10.00 }
             Saved (id: a1b2c3d4)

  ^C
  Stopping server…
  Server stopped.
```

---

## Programmatic Usage

You can also use the webhook components directly in your Node.js code:

```typescript
import { createStorage, createWebhookServer, type WebhookStorage } from 'aba-payway-ts';

// Create storage (auto-detects best backend)
const storage = await createStorage('auto', './my-callbacks.jsonl');

// Create and start server
const server = createWebhookServer(storage, { port: 3000 });
await server.start();
console.log('Webhook server running on port 3000');

// Graceful shutdown
process.on('SIGTERM', async () => {
  await server.stop();
  await storage.close();
});
```

---

## Data Inspection

You can inspect stored callbacks using standard tools:

```bash
# View all callbacks (JSONL → pretty-print)
cat "$(payway-sdk doctor --json | jq -r .dataRoot)/webhook_data/callbacks.jsonl" | jq -s '.'

# Count callbacks
wc -l "$DATA_ROOT/webhook_data/callbacks.jsonl"   # DATA_ROOT = payway-sdk doctor --json | jq -r .dataRoot

# Filter approved online checkout transactions
cat "$DATA_ROOT/webhook_data/callbacks.jsonl" | jq -s '.[] | select(.body.status == "APPROVED")'   # DATA_ROOT as above
```

---

## Local Webhook Workbench

The `payway-sdk webhook` command group closes the local test loop: you can exercise your receiver's entire handling path — signature verification, parsing, idempotent processing — from the terminal in seconds, without the ABA Simulator app and without real sandbox payments. The pattern mirrors the Stripe CLI's `listen` / `trigger` / `events resend` workflow, adapted to PayWay's three callback contracts.

### The loop

```bash
# Terminal 1: capture + forward to your app's receiver route
npm exec -- payway-sdk setup-webhook --forward-to http://localhost:3000/webhooks/aba

# Terminal 2: fire a signed fixture at the capture server — your app receives
# it via --forward-to with a valid X-PAYWAY-HMAC-SHA512 header
npm exec -- payway-sdk webhook trigger --event payment.approved -t order-001

# Or fire straight at your app (no capture server needed)
npm exec -- payway-sdk webhook trigger --url http://localhost:3000/webhooks/aba --event payment.declined
```

Your receiver sees a real POST with a body shaped exactly like a gateway callback, and a signature that passes `verifyCallback` when your key configuration is correct — and fails when it is not. That is the test: a broken verifier, a wrong key, or a `hash`-field mistake surfaces immediately instead of during a live sandbox session.

### `webhook trigger` — signed fixture callbacks

| Fixture event | Route | Signed | Notes |
|---|---|---|---|
| `payment.approved` / `payment.declined` / `payment.pending` / `payment.refunded` / `payment.cancelled` | `/aba-payway-webhook` | ✅ HMAC-SHA512 | Full checkout-callback body; signature verifies with your `PAYWAY_API_KEY` |
| `khqr.notification` | `/aba-payway-khqr-webhook` | ❌ | Offline KHQR shape (no published auth contract — capture and reconcile) |
| `payment-link.pushback` | `/aba-payway-pushback` | ❌ no hash | Live contract `{tran_id, status: 0, merchant_ref_no}` (SANDBOX-FINDINGS §22) |

Flags: `-t/--tran-id`, `--merchant-ref`, `-a/--amount`, `-c/--currency USD|KHR`, `--payer-name`, `--forward-headers`, `--json`. Two deliberate contract notes:

- **Pushback and KHQR fixtures are unsigned on purpose** — their real-world deliveries carry no hash, so a receiver must never expect one for them. Confirm them by channel: a **payment-link pushback** is an online transaction — verify via `check-transaction -t <tran_id>`; an **offline-KHQR notification** has no online `tran_id` to look up — reconcile via the merchant-reference inquiry (`get-transactions-by-mc-ref`; `check-transaction` cannot see offline KHQR payments at all).
- **Fixtures are synthetic** — the gateway never saw this `tran_id`. The command prints a reminder; do not treat a fixture delivery as evidence about any real transaction.

### `webhook verify-callback` — one-shot signature check

```bash
# Check a body + signature pair (files, inline JSON, or piped stdin)
npm exec -- payway-sdk webhook verify-callback --body-file callback.json --sig "abc123=="

curl -s https://your.api/callback > body.json
npm exec -- payway-sdk webhook verify-callback --body-file body.json --sig "$SIG" --json
```

Exit `0` = valid (safe to process), exit `1` = INVALID with the failure reason (`signature_mismatch` | `malformed_signature` | `empty_body`) — the same reasons `verifyCallbackDetailed` returns in code. `--record wh_…` reports the *persisted* verdict of a captured delivery instead of re-checking.

### `webhook resend` — replay a captured record

```bash
# Find the record id
npm exec -- payway-sdk webhook list

# Re-POST the exact captured body + signature header to any URL
npm exec -- payway-sdk webhook resend --record wh_xxx --to http://localhost:3000/webhooks/aba
```

Receiver regression testing against real captured payloads: a code change to your handler can be re-tested against the same deliveries that originally exercised it. Replaying does NOT create a new payment at the gateway.

### What each command is for

| Command | Answers |
|---|---|
| `webhook trigger` | "Does my receiver correctly accept signed callbacks and reject bad ones?" |
| `webhook verify-callback` | "Why did this specific delivery fail verification?" |
| `webhook resend` | "Does my handler still process the deliveries I captured last week?" |
| `setup-webhook --forward-to` | "Can my real app code run end-to-end while I develop, without the ABA Simulator?" |

---

## Integration with PayWay QR Flow

### Step 1: Start the webhook server

```bash
npm exec -- payway-sdk setup-webhook --tunnel
# Note the generated URL, e.g. https://abc-123.trycloudflare.com/aba-payway-webhook
```

### Step 2: Generate a QR code with the webhook URL

```bash
npm exec -- payway-sdk generate-qr \
  --amount 5.00 \
  --callback-url https://abc-123.trycloudflare.com/aba-payway-webhook
# Merchant credentials come from the active profile / PAYWAY_* env (docs/02) —
# generate-qr has no --merchant-id flag.
```

### Step 3: Scan the QR code and complete payment

The callback will appear in your terminal and be saved to disk.

### Offline ABA KHQR notification setup

1. Configure the ABA-issued offline KHQR merchant fields through explicit `PayWay` configuration, `PAYWAY_KHQR_*` environment variables, or a local CLI profile. `payway.khqr.validateConfiguration()` reports missing or invalid fields without exposing their values.
2. Publish `https://your-public-host/aba-payway-khqr-webhook` and request ABA provisioning/whitelisting for that route.
3. Keep raw notification records, deduplicate delivery/processing on `transaction_id`, and reconcile the invoice or account with `merchant_ref` before any fulfilment decision.
4. Do not assume online HMAC authentication; implement only the verification strategy ABA confirms for this notification.
5. The supplied high-volume guidance says the same KHQR can be paid multiple times; confirm the provider rule with ABA. The same `transaction_id` is a replay, but a new `transaction_id` with the same `merchant_ref` is a separate Payment that may create a partial payment or overpayment.
6. Recover missed notifications with `get-transactions-by-mc-ref`. It returns at most 50 matches, has no pagination parameter, and is limited to 10 requests per minute; treat a saturated response as a possible reconciliation gap.

---

## Security Checklist

- [ ] Never expose the webhook server to production traffic without the verification contract ABA confirmed for that callback type
- [ ] The `setup-webhook` command is for **development and testing only**
- [ ] For online callbacks, implement HMAC verification that **rejects** invalid callbacks; for offline KHQR, use only the verification ABA actually provides (see [Chapter 11 — Callbacks & Webhooks](11-callbacks-and-webhooks.md))
- [ ] Rotate your `PAYWAY_API_KEY` if it has been exposed in logs

---

## Next Steps

- [Chapter 11 — Callbacks & Webhooks](11-callbacks-and-webhooks.md) — production webhook handler implementation with Express.js
- [Chapter 12 — Error Handling & Debugging](12-error-handling-and-debugging.md) — troubleshooting callback issues
- [Cloudflare Free Webhook Guide](../recipes/cloudflare-free-webhook.md) — permanent webhook archiver using Cloudflare Workers + D1
