# Payment Link API — SDK/CLI Documentation Implementation Plan

**Date:** 2026-09-05
**Status:** Proposed (not yet started)
**Author context:** scope review requested against the three official ABA doc pages + full repo inventory (SDK domain, CLI, OpenAPI, skills, agent REPL, tests, mock harness).
**Truth set (sources):**
- Official (downloaded copies in this folder): `create-payment-link.md`, `get-payment-link-details.md`, `payment-link-overview.md` from developer.payway.com.kh
- Sandbox-verified: `docs/SANDBOX-FINDINGS.md` §15 (image multipart), validation.test.ts / payment-link-*.test.ts pins
- Repo spec: `payway-openapi/paths/payment-link.yaml` + `components/schemas/payment-link.yaml` (types → `src/types.ts:1120-1180`)
- Implementation: `src/domains/payment-link.ts`, `src/client.ts:364-394` (params), `src/cli.ts:2350-2547`, `src/agent/tools.ts:193-230`

---

## 1. Canonical parameter & datatype reference (what the docs must state)

### 1.1 Create Payment Link — `POST /api/merchant-portal/merchant-access/payment-link/create`

**Wrapper (multipart/form-data):**

| Field | Official datatype | Required | Notes |
|---|---|---|---|
| `request_time` | string | yes | UTC `YYYYMMDDHHmmss` |
| `merchant_id` | string | yes | ABA-issued key |
| `merchant_auth` | string | yes | RSA-encrypted JSON (117-byte chunks, PKCS1, base64) |
| `hash` | string | yes | base64 HMAC-SHA512 over `request_time + merchant_id + merchant_auth` — image bytes NEVER hashed |
| `image` | binary | no | ≤3MB, JPG/JPEG/PNG |

**merchant_auth inner payload:**

| Field | Official datatype | Official required | Wire reality (sample/sandbox) | SDK param (`CreatePaymentLinkParams`) | SDK behavior |
|---|---|---|---|---|---|
| `mc_id` | string | mandatory | = merchant_id, auto-filled by SDK | — (injected) | automatic |
| `title` | string | mandatory | ≤250 chars | `title: string` | throws when empty; >250 **advisory warn** (strict → throw) |
| `amount` | **string** (doc) | mandatory | sample passes **numeric** 0.03; min 100 KHR / 0.01 USD, not null/zero | `amount: number` | throws on ≤0/non-finite; USD >2dp / KHR non-integer throws; below floor **advisory** |
| `currency` | string | mandatory | `KHR` \| `USD` (doc adds minLength/maxLength 3) | `currency?: 'USD'\|'KHR'` | defaults `USD`; invalid throws. **Sandbox: omitting → PTL04** (undocumented officially) |
| `description` | string | optional | ≤250 chars | `description?: string` | >250 **throws** (sandbox-verified PTL04 — stricter than title, inconsistent pair) |
| `payment_limit` | **string** (doc) | optional | sample passes **integer 5**; blank = unlimited | `paymentLimit?: number` | CLI requires non-negative integer |
| `expired_date` | **string** (doc) | **mandatory** (but "null = no expiry") | sample passes `time()` **numeric** | `expiredDate?: number` | optional in SDK; epoch seconds |
| `return_url` | string | mandatory | **base64-encoded**; gateway POSTs payment status here | `returnUrl: string` | base64 auto-encoded; throws when missing/empty; non-public-HTTPS throws (`allowPrivateCallbackHosts` opt-out) |
| `merchant_ref_no` | string | **optional** | ≤50 chars, "unique suggested, PayWay does not validate duplicates", echoed in callback | `merchantRefNo: string` | **SDK stricter: throws when absent/empty**; 50-char cap NOT enforced anywhere |
| `payout` | string | optional | JSON array `[{acc, amt}]` as a **string value inside** the auth JSON; total must equal link amount | `payout?: string \| {acc: string; amt: number}[]` | arrays `JSON.stringify`'d once; pre-encoded strings pass through; entry shape `{acc, amt}` throws on malformed (shared validator); total≠amount **advisory** (strict → throw); CLI hard-exits 1 on mismatch |

**Create response:** top-level `{ data: PaymentLink, status: {code, message}, tran_id, payout? }`.

- Official apidog places `payout` **top-level** (array of `{acc, amt, acc_name}` — resolved beneficiary names), but the overview page's sample shows `"payout": []` **inside data**. Repo schema models it inside `data`. → **Verify in sandbox before documenting placement (V-2).**
- `data` fields: `id` (opaque Link ID, NOT the URL slug), `title`, `image{image, filename, size}` (size in **KB**; empty shape `{"image":"","filename":"","size":0}` when no image; sandbox renames uploads to CDN `payment_link_image_<epoch-ms>`), `amount` (schema says number/double, **sample shows string `"0.03"`** — repo schema correctly says string), `currency`, `status` (`"OPEN"` on create), `description`, `payment_limit`, `total_amount_org` (string), `total_refund` (number in create schema, **string in detail schema**), `total_amount`, `total_trxn`, `created_at`/`updated_at` (`YYYY-MM-DD HH:mm:ss`), `expired_date` (epoch seconds), `return_url` (decoded), `merchant_ref_no`, `outlet_id`, `outlet_name`, `payment_link` (the shareable hosted URL).
- `tran_id`: doc says string, overview sample shows integer `1681357410`. → document "integer-or-string, don't rely on the type" (V-3).
- Create error codes (official): `PTL02` wrong hash, `PTL05` parameter invalid format, `PTL99` merchant invalid currency, `PTL132` invalid payment link. **Sandbox-only additions:** `PTL04` parameter validation required (omitted currency/return_url; description >250) — NOT in the official list.
- Content-Type tolerance: official doc mandates `multipart/form-data`; the SDK sends **urlencoded when no image** and the gateway accepts it (sandbox-verified). Document as observed tolerance, keep multipart-with-image as the canonical shape.

### 1.2 Get Payment Link Details — `POST …/payment-link/detail`

- Wrapper: `application/json` (not multipart): `{request_time, merchant_id, merchant_auth, hash}`; merchant_auth plaintext = `{mc_id, id}`; same hash composition.
- SDK: `paymentLink.getDetails(linkId)` / CLI `payment-link detail -i <id>` (id = `data.id` from create, NOT merchant_ref_no, NOT the URL slug).
- Response: same `PaymentLink` shape **plus `pushback_url`** (present in the official detail schema only) — **missing from the repo OpenAPI + `src/types.ts`** (gap G-3).
- Status values: `OPEN` while `payment_limit > total_trxn`; `PAID` once `payment_limit == total_trxn` (no further payments accepted). Unlimited links (`payment_limit` unset) never reach PAID. No EXPIRED status is documented for expired_date expiry — behavior undocumented (V-4).
- Error codes: `PTL02`, `PTL132`.

### 1.3 Pushback (payment notification) — the return_url callback

- Gateway POSTs `Content-Type: application/json` to the decoded `return_url` on payment: `{ tran_id (string), status (string, e.g. "00"), merchant_ref_no }`.
- **The documented sample carries NO hash field** — unlike purchase webhooks. Verification path: take `tran_id` → `check-transaction`. → **V-1: probe whether a real pushback includes `hash`/more fields before documenting verification steps** (affects docs/16 + whether `verifyCallback` applies).

### 1.4 Datatype-inconsistency register (doc the reality, not the doc)

| # | Field | Official says | Reality | Docs treatment |
|---|---|---|---|---|
| D-a | `amount` (request) | string | numbers accepted (SDK sends number) | document number, note official string |
| D-b | `amount` (response) | number/double | sample `"0.03"` string | repo schema already string — keep; call out in chapter |
| D-c | `payment_limit` | string | integer wire/response | number |
| D-d | `expired_date` | string, mandatory | epoch number; mandatory-nullable contradiction | number, optional |
| D-e | `tran_id` (response) | string | sample integer | "integer or string — coerce" |
| D-f | `total_refund` | number (create) / string (detail) | — | per-endpoint, or document as number-with-string-possible |
| D-g | `payout` (response) | top-level (apidog) vs inside `data` (sample) | verify (V-2) | one placement, pinned by sandbox evidence |
| D-h | `merchant_ref_no` | optional | SDK requires (stricter) | document SDK strictness as intentional |
| D-i | `image.size` | "KB" | sandbox returns 0 regardless (§15) | document quirk |

---

## 2. Permutations & combinations matrix (the doc's decision tables)

Dimensions and their interactions — this is the content for the "choosing your parameters" section:

1. **Currency × amount**: USD (≥0.01, ≤2dp) | KHR (≥100, integer). Floors are advisory in the SDK, gateway-enforced.
2. **Payout mode** × 3: none | array `[{acc, amt}]` | pre-encoded string.
   - Constraint: Σamt == amount (advisory in SDK / hard exit 1 in CLI / strict → throw).
   - Payout currency **follows the link currency** (official: no per-entry currency).
   - Beneficiary constraints (sandbox): must be whitelisted (403 `Payout accounts are not in whitelist` otherwise — e.g. 000999888), account format 9-digit account / 15-digit KHR MID, per-beneficiary currency match. Seeded accounts: `sandbox-beneficiaries`.
   - Entry count: 1..N; response resolves `acc_name` per entry.
3. **Image** × 2 (none | attached) × 3 formats (JPG/JPEG/PNG) × ≤3MB. Switches the wire to multipart; hash composition unchanged. `image/jpg` misspelling tolerated by SDK advisory set.
4. **payment_limit**: unset (unlimited, never PAID) | N (PAID at total_trxn == N — natural oversell guard).
5. **expired_date**: unset (no expiry) | epoch seconds (post-expiry payment behavior undocumented — V-4).
6. **description**: absent | ≤250 (hard throw over).
7. **merchant_ref_no**: SDK-required string ≤50 (cap unenforced); duplicates accepted by the gateway — uniqueness is the merchant's job (mirror of the purchase-path duplicate-tran_id trap W5-7).
8. **return_url**: required public HTTPS; base64 by SDK; must accept POST application/json.

Cross-product notes for the doc: e.g. "limited drop" = payment_limit N + expired_date + optional image + no payout; "marketplace split" = payout array with Σ=amount + unlimited limit; "KHR cash collection" = KHR integer amount + no payout.

---

## 3. Use-case catalog (doc section: "Recipes")

| # | Use case | Parameter recipe | Flow after create |
|---|---|---|---|
| U1 | **Invoice billing** (the overview's pain-points) | amount=invoice total, merchant_ref_no=invoice no, return_url=server | pushback → check-transaction(tran_id) → mark paid |
| U2 | **Live-stream selling** (official example) | exact amount, short expiry optional | share `payment_link` in chat; poll detail for total_trxn |
| U3 | **Marketplace split payout** | payout `[{acc,amt}]` Σ=amount; whitelist beneficiaries first | detail `payout`/`total_amount` reconciliation |
| U4 | **Limited-quantity drops** | payment_limit = stock | poll detail until `status: "PAID"` — stops overselling |
| U5 | **Pre-order window** | expired_date = window end | after expiry, treat link as closed (verify V-4) |
| U6 | **Donation drives / repeat collections** | no payment_limit, fixed amount | total_trxn/total_amount as running totals |
| U7 | **Branded links** | image = product/brand JPG ≤3MB | CDN-hosted echo; size:0 quirk note |
| U8 | **Support-desk / field collection** | CLI `payment-link create` one-liner, TTY QR | share link instantly |
| U9 | **KHR local pricing** | currency KHR, integer ≥100 | payout entries follow KHR |
| U10 | **Refund handling on paid links** | (post-state) | total_refund grows, total_amount = after-refund; refund via the refund API per tran_id |
| U11 | **Agent-assisted creation** | `payway-sdk ask "create a payment link…"` / `create_payment_link` tool | today: no payout/image on the tool (G-2) |

---

## 4. Gaps found (fix-or-document decisions feeding the doc plan)

| # | Gap | Where | Disposition in this plan |
|---|---|---|---|
| G-1 | CLI `--json` error envelope missing: both catches call `printApiError`, not `printApiErrorJson` (create `src/cli.ts:2506-2508`, detail `2544-2546`); local validation branches also print plain text under `--json` | cli.ts | **Fix before documenting** (P1) — the envelope contract is already documented for check-transaction/detail/generate-checkout; documenting a 4th behavior would contradict T5.4 |
| G-2 | Agent tool `create_payment_link` forwards neither `payout` nor `image` (`src/agent/tools.ts:196-205`, `contracts.ts:85-96`); no `get_payment_link_details` tool exists | agent module | Decision point: (a) extend tool params + add detail tool (small code change, matches SDK parity), or (b) document as limitation. **Recommend (a)** — otherwise U3/U7/U11 doc sections must carry "SDK yes, agent no" asterisks |
| G-3 | `pushback_url` (detail response) missing from repo OpenAPI + `src/types.ts` | payway-openapi + types | Spec sync (P3), mirror of audit-D8 pattern, then regen types |
| G-4 | `merchant_ref_no` 50-char cap unenforced (spec says max 50) | payment-link.ts:70-72 | Add advisory warn (P4) and document |
| G-5 | CLI image loader doesn't enforce 3MB (extension+empty only; `src/cli/payment-link-image.ts:51-65`) — over-limit file only warns at the domain | cli/payment-link-image.ts | Either hard-exit 1 in the CLI (parity with the payout total rule) or document as advisory — **recommend hard-exit**, symmetric with `--payout` |
| G-6 | Skill `aba-payway-payment-link` v1.3.0 has no image/agent/QR coverage while `skills/README.md:33` advertises "incl. images" | skills/ | D8 rewrite |
| G-7 | No numbered docs chapter covers payment link (zero mentions in docs/03–docs/16); README §4 + SANDBOX-FINDINGS §15 are the entire user documentation | docs/ | D1 new chapter |
| G-8 | Mock harness (`src/test/index.ts`) serves no payment-link endpoints — doc examples can't be smoke-tested against it | src/test | Optional P5; examples tests can stay fetch-spy based |
| G-9 | No `--no-show-qr` on `payment-link create` (generate-qr/generate-checkout both have the opt-out) | cli.ts:2488 | Tiny flag addition (P6) or document TTY auto-render |
| G-10 | `payout` exists in the official create schema only inside `merchant_auth` prose — invisible to schema tooling | payway-openapi | Add to `CreatePaymentLinkRequest` properties as the string part + prose pointer |

---

## 5. Documentation deliverables

**D1 — New chapter `docs/17-payment-link.md`** (the centerpiece):
1. Intro & when to choose a payment link (vs QR vs checkout — link to `aba-payway-first-payment` route table)
2. Prerequisites: RSA `publicKeyPem` (sandbox vs production), `isValidPublicKeyPem()` pre-flight
3. Creating links: full parameter table (§1.1 above), datatype-reality callouts (§1.4), validation behavior (throw vs advisory vs `strictValidation`)
4. Permutations & recipes (§2 + §3)
5. Images: multipart contract, hash exclusion, CDN rename, `size: 0` quirk, CLI `--image` loader rules
6. Split payout: `{acc, amt}` key warning (vs payout-domain `{account, amount}`), Σ=amount rule, whitelist + currency constraints, sandbox accounts
7. Inspecting: `getDetails`/CLI `detail -i` (id ≠ merchant_ref ≠ slug), status lifecycle OPEN→PAID, totals semantics (`total_amount_org` vs `total_amount` vs `total_refund`)
8. Pushback handling: POST receiver, sample body, tran_id → check-transaction reconciliation (hash question resolved by V-1)
9. Error codes table: PTL02, PTL04*, PTL05, PTL99, PTL132, 96, payout whitelist 37/PTL146/PTL46, currency PTL147/12 (* = sandbox-discovered)
10. CLI quick reference (create/detail flags incl. `--json` envelope after P1)
11. Troubleshooting (wrong-hash hint, private returnUrl, base64, PEM newline normalization)

Also: index row in `docs/README.md`, scenario rows in `docs/01` (exists), `docs/15-merchant-scenario-requirements.md`.

**D2 — `README.md` §4 expansion**: permutation pointer, datatype callouts, pushback snippet, CLI detail example. Keep the 3 existing snippets tested (see D10).

**D3 — `docs/12-error-handling-and-debugging.md`**: add PTL05/PTL99/PTL132 rows next to the existing PTL04/96 entries; payout-whitelist codes already present.

**D4 — `docs/14-appendix-code-snippets.md`**: add payment-link snippets (basic, image, payout, detail polling, pushback receiver).

**D5 — `docs/16-webhook-setup-guide.md`**: pushback section (depends on V-1 outcome).

**D6 — `docs/13-deployment-checklist.md`**: RSA-key requirement row for link-based flows.

**D7 — `docs/AGENTIC-PAYWAY-CLI-USER-GUIDE.md`** + `skills/aba-payway-agent/SKILL.md`: tool table update (post G-2 decision).

**D8 — `skills/aba-payway-payment-link/SKILL.md` → v1.4.0**: add image section (limits, loader, CDN quirk), agent tool row, terminal QR note, use-case recipes, error-code list. Sync `.zcode` copy byte-identical. Bump `skills/README.md` version list.

**D9 — `docs/examples/backend/payment-link-create.ts`** (+ payout & image variants or one combined): real importable example, then wire into `src/__tests__/docs-examples.test.ts` (today payment-link snippets are untested).

**D10 — TypeDoc regen** (`npm run docs:api`) so the new JSDoc/examples surface; low priority, JSDoc is in-source.

**D11 — `AGENTS.md`**: add a `payment-link detail` canonical example line (create line exists).

---

## 6. Code prerequisites (only where docs depend on them)

| # | Change | Size | Files | Tests to add |
|---|---|---|---|---|
| P1 | `--json` error envelope on create/detail catches + envelope for the local validation branches (shared `printValidationErrorJson`) | S | cli.ts:2350-2547 | cli-inprocess: `--json` + bad id → envelope shape; extend the T5.4 envelope suite |
| P2 | Agent tool: forward `payout`/`image` (contract + tools.ts), add `get_payment_link_details` read tool | M | contracts.ts, tools.ts, agent docs | agent-contracts + agent-tools + e2e readiness row |
| P3 | OpenAPI: add `pushback_url` to detail `PaymentLink`, add `payout` as create schema property (G-10), fix datatype mismatches per §1.4 → regen `src/types.ts` | S | payway-openapi, types.ts | existing suites (types are generated) |
| P4 | `merchantRefNo` >50 advisory (strict → throw) | XS | payment-link.ts, utils | validation.test |
| P5 | CLI image loader 3MB hard exit 1 (parity with payout-total rule) | XS | cli/payment-link-image.ts, cli.ts catch | payment-link-image.test, cli-inprocess |
| P6 | `--no-show-qr` flag on create (mirror generate-qr) | XS | cli.ts | cli-poll-display or cli-ux |
| P7 | (Optional) mock-harness payment-link routes | M | src/test/index.ts | mock contract tests |

P1/P3/P4/P5/P6 are small and safe; P2 is a tool-contract change — do it in its own commit so the skills/agent-guide sync (anti-checklist rule) lands in the SAME change.

---

## 7. Verification probes before writing (sandbox, read-mostly, evidence → `test-output/payment-link-docs-review/`)

- **V-1**: Real pushback body — does it carry `hash`/`merchant_id`? Needed for D5's verification section.
- **V-2**: Response `payout` placement — top-level vs `data.payout` (with a payout-bearing link).
- **V-3**: `tran_id` runtime type in create/detail responses (pin the docs wording "coerce").
- **V-4**: `expired_date`-expired link — can it still pay? what does detail report? (mirrors W4-1/W5-1 lifetime semantics).
- **V-5** (optional): reproduce PTL05/PTL99 to confirm the error-code table wording.

Use the pattern from `scripts/sandbox-probe-payment-link.ts`; add findings to `docs/SANDBOX-FINDINGS.md` (new dated section — append, never rewrite).

---

## 8. Sequencing, gates, definition of done

| Batch | Content | Gate |
|---|---|---|
| **A. Probes** | V-1…V-4 (+V-5 opt) via runner script under `.scratch/payment-link-docs-review/` | evidence JSONs + SANDBOX-FINDINGS new § |
| **B. Spec sync** | P3 (+G-10) → regen types | tsc + build + vitest green |
| **C. Code fixes** | P1, P4, P5, P6 (one commit); P2 separate commit with skills/agent-doc sync | full gates: `npm run build` → `npx vitest run` → `npx tsc --noEmit` → `npx biome lint src`; behavior pins updated in same commit |
| **D. Core docs** | D1 chapter + D2 README + D3 error tables + D4 snippets + D6 checklist row | docs-examples tests cover new snippets (D9) |
| **E. Skills & agent docs** | D8 skill v1.4.0 + D7 agent guide (post-P2) | skills-audit greps CLEAN (symbols resolve, commands registered, payout key-shape split intact) |
| **F. Close-out** | CHANGELOG Unreleased entry, HANDOFF.md update, TypeDoc regen (D10) | release-checklist smoke (57+ exports) |

**Definition of done (whole plan):**
1. A merchant can implement the full payment-link lifecycle (create → share → pushback → reconcile → refund accounting) using only `docs/17` + README, with every parameter's datatype/constraint stated once and correctly.
2. Every behavior difference between official docs and reality (§1.4 register) is documented with its evidence source.
3. `--json` envelope contract uniform across all four link-adjacent CLI commands.
4. Skill ≤ current SDK surface (image + payout + agent coverage), byte-identical `.zcode` copy.
5. All repo gates green; CHANGELOG + HANDOFF updated; no audit artifacts rewritten.

**Estimated effort:** A: 0.5d · B+C: 0.5–1d · D: 1–1.5d · E+F: 0.5d — ~3–3.5 focused days.

**Alignment note:** sync-audit **S3** (usage-guide fixes) is the current top priority per HANDOFF §5; this plan's Batch D touches the same files (docs/03/04/06/14 dead-endpoint fixes). Run S3's link sweeps inside Batch D to avoid double-editing those files; keep S3's remaining items (webhook subpath, Node 20, doctor --live) sequenced independently.
