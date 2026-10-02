# Merchant integration with coding agents

Use the community-maintained `aba-payway-integration` skill to add PayWay to an existing merchant project or build a new integration. TypeScript/JavaScript recipes target Express and Next.js. They demonstrate local execution; they do not certify a merchant deployment or ABA production approval.

## Install and discover

Before publication, install the release owner's reviewed `aba-payway-ts-<version>.tgz` with `npm install /path/to/the-reviewed-package.tgz`. After an approved npm release use `npm install aba-payway-ts`. Then:

```sh
npm exec -- payway-sdk skills add codex --only aba-payway-integration
npm exec -- payway-sdk skills doctor --agent codex
# Other existing targets: claude, cursor, opencode, copilot.
# For a project-specific destination, pass --dest <skills-directory>.
```

The integration skill includes its own references and executable recipe sources. Copying the complete `skills/aba-payway-integration/` folder into a client's documented skill directory also works; do not copy SKILL.md alone. The existing first-payment skill remains the focused one-payment journey.

## Use the skill in chat

The skill guides your coding agent. The SDK/CLI supply executable tools; optional MCP exposes tools to a client. Installing the skill does not configure a merchant or prove a payment works.

After installation, ask your agent to use **aba-payway-integration** by name. Where supported, use the client's explicit skill picker or invocation; Codex supports `$aba-payway-integration`. You can also ask it to read the installed SKILL.md. For a manual copy, include the complete folder with references/assets.

Start with:

> Use aba-payway-integration. Explain how to use it for this project. Compare suitable payment flows, identify what I need, and give me the next prompt. Do not change files or contact PayWay.

The agent should explain the relevant choices and prerequisites, distinguish documented versus executable support, and suggest a prompt suited to your project. If no project is available, it can describe the journey and ask which platform/payment scenario you want. A usage question does not initiate code changes, provisioning or payments.

### Choose the task you want

| Task | Example prompt | Expected result |
|---|---|---|
| Learn the skill | “Use aba-payway-integration. Walk me through installation, task choices and the information I should provide.” | A usage walkthrough and starter prompts |
| Choose a flow | “Compare QR, hosted checkout and payment links for my shop; recommend a route and explain its prerequisites.” | Options, recommendation and entitlement/stack limits |
| Plan | “Inspect this Next.js shop and plan hosted checkout using our existing orders and database. Do not edit files yet.” | Project findings, selected references, implementation steps and open questions |
| Implement | “Add PayWay online QR to this Express shop. Reuse our authentication, server prices and durable database.” | Project changes, relevant checks and remaining merchant prerequisites |
| Review/test | “Review this integration for verification, duplicate callbacks and lost-response recovery. Run local checks only.” | Findings, local test evidence and unrun gateway cases |
| Troubleshoot | “This linking call returns 104. Explain the endpoint/profile blocker using masked evidence.” | Diagnosis and enablement/recovery action without a blind retry |
| Assess launch readiness | “Assess our production and settlement readiness against G0–G7. List missing evidence; do not move money or deploy.” | Gate statuses, owners, blockers and next steps |

The agent follows the requested task; these are prompt examples rather than special CLI commands or mandatory approval stages. Implementation requests can proceed within the chosen project scope. A real gateway test or funds movement needs authorization for its actual operation/environment/amount scope.

### Give useful context

Provide the project/framework, what customers should do, currencies, existing order/authentication/database/worker architecture, enabled methods if known, and the desired task. The agent can infer code facts and mark missing merchant facts unconfirmed. For example:

> Use aba-payway-integration to plan payment links for our authenticated Express invoicing app. Orders and prices live in PostgreSQL; invoices use USD. Explain callback verification and unknown-outcome recovery. Merchant enablement is unconfirmed. Keep this planning-only.

Do not paste keys, tokens, card data, passwords or complete account details. Identify server-side secret references or confirm whether credentials are configured. For troubleshooting include the endpoint, masked code/message, attempt reference and correlation/trace ID.

### Understand the result and continue

Expect the selected task/flow, project facts, prerequisites and relevant references, changes/checks actually performed, separate simulated/sandbox/production/settlement evidence, and the next action. A plan has no implementation pass; a local test pass is not a live payment or settlement pass. Advanced workflows can remain blocked by product contracts or merchant enablement.

Continue with “Implement the agreed flow using our existing architecture,” “Explain this blocker,” or “Resume from the saved attempt and diagnose the uncertain result without creating another payment,” as appropriate. Keep the masked profile and evidence with the merchant project; a later session can use them to resume.

If the agent cannot find the skill, check the complete folder is in that client's documented loader path, run skills doctor for an installer-managed destination, and follow the client's reload/discovery instructions. Reinstallation preserves edits; review doctor/upgrade conflicts before overwriting customized files.

Additional integration examples:

- “Add PayWay online QR to my Express shop. Reuse our authenticated orders and database.”
- “Add hosted checkout to this Next.js application and verify payments on the server.”
- “Create invoice payment links and handle unsigned pushbacks safely.”
- “Recover this timed-out create without submitting a second payment.”
- “Our COF call returns 104. Confirm the contract and explain the enablement prerequisite.”

## Integration journey

Inspect the framework, order/pricing source, authorization, persistence, jobs and tests. Select the payment flow and confirm required capabilities. Implement create → customer interaction → verify → fulfill → recover using the existing application architecture.

Credentials stay in server-side environment/secret storage. The browser sends an order identifier, never an authoritative price. Persist an attempt and its unique identifier before PayWay submission; keep it after a timeout. Atomically accept verified payment evidence and insert a uniquely keyed fulfillment job. Make the worker's downstream effects idempotent too.

Signed online callbacks require SDK verification. Unsigned notifications require inquiry; never fulfill from the notification body or browser redirect. Match known order identity, original currency and amount due. Payer debit currency can differ. Missing callback does not mean unpaid; PRE-AUTH does not mean captured.

## Capability and verification matrix

This table distinguishes existing evidence from work performed by the integration recipes. “Dated sandbox” describes earlier repository campaigns, not a fresh test for every merchant/profile. Offline recipe tests use synthetic providers. Every merchant must verify its enabled methods, callbacks and production configuration.

| Workflow | SDK / CLI entrypoint | Configuration and enablement | Verification, callback and recovery |
|---|---|---|---|
| Online QR | `qr.generateQr` / `generate-qr` | Merchant ID/API key; public callback URL; enabled currency | Dated sandbox campaigns Aug–Sep 2026. Lifetime seconds, minimum 180. Route-correct signed notification + inquiry; save unique transaction ID. |
| Hosted checkout | `checkout.getCheckoutFormHtml` / `checkout-form --payment-gate 0` | Merchant credentials; selected method; callback and browser success URLs have different purposes | Dated sandbox Sep 2026. Browser form POST to PayWay, not a saved gateway HTML shell. Lifetime minutes. Verify and inquire by saved transaction ID. |
| Payment link | `paymentLink.create/getDetails/void` / `payment-link` | Merchant credentials and RSA public key; public return URL | Dated sandbox Sep 2026. Unsigned pushback. Save `data.id` plus unique merchant reference. Inquiry must bind payment to that link/order; create's top-level tran_id is not the paid transaction ID. Void is permanent and not idempotent. |
| Offline KHQR | `qr.generateOfflineQR` / `generate-qr --offline` | ABA-issued KHQR merchant data; pushback enrollment | Generation tested offline; issuance/enrollment merchant-specific. CRC is not HMAC. Unsigned notification and inquiry; account for repeated payments. |
| Customer Printed QR | `khqr.getTransactionsByMerchantRef` / `get-transactions-by-mc-ref` | Merchant Portal customer/QR configuration and notification enrollment | Dated captured Customer Module callback is signed; confirm the profile/version and use SDK verification. Separate from unsigned offline KHQR. Reference inquiry has a 50-row limit; retain receipt identity/checkpoint and deduplicate. |
| COF account/card linking | `credentialsOnFile.linkAccount/linkCard/getLinkCardFormHtml` / `cof link-account/link-card/link-card-form` | Required request ID, customer ID, linking flag; tokenization enablement | Dated Sep 2026 request/hosted-error evidence; successful full token cycle remains profile-dependent. Token arrives through callback. Verify endpoint-specific callback contract; hosted HTML is not token success. |
| Token details/renew/remove | `credentialsOnFile.getTokenDetails/renewToken/removeToken` / `cof token` | Account/token permissions; details uses request ID only; remove uses customer ID and token | Endpoint-shape evidence; full lifecycle requires a valid token. Account renewal restarts the local approximate 90-day window. Removal is irreversible. |
| Stored-token payment | `credentialsOnFile.payment` / `cof charge` | Valid token and charging flag; merchant enabled | Contract/offline tests; successful cycle depends on enablement. Persist a unique attempt before charging; inquiry before retry. |
| Subscription registration | Purchase with `ctid/tokenFlag/frequency` / `generate-checkout` | Subscription-enabled profile | Sep 2026 hash/104 blocker evidence; no claim of completed recurring cycle on a disabled profile. Use verified SDK hash order; inquire ambiguous charges. |
| Refund | `checkout.refund` / `refund` | Paid refundable transaction, balance, method support; RSA where required | Dated sandbox evidence. Confirm eligible paid amount and prior refunds first; never blind-retry money movement. Standard refunds after payout/split are not supported. |
| Pre-auth | Purchase pre-auth; `preAuth.complete/completeWithPayout/cancel` / `pre-auth` | Card pre-auth enabled; capture window merchant-specific | Dated sandbox evidence; default capture window 30 days, no auto-release webhook. PRE-AUTH is a hold, not fulfillment proof. |
| Beneficiaries, payout and split payments | `payout.addBeneficiary/updateBeneficiaryStatus`, `payout.payout`; purchase/QR/link payout options / `beneficiary`, `payout`, route-specific `--payout` | RSA key, enabled payout service, whitelisted currency-compatible beneficiary | Existing sandbox whitelist/error evidence; payout remains enablement-specific. Standalone/QR entries use account/amount; purchase/link entries use acc/amt. |
| Transaction status/detail/list | `checkout.checkTransaction/getTransactionDetail/getTransactionList` / corresponding transaction commands | Merchant credentials; endpoint rate limits | Dated sandbox evidence. List windows use gateway UTC+7; unpaid QR may be absent. Inquire exact saved IDs rather than inferring from lists. |
| Local close/expiry policy | `checkout.closeTransaction` / `close-transaction` | Merchant order policy | Dated channel-dependent evidence. No remote CLOSED/EXPIRED status; closed hosted-card sessions may still pay. Reconcile late payments. |
| Exchange rate | `checkout.getExchangeRate` / `exchange-rate` | Merchant credentials | Dated API evidence. Preserve returned units/types; do not infer settlement amounts from current rates. |
| Soundbox QR | `qr.requestQr` / `request-qr` | Soundbox provisioning, callback and merchant enablement | Spec-derived, not live-verified. Amount omitted means device entry; contract/hash confirmation required before asserting readiness. |
| Partner activation | `selfActivation.registerMerchant/getCredentialInfo/getMerchantInfo` / `self-activation` | Partner credentials/RSA, not merchant credentials | Spec-derived, not live-verified. Partner auth and endpoint-specific HMAC algorithms; never fabricate partner access. |

Confirm exact symbols and parameter shapes in the [SDK/CLI reference](../../knowledge/sdk-cli-reference.md); correct this table when the implementation or ABA contract changes. Official onboarding and endpoint documentation: [ABA Developer Suite](https://developer.payway.com.kh/). Soundbox/partner contracts originate from the ABA-shared spec; no public documentation URL or redistribution right is implied.

## Recipes and completion criteria

Use [structured intake and G0–G7](../../knowledge/integration-onboarding.md), [contract/version and callback policy](../../knowledge/integration-contracts.md), [UI/mobile acceptance](../../knowledge/integration-ui.md), [advanced operation controls](../../knowledge/integration-operations.md) and [receipt-to-bank evidence](../../knowledge/integration-finance.md) selectively. Core recipes implement QR, hosted checkout and one-payment links; advanced/adjacent workflows retain operation-specific contract and enablement limits. There is no implication of completed live, production or settlement acceptance.

Read [Express and Next.js recipes](../../knowledge/integration-recipes.md), [callbacks](../../knowledge/callbacks-webhooks.md), [payment-link handling](../../knowledge/payment-link.md), and [deployment checklist](../../knowledge/deployment-checklist.md) as applicable.

Complete only when project checks pass, prices/ownership are server-controlled, attempts survive unknown outcomes, verification binds payments to stored orders, acceptance/jobs are durable and duplicate-safe, and recovery handles missing callbacks. Report simulation, offline checks, dated sandbox evidence and current-profile blockers separately.

## Updates and maintainer responsibilities

Re-run `skills add <agent> --only aba-payway-integration` to upgrade. The installer preserves customized resources; doctor reports stale or missing files. Review conflicts before using --force-skills. Manual folder installs need manual updates.

Maintainers update curated public sources and recipe sources, run `npm run sync:knowledge`, then verify recursive skill mirrors, navigation/provenance, installation and behavior tests. Rerun agent trials when routing, SDK usage or safety decisions change. Keep raw gateway evidence and agent transcripts private. Publish only after the exact candidate's release gates and owner approvals are complete.
