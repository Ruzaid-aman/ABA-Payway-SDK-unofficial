# AOF Live Test Cycle — campaign state

**Status:** COMPLETE except ONE leg — the app-side (ABA Mobile) unlink callback
(Q18 sub-questions 2/4). Everything gateway-side is live-verified and codified.
**Committed:** `efce6bc` (2026-09-15, main) — nested callback contract + charge
matrix + lifecycle ops + §26 AOF-7..11 + corpus sync. Suite 2035/2035.
Earlier: `840aaf6` (QR presentation + body-hash verify), `baa0fe6` (§26 AOF-1..6),
`c8b78cb` (offline gap wave), `269f397` (user's before-testing, datetime wave).

## Results (full detail: docs/SANDBOX-FINDINGS.md §26 AOF-1..AOF-11)
- **Q18 payload half CLOSED** — live capture `wh_mu2hf6i6_7c84ba65`:
  `{request_id, payment_credential:{ctid,pwt,source_of_fund,type,status:1,
  expired_at,token_flag,frequency,subscribed_amount,amount_limit_per_tran,currency}}`.
  Parser/fixture/classifier all speak the nested shape (flat legacy still parses).
- **Q18 signature half OPEN (new sub-question 5)** — the header HMAC does not
  verify under our canonicalization; 19 offline orderings failed (§26 AOF-8).
  Recovery: `cof token details -r <request_id>` (transitive auth).
- **Charge matrix** (§26 AOF-9): CITU_FLEX → 00 + check-transaction APPROVED
  (apv 101349); MITU_FLEX/MITU_FIX/MITR_FLEX → 105; no token_flag → 04.
  Success response is status-ONLY (no tran_id) — reconcile via your tran_id (AOF-10).
- **Lifecycle live-00**: renew (window restart, pwt unchanged), remove (local
  prune; charge-after-remove = 105, no +87 discriminator on the account leg),
  CITO_FLEX re-link (fresh QR; expire_in epoch CONFIRMED on 3 links, AOF-11).

## The one open leg (resume recipe)
User removes the linked account in ABA Mobile → receiver should capture the
status-0 CoF callback (Q18.2 semantics) and the app-side behavior (Q18.4).
1. Restart the rig (runbook now in `skills/aba-payway-webhook-production`):
   pre-flight port 8443 check → `setup-webhook --tunnel --port 8443` (detached,
   logs to files) → note fresh tunnel URL (it upserts PAYWAY_CALLBACK_URL in .env).
2. `cof link-account -r aofunlink1 -c aofcycle01 -f CITI_FLEX --currency USD
   --callback-url <tunnel>/aba-payway-webhook -y` → user scans + approves.
3. User: ABA Mobile → linked accounts → remove.
4. `webhook list` / `webhook show --record wh_…` (expect signatureVerdict
   invalid per AOF-8 — the SHAPE is the prize, not the verdict) → then codify
   the removal-callback shape + close Q18.2/18.4 (§27 or AOF-12+).

## Environment notes
- Rig is DOWN (verified: port 8443 free, 0 cloudflared). `.env`
  `PAYWAY_CALLBACK_URL` holds a DEAD tunnel URL (red-major-tiny-waves) — the
  next `setup-webhook --tunnel` overwrites it (designed flow).
- No token is linked right now (remove in G + re-links never scanned). The
  charge matrix token `5276…93A` was removed gateway-side in Phase G.
