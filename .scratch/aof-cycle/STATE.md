# AOF Live Test Cycle — campaign state

**Status:** IN FLIGHT — Phases A–C + offline gap wave DONE. **RESUME at Phase D** (needs the user at the desk to scan QRs in ABA Mobile).
**Constraint:** CLI/SDK/knowledge-base ONLY — no standalone test scripts (user directive; improve CLI/SDK/skills instead).
**Pacing:** stage-gated, 10–15 s sleeps between gateway calls.
**Commits:** `840aaf6` (QR presentation + body-hash verification), `baa0fe6` (§26 + skills), this wave (offline gap fixes).

## Live facts pinned so far (SANDBOX-FINDINGS §26)
- CITI_FLEX + CITO_FLEX link-account → `00 Success` (first ever on this profile).
- CITO_FIX / CITR_FLEX still `104`; **card leg still `104`** — account-only enablement.
- Deeplink: `abamobilebank://ababank.com?type=account_on_file&qrcode=…` (NOT `type=payway`).
- `expire_in` = absolute epoch (expiry instant); CLI now renders the wall-clock deadline.
- The real pwt-callback contract (Q18) is still UNCAPTURED — that is Phase D's prize.

## Phase D resume checklist (user at desk)
1. `NODE_TLS_REJECT_UNAUTHORIZED=0 npx tsx src/cli.ts setup-webhook --tunnel --port 8443` (background; note the fresh `<tunnel>` URL; it upserts `PAYWAY_CALLBACK_URL` in `.env`). After teardown, **taskkill any orphan `cloudflared.exe`** (survives the background-task stop on Windows).
2. Optional dry-run (no user needed): `... webhook trigger --event cof-link.linked --url <tunnel>/aba-payway-webhook --ctid dryrun01` → `cof token list` shows the synthetic pwt → `webhook show --record wh_…` (signatureSource must read `body`) → `cof token remove -c dryrun01 --token <pwt>` (gateway 00 idempotent + local prune).
3. `NODE_TLS_REJECT_UNAUTHORIZED=0 npx tsx src/cli.ts cof link-account -r aoflink001 -c aofcycle01 -f CITI_FLEX --currency USD --callback-url <tunnel>/aba-payway-webhook --open-image -y` → **USER SCANS + approves in ABA Mobile** (QR window per `expire_in`).
4. First Q18 capture: receiver log ("✓ CoF token captured … (body-hash|header-hash)") → `webhook list` → `webhook show --record wh_…` (headers + raw body + verdict) → `cof token list -c aofcycle01 --json` (extraFields = real contract) → `cof token details -r aoflink001`.
5. Continue per plan: E charge matrix (CITU_FLEX first; watch for an approval QR — the CLI now renders one if it appears) → F renew → G merchant unlink (+ expect 87 on charge-after-removal) → H CITO_FLEX re-link + app-side unlink in ABA Mobile → I codification (cof-callback.ts knowns from the real capture, §26 append, Q18 close, corpus sync SAME commit) → J teardown + report.

## Environment notes
- `.env` `PAYWAY_CALLBACK_URL` currently holds the DEAD 05:32Z tunnel URL — the next `setup-webhook --tunnel` overwrites it (designed flow).
- Store baselines at park time: token store EMPTY, webhook captures EMPTY (clean slate for D).
- `docs/09` + knowledge-corpus content edits are deliberately DEFERRED to Phase I: the separate datetime wave owns the uncommitted `knowledge/` + `llms.txt` + `docs/22` changes; mixing would tangle both waves.
