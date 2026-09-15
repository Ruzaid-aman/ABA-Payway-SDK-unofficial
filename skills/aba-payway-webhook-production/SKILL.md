---
name: aba-payway-webhook-production
description: Verify PayWay callbacks and status lookups, fulfill once, and recover missing or repeated notifications.
metadata:
  version: 1.1.1
---

# PayWay Webhook Production

## Quick Start

Start after the [first-payment journey](../aba-payway-first-payment/SKILL.md). Keep credentials, verification, and fulfillment on the server. A public HTTPS endpoint receives callbacks; local tunnel setup is for development:

```sh
npm exec -- payway-sdk setup-webhook --help
npm exec -- payway-sdk setup-webhook --tunnel
npm exec -- payway-sdk check-transaction -t order-001
```

```ts
import { PayWay, paymentLifecycle } from 'aba-payway-ts';

const payway = new PayWay(); // Server credentials from environment.
const result = await payway.checkout.checkTransaction('order-001');
const state = paymentLifecycle(result.data?.payment_status);
```

## Local Testing Without the ABA Simulator

Test the full receiver path in seconds, offline: `setup-webhook --forward-to <your-app-url>` captures and re-POSTs every delivery to your app, `webhook trigger --event payment.approved` sends a correctly-signed fixture (a correct `verifyCallback` accepts it; a broken key or `hash`-field mistake rejects it), `webhook resend --record wh_… --to <url>` replays a captured delivery, and `webhook verify-callback --sig …` explains why a specific delivery failed. Fixture deliveries are synthetic — the gateway never saw the `tran_id`; never fulfill on them. The pushback and KHQR fixtures deliberately carry no signature, matching their real no-hash contracts.

## Trust and Fulfillment

For signed online callbacks, verify using `payway.verifyCallback` and the signing contract for that route. Preserve the required signed input and reject invalid signatures. Payment-link pushbacks are unsigned: treat their transaction ID as an untrusted lookup hint, verify via PayWay, and bind the result to your stored order. Offline KHQR has its own notification contract; do not use online HMAC or transaction-ID assumptions.

The lifecycle is `created`, `pending`, `approved`, `failed`, `unknown`. Only verified `approved` is eligible for fulfillment after matching the stored transaction ID, amount, and currency. PRE-AUTH and REFUNDED need separate domain handling. Creation, redirects, and request status codes are not approval.

Persist the verified event and atomically transition the order once, using a database uniqueness constraint and durable fulfillment job. Repeated callbacks and concurrent status checks must not produce duplicate goods. Acknowledge only after durable acceptance; avoid lengthy work in the receiver.

## Running the Receiver (Background / Repeated Runs)

The capture server (`setup-webhook`) is a long-running listener. When you start it away
from an interactive TTY — background job, CI, agent, hidden window — follow this recipe so
a run starts clean and ends clean:

1. **Pre-flight — confirm the port is free before starting anything.** `setup-webhook`
   starts the tunnel and writes `PAYWAY_CALLBACK_URL` into `.env` **before** binding the
   listener; a busy port leaves a dead URL propagated to `.env` and can hang the run on a
   non-TTY "port busy" prompt instead of failing fast.
   ```sh
   # Windows
   Get-NetTCPConnection -LocalPort 8443 -State Listen -ErrorAction SilentlyContinue
   # then identify an orphan listener by command line and kill it
   Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'setup-webhook' }

   # macOS/Linux
   lsof -iTCP:8443 -sTCP:LISTEN
   ```
2. **Start detached with logs** (Windows):
   ```sh
   Start-Process -FilePath "npx.cmd" -ArgumentList 'tsx','src/cli.ts','setup-webhook','--tunnel','--port','8443' -RedirectStandardOutput out.log -RedirectStandardError err.log -WindowStyle Hidden
   ```
3. **Stop cleanly — kill the whole tree, not just the npx PID.** `npx.cmd` spawns child
   node/cloudflared processes that outlive the npx PID:
   ```sh
   # Windows: taskkill guarantees the listener AND its tunnel die together
   taskkill /PID <real-pid> /T /F     # real-pid = the process listening on the port
   ```
   A force-killed receiver never runs its graceful `.env` restore — re-verify
   `PAYWAY_CALLBACK_URL` afterwards.
4. **Verify the public URL before sharing it.** A tunnel can be "up" with the listener dead
   behind it. Probe through the public URL and require an acknowledged capture:
   ```sh
   curl -i -X POST "https://<tunnel>/aba-payway-webhook" -H 'Content-Type: application/json' -d '{"probe":true}'
   # expect 200 + {"acknowledged":true,"id":"wh_..."}
   ```
5. **Tunnels are ephemeral.** `*.trycloudflare.com` URLs die with the process and are for
   sandbox verification only. ABA provisions a callback URL at the merchant-profile level
   (one URL per profile, changes via support ticket) — never hand them an ephemeral tunnel
   URL for something that must outlive the session. Use `setup-webhook --url <durable-url>`
   for a real endpoint.

## Error Handling

Do not rely on callback retries — **ABA confirmed (2026-09-12) callbacks are single best-effort delivery**: one POST, answer 200 within ~5 s, no guaranteed redelivery on failure (a one-off ~10 s retry has been observed but must not be designed for). There is no merchant-facing callback delivery history or replay API; the Integration Team can inspect pushback logs on request (tran_id + timestamps). Reconcile missing notifications through server-side status checks. A timeout means `unknown`: check the existing attempt before replacing it. Expiry and closure remain local policy; gateway PENDING can persist up to ~24 h, and late approved payments require reconciliation.

Do not log raw callbacks, keys, or customer data. Saved CLI profiles contain plaintext credentials; use a secret manager and explicit SDK configuration in deployed services. The development capture server is not an application fulfillment handler.

For recorded investigations use the opt-in [journal](../aba-payway-journal/SKILL.md); it is not a prerequisite for receiving and verifying a first payment.
