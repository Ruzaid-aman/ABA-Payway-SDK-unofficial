# Audit Results: Dimension 2.4 — Authentication & Security

> Audit date: 2026-08-26
> Scope: `src/constants.ts`, `src/auth.ts`, `src/utils.ts`, `src/cli/dotenv.ts`, `src/config/envValidator.ts`, `src/config/profiles.ts`
> Method: static read. No live sandbox calls required for this dimension.

## 2.4.1 Credential Management

| Aspect | Status | Details |
|--------|--------|---------|
| Secrets not hardcoded | **PASS** | No API keys/secrets appear in source. Credentials are read from environment (`.env` loaded via `src/cli/dotenv.ts`) and validated by `src/config/envValidator.ts`. |
| Env-var based | **PASS** | `PAYWAY_API_KEY`, `PAYWAY_MERCHANT_ID`, `PAYWAY_RSA_PUBLIC_KEY`, `PAYWAY_ENV`, `PAYWAY_SANDBOX`, `PAYWAY_BASE_URL` are consumed from the environment. |
| Profile support | **PASS** | Named credential profiles supported (`src/config/profiles.ts`), enabling per-environment selection without code changes. |

## 2.4.2 TLS Enforcement

| Aspect | Status | Details |
|--------|--------|---------|
| HTTPS for all calls | **PASS** | `BASE_URLS` defines only `https://` endpoints — sandbox `https://checkout-sandbox.payway.com.kh` and production `https://checkout.payway.com.kh` (`src/constants.ts:1-3`). No `http://` fallback exists. |
| Certificate validation | **PASS** | Uses Node's `fetch` (TLS verified by default). The only documented exception is the sandbox self-signed chain workaround `NODE_TLS_REJECT_UNAUTHORIZED='0'`, which the README scopes per-command and explicitly warns never to set globally. |

## 2.4.3 Sensitive Data Redaction

| Aspect | Status | Details |
|--------|--------|---------|
| Log redaction | **PASS** | `sanitizeForLog` (`src/utils.ts:214-228`) walks objects/arrays and replaces values whose lower-cased key is in `SENSITIVE_LOG_KEYS` with `'***HIDDEN***'`. |
| Covered keys | **PASS** | Set includes `api_key`, `hash`, `merchant_auth`, `password`, `pwt`, `payment_token`, `authorization`, `x-payway-hmac-sha512`, `publickeypem`, `card_number`, `cvv`, `google_pay_token` (`src/utils.ts:197-211`). |
| Debug output sanitized | **PASS** | `onRequest`/`onResponse` debug hooks pass payloads through `sanitizeForLog` before logging (covered by `client.test.ts:161-186`). |

**Observation (P3):** redaction is key-name based and case-insensitive exact-match; a secret stored under an unlisted key name would not be masked. Acceptable for current payloads but worth a note in secure-coding guidelines.

## 2.4.4 RSA Key Management

| Aspect | Status | Details |
|--------|--------|---------|
| Public-key encryption | **PASS** | `encryptMerchantAuth` (`src/auth.ts:32-51`) RSA-encrypts the merchant-auth blob with `RSA_PKCS1_PADDING` (`src/auth.ts:43`). Large payloads are chunked. |
| PEM validation before use | **PASS** | The pre-auth domain requires `publicKeyPem` and validates PEM structure up front (throws `PayWayConfigError`); `isValidPublicKeyPem()` is exported for pre-flight checks (per `skills/aba-payway-pre-auth/SKILL.md`). |
| No private-key handling | **PASS** | The client only ever holds the merchant **public** key for outbound encryption; no private key material is loaded or logged. |

## 2.4.5 Basic Authentication

| Aspect | Status | Details |
|--------|--------|---------|
| Applicability | **N/A** | PayWay does not use HTTP Basic auth for these endpoints; authentication is HMAC-SHA512 (`hash` field) plus RSA-encrypted `merchant_auth`. Not a gap. |

## 2.4.6 Credential Rotation

| Aspect | Status | Details |
|--------|--------|---------|
| Rotation without code change | **PASS** | All secrets are externalized to environment/profile config; rotating keys is a config change only. README documents credential setup and profiles. |

---

## Summary

| Sub-dimension | Verdict | Severity | Notes |
|---------------|---------|----------|-------|
| 2.4.1 Credential management | **PASS** | — | env + profiles, no hardcoded secrets |
| 2.4.2 TLS enforcement | **PASS** | — | HTTPS-only base URLs |
| 2.4.3 Sensitive data redaction | **PASS** | P3 | key-name based; covers core secrets |
| 2.4.4 RSA key management | **PASS** | — | PKCS1, PEM validated, public-only |
| 2.4.5 Basic authentication | **N/A** | — | not used by PayWay |
| 2.4.6 Credential rotation | **PASS** | — | config-driven |

### Overall Assessment: **PASS**

Security posture is sound: secrets are externalized, all traffic is HTTPS, sensitive fields are redacted in logs, RSA encryption uses correct padding with upfront PEM validation, and only public-key material is handled. The only minor note is that log redaction is name-based (P3) — acceptable given the current payload schema.
