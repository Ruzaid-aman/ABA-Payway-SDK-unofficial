# PayWay API Postman Collection

> **Unofficial and unsupported implementation**
>
> This collection is provided only to help developers get started quickly and test the PayWay APIs. It is not an official PayWay SDK, integration, or support channel. It may be incomplete, change without notice, and require updates when the API or sandbox behavior changes. Always confirm request formats, security requirements, response handling, and production-readiness with the official PayWay documentation and PayWay support team.

## Quick start

### 1. Import and configure the collection

1. Import the YAML collection from `postman/collections/` into Postman.
2. Import or open the matching environment from `postman/environments/`.
3. Select the environment for the collection.
4. Add your sandbox credentials to Postman variables. Keep private keys, merchant secrets, and other credentials in **Secret** variables or a local environment; never commit live values to this repository.
5. Confirm that the base URL, merchant ID, API key, and signing credentials resolve before sending a request.

Use `01-working-guide.md` for the complete setup and variable reference.

### 2. Set up a callback URL

For callback and webhook testing, create a temporary receiver at [webhook.site](https://webhook.site/) or use a local listener exposed through a secure tunnel. Copy the receiver URL into the collection or environment variable used by the callback request, then send a payment request that supports callbacks.

Keep the webhook receiver open while testing. When PayWay sends the callback:

- Check the HTTP status and request body.
- Confirm the merchant reference, transaction ID, amount, and payment status.
- Verify the callback signature using the configured credentials before trusting the payload.
- Use the transaction inquiry or polling request to confirm the final gateway status; do not treat receipt of a callback alone as proof of payment.

Callback URLs are often profile- or sandbox-dependent. Treat observed behavior as a **sandbox observation**, not a guarantee of production behavior. See `04-callback-and-webhook-testing.md`.

### 3. Test a payment

Start with the hosted checkout flow:

1. Run the purchase request with a unique merchant reference and a small sandbox amount.
2. Open the checkout URL returned by the response.
3. Complete the payment with the sandbox test card or payment method documented in the collection.
4. Return to Postman and run the transaction inquiry request using the transaction ID or merchant reference saved by the scripts.
5. Confirm the response status, amount, currency, and reference before considering the test successful.
6. If callbacks are enabled, compare the callback payload with the inquiry response.

After hosted checkout works, use the workflow guides for QR, payment links, pre-authorisation, payout, credentials on file, KHQR, and polling. Each flow may have different prerequisites and sandbox limitations.

## Important limitations

- This is a starter/testing collection, not a supported production integration.
- Do not use real customer data, live credentials, or real payments while experimenting with the collection.
- Sandbox responses and available features can differ by merchant profile and can change without notice.
- Validate amounts, dates, references, signatures, idempotency, retries, and final payment status in your own integration.
- Do not edit the historical reference copy to fix current behavior; update the active YAML collection and its documentation instead.

## Guides

| Guide | Purpose | Priority |
| --- | --- | --- |
| `01-working-guide.md` | Import/open the YAML workspace, configure credentials safely, run the first hosted checkout, and understand saved variables. | Must have |
| `02-script-and-helper-architecture.md` | Explain collection/request script scope, the versioned portable helper, migration keys, HMAC signing, RSA fallback behavior, and package/runtime assumptions. | Must have |
| `03-workflow-playbook.md` | Give copyable journeys for checkout, QR, payment links, pre-auth, payout, CoF, KHQR, callbacks, and Runner flows. | Must have |
| `04-callback-and-webhook-testing.md` | Cover webhook.site receiver creation, callback replay, signature verification, polling, retries, and local listener alternatives. | Must have |
| `05-khqr-offline-flow.md` | Document TLV construction, CRC self-tests, merchant-reference correlation, multiple payments, and the by-reference inquiry limitation. | Recommended |
| `06-troubleshooting-and-error-codes.md` | Map common gateway codes and symptoms to Console output, prerequisite variables, date/amount formatting, and recovery steps. | Must have |
| `07-maintainer-validation.md` | Define the edit/build/validate/import/simulation workflow and the release gate for syntax, variable resolution, helper sync, and live checks. | Must have |
| `08-sandbox-findings.md` | Record observed sandbox behavior separately from the official API contract, including profile-specific capabilities and known endpoint quirks. | Recommended |

## Documentation rules

- Treat the YAML collection and `_build/yaml_collection.test.js` as the source of truth for counts and structure.
- Do not edit the historical reference copy to fix current behavior.
- Never put live secrets in committed guides; use placeholders and explain where collection Secret variables belong.
- Label behavior as `official contract`, `sandbox observation`, or `maintainer tooling` so readers can distinguish guarantees from experiments.
- When a guide changes a workflow, update `collection-index.md` and the relevant folder/request description in the same change.

## Suggested build order

Start with `01-working-guide.md`, `02-script-and-helper-architecture.md`, and `07-maintainer-validation.md`. Add the workflow and troubleshooting guides next; keep KHQR and sandbox findings separate because they have the highest profile- and environment-specific caveats.
