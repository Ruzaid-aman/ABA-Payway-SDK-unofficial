# 08 — Onboarding, contracts, finance, UI and operations

Type: task
Status: resolved
Blocked by: 07

## Acceptance

Extend selective standalone guidance for F3–F7; represent G0–G7 without invented bank thresholds; remove callback/rollback/settlement contradictions; provide typed evidence and settlement examples; record all consequential unknowns in the existing ABA log.

## Answer

Five curated public guides cover onboarding/profile evidence, operation contracts, finance, UI/mobile and advanced operations. The entrypoint selects these references. Gate evidence helpers reject unsupported passed production gates. Settlement examples require explicit operation/batch/currency joins and approved tolerance; they are normalized synthetic examples rather than bank report adapters. Rollback retains production processing for existing payments.

Unsigned offline KHQR is distinct from the captured signed Printed QR profile. Production authentication is configured by service/profile/version and cannot downgrade based on a missing header. Callback acknowledgment is explicit configuration with a default HTTP 200 plain-text teaching response. COF callback canonicalization remains unresolved; token inquiry and enrollment evidence are required.

## Comments

2026-10-02: Q44–Q56 appended to the canonical ABA register without sending them externally. Restricted companion design stays internal and outside the package; there is no new partner/plugin API or invented production policy.
