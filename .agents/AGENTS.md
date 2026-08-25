# Project Rules & Learned Knowledge: PayWay SDK

## Domain Separation
- **Offline/Onsite KHQR Generation**:
  - Uses EMVCo Tag-Length-Value (TLV) encoding.
  - Checksum calculation uses **CRC-16 CCITT** (polynomial `0x1021`, initial `0xFFFF`).
  - Does NOT make any network/API requests to PayWay.
- **Online/API Calls**:
  - Uses standard REST APIs (e.g. `/api/payment-gateway/v1/payments/generate-qr` or `/payment-link/create`).
  - Signatures are generated using **HMAC-SHA512** (raw digest base64-encoded) on concatenated strings of parameters.
  - DO NOT mix up or merge the encryption/checksum logic of offline QR (CRC-16) with online API calls (HMAC-SHA512).

## Cryptographic Standards
- **HMAC-SHA512**:
  - Key: API Key.
  - Format: Raw binary digest, then base64 encoded.
- **RSA Public Key Encryption**:
  - Key: 1024-bit PEM public key.
  - Padding: `RSA_PKCS1_PADDING`.
  - Block size: 117 bytes.
  - Formatting: Plaintext is JSON-stringified, encrypted in chunks, and then concatenated as raw buffers before base64-encoding the entire concatenated buffer.
  - *Warning*: Do not base64-encode individual chunks inside the loop (as done in some boilerplate JS files); this is a known boilerplate quirk. The PayWay production system expects standard PHP-equivalent chunk concatenation before base64 encoding.

## Request Formatting
- **Form Content-Types**:
  - Some APIs (such as Payment Link Create/Detail, Refund, Pre-auth) expect forms (`multipart/form-data` or `application/x-www-form-urlencoded`) rather than JSON.
  - The SDK must support encoding payloads into forms when making requests to these specific endpoints.

## Workflow & State Tracking
- **Always check status first**: Before beginning new work or deciding what to do next, ALWAYS read `PROJECT_STATUS.md` in the root of the workspace. This is the source of truth for what has been done and what the current priorities are.
- **Understand the API quirks**: Read `SANDBOX-FINDINGS.md` to understand API behaviors we have verified during our sandbox probes.
- **Close Transaction escalation (open)**: `docs/CLOSE-TRANSACTION-FINDINGS.md` documents that sandbox close is NOT enforced (paid-after-close → APPROVED, twice) and closure is unqueryable. Read it before ANY work involving `closeTransaction`, and re-run its §7 validation checklist when ABA ships a fix.
- **When probing endpoints**: When tasked to probe a sandbox endpoint, write a script in the `scripts/` folder to execute and verify the endpoint exists and validates formatting correctly, similar to prior probes.
- **Update status continuously**: Keep `PROJECT_STATUS.md` updated as tasks are completed.

## SDK Usage Examples
- Prefer the facade for a complete merchant flow: `const session = await sdk.initiate(payload, config);` followed by `await sdk.handle(session, { target: '#payway-container' });`.
- Use `new PayWay()` for domain APIs when `PAYWAY_MERCHANT_ID` and `PAYWAY_API_KEY` are configured in the environment.
- Keep all SDK calls and credentials on the server. Browser code must receive only the data required to render or redirect payment experiences.

## Error Handling Matrix
| Error | Meaning | Retry guidance |
|---|---|---|
| `PayWayConfigError` | Missing or invalid local configuration/input | Correct configuration; do not retry unchanged. |
| `PayWayBusinessError` | PayWay rejected a valid transport request | Resolve the business condition; do not retry blindly. |
| `PayWayNetworkError` | Network failure or request timeout | Retry is supported by configured retry policy. |
| `PayWayRateLimitError` | PayWay returned HTTP 429 | Honor retry delay and reduce request rate. |
| `PayWayAPIError` | Other HTTP/API failure | Retry only when `retryable` is true. |
| `PayWaySignatureError` | Signature-related verification failure | Reject the untrusted callback. |

## Environment Variables
| Variable | Purpose |
|---|---|
| `PAYWAY_MERCHANT_ID` | Required merchant identifier when not passed to `PayWay`. |
| `PAYWAY_API_KEY` | Required signing key when not passed to `PayWay`. |
| `PAYWAY_RSA_PUBLIC_KEY` | RSA public key for encrypted endpoints. |
| `PAYWAY_BASE_URL` | Optional API base URL override. |
| `PAYWAY_ENV` | Named environment override (`sandbox` or `production`). Takes precedence over `PAYWAY_SANDBOX`. |
| `PAYWAY_SANDBOX` | `true` selects sandbox; `false` selects production. |
| `PAYWAY_TIMEOUT` | Optional request timeout in milliseconds. |
| `DEBUG_PAYWAY` | `true` or `1` enables sanitized diagnostic logging. |

## Skills Directory
- The packaged `skills/` directory contains 24 focused `aba-payway-*` guides.
- Several guides bundle dependency-free `.cjs` tools under their `scripts/` folder (KHQR decode/CRC validation, request signing, callback verification, mock callbacks, reconciliation cron, checkout payload builder, status decoder) — each SKILL.md documents its own tools.
- Install all of them (including bundled scripts) with `npx payway-sdk skills add <agent>`, where agent is `claude`, `codex`, `opencode`, `cursor`, or `copilot`.

