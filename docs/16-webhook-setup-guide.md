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

```bash
# Basic — starts server on port 8443, saves callbacks to ./webhook_data/callbacks.jsonl
npx payway-sdk setup-webhook

# With Cloudflare Tunnel (auto-generates a public URL)
npx payway-sdk setup-webhook --tunnel

# Custom port and storage
npx payway-sdk setup-webhook --port 3000 --storage json

# Use a pre-existing public URL (e.g., ngrok, localtunnel, or your own tunnel)
npx payway-sdk setup-webhook --url https://your-tunnel-url.ngrok.io
```

---

## Command Options

| Option | Default | Description |
|---|---|---|
| `--port <number>` | `8443` | Local port for the webhook server |
| `--storage <type>` | `auto` | Storage backend: `auto` (SQLite → JSON), `json`, or `sqlite` |
| `--tunnel` | `false` | Start a Cloudflare Tunnel for a public URL |
| `--url <string>` | — | Use an existing public URL (skips tunnel startup) |

---

## Online Checkout Authentication

For the online checkout route only, the command reads your API key from the `PAYWAY_API_KEY` environment variable to log HMAC signature verification results.

```bash
export PAYWAY_API_KEY="your-api-key"
npx payway-sdk setup-webhook
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

Appends each callback as a JSONL (JSON Lines) record to `./webhook_data/callbacks.jsonl`. Zero dependencies — works everywhere.

```bash
npx payway-sdk setup-webhook --storage json
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
npx payway-sdk setup-webhook --storage sqlite
```

Storage path: `./webhook_data/callbacks.db`

---

## Cloudflare Tunnel

The `--tunnel` option requires [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-local-tunnel/) to be installed and available in your PATH.

```bash
# Check if cloudflared is installed
which cloudflared    # macOS/Linux
where cloudflared    # Windows

# Start with tunnel
npx payway-sdk setup-webhook --tunnel
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

Full lifecycle: [17. Payment Link API](./17-payment-link.md) §17.6.

### Online Checkout Signature Logging and Offline KHQR Notifications

For the **online checkout route**, the server extracts the `X-PAYWAY-HMAC-SHA512` header and the `hash` field from the body, then logs HMAC-SHA512 verification using sorted-key concatenation (matching the algorithm in [`src/auth.ts`](../src/auth.ts)).

- ✅ **Signature valid** → logs `✓ Signature verified`
- ❌ **Signature invalid** → logs `✗ Signature mismatch (expected: ...)` but still saves the record
- ⏭️ **No API key** → logs `⊘ Signature verification skipped (no API key)`

#### Verdict mode: rejecting invalid signatures (TD-09)

The capture server above is intentionally always-200 — it is a **sink**, not a
verdict. For deployments that need the webhook itself to refuse tampered
deliveries, pass `rejectInvalidSignature` when creating the listener:

```typescript
import { createWebhookServer, createStorage } from 'aba-payway-ts';

const storage = createStorage('json');
const listener = createWebhookServer(storage, {
  port: 8443,
  apiKey: process.env.PAYWAY_API_KEY, // required for verification
  rejectInvalidSignature: true, // ← 401 on invalid signatures (default: false)
});
```

Semantics in verdict mode:

| Delivery | Stored? | Response |
|---|---|---|
| Valid signature | ✅ | `200 { acknowledged: true }` |
| **Invalid signature** | ✅ (audit trail kept) | **`401 { error: 'invalid signature' }`** |
| No signature header | ✅ | `200` (nothing to verify against — gateway may omit it on retries) |

Capture-vs-verdict separation matters for ABA callback retries: a capture sink
never causes redelivery storms, while a 401-verdict endpoint should be paired
with idempotent business handlers. When in doubt, keep the default and enforce
verdicts inside your own handler after persisting the payload.

> **Important:** This development listener never rejects either route based on its capture processing. Production online checkout handling must reject invalid HMACs; offline KHQR handling must use only an ABA-confirmed verification contract.

The offline KHQR route has no assumed online HMAC contract. The listener retains its raw body, headers, source IP, parsed `transaction_id`, unknown fields, and parse errors. Receiving or parsing it does not mean a payment is verified or an order is paid. Deduplicate on `transaction_id`, reconcile against your own `merchant_ref`, and only fulfil after implementing the verification mechanism ABA actually supplies for your merchant.

### Error Handling

| Scenario | Behavior |
|---|---|
| Malformed JSON body | Logged as warning, saved as raw text, server returns 200 |
| Port already in use (EADDRINUSE) | Prints clear error with port number and exits |
| Missing `PAYWAY_API_KEY` | Online HMAC verification skipped; both routes are still saved |
| SIGINT / SIGTERM | Graceful shutdown — finishes processing current request, stops server |

---

## Lifecycle

```
$ npx payway-sdk setup-webhook --tunnel

  Starting webhook server on port 8443…
  Storage: ./webhook_data/callbacks.jsonl

  Starting Cloudflare Tunnel…

  ✓ Webhook server listening on http://localhost:8443
  ✓ Cloudflare Tunnel active

    Online callback URL: https://abc-123.trycloudflare.com/aba-payway-webhook
    Local online route:  http://localhost:8443/aba-payway-webhook
    Callbacks directory: ./webhook_data/

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
import { createStorage, type WebhookStorage } from 'aba-payway-ts';
import { createWebhookServer } from 'aba-payway-ts/webhook/server';

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
cat ./webhook_data/callbacks.jsonl | jq -s '.'

# Count callbacks
wc -l ./webhook_data/callbacks.jsonl

# Filter approved online checkout transactions
cat ./webhook_data/callbacks.jsonl | jq -s '.[] | select(.body.status == "APPROVED")'
```

---

## Integration with PayWay QR Flow

### Step 1: Start the webhook server

```bash
npx payway-sdk setup-webhook --tunnel
# Note the generated URL, e.g. https://abc-123.trycloudflare.com/aba-payway-webhook
```

### Step 2: Generate a QR code with the webhook URL

```bash
npx payway-sdk generate-qr \
  --amount 5.00 \
  --callback-url https://abc-123.trycloudflare.com/aba-payway-webhook \
  --merchant-id YOUR_MERCHANT_ID
```

### Step 3: Scan the QR code and complete payment

The callback will appear in your terminal and be saved to disk.

### Offline ABA KHQR notification setup

1. Configure the ABA-issued offline KHQR merchant fields through explicit `PayWay` configuration, `PAYWAY_KHQR_*` environment variables, or a local CLI profile. `payway.khqr.validateConfiguration()` reports missing or invalid fields without exposing their values.
2. Publish `https://your-public-host/aba-payway-khqr-webhook` and request ABA provisioning/whitelisting for that route.
3. Keep raw notification records, deduplicate `transaction_id`, and reconcile with `merchant_ref` before any fulfilment decision.
4. Do not assume online HMAC authentication; implement only the verification strategy ABA confirms for this notification.

---

## Security Checklist

- [ ] Never expose the webhook server to production traffic without the verification contract ABA confirmed for that callback type
- [ ] The `setup-webhook` command is for **development and testing only**
- [ ] For online callbacks, implement HMAC verification that **rejects** invalid callbacks; for offline KHQR, use only the verification ABA actually provides (see [Chapter 11 — Callbacks & Webhooks](./11-callbacks-and-webhooks.md))
- [ ] Rotate your `PAYWAY_API_KEY` if it has been exposed in logs

---

## Next Steps

- [Chapter 11 — Callbacks & Webhooks](./11-callbacks-and-webhooks.md) — production webhook handler implementation with Express.js
- [Chapter 12 — Error Handling & Debugging](./12-error-handling-and-debugging.md) — troubleshooting callback issues
- [Cloudflare Free Webhook Guide](./cloudflare-free-webhook.md) — permanent webhook archiver using Cloudflare Workers + D1
