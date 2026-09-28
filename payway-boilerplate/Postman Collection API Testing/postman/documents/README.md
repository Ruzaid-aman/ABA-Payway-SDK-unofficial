# PayWay API Postman Collection

> **Unofficial and unsupported implementation**
>
> This collection is provided only to help developers get started quickly and test the PayWay APIs. It is not an official PayWay SDK, integration, or support channel. It may be incomplete, change without notice, and require updates when the API or sandbox behavior changes. Always confirm request formats, security requirements, response handling, and production-readiness with the official PayWay documentation and PayWay support team.

## Quick start

### 1. Import and configure the collection

1. **One-file route:** import `dist/PayWay API — Complete Collection.postman_collection.json` into Postman (Import → File). This export also carries the saved response examples and is the artifact to share with merchant developers.
2. **Workspace route (maintainers):** open the folder as a Postman Git workspace — `.postman/resources.yaml` maps `postman/collections/PayWay API — Complete Collection/` (the editable YAML source).
3. The collection is **pre-configured with this project's sandbox merchant** (merchant `ec476910`, `secret_key` Postman *Secret*-typed, full `rsa_public_key` PEM, seeded beneficiary `500000001`, `ctid customer123`) — the first request works with zero setup.
4. Optional: import an environment from `postman/environments/` — `PayWay - Sandbox.environment.yaml` (mirrors the pre-filled values) or `PayWay - Production.environment.yaml` (placeholders). These are Postman v3 YAML resources and currently local-only (not mapped in `.postman/resources.yaml`); environment variables override collection variables once selected, so keep the Production environment selected only when you have filled in your own merchant values.
5. For another merchant, replace `merchant_id` / `secret_key` / `rsa_public_key` / `ctid` in the collection Variables tab (or in your environment). Keep secrets in **Secret** variables — note the typing is Postman app/cloud state: the YAML files on disk store every value, including `secret_key`, as plain text, so repo-level protection is what keeps them safe. Never commit live values to this repository. The pre-filled sandbox credentials are public demo values — replace them before touching anything real.

Start at **03 - Ecommerce Checkout → 1. Purchase (Hosted Checkout)** — the ⚡ Quick test block in each request's description says what to set, what to expect, and what to send next. The collection **Overview** tab carries the full walkthrough, the error-code table, and a 60-second fixes section.

### 2. Set up a callback URL

For callback and webhook testing, create a temporary receiver at [webhook.site](https://webhook.site/) (or let **09 - KHQR Guideline → 1. Create webhook.site Receiver** create one via API and wire the variables for you), or expose a local listener through a secure tunnel. Paste the receiver URL into `{{callback_listener}}` / `{{callback_url}}`, then send a payment request that supports callbacks.

Keep the receiver open while testing. When PayWay sends the callback:

- Check the HTTP status and request body.
- Confirm the merchant reference, transaction ID, amount, and payment status.
- Verify the callback signature (`X-PayWay-Hmac-Sha512`) using the configured credentials before trusting the payload — except payment-link pushbacks and offline-KHQR pushbacks, which carry **no hash by design**; verify those via Check Transaction.
- Use the transaction inquiry or polling request to confirm the final gateway status; do not treat receipt of a callback alone as proof of payment.

Callback behavior is profile- and sandbox-dependent. Treat observed behavior as a **sandbox observation**, not a guarantee of production behavior.

### 3. Test a payment

Start with the hosted checkout flow:

1. Run the purchase request with a unique merchant reference and a small sandbox amount.
2. Open the checkout URL from the **Visualize** tab ("Open payment page →" form-POSTs the signed fields; the page is served by PayWay itself, avoiding CORS).
3. Complete the payment with a sandbox test card (table in the Overview tab and folder 01).
4. Return to Postman and run **3. Check Transaction** using the transaction ID saved automatically to `{{last_tran_id}}`.
5. Confirm the response status, amount, currency, and reference before considering the test successful.
6. If callbacks are enabled, compare the callback payload with the inquiry response.

After hosted checkout works, use the Runner flows (folder 11) or the per-folder requests for QR, payment links, pre-auth, payout, credentials on file, KHQR, and polling. Each flow may have different prerequisites and sandbox limitations.

## Workspace map (what actually exists)

| Artifact | Purpose |
| --- | --- |
| `postman/collections/PayWay API — Complete Collection/` | **The deliverable** — editable Postman v3 YAML resources mapped by `.postman/resources.yaml` |
| `dist/PayWay API — Complete Collection.postman_collection.json` | **Distribution export** — single-file v2.1 JSON with saved response examples; regenerate with `node _build/export_json.js`, freshness-gated by `--check` |
| `postman/environments/` | Importable Sandbox (mirrors pre-filled values) and Production (placeholders) environments |
| `postman/specs/payway-openapi.yaml` | Bundled OpenAPI 3.1 contract (`x-hmac-fields` documents the body-hash signing model) — the machine-readable surface for AI tools and codegen; path parity with the collection is tested |
| `postman/documents/error-codes.json` | Machine-readable error registry (83 codes, 8 families, sandbox-verified + production telemetry) — copied from the SDK knowledge corpus |
| `collection-index.md` | Full index: folders, requests, variables, flows, build tooling |
| `MAINTAINER_REPORT.md` | Release gate state, live-verification matrix, incident history |
| `llms.txt` | Index of official PayWay docs (Markdown per page) plus workspace pointers — for AI tools |
| `_build/` | YAML loader, validators, example/export tooling, KHQR simulation, helper sync |
| `Refrence-copy-PayWay API — Complete Collection-1/` | Historical reference only — never edit |

## Planned guides (not yet written)

The following maintainers' guides are planned but do **not** exist yet — do not link to them as if they did:

1. `01-working-guide.md` — import/configuration walkthrough (the Overview tab + this README currently cover it)
2. `02-script-and-helper-architecture.md` — script scopes, the versioned portable helper, HMAC orders, RSA fallback
3. `03-workflow-playbook.md` — copyable journeys per product area
4. `04-callback-and-webhook-testing.md` — receiver options, signature verification, polling
5. `05-khqr-offline-flow.md` — TLV construction and correlation details (folder 09 descriptions currently carry this)
6. `06-troubleshooting-and-error-codes.md` — superseded for now by `error-codes.json` + the Overview error table
7. `07-maintainer-validation.md` — the edit/build/validate workflow (see "Documentation rules" below and MAINTAINER_REPORT.md)
8. `08-sandbox-findings.md` — observed sandbox behavior (see MAINTAINER_REPORT.md §2/§5 until written)

## Important limitations

- This is a starter/testing collection, not a supported production integration.
- Do not use real customer data, live credentials, or real payments while experimenting with the collection.
- Sandbox responses and available features can differ by merchant profile and can change without notice.
- Saved response examples in the dist export are sandbox-shaped samples for orientation — field values (amounts, ids, rates, QR strings) are illustrative unless marked as live captures.
- Validate amounts, dates, references, signatures, idempotency, retries, and final payment status in your own integration.

## Documentation rules

- Treat the YAML collection and `_build/yaml_collection.test.js` as the source of truth for counts and structure.
- `dist/` is generated: edit `_build/examples.json` + the YAML resources, then run `node _build/export_json.js`; CI fails if the committed export is stale (`export_json.js --check`).
- Do not edit the historical reference copy to fix current behavior.
- Never put live secrets in committed guides; use placeholders and explain where collection Secret variables belong.
- Label behavior as `official contract`, `sandbox observation`, or `maintainer tooling` so readers can distinguish guarantees from experiments.
- When a change alters workflows, counts, or artifacts, update `collection-index.md` and the relevant folder/request descriptions in the same change.

## Maintainer workflow

```powershell
cd "payway-boilerplate/Postman Collection API Testing/_build"   # from the repo root
npm ci                 # once
npm run test:yaml      # structure · scripts · import shape · KHQR sim · spec parity
node sync_portable_helper.js   # after editing the helper source (then re-run test:yaml)
node export_json.js    # regenerate dist export with examples (CI enforces freshness)
node verify_index.js   # after editing collection-index.md
node readme_path_audit.js      # after editing postman/documents/README.md
```

The suite must be green before describing the collection as verified; CI (`.github/workflows/ci.yml`, job `postman-collection`) enforces the same gate on every push/PR.
