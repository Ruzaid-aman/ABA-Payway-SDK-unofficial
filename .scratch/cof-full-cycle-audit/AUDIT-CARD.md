# COF Full-Cycle Audit — 2026-09-12 (branch `audit/cof-full-cycle-2026-09-12`)

**Scope:** Account on File end-to-end — link-account (QR) + link-card (hosted form) full cycle, pwt
token persistence, storage-service readiness for future purchases.
**Baseline:** main `66f10d2` · suite 1856 green pre-change · session started with the user standing by to
scan the link QR in the integrated browser.

---

## Verdict

**Our side is ready; the paid cycle remains externally blocked (ABA 104) — nothing was scannable.**

1. **External blocker unchanged (LC-1/104):** every linking attempt — link-account with all four flags
   (CITI_FLEX, CITO_FLEX, CITO_FIX, CITR_FLEX) and the hosted card form — answers **104 "Merchant not
   enabled token flag"**. No QR is ever generated for account linking, so there was nothing to present
   for scanning. The ABA enablement ask (filed in `ABA-OPEN-QUESTIONS.md`, §24) is still open.
2. **Token-persistence gap CLOSED (this wave, `a538669`):** the webhook workbench captured raw callback
   bodies but never persisted the `pwt`. The SDK now stores verified link tokens for future charges.
3. **§24 P1 fixes re-verified live:** uniform `--json` error envelope on `cof link-account` and decoded
   `hostedPage.code=104` + correlationId on `cof link-card` both behave exactly as shipped.
4. **LC-4 re-confirmed:** zero callback deliveries for failed links across two live tunneled receivers.

---

## Token persistence (new capability, committed `a538669`)

- `src/webhook/cof-callback.ts` — heuristic `parseCofLinkCallback`/`isCofLinkCallback`. The `pwt` field is
  the discriminator (no other callback contract carries it); unknown string fields (minus `hash`) are
  preserved verbatim for the Q18 first-capture analysis. Schema remains UNVERIFIED live.
- `classifyCallback` gains `'cof-link'` (checked before online-checkout, which also carries `status`).
- `src/webhook/token-store.ts` — `payway-data/linked-tokens.json` (`PAYWAY_TOKEN_STORE_DIR` override):
  upsert by (ctid, pwt), atomic tmp+rename write, corrupt-file degradation to empty, `maskPwt` display.
- `src/webhook/server.ts` — on ANY route, a signature-VERIFIED delivery carrying `pwt` persists the token
  (with `sourceRecordId` joining the raw webhook record); unverified/invalid deliveries are captured raw
  but NEVER persisted (a pwt is a live payment credential).
- CLI: `cof token list [-c ctid] [--show-token] [--json]` (offline read) and `cof charge` without
  `--token` resolves the latest captured pwt for `--ctid` from the store.
- Public exports: `parseCofLinkCallback`, `isCofLinkCallback`, `LinkedTokenRecord`,
  `loadLinkedTokens`, `saveLinkedToken`, `latestTokenForCtid`, `maskPwt`, `resolveTokenStoreDir`.

**Offline proof:** 21 new tests (`cof-token-capture.test.ts`, `cli-cof-token-store.test.ts`) — real
loopback HTTP, real HMAC signing: verified pwt delivery → persisted; invalid signature → captured raw,
token withheld; `cof charge --ctid` sends the resolved pwt on the wire. Suite **1877** green, lint clean.

## Live legs (2026-09-12, sandbox profile ec476910)

| # | Leg | Result |
|---|-----|--------|
| 1 | `linkAccount` CITI_FLEX (rig, tunneled callback) | ✗ 403 code 104 (trace `cd9b2938…`) |
| 2 | Flag sweep CITI_FLEX/CITO_FLEX/CITO_FIX/CITR_FLEX | ✗ all 104 — profile-level, not flag-specific |
| 3 | `cof link-card` hosted form (committed card rig) | ✗ 302 → `/add-card/<b64>` decodes to 104 (trace `ac6690a8…`) |
| 4 | CLI `cof link-account --json` | ✅ uniform error envelope, paywayCode 104 (P1-1 verified live) |
| 5 | CLI `cof link-card --json` | ✅ `hostedPage{code:104}` + `correlationId` (P1-3/I-4 verified live) |
| 6 | Callback capture on failed links | ✗ zero deliveries on both live receivers (LC-4 re-confirmed) |
| 7 | QR scan leg (user standing by) | ⛔ unreachable — no QR exists under 104 |

## Artifacts preserved (do not discard)

| Artifact | Purpose |
|---|---|
| `scripts/sandbox-probe-link-account-cycle.ts` (committed) | Account-link full-cycle rig: **SDK's own webhook server** + tunnel + linkAccount + QR PNG + browser presentation page + token-store watcher. Re-run as-is once ABA enables token flags. |
| `scripts/sandbox-probe-cof-flag-sweep.ts` (committed) | One-POST-per-flag 104 sweep + hosted card-leg probe. |
| `.scratch/cof-full-cycle-audit/flag-sweep.json` | Raw sweep results (this audit). |
| `test-output/link-card-review/` + committed card rig | Unchanged from §24, re-used this session. |

## Re-test checklist when ABA enables token flags (unblocks §24 legs 4–9)

1. `NODE_TLS_REJECT_UNAUTHORIZED='0' npx tsx scripts/sandbox-probe-link-account-cycle.ts` → scan the QR
   (browser page auto-served on :8795) → approve in ABA Mobile sandbox → receiver logs
   "CoF token captured" → `cof token list` → `cof charge -t <id> -a 4.50 --ctid <ctid> --token-flag MITU_FLEX`.
2. Card leg with sandbox test cards (`payway-sdk sandbox-test-cards`), incl. declined/3DS paths.
3. Capture the REAL callback field set → replace the heuristic parser's unknowns with the pinned contract
   (resolves Q18) → re-run `npm run sync:knowledge`.
4. `cof token details` / `renew` / `remove` lifecycle against the captured pwt.
