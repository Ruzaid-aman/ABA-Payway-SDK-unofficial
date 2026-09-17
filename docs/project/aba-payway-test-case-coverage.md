# ABA PayWay Test-Case Coverage

## Executive summary

All 28 supplied merchant cases were assessed. The published SDK covers signing, request construction, status requests, signature verification, retry/rate limiting, and selected input validation. Merchant operational policy, UI review, commercial configuration, and durable order processing are covered by documentation and the separate QR-POS reference example. TC-005 and TC-013 remain contradictory and require ABA confirmation.

## Baseline and final validation

Baseline: 121 Vitest tests passed; typecheck and build passed; Biome reported 35 pre-existing warnings.

Final: 133+ root Vitest tests passed, including the new 8-case SDK scenario suite and 4 new `validateTransactionId` tests; the QR-POS sample passed 7 tests and its TypeScript build. Root typecheck and tsup build passed. Biome still reports the same 35 existing warnings (its command exits non-zero); this work did not claim a clean lint run. The JSON report parsed with 28 unique cases, and this document contains 28 TC headings. Sandbox QR template verification: all 10 templates generated valid QR codes, all 10 paid transactions verified APPROVED via `getTransactionList` + `getTransactionDetail`.

## Coverage totals

| Classification | Count |
|---|---:|
| COVERED_BY_CODE_AND_DOCUMENTATION | 6 |
| COVERED_BY_DOCUMENTATION | 20 |
| CONTRADICTORY_REQUIREMENT | 2 |
| Other classifications | 0 |

## TC-001: Purchase returns QR JSON instead of checkout HTML
Status: COVERED_BY_CODE_AND_DOCUMENTATION

Evidence: `src/client.ts` `createTransaction`; `src/__tests__/merchant-scenario-coverage.test.ts` TC-001; `docs/15-merchant-scenario-requirements.md` TC-001. Verification: focused Vitest test passes. SDK responsibility: signs `payment_gate`. Integrator responsibility: browser form submission and ABA profile confirmation. Gap: routing is ABA-managed. Confidence: High.

## TC-002: Server-side hash generation
Status: COVERED_BY_CODE_AND_DOCUMENTATION

Evidence: `src/auth.ts` `generateHmac`; `src/__tests__/merchant-scenario-coverage.test.ts` TC-002; Chapter 15 TC-002. Verification: request-hook redaction assertion passes. SDK: signs locally. Integrator: keeps client server-side. Gap: none. Confidence: High.

## TC-003: Frontend checkout submission
Status: COVERED_BY_DOCUMENTATION

Evidence: `docs/03-web-implementation.md` backend/form steps; Chapter 15 TC-003. Verification: documented form flow. SDK: creates fields. Integrator: submits browser form. Gap: no server-to-server purchase client. Confidence: High.

## TC-004: Popup integration
Status: COVERED_BY_DOCUMENTATION

Evidence: Chapter 15 TC-004. Verification: ABA JavaScript remains external. SDK: signed fields. Integrator: loads `checkout2-0.js` and targets `aba_webservice`. Gap: confirm script behavior with ABA. Confidence: Medium.

## TC-005: Desktop hosted_view request
Status: CONTRADICTORY_REQUIREMENT

Evidence: `src/types.ts` checkout view documentation; Chapter 15 TC-005. Verification: conflicting supplied guidance is labelled Confirm with ABA. SDK: passes `viewType`. Integrator: use popup pending confirmation. Gap: current ABA rule. Confidence: Low.

## TC-006: Popup close refresh
Status: COVERED_BY_DOCUMENTATION

Evidence: Chapter 15 TC-006. Verification: documented as observed guidance. SDK: none. Integrator: ABA script parameter. Gap: parameter semantics. Confidence: Medium.

## TC-007: Mobile dismissal
Status: COVERED_BY_DOCUMENTATION

Evidence: `docs/05-webview-implementation.md` back-button guidance; Chapter 15 TC-007. Verification: bounded polling documented. SDK: status query. Integrator: expiry/verification. Gap: no reliable dismissal event. Confidence: High.

## TC-008: Website QR expiry
Status: COVERED_BY_CODE_AND_DOCUMENTATION

Evidence: `src/utils.ts` `validateLifetime`; TC-008 test; Chapter 15 TC-008. Verification: invalid values reject. SDK: validates lifetime shape. Integrator: selects profile-appropriate duration. Gap: no ABA maximum encoded. Confidence: High.

## TC-009: POS QR expiry
Status: COVERED_BY_DOCUMENTATION

Evidence: QR-POS README; Chapter 15 TC-009. Verification: sample uses 300 seconds. SDK: forwards parameters. Integrator: selects lifetime. Gap: ABA confirmation. Confidence: Medium.

## TC-010: Polling frequency and stop conditions
Status: COVERED_BY_DOCUMENTATION

Evidence: `payway-boilerplate/merchant-qr-pos/public/index.html`; `payments.test.ts`; Chapter 15 TC-010. Verification: terminal-status tests pass. SDK: status request. Integrator: polling policy. Gap: 15-second server policy is optional. Confidence: High.

## TC-011: Check API versus pushback
Status: COVERED_BY_DOCUMENTATION

Evidence: `docs/11-callbacks-and-webhooks.md`; Chapter 15 TC-011. Verification: reconciliation guidance. SDK: check/verify methods. Integrator: durable reconciliation. Gap: none. Confidence: High.

## TC-012: Pushback payload
Status: COVERED_BY_CODE_AND_DOCUMENTATION

Evidence: `src/auth.ts` callback verification; `auth.test.ts`; Chapter 15 TC-012. Verification: signatures are tested. SDK: verifies payload. Integrator: hosts callback. Gap: callback configuration. Confidence: High.

## TC-013: Callback requirement
Status: CONTRADICTORY_REQUIREMENT

Evidence: Chapter 15 TC-013. Verification: requirement is explicitly escalated. SDK: query/verify primitives. Integrator: confirm profile setting. Gap: ABA decision. Confidence: Low.

## TC-014: Post-pushback verification delay
Status: COVERED_BY_DOCUMENTATION

Evidence: Chapter 15 TC-014. Verification: delay is labelled observed guidance. SDK: status query. Integrator: idempotent recheck. Gap: ABA timing guarantee. Confidence: Medium.

## TC-015: Polling and webhook race
Status: COVERED_BY_DOCUMENTATION

Evidence: `merchant-qr-pos/src/store.ts`; `store.test.ts`; Chapter 15 TC-015. Verification: duplicate event test passes. SDK: none. Integrator: database lock/idempotency. Gap: sample is not SDK code. Confidence: High.

## TC-016: Check Transaction API rate limit
Status: COVERED_BY_CODE_AND_DOCUMENTATION

Evidence: `src/client.ts` default rate rules; `client.test.ts` retry/rate tests; Chapter 15 TC-016. Verification: mocked retry test passes. SDK: throttles/retries. Integrator: production sizing. Gap: current ABA limit confirmation. Confidence: High.

## TC-017: Root domain whitelisting
Status: COVERED_BY_DOCUMENTATION

Evidence: Chapter 15 TC-017. Verification: commercial process documented. SDK: none. Integrator: submit domains. Gap: profile config. Confidence: High.

## TC-018: Custom merchant domain
Status: COVERED_BY_DOCUMENTATION

Evidence: Chapter 15 TC-018. Verification: maintenance process documented. SDK: none. Integrator: request whitelist. Gap: ABA action. Confidence: High.

## TC-019: Simulator versus sandbox account
Status: COVERED_BY_DOCUMENTATION

Evidence: `docs/02-prerequisites-and-setup.md`; Chapter 15 TC-019. Verification: portal onboarding documented. SDK: environment selection. Integrator: register/obtain profile. Gap: ABA approval. Confidence: Medium.

## TC-020: Sandbox expiry
Status: COVERED_BY_DOCUMENTATION

Evidence: Chapter 15 TC-020. Verification: reactivation path documented. SDK: none. Integrator: contact ABA without secrets. Gap: ABA action. Confidence: High.

## TC-021: Supported methods by product
Status: COVERED_BY_DOCUMENTATION

Evidence: Chapter 15 TC-021. Verification: method choices labelled profile-dependent. SDK: accepts payment option. Integrator: render enabled methods only. Gap: actual profile confirmation. Confidence: Medium.

## TC-022: Payment options and logos
Status: COVERED_BY_DOCUMENTATION

Evidence: `docs/10-ui-customization.md`; Chapter 15 TC-022. Verification: hosted UI limits documented. SDK: none. Integrator: ABA-approved UI. Gap: review approval. Confidence: High.

## TC-023: Preauth review coverage
Status: COVERED_BY_DOCUMENTATION

Evidence: Chapter 15 TC-023. Verification: separate review requirement documented. SDK: pre-auth methods. Integrator: submit flow. Gap: commercial sign-off. Confidence: High.

## TC-024: Orphan payment after dismissed checkout
Status: COVERED_BY_DOCUMENTATION

Evidence: Chapter 15 TC-024. Verification: reconciliation/refund policy documented. SDK: status/refund operations. Integrator: records/orders/policy. Gap: merchant refund decision. Confidence: High.

## TC-025: Malformed callback URL
Status: COVERED_BY_CODE_AND_DOCUMENTATION

Evidence: `src/utils.ts` `validatePublicHttpsUrl`; TC-025 test; Chapter 15 TC-025. Verification: invalid URLs reject before fetch. SDK: local validation. Integrator: public stable endpoint. Gap: cannot verify reachability. Confidence: High.

## TC-026: POS checkout evidence
Status: COVERED_BY_DOCUMENTATION

Evidence: Chapter 15 TC-026. Verification: sign-off checklist documented. SDK: QR primitive. Integrator: capture evidence. Gap: ABA review. Confidence: High.

## TC-027: Production/client onboarding gate
Status: COVERED_BY_DOCUMENTATION

Evidence: Chapter 15 TC-027. Verification: sign-off/expiry guidance documented. SDK: none. Integrator: confirm profile validity. Gap: ABA status. Confidence: High.

## TC-028: Optional phone verification
Status: COVERED_BY_DOCUMENTATION

Evidence: Chapter 15 TC-028. Verification: profile/UI boundary documented. SDK: none. Integrator: implement OTP UI if enabled. Gap: profile decision. Confidence: High.

## Tests added

- `src/__tests__/merchant-scenario-coverage.test.ts` — TC-001, TC-002/003, TC-008, TC-025.
- `payway-boilerplate/merchant-qr-pos/src/store.test.ts` — TC-015.
- `payway-boilerplate/merchant-qr-pos/src/payments.test.ts` — TC-010.

## Remaining gaps and ABA confirmations

TC-005 and TC-013 require ABA confirmation. Domain changes, profile activation, UI/pre-auth/POS review, method activation, sandbox expiry, refund policy, and profile limits remain outside the SDK.

## Security findings

The SDK does not expose `apiKey` through request hooks; it now rejects malformed QR callback URLs and invalid lifetimes. The QR-POS example keeps credentials server-side and uses a SQLite unique event key for duplicate success processing.
