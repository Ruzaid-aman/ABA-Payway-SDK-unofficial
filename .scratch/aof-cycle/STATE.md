# AOF Live Test Cycle — campaign state

**Status: COMPLETE.** Every leg live-verified, including the final app-side
unlink (negative-result capture). Committed: `840aaf6`, `baa0fe6`, `c8b78cb`,
`5bc48ea`, `6583b4c`, + this wave. Suite 2035/2035. Full detail:
docs/SANDBOX-FINDINGS.md §26 AOF-1..AOF-14.

## Final leg (2026-09-15 ~12:48–13:05Z): app-side unlink
- Re-link cycle with user scanning: `aofunlink4` (*****5001) + `aofunlink5`
  (*****0003 — returned the IDENTICAL morning pwt, AOF-13 dedupe) +
  `aofunlink6` (*****5001 again) all approved via real callbacks.
- User removed BOTH accounts in ABA Mobile → charges on both pwts → **105**
  (token dead); `getTokenDetails` still `status: 1` (LIES — active); **ZERO
  removal callbacks** delivered (receiver had 5 captures = 2 probes + 3 link
  approvals). → AOF-14; Q18.2/18.4 closed as negative evidence, new ABA
  sub-question 6 (removal callback/profile webhook existence + details
  inconsistency).
- Practical rule codified in skills/docs/09: customer unlink detection is
  CHARGE-TIME ONLY (105); never trust details.status; don't await a webhook.

## Operational learnings this session
- **QR auto-open is unreliable** (viewer shows stale/no image): the reliable
  pattern was `--no-open-image` + explicit `cmd //c start "" <png>` right after
  firing. 3 of 4 lapsed QRs were viewer misses, not gateway issues.
- **Fresh trycloudflare hostnames can hit a Windows DNS negative cache** —
  curl fails (`could not resolve`) while nslookup resolves; fix:
  `ipconfig //flushdns`. The rig's startup readiness probe gates the `.env`
  upsert, so after a failed probe the URL must be upserted manually.
- Teardown recipe unchanged (taskkill listener + cloudflared via `cmd //c`).

## Environment
- Rig was UP for this leg (tunnel everyone-temporal-magnificent-appraisal);
  tore down after codification. `.env` PAYWAY_CALLBACK_URL holds its URL —
  dead after teardown; next `setup-webhook --tunnel` overwrites.
- No tokens are linked now (both app-removed). Local token store empty.
