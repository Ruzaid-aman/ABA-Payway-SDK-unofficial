# Integration profile, onboarding and acceptance

## Project intake

Inspect existing orders, authorization, database, workers, payment providers, deployment and checks before changing code. Populate the profile below from code/configuration where possible. Ask only consequential unresolved questions; continue offline work while provisioning is pending. Record unknowns and assumptions rather than inventing values. Never collect secret values or complete account numbers.

| Profile section | Record |
|---|---|
| Business | Merchant/partner role, payment trigger, one-time/recurring, fixed/customer-entered amount, volume, refund/hold/distribution needs |
| Stack | Framework/runtime/version, plugin/native/web/POS/Mini App, database, serverless/distributed constraints, session resolver, order and worker model |
| Identity | Environment, protected MID reference, tenant mapping, outlet/terminal/app references, invoice/attempt/receipt ID rules |
| Methods | Enabled/disabled/unverified for each selected method, scheme, currency and operation; no logo or sandbox registration proves entitlement |
| Accounts | Protected settlement account/currency references, report access, fee agreement, payout source and beneficiary process separately |
| URLs/network | Service callback, customer success/cancel, app return, default profile callback; domain whitelist; outbound egress and inbound WAF/TLS controls separately |
| Owners | Developer, deployment, product, finance, operations/support, ABA approval reference, rollback owner |
| Evidence | Contract/version, test fixture/simulator build/device, checks, masked traces, production rule, report schema/access and reviewer |

Check whether each outlet requires its own profile, callback, account/report mapping or portal access. Pin environment/MID/tenant/configuration version in durable attempts and jobs; reject a mixed configuration at startup.

## Flow selection

Evaluate a verified official plugin first for a supported e-commerce platform. For default web checkout use the expected plugin popup; merchant app WebViews use the approved full-screen hosted journey. Follow [checkout UI requirements](integration-ui.md#default-e-commerce-checkout-requirements) for enabled methods, policy consent, branding, return and screen review. Bottom-sheet and hosted-QR availability require their own supported contract and entitlement; custom styling does not authorize raw-card handling. Choose online QR for scan/second-screen, offline KHQR for approved local invoice batches, payment links for sharing, COF for consented saved-method charges, and pre-auth for holds. Payout/distribution requires an approved commercial model and funds source. POS/ECR, ABA Mini Apps, partner provisioning and BillZone need separate contracts.

## Sandbox readiness

Start with [official PayWay overview](https://developer.payway.com.kh/overview-865678m0) and [checkout onboarding](https://developer.payway.com.kh/ecommerce-checkout-3158159f0). Verify the current registration/approval/email flow before describing its screens. Separate MID, API key, RSA/public key and portal credentials by purpose and lifetime. Use local secret references; never request secrets in chat.

Run masked local configuration checks, then non-financial connectivity where supported. A paid sandbox cycle needs the user's scoped authorization. Record the intended merchant/outlet and enabled method/currency. Get current official test cards and simulator installation/build/account instructions from ABA; do not substitute another provider's fixtures or publish reusable simulator account secrets. Record OS/device/build, protected account reference, attempt/time, scan/deeplink/cancel/result and callback/inquiry evidence. Label injected callbacks and synthetic providers explicitly.

Domain and IP whitelists differ. For migrations retain approved old/new egress configuration during controlled overlap, test both paths and document rollback. Current hosting policy, source ranges, port rules, account limits and simulator expiry require ABA confirmation.

## Merchant gates

These are merchant acceptance stages, separate from package release checks.

| Gate | Pass requires |
|---|---|
| G0 scope | Selected operations, profile, methods/currencies, UI, outlet/account mapping and limitations agreed |
| G1 sandbox ready | Usable credentials/entitlements, current fixtures/simulator, reachable callback |
| G2 implementation | Contract/signing checks, authorization, durable state/receipt/outbox, tested UI |
| G3 sandbox accepted | Applicable real sandbox scenarios; API/callback/query/order/ledger/UI evidence agree |
| G4 production ready | Business/product approvals, Integration Team checkout/KHQR screen approval before production credentials are released, scoped credentials/network/portal/report access and controlled test authorization |
| G5 production acceptance | ABA's existing required transactions executed and verified in the deployed flow |
| G6 settlement verified | Approved receipt/operation/report/bank joins, fee/FX/currency/account checks and authorized finance/ABA signoff |
| G7 handover | Monitoring, reconciliation, support ownership, operator training and rollback accepted |

Each record contains status (passed/failed/blocked/pending/not-applicable), environment, operation, owner, checked-at, evidence and blocker or N/A reason. Use the installed evidence template. Unrun tests are not passed. ABA must supply the production rule's counts, amounts, methods/currencies/outlets/operations and allowed launch conditions before G5/G6. Do not multiply an unapproved matrix into real-money operations.

## Production and rollback

Load the actual agreement, production acceptance rule, required reports and observation period before controlled production testing. Record authorization for operation/environment/account/amount/currency/beneficiaries/limits, reusing authorization already provided for that scope. Approval to generate code is not approval to move money.

On rollback disable **new production initiation** while continuing production callback acceptance, inquiry, ledger and fulfillment recovery for existing attempts. Retain the required keys and contract adapters. Debug in a separate sandbox environment; never change live callbacks/jobs to sandbox. Go-live confirmation, portal activation expiry and support SLA must follow current ABA policy.
