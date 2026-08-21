# Official ABA KHQR Offline Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the proprietary offline QR payload with official ABA KHQR, typed merchant-profile readiness, and an isolated offline-KHQR notification receiver.

**Architecture:** A KHQR configuration module resolves explicit values before environment variables; CLI profile activation only supplies those same environment variables. The generator composes nested, byte-length TLVs and CRC. A new parser/route handles the ABA offline notification shape without changing checkout webhook semantics.

**Tech Stack:** TypeScript, Node.js, Vitest, Commander, native HTTP, Biome, tsup.

**Spec:** `docs/superpowers/specs/2026-08-21-aba-khqr-offline-design.md`

## Global Constraints

- ABA's KHQR guideline is authoritative; supplied builder/config examples are reference-only and their merchant values must not be committed.
- `generateOfflineQR()` intentionally changes to official format; do not retain a private fallback under this name.
- Never infer ABA tag `30` or `62.68` from API credentials.
- Measure TLVs in UTF-8 bytes; calculate CRC-16/CCITT over text ending in `6304`, excluding the CRC value.
- Offline generation must not make an HTTP call. Callback raw bodies and unknown fields must be retained.
- ABA whitelisting is an external merchant operation; a local setting cannot prove it occurred.
- Worktree is dirty: preserve unrelated edits and stage only listed paths.

## File Structure

- `src/khqr-config.ts` (new): config types, environment resolution, QR/callback readiness.
- `src/khqr-offline.ts`: official nested TLV and CRC generator.
- `src/domains/khqr.ts`, `src/client.ts`, `src/index.ts`: public SDK wiring/exports.
- `src/config/profiles.ts`, `src/cli.ts`: optional profile configuration and offline command.
- `src/webhook/khqr-notification.ts` (new), `src/webhook/storage.ts`, `src/webhook/server.ts`: tolerant parser, stored metadata, separate route.
- `src/__tests__/khqr-config.test.ts` and `src/__tests__/khqr-notification.test.ts` (new), plus focused existing tests.
- `README.md`, `docs/07-qr-code-handling.md`, `docs/11-callbacks-and-webhooks.md`, and `docs/16-webhook-setup-guide.md`: migration and operational guidance.

### Task 1: Model and validate KHQR merchant/callback configuration

**Files:**

- Create: `src/khqr-config.ts`
- Create: `src/__tests__/khqr-config.test.ts`
- Modify: `src/client.ts:50-69,485-515`
- Modify: `src/index.ts:1-110`

**Produces:** `KhqrMerchantConfiguration`, `KhqrCallbackConfiguration`, `KhqrConfigurationReadiness`, `KhqrCallbackReadiness`, `resolveKhqrConfiguration()`, `validateKhqrConfiguration()`, and `validateKhqrCallbackSetup()`.

- [ ] **Step 1: Write failing resolver/readiness tests.** Cover complete constructor config; explicit-over-environment precedence; each required missing field; 15-digit numeric ABA MID; four-digit MCC; name ≤25; city ≤15; template ≤99 UTF-8 bytes; and callback readiness requiring HTTPS, `confirmed-by-merchant`, and a non-`unknown` strategy.

- [ ] **Step 2: Run `npm test -- --run src/__tests__/khqr-config.test.ts`.** Expected failure: module/export absent.

- [ ] **Step 3: Implement the module.** `KhqrMerchantConfiguration` has optional `bakongId`, `abaMerchantId`, `acquirerName`, `merchantCategoryCode`, `merchantName`, `merchantCity`, `paywayData`, and optional callback `{ url, enrollment, verification }`. Resolve missing explicit fields from the seven `PAYWAY_KHQR_*` variables. Return stable issue code, field path, and safe message only—never a merchant value or API key.

- [ ] **Step 4: Add `khqr?: KhqrMerchantConfiguration` to `PayWayConfig`; resolve it at construction; export all public configuration/readiness types.** Do not make it mandatory for API-only SDK usage or change existing top-level credential validation.

- [ ] **Step 5: Run `npm test -- --run src/__tests__/khqr-config.test.ts && npm run typecheck`.** Expected: PASS.

- [ ] **Step 6: Commit only Task 1 paths.** Message: `feat: add ABA KHQR configuration readiness`.

### Task 2: Replace legacy offline output with the ABA payload

**Files:**

- Modify: `src/khqr-offline.ts:1-81`
- Modify: `src/__tests__/khqr-offline.test.ts:1-46`
- Modify: `src/__tests__/validation.test.ts:129-148`

**Consumes:** Task 1's configuration/readiness types.

**Produces:** `GenerateOfflineQrParams` with `amount?`, `currency`, `merchantRef`, `createdAt?`, and `expiresAt?`; official `generateOfflineQR(params, configuration, clock?)`; safe configuration error.

- [ ] **Step 1: Replace legacy tests with failing TLV tests.** Assert `00=01`, static `01=11` without `54`, dynamic `01=12` with `54`, nested `30.00/01/02`, `52`, `53` (`116`/`840`), `58=KH`, `59`, `60`, nested `62.01/68`, nested `99.00/01`, and trailing `6304` plus valid CRC. Include KHR integer/USD two-decimal formatting, reference 25 accepted/26 rejected, non-ASCII byte length, expired timestamps, invalid config, and `fetch` never called.

- [ ] **Step 2: Run `npm test -- --run src/__tests__/khqr-offline.test.ts src/__tests__/validation.test.ts`.** Expected failure: current generator produces proprietary tags.

- [ ] **Step 3: Implement a byte-aware TLV encoder and nested generator.** Use `Buffer.byteLength(value, 'utf8')`; reject values >99 bytes; compose `30` from `00/01/02`, `62` from `01/68`, and `99` from 13-digit timestamps; serialize root tags in the documented order. Add `6304`, calculate existing CRC-16/CCITT against it, then append the 4 hex characters. Delete proprietary tag emission and proprietary input fields.

- [ ] **Step 4: Update domain validation tests to expect a readiness/configuration error instead of legacy parameter validation.** Keep historical `getTransactionsByMerchantRef()` tests unchanged.

- [ ] **Step 5: Run the focused command from Step 2 and `npm run typecheck`.** Expected: PASS.

- [ ] **Step 6: Commit only Task 2 paths.** Message: `feat: generate official ABA KHQR offline payloads`.

### Task 3: Expose generator and readiness through `PayWay.khqr`

**Files:**

- Modify: `src/domains/khqr.ts:1-49`
- Modify: `src/client.ts:429-478`
- Modify: `src/__tests__/client.test.ts:1314-1345`
- Modify: `src/index.ts:1-110`

**Consumes:** Tasks 1-2.

**Produces:** `KhqrDomain.generateOfflineQR(params)`, `KhqrDomain.validateConfiguration()`, and `KhqrDomain.validateCallbackSetup(options?)`.

- [ ] **Step 1: Write failing client tests.** Create `PayWay` with complete `khqr` config, assert `validateConfiguration().ready === true`, assert `generateOfflineQR({ amount: 1.5, currency: 'USD', merchantRef: 'INV-1' })` begins `000201010212`, and assert the global fetch spy was not called. Assert credentials-only client reports unready and throws on generation.

- [ ] **Step 2: Run `npm test -- --run src/__tests__/client.test.ts`.** Expected failure: readiness methods are absent.

- [ ] **Step 3: Pass resolved KHQR config into `createKhqrDomain`.** The domain reads its configuration once at construction, delegates readiness/generation, and does not reread environment variables. Keep its existing signed transaction-history method unchanged.

- [ ] **Step 4: Run `npm test -- --run src/__tests__/client.test.ts src/__tests__/khqr-config.test.ts && npm run typecheck`.** Expected: PASS.

- [ ] **Step 5: Commit only Task 3 paths.** Message: `feat: expose ABA KHQR offline generation in SDK`.

### Task 4: Support profile configuration and the offline CLI flow

**Files:**

- Modify: `src/config/profiles.ts:8-74`
- Modify: `src/__tests__/profiles.test.ts:1-55`
- Modify: `src/cli.ts:258-273,590-690,1040-1123`
- Modify: `src/__tests__/cli.test.ts`

**Consumes:** Tasks 1 and 3.

**Produces:** `CredentialProfile.khqr?: KhqrMerchantConfiguration`, safe profile status display, and official `generate-qr --offline` behavior.

- [ ] **Step 1: Write failing tests.** Persist a profile containing complete KHQR config and assert round-trip. Activate two profiles in succession and assert missing fields from the second clear the corresponding `PAYWAY_KHQR_*` values. Assert an offline CLI command with a complete selected profile says `Offline ABA KHQR generated`; assert incomplete configuration prints readiness issue codes. Assert list/current never exposes `paywayData`, API key, or full ABA MID.

- [ ] **Step 2: Run `npm test -- --run src/__tests__/profiles.test.ts src/__tests__/cli.test.ts`.** Expected failure: profile has no KHQR block and CLI requires legacy inputs.

- [ ] **Step 3: Add optional profile KHQR validation and activation.** `profiles add` offers an optional KHQR section and prompts for all ABA/config fields plus optional callback declaration. Profile activation writes or clears all seven environment variables. `list` and `current` display only QR/callback readiness.

- [ ] **Step 4: Replace offline CLI legacy behavior.** Remove offline use of `--merchant-id`, transaction ID, tip, fee, and type. Retain `--ref`; make amount optional only for static offline generation while online mode still rejects missing amount. Construct `new PayWay()` after activation, print readiness issues on failure, and call the KHQR domain generator on success.

- [ ] **Step 5: Run `npm test -- --run src/__tests__/profiles.test.ts src/__tests__/cli.test.ts && npm run build`.** Expected: PASS.

- [ ] **Step 6: Commit only Task 4 paths.** Message: `feat: configure ABA KHQR offline generation in profiles`.

### Task 5: Parse and receive ABA offline-KHQR payment notifications

**Files:**

- Create: `src/webhook/khqr-notification.ts`
- Create: `src/__tests__/khqr-notification.test.ts`
- Modify: `src/webhook/storage.ts:8-36`
- Modify: `src/webhook/server.ts:13-121`
- Modify: `src/__tests__/webhook-server.test.ts:1-166`
- Modify: `src/index.ts:106-110`

**Produces:** `KhqrPaymentNotification`, `ParsedKhqrPaymentNotification`, `parseKhqrPaymentNotification()`, optional parsed metadata on `WebhookRecord`, and default `/aba-payway-khqr-webhook` handling.

- [ ] **Step 1: Write failing parser/route tests.** Use a synthetic version of the supplied notification with all currently published fields and one `future_field`. Assert snake_case maps to camelCase, unknown field is retained, kind is `khqr-offline`, and verification is `unverified`. POST to `/aba-payway-khqr-webhook` and assert 200, raw body, parsed metadata, no mandatory online HMAC header, and no paid-order decision. Cover malformed JSON, missing/wrong-type `transaction_id`, duplicate transaction-ID metadata, and current online-route regression behavior.

- [ ] **Step 2: Run `npm test -- --run src/__tests__/khqr-notification.test.ts src/__tests__/webhook-server.test.ts`.** Expected failure: parser and route are absent.

- [ ] **Step 3: Implement the parser.** Require the published fields from the specification, map to camelCase public fields, retain raw payload and unrecognised properties, and set verification `unverified`. Do not call online `verifyCallbackSignature()` or require `tran_id`/`status` object fields.

- [ ] **Step 4: Implement dedicated server routing/storage metadata.** Add `WebhookServerOptions.khqr?.path` defaulting to `/aba-payway-khqr-webhook`. Persist headers/body/source IP first, then optional parse result/error metadata. Preserve current `/aba-payway-webhook` behavior exactly. Acknowledgement must be fast and parsing success must never equate to merchant fulfilment.

- [ ] **Step 5: Export parser/types and run `npm test -- --run src/__tests__/khqr-notification.test.ts src/__tests__/webhook-server.test.ts src/__tests__/webhook-storage.test.ts && npm run typecheck`.** Expected: PASS.

- [ ] **Step 6: Commit only Task 5 paths.** Message: `feat: receive ABA KHQR payment notifications`.

### Task 6: Document migration, ABA provisioning, and callback operations

**Files:**

- Modify: `README.md:90-103,357-384`
- Modify: `docs/07-qr-code-handling.md:263-298,546-552`
- Modify: `docs/11-callbacks-and-webhooks.md:8-40,141-216,279-385`
- Modify: `docs/16-webhook-setup-guide.md`
- Modify: `src/__tests__/docs-examples.test.ts`

- [ ] **Step 1: Write failing documentation contract tests.** Assert the docs contain `payway.khqr.validateConfiguration()`, tag `62.68`, and `/aba-payway-khqr-webhook`; assert the legacy sentence `Not official Bakong KHQR` is absent; assert no exact value from the supplied config appears in docs.

- [ ] **Step 2: Run `npm test -- --run src/__tests__/docs-examples.test.ts`.** Expected failure: docs describe the private format.

- [ ] **Step 3: Update docs.** Explain configuration sources, static/dynamic behavior, no-network limit, breaking legacy migration, and ABA-provided fields. Explain callback setup: publish HTTPS URL, request ABA whitelisting, retain raw audit data, deduplicate with `transaction_id`, reconcile via `merchant_ref`, and do not trust a callback until ABA provides the actual verification contract.

- [ ] **Step 4: Run `npm test && npm run typecheck && npm run lint && npm run build`.** Expected: all task tests pass; document any unrelated existing lint failures without editing unrelated files.

- [ ] **Step 5: Commit only Task 6 paths.** Message: `docs: explain ABA KHQR offline setup and callbacks`.

## Plan Self-Review

- Tasks 1-4 cover config precedence, readiness, official TLV/CRC, profile support, and retirement of the private generator.
- Task 5 covers the independently-shaped callback, raw preservation, unknown-field tolerance, and no false HMAC claim.
- Task 6 covers ABA provisioning/whitelisting, migration, and secure deployment guidance.
