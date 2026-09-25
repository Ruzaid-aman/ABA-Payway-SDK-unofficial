# Postman Documents

This directory is for durable, maintainer-authored guides that explain how to use and verify the collection. Keep request-specific payloads, URLs, and quick-start text in the YAML request resources; use these documents for workflows that span requests or require operational context.

## Recommended guides

| Guide | Purpose | Priority |
|---|---|---|
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
