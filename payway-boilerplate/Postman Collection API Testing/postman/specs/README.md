# PayWay OpenAPI 3.1 spec (bundled)

`payway-openapi.yaml` is the hand-authored **OpenAPI 3.1.0 contract for the ABA PayWay
merchant API surface** — the machine-readable counterpart of this Postman collection.
Copy it wherever AI tools and codegen expect a spec (Spec Hub import, IDE plugins,
`openapi-generator`, Postman's AI agent, etc.).

## Why it matters for AI tooling

The spec documents what Postman scripts can only do implicitly:

- **The signing model** — PayWay has no transport auth; every request carries a
  `hash` field **inside the body**, computed as `base64(HMAC-SHA512(fields..., secret))`
  over an endpoint-specific ordered field list, expressed via the `x-hmac-fields`
  vendor extension on each operation. Codegen cannot infer this (Stainless,
  Speakeasy, openapi-generator do not support body-field HMAC signing) — read the
  extension explicitly.
- **Response schemas** for every endpoint, including the mixed string/number
  `status.code` quirk and `payment_status_code` semantics.

## Provenance and parity

- Source of truth: `payway-openapi/` at the SDK repo root (hand-authored from
  developer.payway.com.kh). This file is the **bundled** export (all `$ref`s
  resolved) — regenerate the copy from there when the spec changes.
- `_build/spec_parity.js` (part of `test:yaml`) asserts the spec paths are a
  subset of the collection's endpoints. The one collection-only endpoint is
  **Payment Link Void** — live-verified but deliberately undocumented by PayWay,
  so it exists in the collection (folder 05) and not in the spec.
