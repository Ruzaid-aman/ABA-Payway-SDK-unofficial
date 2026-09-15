# Payment-link Void — Safe Implementation Plan (worktree branch `feat/payment-link-void`)

**Contract ground truth:** `docs/SANDBOX-FINDINGS.md` §23 (commit `432d6ab`, live-verified 2026-09-11). Void behaves exactly like detail: RSA `merchant_auth = {mc_id, id}` (the create-response `data.id`), default-trio HMAC `request_time.merchant_id.merchant_auth`, base64. Responses: 200 `{status:{code:"00"}, tran_id:<numeric>}` · 403 `PTL188` "already voided" · 403 `96` bogus id. Content-Type lenient (urlencoded default is accepted). `VOIDED` is a real status; hosted page 200s but SSR `page:"invalid-data"` code `07`.

**Scope decision (unanswered → recommended path):** SDK method + CLI command only. **No** `void_payment_link` agent tool this wave (would flip the 13-tool pin in 9 places + need new risk classification — separate follow-up). PTL188 → standard exit 2 + `{error:{paywayCode:'PTL188',…}}` envelope with a "already in desired terminal state" hint.

**Isolation rationale:** another agent's webhook/offline-KHQR campaign sits uncommitted in the main checkout (~30 files incl. `src/cli.ts:2220` help line, CHANGELOG, HANDOFF). A linked worktree at committed HEAD `432d6ab` contains none of it — my edits can't clobber theirs and vice versa. `.worktrees/` is already gitignored (`.gitignore:63`).

---

## Phase 0 — Branch out (no code yet)

1. `git worktree add .worktrees/payment-link-void -b feat/payment-link-void main` (worktree at `432d6ab`; work in `D:\Antigravity_google\SDK-prepration\.worktrees\payment-link-void`).
2. Copy `.env` (sandbox credentials, gitignored — not carried by worktrees) into the worktree root; needed for live tests only.
3. `npm ci` in the worktree (`node_modules` is not shared; `better-sqlite3@13` ships win-x64 prebuilds — a node-gyp warning is spurious, per memory).

## Phase 1 — SDK core (TDD: tests written with each slice)

1. `src/constants.ts`:
   - `ENDPOINTS` (line ~21): `voidPaymentLink: '/api/merchant-portal/merchant-access/payment-link/void'`
   - `MUTATION_ENDPOINTS` (line ~41): add it — void is irreversible → single-attempt transport, no auto-retry (consumed at `src/client.ts:1352-1354`); extend the docblock.
   - `PAYMENT_LINK_ERROR_CODES` (line ~192) + `PAYMENT_LINK_TITLES` (line ~201) + `PAYMENT_LINK_HINTS` (line ~207): add `PTL188` ("Payment Link Already Voided" — already in the desired terminal state; not idempotent; treat as terminal, not an error). `explain-code.ts` picks it up automatically via TITLES.
2. Curated OpenAPI spec (types are generated, never hand-edited):
   - `payway-openapi/paths/payment-link.yaml`: new `payment-link/void` path block mirroring detail's — `x-hmac-fields [request_time, merchant_id, merchant_auth]`, `x-merchant-auth-encryption` plaintext `{mc_id, id}`, description carrying §23 facts (numeric tran_id, PTL188, 96, content-type leniency, VOIDED status).
   - `payway-openapi/components/schemas/payment-link.yaml`: `VoidPaymentLinkRequest` (clone of `GetPaymentLinkDetailsRequest`, line 153) + `VoidPaymentLinkResponse` (`PaymentLinkStatus` ref + `oneOf` int/string `tran_id`, per the observed `{status:{code:"00",message:"Success.",lang,trace_id}, tran_id:<number>}`).
   - `npm run bundle && npm run generate-types` → `src/types.ts` diff must contain ONLY payment-link-void additions.
3. `src/domains/payment-link.ts`:
   - `PaymentLinkDomain` interface (line 39): `void: (paymentLinkId: string, callOptions?: RequestCallOptions) => Promise<components['schemas']['VoidPaymentLinkResponse']>`.
   - Implementation cloned from `getDetails` (line 203): non-empty id validation → `requestWithMerchantAuth(ENDPOINTS.voidPaymentLink, { id }, { callOptions })` — no hmacFields override, default urlencoded (accepted live).
4. `src/client.ts` `HASH_ORDER_HINTS` (line ~574): `[ENDPOINTS.voidPaymentLink]: MERCHANT_AUTH_DEFAULT_HASH_FIELDS.join('.')` + extend the refund/payment-link comment to "create/details/void".
5. `src/journal/stats.ts` `READ_ENDPOINT_MARKERS` (line ~77): do NOT add `payment-link/void` (it must count as a mutation in journal funnel heuristics — omission is the requirement).

**Phase-1 tests:**
- `src/__tests__/hash-order-hints.test.ts`: extend the payment-link spy test (line 242) with `domain.void('pl-1')` → `calls[2].hmacFields` undefined + hint equality; add `ENDPOINTS.voidPaymentLink` to the sorted snapshot list (line 288) and the direct-constant test (line 104).
- `src/__tests__/mutation-retry-policy.test.ts` (line ~169): void in the mutations array, single-attempt transport assertion.
- `src/__tests__/client.test.ts` payment-link block (line 1124): void happy path through stubbed fetch — url hits the void path, urlencoded body carries `merchant_auth` + `hash`, id never top-level.
- `src/__tests__/payment-link-domain` style spy test (capture pre-encryption plaintext `{id}`), matching `payment-link-payout.test.ts:31-41`.

## Phase 2 — CLI command

1. `src/cli.ts` — register `void` after detail (line 3415), template = detail + `close-transaction` confirmation precedent (line 1434):
   - `paymentLinkCmd.command('void')` — description flags it as permanent/irreversible and cites §23/undocumented.
   - `.requiredOption('-i, --id <id>', 'Payment link id (data.id returned by create)')` · `.option('-y, --force', 'Skip confirmation prompt')` · `.option('--json', …)`.
   - Action: banner suppressed under `--json`; `assertCredentialsPresent` + `assertRsaKeyPresent`; TTY confirmation (clack/readline "Void payment link <id>? This cannot be undone." — skipped under `--json`/`-y`/non-TTY, `CliCancelled` → exit 130); `payway.paymentLink.void(opts.id)`; `--json` → `printApiResultJson`, errors → `printApiErrorJson` (PTL188/96 → kind 'api', exit 2); human mode → success block + error via `printApiError`.
2. `src/cli.ts` `apiErrorHint` (line 212): `PTL188` branch before the 96/PTL132 rows — "link already voided — already in the desired terminal state; safe to treat as done, not an error".
3. No journal wiring needed — inherited from the global preAction hook.

**Phase-2 tests:**
- Mock harness `src/test/index.ts` (line 253-330): stateful void route — unknown id → 403 `96`; second void → 403 `PTL188`; success records a voided-set so detail answers `status:"VOIDED"`.
- `src/__tests__/server-and-contract.test.ts` C4 block (line 125): void success → `00`; double-void → `PTL188`; bogus → `96`; post-void detail → `VOIDED`.
- `src/__tests__/cli-mock-commands.test.ts`: `payment-link/void` route (insert before the 404 else; substring-order safe vs `payment-link/detail`); tests: `--json` success exit 0, `--json` PTL188 envelope (`paywayCode:'PTL188'`, exit 2, no `✗`), human-mode rejection, confirmation skipped under `--json`/`-y`.
- `src/__tests__/cli-inprocess.test.ts` (line 80): `explain PTL188` → payment-link family.
- `src/__tests__/cli.test.ts` spawn pattern (line 1214): `payment-link void` missing `--id` → validation envelope, exit 1.

## Phase 3 — Live verification (sandbox, from the worktree)

1. Leg A — SDK: create link → `paymentLink.void(id)` → 00; detail → `VOIDED`, `updated_at` advanced, `total_trxn` 0; double-void → 403 PTL188; bogus → 403 96.
2. Leg B — CLI: `npx tsx src/cli.ts payment-link void -i <id> --json` success + PTL188 envelope legs (both with `NODE_TLS_REJECT_UNAUTHORIZED='0'` scoped to the command).
3. Gate the durable §23 facts into `src/__tests__/sandbox-contract.test.ts` (pattern at line 106, `it()` titles embed § refs): add `PAYWAY_RSA_PUBLIC_KEY` to its `parseDotenv` extraction (line ~56) + construct the client with `publicKeyPem`; pin: void 00/numeric-tran_id, double-void PTL188, bogus 96, post-void detail VOIDED. (Runs only under `npm run test:sandbox` — hermetic `npm test` untouched.)
4. Evidence JSON → `test-output/payment-link-void-e2e/` in the worktree; summary appended to SANDBOX-FINDINGS §23 as an addendum (implementation-verified).

## Phase 4 — Docs & codification (the "all in the same change" rule)

1. `docs/17-payment-link.md`: new §17.4 "Voiding a link" (detail §17.3 ends line 91; §17.4 payout renumbers → adjust headings + internal links); §17.3 status lifecycle gains `VOIDED` (line 86-89); §17.7 CLI quick-ref `payment-link void -i <link-id>` row (line 169); §17.8 PTL188 + hosted-page `07` rows (line 180-189).
2. `docs/12-error-handling-and-debugging.md`: PTL188 row in the payment-link table (line 284+); update the `96` row (line 295) and main-table 96 row (line 161) to mention void; VOIDED callout in the sandbox-verified note (line 297-302).
3. `skills/aba-payway-payment-link/SKILL.md` (version → 1.5.0): void command, VOIDED status (line 57), PTL188 (line 66) — **byte-mirror to `.zcode/skills/aba-payway-payment-link/SKILL.md`** (enforced by `skills.test.ts:25-44`; count stays 32).
4. `AGENTS.md` root: void command line after line 44 + VOIDED/PTL188 bullet extending line 86.
5. `.agents/AGENTS.md`: §23 fact bullet in the payment-link section (line 39-44).
6. `docs/SDK-AND-CLI-REFERENCE.md`: CLI row line 84 (`create / detail / void`), SDK §4 method + snippet (line 539+). `skills/README.md`: payment-link description row gains void.
7. `CHANGELOG.md` Unreleased + `HANDOFF.md` new campaign section (worktree edits are on the committed base — the other agent's uncommitted main-checkout edits remain untouched there).
8. `npm run docs:api` (typedoc) regen so `docs/api/` picks up the new method; `npm run check:package` / `check:repository` gates.

## Phase 5 — Full verification gates (in the worktree, in order)

`npm run build` (tsup — build BEFORE vitest, per memory) → `npx tsc --noEmit` → `npm run lint` + `format` (biome) → `npm test` (baseline 1662 + new; excludes sandbox-contract) → `npm run test:sandbox` (live §23 pins + full sandbox suite) → `npm run check:repository`. Confirm `git diff src/types.ts` in the worktree contains only void additions.

## Gated phase commits on the branch (per wave workflow)

1. `feat: payment-link void — SDK domain, endpoint constants, PTL188 hint family, OpenAPI spec + generated types`
2. `feat: payment-link void — CLI command with confirm gate, mock-harness routes, full test matrix`
3. `test: live sandbox §23 verification legs + gated sandbox-contract pins (evidence)`
4. `docs: void chapter §17.4, PTL188/VOIDED rows, skill v1.5.0 + mirror, AGENTS/HANDOFF/CHANGELOG`

**Deliberately out of scope:** `void_payment_link` agent tool (13→14 catalog growth), void-on-paid/partially-paid link probing (needs interactive payer — stays open in §23), merging to main (per concurrent-agent rule: **no merge unless you direct it** — the main checkout's in-flight uncommitted work would need coordinating/stashing first). Worktree cleanup (`git worktree remove .worktrees/payment-link-void`) only after the merge decision.