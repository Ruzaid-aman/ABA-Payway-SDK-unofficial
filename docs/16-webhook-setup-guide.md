# Chapter 16 — Webhook Setup with the CLI

This chapter explains how to receive ABA PayWay payment callbacks using the built-in `setup-webhook` CLI command. It starts a local HTTP server that logs and persists every incoming callback, with optional Cloudflare Tunnel integration for exposing the server to the public internet during development.

> **When to use this guide:** You are a developer who wants to test webhook callbacks locally during development, or you need a quick way to capture and inspect callback payloads without setting up your own Express/Node.js server from scratch.

---

## Overview

When a payment is completed, PayWay sends a server-to-server HTTP POST callback to the URL you configured in your merchant settings (or passed via `callbackUrl` in QR API requests). The `setup-webhook` command:

1. **Starts a local HTTP server** on a configurable port (default `8443`)
2. **Logs every incoming callback** with timestamp, source IP, headers, and body
3. **Verifies the HMAC-SHA512 signature** and logs the result (never rejects — you always see the payload)
4. **Persists callbacks** to disk in JSONL format (or SQLite if available)
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

## Authentication

The command reads your API key from the `PAYWAY_API_KEY` environment variable. This is used to log HMAC signature verification results.

```bash
export PAYWAY_API_KEY="your-api-key"
npx payway-sdk setup-webhook
```

> **Note:** If `PAYWAY_API_KEY` is not set, the server still accepts and logs all callbacks — signature verification is logged as "skipped" rather than "verified".

---

## Webhook URL

By default, callbacks are expected at:

```
POST http://localhost:8443/aba-payway-webhook
```

When using the `--tunnel` option, a public URL is generated:

```
https://random-name.trycloudflare.com/aba-payway-webhook
```

Copy this URL into your PayWay merchant dashboard or pass it as the `callbackUrl` in QR API requests.

---

## Storage Backends

### JSON (default fallback)

Appends each callback as a JSONL (JSON Lines) record to `./webhook_data/callbacks.jsonl`. Zero dependencies — works everywhere.

```bash
npx payway-sdk setup-webhook --storage json
```

**Record format:**

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

Only `POST /aba-payway-webhook` is accepted. All other routes return `404`. Non-POST methods return `405`.

### Response

The server always responds with:

```json
HTTP/1.1 200 OK
Content-Type: application/json

{ "acknowledged": true }
```

### Signature Verification

The server extracts the `X-PAYWAY-HMAC-SHA512` header and the `hash` field from the body, then verifies the HMAC-SHA512 signature using sorted-key concatenation (matching the algorithm in [`src/auth.ts`](../src/auth.ts)).

- ✅ **Signature valid** → logs `✓ Signature verified`
- ❌ **Signature invalid** → logs `✗ Signature mismatch (expected: ...)` but still saves the record
- ⏭️ **No API key** → logs `⊘ Signature verification skipped (no API key)`

> **Important:** The server never rejects callbacks based on signature verification. This allows you to inspect all payloads during development, including malformed or tampered ones.

### Error Handling

| Scenario | Behavior |
|---|---|
| Malformed JSON body | Logged as warning, saved as raw text, server returns 200 |
| Port already in use (EADDRINUSE) | Prints clear error with port number and exits |
| Missing `PAYWAY_API_KEY` | Signature verification skipped, callbacks still saved |
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

    Public webhook URL:  https://abc-123.trycloudflare.com/aba-payway-webhook
    Local endpoint:      http://localhost:8443/aba-payway-webhook
    Callbacks directory: ./webhook_data/

    Press Ctrl+C to stop.

  [10:30:15] POST /aba-payway-webhook from 203.0.113.42
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

# Filter approved transactions
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

---

## Security Checklist

- [ ] Never expose the webhook server to production traffic without proper signature verification
- [ ] The `setup-webhook` command is for **development and testing only**
- [ ] In production, implement signature verification that **rejects** invalid callbacks (see [Chapter 11 — Callbacks & Webhooks](./11-callbacks-and-webhooks.md))
- [ ] Rotate your `PAYWAY_API_KEY` if it has been exposed in logs

---

## Next Steps

- [Chapter 11 — Callbacks & Webhooks](./11-callbacks-and-webhooks.md) — production webhook handler implementation with Express.js
- [Chapter 12 — Error Handling & Debugging](./12-error-handling-and-debugging.md) — troubleshooting callback issues
- [Cloudflare Free Webhook Guide](./cloudflare-free-webhook.md) — permanent webhook archiver using Cloudflare Workers + D1
