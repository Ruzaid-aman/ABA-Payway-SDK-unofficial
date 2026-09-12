# REVIEW CARD — Card-on-file (link-card) integration, full cycle

**Date:** 2026-09-12 · **Scope:** ABA PayWay link-card (hosted card linking) end-to-end — SDK `credentialsOnFile.linkCard()` / `getLinkCardFormHtml()`, CLI `cof link-card` / `cof link-card-form` / `cof charge` / `cof token *`, callback delivery, docs & skills contract.
**Method:** superpowers code-reviewer subagent (read-only, range `4e88bd9..329bf0c` scoped to COF files) + offline automated suites + live sandbox full-cycle e2e (webhook receiver + trycloudflare tunnel + in-app-browser card-entry attempt with ABA sandbox test cards).
**Evidence:** `test-output/link-card-review/` (gitignored, on disk) · findings: SANDBOX-FINDINGS **§24** · rig: `scripts/sandbox-probe-link-card-cycle.ts` (committed, re-runnable).

---

## Verdict

**Ready: With fixes — no Critical code defects; one external blocker + a small P1 fix list.**

The link-card implementation itself is contract-faithful and unusually well pinned (single hash source of truth with a three-way drift guard, wire-vs-form byte-identity test, always-HTML handled at the right transport layer, escaping/mutation/`callOptions` contracts all correct). What needs attention:

1. **External blocker (ABA):** the sandbox merchant profile is not enabled for token flags — hosted card linking answers **code 104** before any card can be entered, so the paid cycle (pwt → charge → renew) and the Q18 callback capture **cannot be tested live** until ABA enables the service.
2. **P1 fixes (repo):** the `cof` group's `--json` failure path violates the uniform error-envelope contract; docs/09 teaches an impossible `linkCard()` integration; the SDK silently discards the hosted outcome (302 `/add-card/<base64>` payload).
3. **Audit correction:** the standing "sandbox skips hash verification on link-card" claim is **refuted** — hash is required and enforced (controlled replays today).

---

## 1 · Offline automated testing — PASS

| Suite | Result |
|---|---|
| 8 targeted COF/link-card vitest suites (`link-card-form-html`, `cof-linkcard-frequency`, `cof-subscription-parity`, `hash-order-hints`, `error-parity-b5`, `cli-mock-commands`, `validation`, `mutation-retry-policy`) | **188/188 green** |
| `payway-sdk test` (built-in mock contract harness) | **5/5 green** |
| `npm run build` | green (dist fresh for the CLI runs) |

## 2 · Live full-cycle e2e — leg by leg

| # | Leg | Result |
|---|---|---|
| 1 | `cof link-card` API path (`--json`) | ✅ exit 0, `{hostedHtmlPath,…}` envelope, 42 KB page saved — but page is the shell; real result is 104 (LC-2) |
| 2 | `cof link-card-form` → browser auto-submit (in-app browser, http origin) | ✅ mechanics work end-to-end; gateway 302 → `/add-card/<base64>` → rendered **"Unable to process — Merchant not enabled token flag [Error Code: 104] [Order ID: lcrev01a/01b]"** |
| 3 | `CITO_FLEX` variant | ✗ same 104 — profile-level block, not flag-specific (LC-1) |
| 4 | pwt callback capture (receiver + tunnel) | ⛔ no callback fires on failed link (LC-4) — leg blocked by #2 |
| 5 | `cof charge` with captured pwt | ⛔ blocked by #4; negative path probed: unknown pwt → **105** + hint (LC-6) |
| 6 | `cof token details` | ✗ negative path: never-linked request → **09** "Data not found" (LC-6) |
| 7 | `cof token remove` | ⚠️ **unknown token → `00 Success`** — remove doesn't verify existence (LC-6) |
| 8 | Hash enforcement (controlled replays: intact / corrupted base64 / missing) | ✅ enforced: 104 pass-through vs **01 Wrong Hash** vs **HTTP 400 `04` `errors.hash required`** (LC-3) |
| 9 | Declined-card & 3DS-card legs | ⛔ unreachable (no card form renders on this profile); 3DS OTP is email-delivered regardless |

## 3 · Code review findings (reviewer subagent)

**Strengths (verified, with pins):** single `LINK_CARD_HMAC_FIELDS` fed into signature + request + hint (drift-guarded, `hash-order-hints.test.ts`); wire-vs-form byte-identity via fetch interception (`link-card-form-html.test.ts:57-86`); shared `buildLinkCardPayload` (no form/API drift); always-HTML → structured `PayWayBusinessError` at the right layer in `_executeFetch` (status → empty-body → HTML branch); escaping/formId/filename traversal all guarded; `MUTATION_ENDPOINTS` single-submit; CLI capture path + mock tests; frequency advisory (D5) exact.

**Important**

| # | Finding | Where |
|---|---|---|
| I-1 | Flagship `linkCard()` example teaches an integration that can never work (`result.pwt` — the method always throws; pwt only via callback) | `docs/09-link-unlink-renew-lifecycle.md:141-180` (contrast :182/:199 which state it correctly) |
| I-2 | Factually wrong sentence: "SDK detects the HTML shape and treats it as the success signal… error only when the page indicates failure" — no such discrimination exists | `docs/09:218` |
| I-3 | `cof` group `--json` failures print the human error block, not the `{error:{kind,exitCode,…}}` envelope (**hit live**, LC-7) | `src/cli.ts:3924, 4015, 4165, 4197, 4224, 4252` → route catches through `printApiErrorJson` (`:312`) |
| I-4 | Hosted-page `--json` envelope omits `correlationId`/`traceId` journal join-keys (hand-rolled, bypasses `printApiResultJson`) | `src/cli.ts:3979-3990` |

**Minor:** stale "frequency has no body field" comments (`src/client.ts:595-597, 627-628`, `docs/09:229`) · validation asymmetry — linkCard lacks `validateCurrency`, no runtime frequency-enum advisory, no missing-callbackUrl advisory on the API path, `continueSuccessUrl` base64 rule is heuristic, `frequency:''` slips through (`credentials-on-file.ts:215-228` vs `:262-265`, `utils.ts:641-649`) · unprotected `writeFileSync` in the catch (`cli.ts:3972-3975`) · HTML-on-4xx not captured by the CLI (only 200-HTML reaches the branch) · test gaps (gateway-JSON-on-link-card via CLI; entity-decoding in the wire-vs-form extractor; HTML-4xx pin) · `linkCard` interface method has no JSDoc (`credentials-on-file.ts:81-84`).

## 4 · Live findings (LC-1…LC-7) — full detail in SANDBOX-FINDINGS §24

- **LC-1** Profile blocker: 104 "Merchant not enabled token flag" (CITI_FLEX & CITO_FLEX) → ask ABA to enable; unblocks Q18 capture + COF charge e2e.
- **LC-2** Hosted result travels as `302 → Location: /add-card/<base64 JSON>`; Node fetch follows silently; the 42 KB shell carries no marker → the 2026-09-01 "card-entry page" reading was shell-only (now corrected).
- **LC-3** Hash IS enforced in sandbox (01 / 400-04 evidence) — §9a "skips hash" + open question 7 + skill caveat are stale.
- **LC-4** No callback on failed link attempts (zero deliveries with live tunneled callback_url).
- **LC-5** Hosted error page: OK button is a dead end; `continue_success_url` ignored on error.
- **LC-6** Lifecycle negative codes live: charge→105, details→09, **remove→00 even for unknown tokens** (can't probe existence with remove).
- **LC-7** `cof --json` failure output is human text (machine contract gap, = I-3).

## 5 · Improvement backlog for SDK/CLI (proposed, not built — prioritized)

**P1**
1. **`cof` --json envelopes** — swap the six catches to `printApiErrorJson`; envelope shape then matches payout/pre-auth/exchange-rate (fixes I-3/LC-7; small, testable via mock handlers).
2. **docs/09 corrections** — rewrite the flagship example to the catch-HTML-serve-page/pwt-via-callback pattern (mirror the link-card skill); fix the :218 sentence (I-1, I-2).
3. **Hosted outcome detection** — SDK: capture the post-redirect URL on `linkCard()` (`response.url` or `redirect:'manual'`), decode `/add-card/<base64>`, and surface a typed result (`{ hosted: true, addCardPayload }`) or structured warning; CLI `cof link-card` then distinguishes "error page (104/01…)" from "card-entry page" instead of always "✓ … saved" (LC-2, probe implements the decode).
4. **Journal join-keys** in the hosted-page `--json` envelope (I-4).

**P2**
5. Validation symmetry on `buildLinkCardPayload`: `validateCurrency`, frequency enum advisory, missing-`callbackUrl` API-path advisory (pwt undeliverable), strict base64 rule for `continueSuccessUrl` (mirrors tokenFlag treatment).
6. Stale-text sweep (one wave, needs `npm run sync:knowledge` because the corpus pins skill shas): client.ts frequency comments, docs/09:229, `aba-payway-link-card` skill "Sandbox does not verify the hash" line → LC-3 correction, §9a/Q7 pointers.
7. Harden the catch-block file write (`cli.ts:3972-3975`); capture HTML-on-4xx for any `PayWayAPIError` with HTML rawBody.

**P3**
8. Test-gap suite (gateway-JSON-on-link-card via CLI; entity-decoding in the wire-vs-form extractor; HTML-4xx pin); `linkCard` JSDoc; `Cache-Control: no-store` hint/meta for `getLinkCardFormHtml` (signed form is replayable/stale-cacheable).

## 6 · Preserved tools & artifacts (do not discard)

| Artifact | Purpose |
|---|---|
| `scripts/sandbox-probe-link-card-cycle.ts` (committed) | Re-runnable full-cycle rig: receiver + tunnel + signed form + local form server + **server-side `/add-card/<base64>` decode** + callback signature verification. Pattern source: `scripts/sandbox-probe-payment-link-pushback.ts`. |
| `.scratch/link-card-review/tools/serve-form.mjs` | Tiny static server so browser-use IAB (no `file:` navigation) can open locally-generated signed forms. |
| `test-output/link-card-review/` | `form-leg1(b).html` (signed forms), `receiver.log` (tunnel URL), `post-response*.html`, `nohash-response.html` (400 04 body), cycle captures. |
| `payway-output/link-card-lcrev00a/b.html` | The 42 KB hosted shells (LC-2 evidence). |

**Environment notes:** `setup-webhook --tunnel` overwrote `PAYWAY_CALLBACK_URL` in `.env` (previous value was an older ephemeral tunnel URL — re-run setup-webhook when a receiver is next needed). The trycloudflare URL is ephemeral; the rig recreates its own per run.

## 7 · Blockers & follow-ups

- **ABA:** enable token-flag service on sandbox profile `ec476910` (unblocks LC-1 legs + Q18 capture; rig ready). Filed as an addendum in `ABA-OPEN-QUESTIONS.md`; Q7 resolved-by-evidence there.
- **Fix wave:** P1 items 1–4 are a ~half-day batch (mock tests + docs); P2 needs the knowledge-sync gate.
- **Re-test after enablement:** legs 4–9 of §2, plus approved/declined/3DS card paths with `sandbox-test-cards`.

---

## 8 · RESOLUTION (2026-09-12, same day) — fix wave SHIPPED as `5cf62af`

All P1 items + the P2/P3 fixables are on `main` (suite **1856** green):

- ✅ P1-1 `cof` `--json` envelopes — all six catches route through `printApiErrorJson` (I-3/LC-7).
- ✅ P1-2 docs/09 — flagship example rewritten to the catch-HTML/serve/pwt-via-callback pattern; the "success signal" sentence fixed; hash-order wording corrected (I-1, I-2).
- ✅ P1-3 hosted-outcome detection — SDK `PayWayBusinessError` now carries `responseUrl` + `hostedPage` (`HostedPageOutcome` type, exported); CLI reports the error code + hint (human) and `hostedPage` in `--json` (exit 0 kept deliberately — the saved page is the evidence; machines branch on data).
- ✅ P1-4 journal join keys in the hosted-page envelope (I-4).
- ✅ P2-5 validation symmetry: `validateCurrency`, frequency-enum advisory, missing-`callbackUrl` advisory, `frequency:''` guard. (Deferred: strict base64 rule for relative `continueSuccessUrl` — wire-behavior change with no live evidence; left as-is.)
- ✅ P2-6 stale-text sweep: client.ts comments, docs/09:229 wording, skill "sandbox skips hash" → LC-3 truth (skill v1.3.0, mirrored to `.zcode`); corpus re-synced via `npm run sync:knowledge`.
- ✅ P2-7 hardened catch-block save; 4xx-HTML rawBody accepted for CLI capture (pinned).
- ✅ P3-8 tests: gateway-JSON-on-link-card, entity-decoding extractor + metachar case, HTML-4xx pin, `linkCard` JSDoc, `Cache-Control: no-store` meta. (Remaining P3: none blocking.)

**Still open:** only the ABA enablement ask (token-flag service on the sandbox profile) — until then the paid-cycle legs and the Q18 callback capture remain blocked, with the rig ready.
