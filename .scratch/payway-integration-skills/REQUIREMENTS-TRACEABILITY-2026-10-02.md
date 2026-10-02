# Additional requirements traceability — 2026-10-02

Candidate: `24dbb4a` on `codex/payway-integration-skills`. See [review, findings, dependencies and acceptance criteria](ADDITIONAL-REQUIREMENTS-REVIEW-2026-10-02.md).

Implementation follow-up: [enhancements and whole-skill second pass](ENHANCEMENTS-2026-10-02.md). The rows and counts below retain the original review snapshot; current implemented resources, fresh tests and unresolved application/bank acceptance are recorded separately.

This is an assessment of all 146 numbered requirements from the supplied draft. It records instruction/code/evidence coverage, not certification of a merchant or gateway. The proposed work/owners are defined as F1–F9 in the review. “Maintain” means retain the existing requirement while testing changed assets; it does not imply approval to publish.

- **Covered:** existing instruction or implementation addresses the requirement within the declared scope.
- **Partial:** some relevant guidance/code/evidence exists; material work remains.
- **Missing:** no maintained implementation/workflow/evidence for the stated outcome.
- **Conflict:** current code/guidance conflicts with another source or requirement.
- **Bank input:** the affected behavior cannot be certified without an approved ABA/Finance contract or policy.

The source links point to the local supplied document and exact requirement line. A requirement spanning several sentences must be read in full. Evidence codes identify inspected existing assets; they are not claims that every linked requirement has an end-to-end passing test.

## Evidence index

- E1: [Skill entrypoint](../../skills/aba-payway-integration/SKILL.md).
- E2: [Workflow capability/evidence matrix](../../docs/guides/24-agent-integration.md).
- E3: [Setup/onboarding guidance](../../skills/aba-payway-integration/references/setup.md).
- E4: [Integration resolver](../../examples/integration-recipes/service.ts).
- E5: [SQLite teaching store](../../examples/integration-recipes/sqlite-store.ts).
- E6: [Gateway adapter/framework recipes](../../examples/integration-recipes/payway-gateway.ts).
- E7: [SDK validation, endpoints and transport](../../src/client.ts).
- E8: [Behavior tests and candidate evidence](../../src/__tests__/integration-recipes.test.ts).
- E9: [QR/offline guidance](../../skills/aba-payway-integration/references/qr-handling.md).
- E10: [Deployment guidance](../../skills/aba-payway-integration/references/deployment-checklist.md).
- E11: [Diagnostic journal guidance](../../skills/aba-payway-integration/references/transaction-journal.md).
- E12: [Distribution tests](../../src/__tests__/integration-skill.test.ts).
- E13: [Native/deeplink/UI guidance](../../skills/aba-payway-integration/references/native-apps.md).
- E14: [Settlement guidance](../../skills/aba-payway-integration/references/settlement-disputes.md).
- E15: [Customer Printed QR contract](../../skills/aba-payway-integration/references/customer-module-qr.md).
- E16: [Inquiry endpoint documentation](https://developer.payway.com.kh/get-a-transaction-details-14530824e0).
- E17: [Closure policy](../../skills/aba-payway-integration/references/close-transaction.md).
- E18: [Payment Link guide](../../skills/aba-payway-integration/references/payment-link.md).
- E19: [SDK/CLI operation reference](../../skills/aba-payway-integration/references/sdk-cli-reference.md).
- E20: [Declared scope; no approved companion contract](../../skills/aba-payway-integration/SKILL.md).

Additional evidence: [candidate verification](VERIFICATION.md), [Codex/Claude trial record](AGENT-TRIALS.md), [review probes](REVIEW-PROBES-2026-10-02.md), [current inquiry](https://developer.payway.com.kh/check-transaction-14530826e0), [KHQR contract](https://developer.payway.com.kh/khqr-guideline-3192101f0), and [checkout callback contract](https://developer.payway.com.kh/ecommerce-checkout-3158159f0). Official pages were reopened during this review; complete endpoint/profile approval remains separate.

## Numbered requirements

| Requirement | Assessment | Existing evidence | Proposed work | Remaining change or reason |
|---|---|---|---|---|
| [REQ-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:89) | Partial | E1/E2/E10 | F4 | Add explicit migration/go-live/settlement triggers and plugin-first routing. |
| [REQ-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:91) | Covered | E1/E2/E10 | Maintain | Project inspection and preservation are explicit; extend profile fields under REQ-003. |
| [REQ-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:93) | Partial | E1/E2/E10 | F4/F5 | Add a structured integration profile, gate/evidence records and settlement output. |
| [REQ-004](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:95) | Covered | E1/E2/E10 | Maintain | Consequential questions, independent work and no secrets in chat are explicit. |
| [REQ-005](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:97) | Covered | E1/E2/E10 | Maintain | Simulation, dated sandbox, enablement and production prerequisites are distinguished. |
| [REQ-006](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:99) | Partial | E1/E2/E10 | F3/F4 | Blocker guidance exists; add entitlement checklist and sanitized ABA request template. |
| [REQ-007](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:101) | Partial | E1/E2/E10 | F4 | No implicit mutation authorization; add scoped operation/account/amount approval record. |
| [REQ-SB-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:157) | Partial | E3/E10/E11 | F4 | Official registration guidance exists; verify current screens, email/approval steps and expiry. |
| [REQ-SB-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:159) | Partial | E3/E10/E11 | F3/F4 | Merchant/API/RSA configuration exists; add per-service purpose, expiry and owner. |
| [REQ-SB-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:161) | Partial | E3/E10/E11 | F4 | Doctor and masked diagnostics exist; distinguish key expiry, MID and entitlement evidence. |
| [REQ-SB-004](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:163) | Partial | E3/E10/E11 | F3/F4 | Family-level prerequisites exist; add individually confirmed method/operation entitlements. |
| [REQ-SB-005](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:165) | Partial | E3/E10/E11 | F3/F4 | HTTPS/domain/IP guidance exists; add service URL/network verification record. |
| [REQ-SB-006](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:167) | Partial | E3/E10/E11 | F4/F8 | Existing diagnostics and dated campaigns; no fresh selected-merchant accepted cycle. |
| [REQ-SIM-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:173) | Bank input | E3/E10 | F4 | Current approved Android/iOS simulator build, guide, account rules and distribution rights needed. |
| [REQ-SIM-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:175) | Partial | E3/E10 | F6/F8 | Scan/deeplink guidance exists; no fresh physical-device matrix for this candidate. |
| [REQ-SIM-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:177) | Missing | E3/E10 | F4/F8 | Add simulator build/device/profile/time evidence template. |
| [REQ-SIM-004](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:179) | Covered | E3/E10 | Maintain | Injected fixtures and teaching providers explicitly do not establish bank payment. |
| [REQ-ENV-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:198) | Partial | E3/E7/E10 | F3 | SDK endpoint registry exists; add approved host/version/profile/URL registry. |
| [REQ-ENV-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:200) | Partial | E3/E7/E10 | F1/F3 | Configuration separates environments; recipe DB/events/keys lack explicit MID/environment scope. |
| [REQ-ENV-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:202) | Partial | E3/E7/E10 | F3/F4 | Network guidance exists; add distinct outbound/inbound and WAF/TLS records. |
| [REQ-ENV-004](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:204) | Missing | E3/E7/E10 | F4/F7 | Add approved IP/domain transition, overlap, tests and rollback runbook. |
| [REQ-ENV-005](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:206) | Bank input | E3/E7/E10 | F4 | Current hosting/whitelist approval policy must come from ABA. |
| [REQ-ENV-006](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:208) | Partial | E3/E7/E10 | F3/F5 | Endpoint timezone guide exists; add durable event times, skew and finance cutoff contract. |
| [REQ-API-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:224) | Partial | E7/E8/E12 | F3 | SDK signs endpoint-specific serialized values; needs approved vectors for every advertised operation. |
| [REQ-API-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:226) | Covered | E7/E8/E12 | Maintain | Endpoint-specific SDK hash fields already replace a universal four-field hash. |
| [REQ-API-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:228) | Partial | E7/E8/E12 | F3/F8 | Existing signing tests are not a complete bank-approved, cross-language vector registry. |
| [REQ-API-004](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:230) | Partial | E7/E8/E12 | F1/F3 | Raw status adapters exist; project resolver does not distinguish verified result from raw approval. |
| [REQ-API-005](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:232) | Covered | E7/E8/E12 | Maintain | Hosted browser form/HTML is implemented and tested, with JSON callbacks. |
| [REQ-API-006](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:234) | Partial | E7/E8/E12 | F3 | Maintain derived-spec labeling and source conflicts; obtain complete operation contracts. |
| [REQ-MONEY-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:238) | Partial | E5/E7 | F1 | Integer prices exist; make currency scale explicit and use exact comparison/serialization. |
| [REQ-MONEY-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:240) | Partial | E5/E7 | F1/F3 | SDK rejects fractional KHR, but recipe store accepts it and gateway divides both currencies by 100. |
| [REQ-MONEY-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:242) | Partial | E5/E7 | F1 | Ownership/server price checks pass; add price snapshot, tax/discount/rounding and boundary tests. |
| [REQ-MONEY-004](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:244) | Partial | E5/E7 | F1/F5 | Original versus payer basis is documented; no complete FX and settlement ledger. |
| [REQ-ID-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:246) | Partial | E4/E5/E7 | F1/F5 | Core order/attempt/link IDs are separate; add receipts/bank/refund/payout/batch mappings. |
| [REQ-ID-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:248) | Partial | E4/E5/E7 | F1/F3 | Core 18-character generator works; contracts and database uniqueness need per-operation scope. |
| [REQ-ID-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:250) | Missing | E4/E5/E7 | F1 | Add environment/MID/tenant/operation/receipt uniqueness and routing constraints. |
| [REQ-STATE-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:284) | Partial | E4/E5/E8 | F1 | Atomic one-job acceptance exists; add verified/duplicate/conflict results and monotonic financial state. |
| [REQ-STATE-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:286) | Partial | E4/E5/E8 | F1/F7 | Core create uncertainty is retained; advanced operations need independent durable intents and recovery. |
| [REQ-STATE-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:288) | Covered | E4/E5/E8 | Maintain | Local creation lock, callback dedupe and provider references are distinguished; no invented header. |
| [REQ-UI-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:294) | Partial | E6/E13 | F6 | First-payment UI exists; authenticated merchant recipe needs identity/reference/amount/currency screen. |
| [REQ-UI-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:296) | Partial | E6/E13 | F3/F6 | Method guides exist; add approved assets and actual profile/method selection. |
| [REQ-UI-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:298) | Partial | E6/E13 | F1/F6 | Lifecycle hints exist; implement visible states using verified persisted payment state. |
| [REQ-UI-004](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:300) | Partial | E6/E13 | F1/F6 | Duplicate initiation is prevented; add refresh/app restoration and safe retry UX. |
| [REQ-UI-005](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:302) | Partial | E6/E13 | F1/F6 | Current API can show raw approval for mismatched proof; add verified receipt fields. |
| [REQ-UI-006](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:304) | Missing | E6/E13 | F6/F8 | No recorded keyboard/screen-reader/contrast/zoom/localization/device-width acceptance. |
| [REQ-UI-QR-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:308) | Partial | E9/E13 | F6 | Rendering/frame guidance exists; verify approved merchant presentation in actual app. |
| [REQ-UI-QR-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:310) | Partial | E9/E13 | F6/F8 | Image helpers exist; physical screen/print scan evidence and share/download coverage incomplete. |
| [REQ-UI-QR-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:312) | Partial | E9/E13 | F6/F8 | Documented deeplink guidance exists; verify same-device fallback per banking app. |
| [REQ-UI-QR-004](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:314) | Partial | E9/E13 | F1/F6 | Local expiry guidance exists; recipe cannot create a safe distinct replacement attempt. |
| [REQ-UI-MOB-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:318) | Partial | E13 | F6/F8 | Native/webview guides exist; candidate lacks physical iOS/Android/app-death/return matrix. |
| [REQ-UI-MOB-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:320) | Partial | E13 | F3/F6 | Deeplink/backend verification guidance exists; add return allowlist/context tests. |
| [REQ-UI-MOB-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:322) | Partial | E13 | F6/F8 | Hosted form verified locally; modal/bottom-sheet focus/navigation/mobile checks incomplete. |
| [REQ-UI-OPS-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:326) | Missing | E10/E14 | F6/F7 | No complete merchant finance UI permission, approval and audit implementation. |
| [REQ-UI-OPS-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:328) | Partial | E10/E14 | F6/F7 | Refund/error guidance exists; add operation-state UI and confirmed escalation. |
| [REQ-UI-OPS-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:330) | Partial | E10/E14 | F3/F6 | Customer/outlet guidance exists; add verified local/report mappings and UI fields. |
| [REQ-CB-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:345) | Conflict | E1/E2/E4/E5/E14/E15 | F3 | Core signed/unsigned routes exist; Printed QR signature and acknowledgment guidance conflict. |
| [REQ-CB-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:347) | Partial | E1/E2/E4/E5/E14/E15 | F3/F8 | SDK constant-time verifier exists; PHP/JS Unicode/booleans/nested encoding need approved vectors. |
| [REQ-CB-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:349) | Conflict | E1/E2/E4/E5/E14/E15 | F3 | Recipe rejects missing signature on signed routes; entrypoint wrongly generalizes Printed QR as unsigned. |
| [REQ-CB-004](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:351) | Partial | E1/E2/E4/E5/E14/E15 | F3 | Extra fields parse; add version/type tests and protected evidence/digest retention. |
| [REQ-CB-005](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:353) | Partial | E1/E2/E4/E5/E14/E15 | F1/F3 | Identity/amount/currency checked; add environment/MID/tenant binding and exception records. |
| [REQ-CB-006](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:355) | Partial | E1/E2/E4/E5/E14/E15 | F1/F3 | Durable minimal inbox and reconciliation exist; add receipt/audit state and verified ACK policy. |
| [REQ-CB-007](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:357) | Partial | E1/E2/E4/E5/E14/E15 | F1/F3 | Duplicates produce one outbox row; no full receipt identity/conflict/correction audit model. |
| [REQ-CB-008](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:359) | Conflict | E1/E2/E4/E5/E14/E15 | F3 | Recipes return 202 JSON, existing guides require 200; confirm status/body/timeout per service. |
| [REQ-CB-009](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:361) | Partial | E1/E2/E4/E5/E14/E15 | F7 | SDK journal diagnostics exist; add callback stage counters, latency and queue monitoring. |
| [REQ-CB-010](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:363) | Missing | E1/E2/E4/E5/E14/E15 | F3/F8 | No explicit tested merchant-cohort callback adapter registry. |
| [REQ-QUERY-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:369) | Conflict | E4/E6/E7/E16 | F2 | Core status route uses historical detail; official contract excludes real-time processing checks. |
| [REQ-QUERY-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:371) | Partial | E4/E6/E7/E16 | F2 | SDK throttles per instance; add shared pacing, single-flight/cache and scheduled recovery. |
| [REQ-QUERY-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:373) | Partial | E4/E6/E7/E16 | F2 | Polling helpers exist; add configurable worker/UI policy and terminal-stop behavior. |
| [REQ-QUERY-004](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:375) | Covered | E4/E6/E7/E16 | Maintain | Core saved-attempt inquiry and unknown preservation exist; do not resubmit on return/timeout. |
| [REQ-CLOSE-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:377) | Partial | E17 | F1/F7/F8 | Channel-dependent closure and late payment guidance exist; merchant race tests not complete. |
| [REQ-LIST-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:379) | Partial | E9/E14/E16 | F2/F5 | 50-row/no-pagination warning exists; implement completeness detection, overlap and approved report source. |
| [REQ-QR-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:391) | Partial | E6/E9 | F6 | Payload/image helpers exist; recipe returns payload only; hosted URL remains contract-dependent. |
| [REQ-QR-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:393) | Partial | E6/E9 | F1/F3 | Unique saved attempt and lifetime units exist; amount/config snapshot and expiry timestamps missing. |
| [REQ-QR-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:395) | Partial | E6/E9 | F6/F8 | Callback/inquiry tests exist; fresh selected-profile and cross-bank acceptance not recorded. |
| [REQ-QR-004](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:397) | Partial | E6/E9 | F1/F3 | Repeated-receipt guidance exists; one-paid-order recipe has no individual excess-receipt ledger. |
| [REQ-OFF-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:401) | Partial | E9/E14/E8 | F3 | Config/TLV/CRC generation tests exist; need approved issued-profile vectors and provenance. |
| [REQ-OFF-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:403) | Partial | E9/E14/E8 | F3/F8 | Existing byte-length/CRC/Unicode tests are substantial; bank-approved vector coverage still incomplete. |
| [REQ-OFF-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:405) | Partial | E9/E14/E8 | F7/F8 | Bulk manifest/duplicate guidance exists; no candidate agent trial for thousands of invoice QRs. |
| [REQ-OFF-004](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:407) | Partial | E9/E14/E8 | F1/F7 | Receipt/allocation guidance exists; no reusable durable multi-receipt invoice adapter in new assets. |
| [REQ-OFF-005](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:409) | Partial | E9/E14/E8 | F1/F3 | SDK lifetime and local expiry guidance exist; actual contract/enforcement must remain scoped. |
| [REQ-OFF-006](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:411) | Partial | E9/E14/E8 | F2/F5 | Inquiry limits documented; complete financial report and import implementation absent. |
| [REQ-LINK-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:415) | Partial | E6/E18 | F1/F3 | Create/link ID/merchant ref/single-payment expiry implemented; stored expiry/outlet/config snapshot absent. |
| [REQ-LINK-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:417) | Partial | E6/E18 | F1/F7 | One-payment recipe intentionally limited; reusable links need individual receipt/overpayment ledger. |
| [REQ-LINK-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:419) | Partial | E6/E18 | F6 | Customer-only artifact projection exists; add expired/paid/share and trusted URL lifecycle UX. |
| [REQ-LINK-004](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:421) | Partial | E6/E18 | F5/F7 | Saved link totals verified for core case; individual receipt-to-batch settlement missing. |
| [REQ-COF-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:427) | Partial | E2/E19/E8 | F3/F7 | SDK linking/lifecycle routes and enablement caveats exist; full verified token-delivery journey incomplete. |
| [REQ-COF-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:429) | Missing | E2/E19/E8 | F7 | Add consent purpose/version/time, ownership and cancellation policy. |
| [REQ-COF-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:431) | Partial | E2/E19/E8 | F1/F7 | Server/redaction guidance exists; add encrypted tenant/MID/environment/customer token vault. |
| [REQ-COF-004](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:433) | Partial | E2/E19/E8 | F3/F7 | Operations routed; distinguish provider schedule versus merchant scheduler with approved contract. |
| [REQ-COF-005](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:435) | Missing | E2/E19/E8 | F7 | No durable billing-cycle lock/invoice/retry/grace/notification adapter. |
| [REQ-COF-006](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:437) | Missing | E2/E19/E8 | F7 | No revoked-consent scheduler block and in-flight/provider schedule cancellation implementation. |
| [REQ-COF-007](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:439) | Partial | E2/E19/E8 | F7/F8 | Endpoint/offline/blocker tests exist; successful enabled token cycle and adversarial consent suite incomplete. |
| [REQ-AUTH-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:445) | Partial | E2/E17/E19 | F1/F7 | Hold-not-payment and capture window documented; add durable hold record. |
| [REQ-AUTH-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:447) | Partial | E2/E17/E19 | F7 | SDK operation shapes exist; atomic capture/cancel intent and uncertainty resolution absent. |
| [REQ-AUTH-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:449) | Partial | E2/E17/E19 | F7/F8 | Dated SDK evidence exists; complete merchant amount/expiry/race matrix not recorded. |
| [REQ-AUTH-004](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:451) | Bank input | E2/E17/E19 | F3/F7 | Current partial completion, remainder release and method-specific observation contract needed. |
| [REQ-AUTH-005](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:453) | Missing | E2/E17/E19 | F3 | Explicitly classify re-auth/incremental as unsupported/unverified unless an approved contract exists. |
| [REQ-AUTH-006](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:455) | Missing | E2/E17/E19 | F5/F7 | Capture/related payout financial reconciliation and release observation records absent. |
| [REQ-REF-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:461) | Partial | E2/E19/E14 | F3/F7 | SDK checks/guidance exist; complete eligible balance/time/method/profile workflow missing. |
| [REQ-REF-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:463) | Missing | E2/E19/E14 | F7 | No atomic refundable balance reservation for concurrent/unknown refunds. |
| [REQ-REF-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:465) | Partial | E2/E19/E14 | F3/F7 | Refund status/history guidance exists; add accepted/processing/completed/failed/unknown adapter. |
| [REQ-REF-004](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:467) | Partial | E2/E19/E14 | F7/F8 | SDK tests and dated evidence exist; operator intent/history/concurrency acceptance incomplete. |
| [REQ-REF-005](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:469) | Partial | E2/E19/E14 | F4/F7 | Portal/error guidance exists; verify current authorized fallback and evidence template. |
| [REQ-REF-006](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:471) | Missing | E2/E19/E14 | F5/F7 | No completed refund-to-report/bank impact matching. |
| [REQ-PAY-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:475) | Partial | E2/E14/E19 | F3/F7 | RSA/whitelist/currency/config guidance exists; current source/account/commercial approval needed. |
| [REQ-PAY-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:477) | Partial | E2/E14/E19 | F3/F7 | Beneficiary APIs/fixtures exist; add verified already-existing continuation and currency/status checks. |
| [REQ-PAY-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:479) | Missing | E2/E14/E19 | F7 | No durable approved payout intent/allocation/source debit audit adapter. |
| [REQ-PAY-004](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:481) | Missing | E2/E14/E19 | F7 | No separate batch/per-beneficiary result and partial-execution resolver. |
| [REQ-PAY-005](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:483) | Partial | E2/E14/E19 | F3/F7 | Do-not-blind-retry guidance exists; reliable original-operation query/ABA escalation contract needed. |
| [REQ-PAY-006](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:485) | Missing | E2/E14/E19 | F5/F7 | No source debit/all-beneficiary credit/fee/operation financial ledger. |
| [REQ-PLUG-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:493) | Missing | E20 | F9 | Create verified official platform/plugin/version/feature matrix and plugin-first routing. |
| [REQ-PLUG-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:495) | Missing | E20 | F9/F8 | No actual plugin runtime/order/duplicate-hook/rounding/portal acceptance. |
| [REQ-PLUG-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:497) | Missing | E20 | F9 | No supported plugin extension, upgrade backup and rollback guide. |
| [REQ-POS-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:501) | Bank input | E20 | F9 | Separate approved hardware/ECR protocol, firmware, transport and provisioning required. |
| [REQ-POS-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:503) | Missing | E20 | F9/F8 | No terminal/POS disconnect/lost-result/duplicate/receipt acceptance suite. |
| [REQ-POS-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:505) | Bank input | E20 | F9/F5 | Terminal/outlet/account settlement and refund/void contracts needed. |
| [REQ-MINI-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:509) | Bank input | E13/E20 | F9 | ABA Mini App app/profile/environment/entitlement contract missing; Telegram guide does not establish it. |
| [REQ-MINI-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:511) | Partial | E13/E20 | F6/F9 | Generic mobile guides help; ABA same-app return and method rules need approved companion tests. |
| [REQ-PARTNER-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:515) | Partial | E2/E20 | F1/F3/F9 | Spec-derived self-activation exists; authorized provisioning/legal/entitlement/tenant journey incomplete. |
| [REQ-PARTNER-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:517) | Missing | E2/E20 | F3/F9/F8 | No portfolio cohort/failover/configuration cross-tenant callback acceptance. |
| [REQ-BILL-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:521) | Bank input | E20 | F9 | Separate approved BillZone/biller API, posting/correction and environments needed. |
| [REQ-BILL-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:523) | Missing | E20 | F9 | No authoritative bill balance/customer validation adapter. |
| [REQ-BILL-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:525) | Missing | E20 | F9 | No accepted-payment-but-unposted suspense/retry/refund workflow. |
| [REQ-BILL-004](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:527) | Missing | E20 | F9/F5 | No payment-to-biller-posting-to-settlement join and separate UAT owner. |
| [REQ-SET-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:674) | Partial | E14/E10 | F5 | Portal/statement guidance exists; actual report/schema/access and authoritative source registry missing. |
| [REQ-SET-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:676) | Partial | E14/E10 | F5 | Settlement cycle guidance exists; explicit transaction/operation/batch/account grain missing. |
| [REQ-SET-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:678) | Conflict | E14/E10 | F5 | Existing guide suggests amount/time/APV heuristic; require authoritative ID/batch joins. |
| [REQ-SET-004](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:680) | Partial | E14/E10 | F1/F5 | Original versus payer amount guidance exists; full payable/FX/settlement basis incomplete. |
| [REQ-SET-005](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:682) | Partial | E14/E10 | F5 | Net/gross guidance exists; add agreement-specific fee/refund/adjustment component model. |
| [REQ-SET-006](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:695) | Missing | E14/E10 | F5 | No checksum/schema/row-ID protected idempotent finance import. |
| [REQ-SET-007](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:697) | Partial | E14/E10 | F5 | Mismatch escalation guidance exists; no classified owned finance exception queue. |
| [REQ-SET-008](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:699) | Bank input | E14/E10 | F5 | Finance-approved tolerance/cycle and reviewer required; do not invent defaults. |
| [REQ-SET-009](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:701) | Partial | E14/E10 | F5/F7 | Hold/refund/payout distinctions documented; actual capture/refund/source/beneficiary financial proof missing. |
| [REQ-SET-010](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:703) | Missing | E14/E10 | F5 | No later-batch refund/fee follow-up evidence/signoff workflow. |
| [REQ-OPS-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:713) | Partial | E10/E11/E14 | F7 | Journal stats/anomalies exist; complete merchant metrics/SLA/alerts and finance monitors missing. |
| [REQ-OPS-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:715) | Partial | E10/E11/E14 | F1/F7 | Correlation/trace/redaction guidance exists; add receipt/MID/outlet/environment join. |
| [REQ-OPS-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:717) | Partial | E10/E11/E14 | F4/F5/F7 | Error/recovery guidance exists; add owned outage/expiry/whitelist/report/finance runbooks. |
| [REQ-OPS-004](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:719) | Conflict | E10/E11/E14 | F4/F7 | Existing rollback swaps production to sandbox; preserve production callback/reconciliation while disabling initiation. |
| [REQ-OPS-005](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:721) | Partial | E10/E11/E14 | F4/F9 | Support guide exists; named developer/finance handover and approved internal support policy missing. |
| [REQ-REL-001](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:759) | Covered | E8/E10/E12 | Maintain | Frontmatter/references/provenance, examples and all five installer targets have recorded passing checks. |
| [REQ-REL-002](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:761) | Partial | E8/E10/E12 | F8 | This review adds 146-row assessment; implementation/test/gate/owner links need maintenance as changes land. |
| [REQ-REL-003](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:763) | Partial | E8/E10/E12 | F8 | Core Codex tasks pass; advanced/plugin/offline/mobile/settlement trials absent; Claude deferred. |
| [REQ-REL-004](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:765) | Partial | E8/E10/E12 | F1/F7/F8 | Core secret/signature/mismatch/timeout rejection covered; new money/refund/settlement/invented-API prompt suite needed. |
| [REQ-REL-005](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:767) | Missing | E8/E10/E12 | F3/F8 | No full callback-format/key-rotation/endpoint-limit source-migration agent evaluation. |
| [REQ-REL-006](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:769) | Partial | E8/E10/E12 | F3/F8/F9 | Local package scans pass; product/brand/security approvals, hosted gates and per-module acceptance remain open. |
| [REQ-REL-007](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md:771) | Partial | E8/E10/E12 | F3/F8 | Version/provenance/update guidance exists; add named owner, API compatibility, retirement and review cadence. |

## Unnumbered requirements and artifacts

These sections are part of the expanded specification even though they have no REQ identifier.

| Source section | Existing coverage | Proposed improvement / acceptance |
|---|---|---|
| §1 evidence authority and §2 benchmark critique | Generated provenance and private benchmark research exist | F3: fact/operation URL, version, verification date, environment/profile, reviewer and conflict resolution. Preserve current implementations already addressing old proposal defects |
| §3 service/operation and method matrix | 17 family-level rows and actual SDK/CLI symbols | F3/F7/F9: operation-level contracted/implemented/fixture/sandbox/production/settlement/blocked evidence, profile-specific methods/currencies and plugin routes |
| §5 mandatory intake and routing | Project inspection and flow routing | F4/F9: masked integration profile, unknown/assumed fields, outlet/network/account/finance/owner mapping; evaluate verified official plugins first |
| §6 G0–G7 merchant gates | Repository publication audit and merchant deployment checklist | F4/F5: separate merchant gate records and evidence; no test stage passed by implication; bank rule needed for G5/G6 |
| §8 official test cards and simulator prerequisites | Existing ABA test-card helpers and simulator references | F3/F4/F8: reverify current official fixtures, expected outcomes and approved simulator build/guide; no copying reusable simulator access secrets into public content |
| §10 operation contract table | SDK endpoint-specific fields, signing and transport tests | F3: full approved field/encoding/auth/response/reliability/provenance record per advertised operation |
| §11 logical records and §12 separate state machines | Core orders/attempts/inbox/reconciliation/outbox | F1/F5/F7: immutable/scoped attempts, actual receipts and payment ledger; independent fulfillment/refund/hold/payout/token/settlement states |
| §14 URL roles | Checkout callback and browser navigation distinguished in references | F3/F4/F6: explicit service/version URL registry, allowlists, defaults and configuration tests |
| §23 T01–T45 sandbox matrix | Core order/auth/callback/unknown/restart/concurrent tests; fresh 27 focused tests passed | F8: map every applicable case to actual execution/evidence. Unrun, simulated, unavailable and approved N/A stay separate |
| §23 per-test evidence record | Private campaign/trial reports and correlation IDs | F4/F8: case/build/environment/profile/method/currency/IDs/time/expected/actual/verification/UI/ledger/reviewer template; protected artifacts and retention |
| §24 activation/go-live checklist | Technical checklist and prior bank learnings | F4: business/portal/production approvals and safely controlled acceptance, rollback and handover |
| §25 existing ABA acceptance rule | Not supplied in the attachment or candidate | F4/F5: approved policy record; no substitute transaction counts/amounts or automatically multiplied real-money matrix |
| §25 per-transaction financial evidence | Diagnostic journal; some gateway fields | F1/F5: authoritative receipt/operation/report/batch/account/bank evidence and approved join when a field is absent |
| §26 G6 acceptance proof | Introductory settlement guidance | F5: all required accepted transactions/operations accounted for, batch-to-bank proof, resolved material discrepancies and Finance/ABA signoff |
| §28 references and project templates | Self-contained 37-topic corpus and five TS assets | F3–F6: onboarding, contracts, money/state, UI, callbacks/recovery, production/settlement references plus profile/gate/test/finance templates; reuse the generator |
| §28 agents/openai.yaml | Absent, optional metadata | F8: optional display metadata if useful; do not make it a financial release blocker or alter automatic discovery |
| §28 language/framework priorities | Tested TS/JS Express/Next; other languages explicitly unvalidated | Retain TS first. PHP/Laravel/Python later only with agreed merchant priority and equal contract/vector/lifecycle acceptance |
| §28 internal ABA companion | Internal material excluded from public corpus | F9: separate restricted product; approved internal profile/report/support/acceptance policy and access boundaries. Exclusion alone is not companion implementation |
| §28 optional OAS/Postman/MCP/discovery | Existing SDK/CLI/MCP and derived artifacts; skill does not require MCP | Preserve optional dependencies; validate any added adapter/account authorization independently; no new invented discovery manifest |
| §29 build order and §30 owner register | Earlier implementation issues/publication audit exist | Incorporate F1–F9 into separately numbered implementation issues if approved; owner contracts block affected claims/gates, not all independent work |
| §31 sources and “verified” labels | Attachment carries its own 1 October review | Reuse as leads, not automatic approval. This review verifies selected official pages and code on 2 October; bank/merchant agreements and full schemas remain outstanding |

## Core scenario evidence versus broader acceptance

Fresh 27-test rerun comprises 21 integration recipe cases and six standalone/full-catalog/manual-copy installation cases. Existing core cases address parts of T07–T09, T11–T14, T16 and restart/concurrent acceptance. They do not provide all required UI, MID/environment, device, ledger or real bank evidence for those entire rows. Avoid marking a whole scenario passed from a single overlapping assertion.

T01–T06 need current selected-merchant credentials/entitlements/methods and approved paid cycles. T10/T13/T22–T24 need actual browser/device/UI evidence. T15/T17/T18/T20/T21/T39/T44 need stronger format/availability/fulfillment/rate/close/scope/migration tests. T25–T38 and T40–T43 require applicable advanced/platform adapters and contract-specific acceptance. T45 needs finance import/matching fixtures and approved complete sources.

The new probes demonstrate gaps current passing tests omit: raw-approved/mismatched result, paid-state downgrade in response, duplicate success boolean, mutable price, fractional KHR in the teaching store and inability to replace a declined attempt. Add meaningful regression tests when implementing F1/F2; this review does not modify the current tests or product code.

## Maintenance of this matrix

After implementation, replace proposed work with concrete changed resources and scenario/test/evidence links; assign actual owners and record version/environment/date. Keep documentation, executable behavior, fixture checks, dated sandbox, production and settlement states as separate fields. No unrun stage or uncontracted companion can be promoted merely because a family-level reference exists.
