# ABA PayWay: first payment in one page

This is the shortest safe path from an empty Node.js 20 project to a verified sandbox payment.

## Try the flow locally

```bash
npm install aba-payway-ts
npm exec -- payway-sdk demo
```

Until the npm release is available, install the tarball built from this repository as described in the [root quickstart](../QUICKSTART.md). The demo binds to `127.0.0.1`, uses a local mock gateway, and does not read or require ABA credentials. Creating a simulated payment produces a QR and a `PENDING` state; simulated approval moves it to `APPROVED` and demonstrates when fulfillment becomes safe.

Use this non-interactive check for CI and package validation:

```bash
npm exec -- payway-sdk demo --check
```

## Configure a sandbox first payment

```bash
npm exec -- payway-sdk init --mode sandbox --template first-payment
npm exec -- payway-sdk doctor --route online-qr
```

`init` creates `.env.example`, creates `.env` only if absent, and writes `payway-first-payment.mjs` only if absent. Add the merchant ID, API key, and a public HTTPS callback URL to your server environment. The CLI also supports named sandbox and production profiles and reports the active source without showing secrets.

Create a complete online QR request:

```bash
npm exec -- payway-sdk generate-qr -a 3.00 -c USD -t order-001 \
  --callback-url https://your-public-host.example/payway/callback \
  -y --no-polling --output json
```

PowerShell uses a backtick instead of `\` for continuation:

```powershell
npm exec -- payway-sdk generate-qr -a 3.00 -c USD -t order-001 `
  --callback-url https://your-public-host.example/payway/callback `
  -y --no-polling --output json
```

The accepted response is not proof of payment. Verify the transaction before fulfillment:

```bash
npm exec -- payway-sdk check-transaction -t order-001
npm exec -- payway-sdk transaction-detail -t order-001 --wait 10
```

If creation returns a network error or timeout, its outcome is unknown. Reconcile the same merchant transaction ID before creating another payment.

## Put the SDK behind your server

Run the generated first-payment file or adapt its pattern:

```bash
node payway-first-payment.mjs
```

The server owns four responsibilities:

1. Generate a unique merchant transaction ID and store it with the order.
2. Call PayWay with server-only credentials and return only the safe checkout artifact to the client.
3. Verify a callback or query transaction status, including the expected amount and currency.
4. Fulfill the order exactly once, even if verification is repeated.

For a browser-hosted payment page, choose the matching diagnostic and create a signed form:

```bash
npm exec -- payway-sdk doctor --route hosted-checkout
npm exec -- payway-sdk checkout-form -a 5.00 -t order-002 --payment-gate 0 --auto-submit --out checkout.html
```

The browser submits that form directly to PayWay. Never bundle `aba-payway-ts`, API keys, or RSA material into frontend code.

## Automation contract

Use `--output json` for one versioned result or `--output ndjson` for creation
and polling events. Success envelopes include `correlationId` and, when present,
PayWay's `traceId`. Add `--journal` to the same create/check command when you
want a local JSONL trail for `journal timeline`, `journal reconcile`, and
`journal explain`. Exit codes are stable:

| Code | Meaning |
|---:|---|
| `0` | The command completed its work. Payment creation may still be pending. |
| `1` | Input or local configuration is invalid. |
| `2` | PayWay rejected the API request. |
| `3` | A network, rate-limit, or timeout failure occurred. |

## Agentic PayWay CLI

The optional agentic CLI translates a request into typed local PayWay tools. It keeps credentials local, redacts secrets before provider calls, and applies explicit approval rules to payment actions.

```bash
npm exec -- payway-sdk onboard
npm exec -- payway-sdk ask "Generate an online QR for 3 USD" --yolo
```

`--yolo` skips ordinary interactive confirmations in sandbox; it does not bypass explicit non-interactive authorization rules. Every agent action has a manual CLI equivalent. See the [Agent Setup Playbook](./AGENT-SETUP-PLAYBOOK.md) and the packaged [`aba-payway-agent`](../skills/aba-payway-agent/SKILL.md) skill.

## Continue from here

- [Root quickstart](../QUICKSTART.md) — installation and POSIX/PowerShell environment setup.
- [Documentation index](./README.md) — API domains, callbacks, QR, hosted checkout, profiles, and release guidance.
- [Webhook setup](./16-webhook-setup-guide.md) — local receiver and tunnel workflow.
- [`aba-payway-first-payment` skill](../skills/aba-payway-first-payment/SKILL.md) — route selection and recovery rules.
