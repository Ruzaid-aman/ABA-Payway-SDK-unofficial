# Internal ABA integration companion — design and owner inputs

Restricted maintainer/ABA workflow design, 2026-10-02. This file is not curated into knowledge, skill resources or public packages. No profile/report/account tool access or bank approval is implemented by this document.

## Audience and controls

Authorized Integration, API/Product, Settlement, Support and merchant Finance owners. Use least-privilege access and protected references; keep originals/captures/account/credential material out of public examples. Record actor, authority, scope, purpose, evidence and outcome for operational actions.

## Owner workflows

| Workflow | Required approved input / record |
|---|---|
| Profile enablement/network/rotation | Protected environment/MID/outlet/partner reference, requested operation, change approval, old/new configuration/version, controlled test and rollback; Q46/Q49/Q51 |
| Sandbox/simulator access | Current onboarding/build/account entitlement and distribution rules; no public reusable secrets; Q49/Q50 |
| Production acceptance | Existing rule/version, scoped financial authorization, per-method/currency/outlet/operation evidence, launch condition and go-live owner; Q44 |
| Finance signoff | Actual report/bank access, protected checksums/joins/batches/component calculations, exceptions, reviewer/time; Q45/Q54 |
| Legacy/partner callback migration | Explicit service/cohort/version/key/ACK vector policy, tenant routing, overlap tests and retirement; Q46/Q52/Q55 |
| Post-launch incident/support | Named developer/operations/finance contacts, masked references/time/trace, actual support classification/SLA and escalation; Q56 |

Use the public merchant G0–G7 templates for factual evidence, then attach restricted ABA approvals. Never infer commercial entitlement or settlement signoff from a developer test. Missing policy remains open in [the existing register](../../audit-results/four-pillars/ABA-OPEN-QUESTIONS.md). This is a proposed companion boundary and intake workflow, not a launched internal product.
