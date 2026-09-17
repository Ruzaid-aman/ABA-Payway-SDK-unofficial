# Recipe: Capturing a PayWay callback contract (pushback/webhook probe)

**Audience:** agents and maintainers running a sandbox campaign that needs to
observe what PayWay actually SENDS (callback/pushback bodies, headers, timing)
— e.g. the payment-link pushback contract captured on 2026-09-06
(SANDBOX-FINDINGS §22, `scripts/sandbox-probe-payment-link-pushback.ts`).

## Why

Official docs routinely disagree with the wire (the payment-link pushback
sample shows `"status": "00"` and no mention that there is no `hash` field;
the live gateway sends numeric `0` and no hash — ever). The only trustworthy
source is a captured delivery. This recipe turns "what does the gateway send?"
into a one-script, one-payment exercise.

## The pattern (3 moving parts)

1. **Raw-capture receiver** — an HTTP server that records EVERY request
   (method, path, all headers, raw body string, ISO timestamp) as one JSON
   line per request into `test-output/<campaign>/…jsonl`, and answers
   `200 {"acknowledged": true}` immediately. Capture raw first, parse later:
   malformed/unexpected deliveries are evidence too.
   - Do NOT parse-then-store. Do NOT reject on signature problems (a capture
     sink must accept everything to be evidence).
2. **Public tunnel** — `cloudflared tunnel --url http://127.0.0.1:<port>`
   (the SDK's `createTunnelManager` in `src/webhook/tunnel.ts` wraps this and
   parses the assigned `https://<random>.trycloudflare.com` URL). Sandbox
   gateways can only POST to public HTTPS; trycloudflare quick tunnels work.
3. **Transaction creation pointed at the tunnel** — create the payment link /
   checkout / QR with the callback/return URL set to
   `<tunnel-url>/<route>`, print the shareable URL or QR for the payer.

The reference implementation of all three is
`scripts/sandbox-probe-payment-link-pushback.ts` — copy it and swap the
creation call for the flow under investigation.

## Running the interactive leg

- The rig prints the shareable URL; the payer (you, or the user) completes it
  with the ABA Mobile Simulator app — reference doc:
  `docs/archive/ABA Mobile Simulator App.md` (PIN 1234, secret word TEST1).
- Approve → the pushback typically lands within seconds; verify the payment
  independently via `check-transaction(tran_id)` and log the result next to
  the capture.
- Run the rig in the background with output to a file; captures persist even
  if the process is killed (append-only JSONL).

## Evidence conventions

- Captures → `test-output/<campaign-slug>/` (gitignored; stays on disk).
- Findings → `docs/SANDBOX-FINDINGS.md` as a new dated section (append, never
  rewrite history).
- The capture script itself → `scripts/sandbox-probe-*.ts` (committed,
  re-runnable; see the existing payment-link probes for style).

## Gotchas learned the hard way

- Create the output directory BEFORE redirecting the rig's stdout into it —
  `mkdir -p test-output/<slug>` or the shell redirect fails before the script
  runs.
- Set `NODE_TLS_REJECT_UNAUTHORIZED='0'` scoped to the single command only
  (sandbox TLS chain); never export it.
- The receiver must answer 200 fast; ACK first, verify/process after.
- Multi-payment targets (payment_limit > 1 links) fire one callback per
  completed payment — one capture per payment, not one per link.
- `check-transaction` is the only record of truth: a user-reported "paid"
  without a gateway verification is not evidence (HANDOFF anti-checklist).
