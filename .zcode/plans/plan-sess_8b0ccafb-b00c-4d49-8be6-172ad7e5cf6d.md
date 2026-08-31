# Plan: Hosted-checkout form helper + payment-link image upload (v1.4.0 features)

Closes the two gaps from the review: merchants must hand-build the hosted-checkout HTML form, and `paymentLink.create()` cannot send the optional `image` part. Two separate branches (repo convention: branch per task), merged sequentially to `main`, CHANGELOG under Unreleased (version bump stays a release-time decision).

## Branch 1 — `feat/checkout-form-html`

**SDK: `payway.checkout.getCheckoutFormHtml(params, options?)`** (synchronous, local-only, no network)

- Reuses `buildPurchasePayload()` in `src/domains/checkout.ts:100` (so every existing validation + the 24-field HMAC are identical to `createTransaction`), then wraps it in a complete HTML document.
- Action URL: `${resolvedBaseUrl}${ENDPOINTS.purchase}`. Pass the already-resolved `this.baseUrl` from `src/client.ts:618` into `createCheckoutDomain` as a 4th argument (avoids duplicating baseUrl/env resolution).
- `CheckoutFormOptions`: `formId?` (default `aba_merchant_request`), `autoSubmit?` (inline `form.submit()` on load — same-tab navigation), `popupMode?` (official boilerplate UX: `target="aba_webservice"`, `checkout2-0.js` plugin script, `AbaPayway.checkout()` on button click), `submitLabel?` (default "Pay with ABA PayWay"), `omitSubmitButton?`. `autoSubmit` + `popupMode` together → `PayWayConfigError`.
- All hidden-input values HTML-escaped (`&<>"'`) — `tran_id`/names/emails are merchant/user input.
- Export the `CheckoutFormOptions` type from `src/index.ts`; update the `public-api.test.ts` pin.

**CLI: `payway-sdk checkout-form`** (local-only, no credentials required — works like `explain`/`validate`)

- Flags: `-a/--amount` (required), `-c/--currency` (default USD), `-t/--transaction-id` (auto-generated, same pattern as `generate-checkout`), `--payment-option` (default omitted so PayWay shows all options, per spec), `--return-url`, `--cancel-url`, `--firstname/--lastname/--email/--phone`, `--auto-submit`, `--popup`, `--out <path>` (default stdout).
- Prints a next-step hint after writing. Registered in the Payments help group. Must not fail when no credentials exist (guard the profile-activation preAction path).

**Tests** (new `src/__tests__/checkout-form-html.test.ts` + in-process `runCli` cases): action URL respects `baseUrl` override; hidden inputs carry every payload field incl. `hash`; `<script>`-bearing `tran_id` is escaped; auto-submit script present; popup mode includes plugin script + target; both-modes conflict throws; `formId`/`submitLabel`/`omitSubmitButton` honored; CLI writes file / stdout, exit-code contract (1 on validation).

**Docs**: README checkout-domain example; new subsection in `docs/03-web-implementation.md` (Express `res.send(html)` snippet, mode guidance); CHANGELOG entry.

## Branch 2 — `feat/payment-link-image`

**Client: multipart support in `requestWithMerchantAuth`** (`src/client.ts:1043`)

- New option `multipartFile?: { name: string; filename: string; contentType: string; data: Uint8Array }`. When present: build a `FormData` with `request_time`/`merchant_id`/`merchant_auth`/`hash` as string parts + `form.append(name, new Blob([data], { type }), filename)`; send with **no manual `Content-Type`** (undici must set the boundary). Hash composition unchanged: `request_time + merchant_id + merchant_auth` — image bytes are NOT hashed (confirmed against boilerplate PHP + spec `x-hmac-fields`).
- `_executeFetch` body param widens `string | FormData`; retry re-send is safe (FormData is reusable). `onRequest`/debug logging keeps its `string` signature by logging a descriptive summary for FormData (e.g. `<multipart: 5 parts, image image.jpg (12.3 KB)>`) — no public hook type change. Node ≥20 globals `FormData`/`Blob` — no new deps.

**Domain + types**: `CreatePaymentLinkParams` (`src/client.ts:234`) gains `image?: { data: Uint8Array; filename?: string; contentType?: string }` (defaults: filename `image.jpg`, contentType `image/jpeg`; validate non-empty data). `payment-link.ts create()` passes it through after existing validation; widen the factory's `requestWithMerchantAuth` option type. Export the param type. Update `payway-openapi/components/schemas/payment-link.yaml` (add `image: binary` part — the response already returns `image`), run `npm run bundle` + `generate-types`, **review the types.ts diff and keep it only if additive** (else revert types.ts and keep the hand-written param type).

**CLI**: `payment-link create --image <path>` — reads file, infers contentType from extension (jpg/png/webp/gif, fallback `application/octet-stream`), clean exit-1 on missing/empty file.

**Sandbox probe (approved)**: extend `scripts/sandbox-probe-payment-link.ts` with an image case (tiny generated PNG) + run live with scoped `NODE_TLS_REJECT_UNAUTHORIZED='0'`. Evidence to `test-output/payment-link-image-probe/`; append findings (gateway acceptance, any constraints observed, negative control) to `docs/SANDBOX-FINDINGS.md`. If the gateway rejects multipart, capture the exact response and adjust/report before finalizing docs.

**Tests** (fetch-stub style per `client.test.ts` conventions): FormData body parts present, hash correctness unchanged, no manual Content-Type, retry with FormData, empty-data/bad-filename validation (`validation.test.ts`), CLI `--image` missing-file exit 1.

**Docs**: README payment-link example with image; docs payment-link section; CHANGELOG.

## Verification (both branches, before each merge)

`npx vitest run` (1052 existing + new, green) · `npx tsc --noEmit` · `npx biome lint src` · coverage floors 74/69/80/74 hold (new code fully tested) · before merging check `main` hasn't moved; conventional commits.

## Out of scope

Version bump/publish (release checklist is a user decision), token-trio un-gating (blocked on ABA), TLS-encapsulation option (separate candidate improvement).