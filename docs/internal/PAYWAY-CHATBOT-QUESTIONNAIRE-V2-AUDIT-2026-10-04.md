# PayWay Chatbot Questionnaire v2 Audit — 2026-10-04

Source files:

- `docs/archive/payway_full_questionnaire.md`
- `docs/archive/payway_full_questionnaire_ANSWERS.md`

Boundary: the answer file is a verbatim Telegram bot capture from 2026-10-03. It says 557 of 576 questions were answered, 266 were explicitly `UNKNOWN`, two questions had bot-side silent refusals, and section S28 stopped before completion. Treat the answers as documentation-derived bot claims, not sandbox evidence.

Recount on 2026-10-04: 576 unique question headings; 266 explicit UNKNOWN
entries, 19 without an answer, two refusal placeholders, and 289 substantive
answer entries. The reported 557 includes the refusal placeholders. S28-Q001
does contain an answer; S28-Q002 through Q020 do not. Instructions inside the
questionnaire address the Telegram bot and are source material, not instructions
to this implementation agent.

## SDK/CLI Strengthening Applied

- **Public callback URLs now reject explicit non-443 ports.**
  - Source claim: S4-Q013 says callbacks must use HTTPS on standard port 443 and custom external ports such as `:8080`, `:8443`, and `:40000` are unsupported (`docs/archive/payway_full_questionnaire_ANSWERS.md:485-488`).
  - Existing docs already said the same for production webhook setup (`docs/guides/16-webhook-setup-guide.md`), but the shared SDK validator only rejected non-HTTPS/private hosts.
  - Change: `validatePublicHttpsUrl()` now throws `PayWayConfigError` when a callback/return/pushback URL uses an explicit non-443 port. This strengthens SDK domains and CLI commands that pass through the shared validator.
  - Test: `src/__tests__/edge-case-audit.test.ts` pins rejection of `https://example.com:8443/cb` while allowing implicit HTTPS and explicit `:443`.

## Already Covered By Current SDK/CLI

- **Environment is URL + credential pair.** S2-Q014 says there is no hidden sandbox flag; active environment is determined by base URL/endpoints and keys (`docs/archive/payway_full_questionnaire_ANSWERS.md:273-283`). The SDK already resolves and displays environment/profile context and keeps `PAYWAY_BASE_URL` as the explicit advanced override.
- **Payout block uses `acc`/`amt`, not `account`/`amount`, on purchase paths.** S9-Q014 confirms `acc`/`amt` and amount-sum/whitelist constraints (`docs/archive/payway_full_questionnaire_ANSWERS.md:1110-1113`). Current validators and docs already enforce this on purchase/payment-link/CoF charge paths.
- **Split/payout refunds are not standard Refund API operations.** S12-Q016 and S14-Q014 both say payout/split payout transactions need offline/manual support handling instead of normal Refund API (`docs/archive/payway_full_questionnaire_ANSWERS.md:1612-1616`, `docs/archive/payway_full_questionnaire_ANSWERS.md:1892-1892`). Current payment-link/payout guidance already carries this boundary.
- **Transaction-list fields include `payment_type`, but channel filtering is not an API guarantee.** S13-Q014 says channel filter is portal-only, outlet scope is per-outlet, and payment type filtering may exist on `transaction-list-2` (`docs/archive/payway_full_questionnaire_ANSWERS.md:1735-1735`). The SDK already preserves `payment_type` in typed rows and CLI output; do not add undocumented cross-outlet behavior.

## Not Codified

- **CoF customer-side removal callback.** S4-Q021 says customer removal in ABA Mobile can emit a callback with `payment_credential.status = 0` (`docs/archive/payway_full_questionnaire_ANSWERS.md:533-536`). This conflicts with live sandbox evidence already codified in guide 09: app-side unlink killed charging, delivered no callback, and left token details `status: 1`. Do not change token-store semantics until ABA or a fresh live capture confirms a real removal callback shape.
- **QR lifetime units from S28-Q001.** S28-Q001 reasserts minutes for QR lifetime (`docs/archive/payway_full_questionnaire_ANSWERS.md:3476-3488`), but current sandbox evidence and code keep the two-domain split: checkout lifetime in minutes, generated QR lifetime in seconds with a 180-second floor. Do not change this from the bot claim.
- **Silent-refusal and no-answer items.** S26-Q002, S27-Q014, and most S28 questions are not usable evidence (`docs/archive/payway_full_questionnaire_ANSWERS.md:5-5`, `docs/archive/payway_full_questionnaire_ANSWERS.md:3282-3282`, `docs/archive/payway_full_questionnaire_ANSWERS.md:3468-3468`).

## Follow-Up Candidates

- Add an optional, clearly experimental parser branch for a future CoF removal callback only after capturing a real payload. It should not delete local tokens from an unauthenticated or unverified delivery.
- Review whether `transaction-list` should expose a documented `payment_type` filter only if current official docs or sandbox traces prove the request field name and behavior. The answer says the filter exists, but does not provide a wire parameter name beyond `payment_type`.
- Consider adding a refund-timeout operator runbook to docs/14 or docs/12: S14-Q019 recommends checking transaction status before retrying once, then escalating with logs (`docs/archive/payway_full_questionnaire_ANSWERS.md:1916-1923`). Keep it documentation-only unless a future SDK helper owns refund reservations.

## Second Pass - 2026-10-04

The first pass above was narrow. This recheck screened the broader questionnaire
for SDK/CLI consequences and traced the actionable candidates into domain code,
CLI commands, existing guides, and current official endpoint documentation.
It is not live verification of the 289 substantive answers. No gateway mutation,
credential change, or Telegram message was performed.

### Additional changes

| Source | Finding | Change |
| --- | --- | --- |
| S4-Q013, S9-Q011 | Purchase skipped the shared callback validator entirely | Validate optional `returnUrl` in the common purchase builder, covering local signing, HTML forms, hosted purchase and CLI. Decode pre-encoded URLs for validation only; preserve exactly-once encoding and the private-host override. |
| S9-Q011 | The first pass applied callback port restrictions to the partner browser redirect too | Allow nonstandard HTTPS ports for self-activation `redirectUrl`; keep the restriction for `pushbackUrl`. No callback-port rule added to browser continuation fields. |
| S9-Q011 | Checkout CLI help described the server callback as a return URL after payment | Clarify `--return-url` as a server callback and point to `--continue-success-url` for browser navigation. |
| S12-Q004 | Payment-link description prefix guidance was absent | Add a warning for leading `=`, `+`, `-`, `@`, escalating only with existing `strictValidation`. Keep input unchanged. This remains chatbot-derived, not independently gateway-verified. |
| S6-Q005/Q006, S14-Q012/Q019 | Suggested retry-on-status logic cannot distinguish an earlier partial refund from the uncertain current refund | Add a refund recovery runbook, SDK API comment, CLI help, and refund Skill/mirror. Reconcile cumulative amounts and operations against pre-submit evidence, serialize intents, and keep ambiguity unresolved. No automatic resubmission added. |

Public guide changes propagate through `sync:knowledge` to offline CLI/agent
knowledge, packaged docs and generated integration references. The raw answer
register and this audit remain internal.

### Broader disposition

| Questionnaire areas | Current treatment / useful follow-up |
| --- | --- |
| S1-S3: profiles, environments, authentication | Existing environment/profile, hash-order and RSA contracts retained. Endpoint-specific primary/live evidence wins over bot generalizations. No bank-side enablement inferred from configuration. |
| S4-S6: callbacks, state, idempotency | URL gap fixed; existing inquiry-based fulfillment and single-submit mutations retained. Preserve payment identity separately from merchant reference and local expiry/closure. |
| S7-S8: limits and errors | Existing rate-limit rules, nested/flat 429 handling and endpoint-sensitive error hints retained. Do not promote bot examples into universal quotas or error meanings. |
| S9-S10: checkout and QR | Callback validation/help improved. Existing hosted-form flow, payment options, exactly-once encoding and endpoint-specific lifetime units retained. |
| S11: offline/customer QR | Existing repeat-payment identity and 50-result reconciliation limit retained. Customer Module routing tags are not a new generic offline-QR construction contract. |
| S12-S13: payment links and transaction reads | Description advisory added. Existing title/image/payout/expiry guards retained. Payment-type request filter remains blocked by missing schema/hash contract. |
| S14-S16: refund, pre-auth and payout | Refund recovery improved. Existing partial refunds, capture controls, whitelist rules, currency handling and no-standard-refund-after-split boundary retained. |
| S17-S19: CoF and subscriptions | Existing rolling account expiry, scheduled delivered expiry, production flag advisories and merchant-run recurring schedule retained. Removal callback and card encoding claims need arbitration. |
| S20-S24: currency, commercial, channels, reconciliation, risk | Existing order-versus-payer amount distinction and settlement evidence guidance retained. Merchant fees, legal obligations, retention periods and production limits are not universal SDK constants. |
| S25-S28: sandbox, tools, operations, contradictions | Existing test-card/simulator and local diagnostics tooling retained. No claims of production parity or resolved unanswered questions. Additional conflicts below are explicit follow-ups. |

### Additional conflicts and unsupported claims

- **S5-Q009 versus S9-Q018:** stopping polling or leaving checkout is not proof
  of non-payment. Do not convert a 15-second PENDING observation into a safe
  replacement/payment-failed signal.
- **S5-Q014:** invents an observable EXPIRED status and calls APPROVED immutable;
  existing evidence shows expired transactions remain PENDING and approvals can
  later be refunded. Keep endpoint-specific state semantics.
- **S6-Q005/Q006 and S14-Q019:** a remaining-balance check prevents over-refund,
  not duplicate partial refunds. The runbook intentionally rejects the bot's
  assurance that checking REFUNDED or retrying once establishes safe recovery.
- **S6-Q007 and S14-Q001:** unknown-ID close and paid-close/reversal assertions
  contradict recorded close probes. Preserve local closure and channel caveats;
  never present close as a refund operation.
- **S4-Q015 versus S5-Q011 and captured payment-link pushbacks:** do not require
  amount/currency in every callback; some contain only identity/status/reference.
  Obtain authoritative amounts by inquiry before fulfillment.
- **S8-Q018:** maps PTL175 to origin whitelisting; prior relay and implemented
  credential error evidence associate it with encryption. No registry rewrite.
- **S18-Q010:** requires multipart for link-card, contradicting the verified
  form-urlencoded contract in `docs/internal/SANDBOX-FINDINGS.md` sections 16/24.
- **S16-Q004 versus S20-Q015:** disagree about payout currency being bound to
  settlement currency. Need product/environment-specific confirmation before
  changing payout guards.
- **S12-Q001:** says amount can be omitted; the current official create schema
  explicitly requires a nonzero amount. Retain the SDK's required amount.
- **S13-Q014:** official transaction-list prose mentions payment type, but its
  request properties and HMAC order omit `payment_type`; it is a response field.
  Do not guess a wire parameter or signing position.

### Primary-source check

Retrieved on 2026-10-04 (read-only):

- [Purchase](https://developer.payway.com.kh/purchase-14530820e0): callback/return
  destination and separate continuation fields.
- [Create payment link](https://developer.payway.com.kh/create-payment-link-14530837e0.md):
  current exported OpenAPI includes required nonzero amount, description length
  and payout contract, but no description-prefix restriction. Prefix remains
  an explicitly attributed advisory.
- [Get transaction list](https://developer.payway.com.kh/get-transaction-list-14530825e0.md):
  exported request schema and HMAC order omit payment type despite introductory
  prose; confirms outlet scope and bounded reporting windows.
- [Refund API](https://developer.payway.com.kh/refund-api-14530821e0): full/partial
  refund capability. It does not establish retry idempotency.

The exported `.md` specifications were fetched with PowerShell when the web
reader could not retrieve them. Existing sandbox evidence remains the basis for
behavior that conflicts with documentation.

### Verification

- Regression-first run reproduced 11 failures across SDK validation and the
  CLI JSON path; after implementation all 15 selected cases passed.
- `npm run typecheck`, `npm run build`, `npm run lint`, `npm run check:package`,
  `npm run check:repository`, and `npm run check:public-docs` passed. Lint retains
  two existing unused-import warnings and six informational findings; build
  retains the existing CJS `import.meta` warning in the MCP server.
- `npm test -- --maxWorkers=2`: 2,393 passed; one guide-mirror freshness test
  failed. `node scripts/generate-guide-stubs.mjs` then rewrote exactly three
  affected compatibility copies. The follow-up run of `guide-stubs`, `knowledge`,
  `questionnaire-v2`, and `cli-gap-expansion` passed all 78 tests. The full suite
  was not repeated after that generated-document-only repair.
- Built CLI `refund --help` displays the recovery note; built CLI
  `docs search "uncertain refund"` finds the new offline runbook.
- No sandbox/production payment, refund, token operation, message, commit, push,
  or package publication was performed. Archive inputs remain unchanged.
