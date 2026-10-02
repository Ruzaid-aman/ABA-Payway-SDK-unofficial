# Advanced operations, incidents and companion boundaries

These are merchant design checklists using existing SDK operations, not claims of completed end-to-end integration. Load only the selected module and obtain its contract/entitlement. Every funds-out/charge/capture action needs authorization within its actual environment/account/amount scope.

| Module | Implement and persist | Required tests / missing-contract behavior |
|---|---|---|
| Offline/Printed QR | ABA-issued profile/templates, TLV/CRC vectors, safe bulk invoice references and manifest; individual verified gateway receipts, invoice allocations and excess/late-payment exceptions | Unicode/field lengths/precision/CRC, thousands-of-invoices duplicates, multiple genuine receipts, expiry and complete recovery. Signed Customer Module and unsigned offline contracts are distinct |
| Reusable links | Link ID/reference/count/expiry/outlet, each actual paid receipt and aggregate totals separately | Limit/expiry races, excess/partial receipts, sharing/retiring URL. Core recipe supports one exact-price payment only |
| COF | Encrypted environment/MID/tenant/customer token vault; consent purpose/version/time and revocation; linking separate from purchase; durable invoice/cycle charge lock | Account/card link/cancel/renew/remove, unauthorized token, duplicate cycle, decline, relinking and post-revocation jobs. Confirm CIT/MIT flags and provider-versus-merchant scheduling to avoid two schedulers charging |
| Pre-auth | Hold ID/method/amount/expiry; separate capture/cancel operations with atomic lock and saved uncertain intent | Lower/equal/approved higher amount, expiry/remainder release, duplicate/race. No invented incremental/re-auth API; hold is not revenue |
| Refund | Verified eligibility/balance/method/window/feature; atomic reservation for completed and in-flight refund amounts; operator approval/reason and parent operation | Concurrent partial/over-refund, timeout retained reservation, final history/refund amount and actual finance effect. No invented standalone refund-status API |
| Payout/split | Commercial approval, source funding/currency, whitelisted beneficiaries, signed/encrypted endpoint fields; durable intent/allocations and source/per-beneficiary outcomes | Currency/allocation/fee/residual rules, existing beneficiary, partial result and lost response. Query the original approved operation or escalate unknown; never regenerate and repeat possible successful transfer |
| Plugin | Official source/version/platform/features, configuration/URL mapping and supported extension points | Customer order/rounding/cancel/duplicates, custom hook double fulfillment, backup/upgrade/rollback. Do not edit plugin internals by default |
| POS/ECR | Approved hardware/firmware/protocol/transport, basket/terminal/gateway mappings | Cable/Wi-Fi disconnect, approved terminal/lost POS reply, duplicate/cancel/receipt, close/refund/settlement under terminal contract |
| ABA Mini Apps | Approved app/profile/environment/domains/method rules and same-app return | Session/app navigation, disabled profile, allowed payment selection. Telegram/browser guidance does not establish ABA Mini App support |
| Partner | Authorized provisioning/legal/credential handoff and per-merchant contracts/keys/reports | Tenant isolation, legacy/new callbacks, failover/config migration; spec-derived activation endpoints alone do not certify a partner platform |
| BillZone | Authoritative bill/customer/balance validation; payment acceptance separate from biller posting; suspense/correction/reconciliation | Stale/already-paid invoice, approved payment with unavailable posting, duplicate retry and refund/correction. Separate product contract and UAT owner required |

## Operators and monitoring

Separate view permissions from refund/capture/payout/beneficiary changes. Record operator, approval, purpose, money, references and outcome in a restricted audit record. Finance screens show operation requested/processing/completed/declined/unknown separately and retain receipt/outlet/staff mappings only when actually supplied or locally verified.

Measure initiation/approval by method, pending/unknown age, callback valid/invalid/duplicate/persisted/ACK/processed/failure/lag, inquiry errors/429, outbox failures, refund/payout age and finance discrepancies. Choose thresholds from approved policy and measured baseline, not invented SLA. Reuse SDK correlation/trace IDs with order/receipt/environment/MID joins; never log raw token/PAN/CVV/key/PII.

## Runbooks

| Incident | Safe recovery and evidence |
|---|---|
| Lost response/missing callback | Preserve attempt; query original reference within contract limits; verify receipt and post once; unknown is not failure |
| Callback/DB/queue outage | Do not ACK lost acceptance; restore durable intake; reconcile missing deliveries; record outage/lag and masked IDs |
| Fulfillment failure | Retry durable outbox using downstream order/job identity; never create another payment |
| Key expiry/rotation | Confirm replacement/environment/version and overlap; keep adapters needed by in-flight records; test approved old/new vectors |
| Whitelist/profile disabled | Gather endpoint/environment/time/trace and protected egress/MID references; request authorized ABA confirmation, not signing workaround |
| Report unavailable/finance mismatch | Mark pending/exception with owner and expected cycle; preserve original records; no heuristic self-signoff |
| Rollback | Disable new initiation while retaining production receipts/callbacks/query/recovery; retire keys/adapters only after approved resolution |

## Public and internal editions

Public skill resources contain merchant implementation guidance, approved public sources and synthetic fixtures. Internal profile operations, reports, acceptance policy, support staffing/Jira/VIP/SLA and restricted captures belong in a separately access-controlled ABA companion with current owner approval. Excluding internal files from npm does not establish internal workflow access or a supported companion. Mark uncontracted adjacent workflows blocked/planned rather than generating fictitious APIs.
