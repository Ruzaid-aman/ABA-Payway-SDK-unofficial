# Contracts, source authority and callbacks

## Contract record

For each selected operation record: exact endpoint/version/method/environment; request/response content type; required/conditional fields, types, enums, lengths/units; omission/null/empty semantics; final wire serialization; credential/key/signing/encryption; response/request status versus financial state; IDs; limits/window/retry safety; callback signature/ACK/identity; source URL/version/date/environment/profile, reviewer and unresolved conflicts.

Use the existing [SDK/CLI reference](../reference/SDK-AND-CLI-REFERENCE.md) and actual SDK symbols. Public documentation samples alone do not supply every missing schema field. Generated source hashes establish freshness, not API-owner approval. Mark facts as official documentation, dated sandbox observation, approved internal contract, local design or unconfirmed. Preserve an exact conflict rather than blending sources.

Official sources rechecked 2 October 2026:
- [Current inquiry](https://developer.payway.com.kh/check-transaction-14530826e0): seven-day window.
- [Historical detail](https://developer.payway.com.kh/get-a-transaction-details-14530824e0): ten/minute and unsuitable for real-time processing checks.
- [Checkout](https://developer.payway.com.kh/ecommerce-checkout-3158159f0): JSON POST notification and signature header.
- [KHQR](https://developer.payway.com.kh/khqr-guideline-3192101f0): whole KHR and multiple receipts.

Scope: retrieved public pages; reviewer: implementation agent; no production/profile approval or complete cross-language vectors claimed. Revalidate when sources or API versions change.

## URL and callback routing

| Service | Notification and verification | Customer return |
|---|---|---|
| Checkout/online QR | Configured service URL; signed contract uses SDK header verification, then saved-attempt inquiry | Success/cancel/app navigation never proves payment |
| Payment Link | Dated sandbox unsigned JSON pushback to return_url; lookup the saved link/ref and approved receipt association | Share only intended public URL |
| Offline KHQR | Enrolled profile URL; unsigned notification; authoritative inquiry and unique gateway receipt | QR scan is payer interaction |
| Customer Printed QR | Captured Customer Module callback is signed; apply explicit profile/version contract and SDK helper | Distinct from offline KHQR |
| COF linking | Separate linking schema; account callback canonicalization remains unresolved; use documented token-detail verification | Linked token is not a paid purchase |
| Partner/payout/adjacent | Require their own approved schema/key/ACK/identity | Never borrow checkout semantics |

Do not select an unsigned policy because a signed callback lacks a header. Bind the configured service/profile/version first; missing/invalid signature rejects signed routes. Unknown variants remain blocked or enquiry-only under an explicitly approved contract.

## Canonicalization and durable acceptance

Reuse SDK signing/verification helpers. Sign the final transmitted values with endpoint-specific field order; preserve lifetime units, request time and endpoint payout field names. Constant-time comparison alone does not prove PHP/JavaScript nested JSON/Unicode/boolean serialization parity.

A golden vector needs a non-secret fixture key, fields, canonical bytes/string, digest and exact wire payload. Include optional/null/empty, decimal, Unicode, URL/array cases and changed/reordered fields. Obtain API-owner approval and run identical vectors before claiming a new language.

Validate required business fields, allow extra properties, enforce body/queue bounds and scoped key selection. Persist a validated minimal hint/receipt identity before successful ACK. The worker queries trusted saved records; callback amount/status or a browser redirect cannot directly fulfill. Match receipt identity and immutable obligation; atomically post once and enqueue an idempotent fulfillment job. Preserve protected evidence/digests only under approved retention.

The recipes default to HTTP 200 with RECEIVEOK **after durable acceptance**, and expose ACK configuration. This follows existing dated guidance; confirm status/body/timeout for the merchant's service/profile before deployment. No mandatory ABA JSON wrapper or retry guarantee is asserted. Durable failure must not be acknowledged as accepted. Design missing-callback recovery independently of gateway retry.

## Inquiry policy

Customer GET status reads persisted state. A scheduled worker coalesces inquiries per attempt, uses jitter/backoff, handles 429/outage and limits active processing duration without declaring unpaid. The recipe's process-local coalescing/limiter needs a shared database lease/budget for distributed deployments.

Current inquiry supplies processing state. After approval, paced detail supplies original currency and amount before acceptance; historical transactions use detail directly. Do not infer original currency from payer currency. Terminal payment state stops active polling; separate refund/hold/payout/finance jobs continue their own operation lifecycle. Saturated last-50 merchant-reference results require a complete approved report source.

## Review and maintenance

Maintain operation-level implementation, fixture, sandbox, production, settlement and entitlement fields separately. Changes to callback versions, fields/keys, amount rules or endpoint limits invalidate affected vectors/tests/gates. Pin skill/API/config versions, assign a maintainer/review cadence, document migration/retirement and rerun exact-candidate gates. Optional OAS/MCP/Postman do not substitute for a verified contract.
