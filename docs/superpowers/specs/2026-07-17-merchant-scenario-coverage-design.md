# ABA PayWay Merchant Scenario Coverage Design

## Goal

Assess all 28 cases in `test-cases/aba_payway_sdk_agent_test_cases_pass2.json` against the published TypeScript SDK, its automated tests, and its documentation/examples; then close SDK-controlled gaps with tests and close merchant/process guidance gaps with explicit documentation.

## Evidence Boundary

- **SDK code** means the public package implementation in `src/` and its automated tests in `src/__tests__/`.
- **Documentation/example evidence** includes `README.md`, `docs/`, and `payway-boilerplate/`.
- `payway-boilerplate/` is never proof of an SDK feature. It can demonstrate an integration pattern only.
- `test-cases/` is input-only and must not be edited.
- Chat-derived or profile-specific instructions must be marked **Confirm with ABA**, **Merchant-profile dependent**, **Commercial configuration required**, **Guidance observed during integration**, or **Not enforced by the SDK**.

## Deliverables

1. `docs/aba-payway-test-case-coverage.md` with an executive summary, baseline/final validation, aggregate totals, and one evidence-backed section for every case ID.
2. `aba-payway-coverage-report.json` using the requested machine-readable schema.
3. A cross-cutting documentation chapter for requirements outside the SDK boundary, with explicit case-ID references and safe integration examples.
4. Focused Vitest coverage for behavior the SDK can control. Tests will be written first and observed failing before any supporting implementation is changed.

## Architecture and Boundaries

The audit creates a canonical case-to-evidence map. Each case receives exactly one classification: `COVERED_BY_CODE`, `COVERED_BY_DOCUMENTATION`, `COVERED_BY_CODE_AND_DOCUMENTATION`, `PARTIALLY_COVERED`, `NOT_COVERED`, `CONTRADICTORY_REQUIREMENT`, or `NOT_APPLICABLE_TO_SDK`.

SDK-scoped tests will cover observable public behavior such as checkout request construction (`payment_gate: 0`), request signing boundaries, required SDK request validation, lifetime/callback URL validation when safely definable from the SDK contract, retry/rate-limit behavior, and absence of secret credentials from SDK request hooks. Merchant database locking, webhook persistence, order creation, UI sign-off, commercial onboarding, and ABA profile configuration remain documented integrator responsibilities rather than SDK features.

## Error Handling and Security

tests can contact PayWay. Tests use local mocked `fetch` implementations or sandbox API, generated, provided  cryptographic keys, and synthetic transaction IDs. can use real provided API keys, customer records, PINs, addresses, email addresses, or sandbox credentials may be added. Documentation must distinguish browser redirects from trusted verification and must not treat a chat transcript as universal PayWay policy.

## Verification

The final run will include the full Vitest suite, Biome lint, TypeScript typecheck, SDK build, and documentation-link/structure validation if the repository supports it. Baseline findings are recorded separately from final results: 121 existing tests pass; typecheck and build pass; the current lint command exits non-zero because it reports 35 pre-existing warnings.

## Scope Inclusion

This work also adds a merchant order database, webhook server, POS application only QR screen, Sandbox API calls,  claims that the provided sandbox merchant profile supports a payment method in testing environment. 
