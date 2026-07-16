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
- **When probing endpoints**: When tasked to probe a sandbox endpoint, write a script in the `scripts/` folder to execute and verify the endpoint exists and validates formatting correctly, similar to prior probes.
- **Update status continuously**: Keep `PROJECT_STATUS.md` updated as tasks are completed.
