# Audit Results: Dimension 2.2 - Request Building & Serialization

## 2.2.1 JSON Serialization of Nested Objects, Arrays, and Null Values

### Checklist Items:

- **Payload JSON serialization**: ✅ Correct - `JSON.stringify(fullBody)` used in `client.ts:781` for `application/json` content type, properly serializes nested objects and arrays
- **Null value handling in payload**: ✅ Correct - `filterParams` in `utils.ts:187-195` explicitly removes `undefined` and `null` values before serialization, preventing `null` from appearing in final payload
- **Falsy value preservation**: ✅ Correct - `filterParams` preserves defined falsy values (`0`, `false`, `""`) while removing `undefined`/`null`
- **Base64 encoding of nested structures**: ✅ Correct - `encodeBase64IfNeeded` in `utils.ts:177-185` JSON-stringifies then base64-encodes non-URL string values (including arrays and objects)
- **URL detection for base64**: ✅ Correct - URLs starting with `http://`, `https://`, `//`, or `www.` are detected and base64-encoded; non-URL strings passed through unchanged
- **HMAC field null handling**: ✅ Correct - `generateHmac` in `auth.ts:8-24` treats `undefined`/`null` fields as empty string `''` per the fieldList order

### Static Code Review:

| Aspect | Status | Details |
|--------|--------|---------|
| JSON.stringify usage | ✅ | `client.ts:781` calls `JSON.stringify(fullBody)` for JSON content type |
| Null/undefined filtering | ✅ | `utils.ts:187-195` `filterParams` removes `undefined` and `null` before serialization |
| Nested object encoding | ✅ | `encodeBase64IfNeeded` handles nested objects via `JSON.stringify(val)` |
| Array encoding | ✅ | `encodeBase64IfNeeded` handles nested arrays via `JSON.stringify(val)` |
| Falsy value handling | ✅ | `filterParams` keeps `0`, `false`, `""` but removes `undefined`/`null` |

### Dynamic Testing:

- All 181 tests pass, including:
  - `filterParams > removes undefined values`
  - `filterParams > removes null values`
  - `filterParams > keeps falsy but defined values (0, false, empty string)`
  - `filterParams > preserves nested objects`
  - `encodeBase64IfNeeded > JSON-stringifies and base64-encodes objects`
  - `encodeBase64IfNeeded > JSON-stringifies and base64-encodes arrays`
  - `generateHmac > treats missing/null/undefined fields as empty string`
  - `generateHmac > coerces numeric values to string`

**Status**: [PASS] JSON serialization correctly handles nested objects, arrays, and null values

---

## 2.2.2 Monetary Amounts as Integers/Decimal Strings

### Checklist Items:

- **USD amount formatting**: ✅ Correct - `formatAmount` in `utils.ts:136-141` uses `amount.toFixed(2)` producing decimal strings with exactly 2 decimal places (e.g., `"6.12"`, `"10.00"`)
- **KHR amount formatting**: ✅ Correct - `formatAmount` uses `Math.round(amount).toString()` producing integer strings without decimals (e.g., `"1000"`)
- **Amount validation for USD**: ✅ Correct - `validatePositiveAmount` in `utils.ts:24-37` validates USD amounts have at most 2 decimal places
- **Amount validation for KHR**: ✅ Correct - `validatePositiveAmount` validates KHR amounts are integers
- **Purchase payload amount**: ✅ Correct - `checkout.ts:108` uses `formatAmount(params.amount, params.currency || 'USD')` for the `amount` field
- **Shipping amount formatting**: ✅ Correct - `checkout.ts:116` uses `formatAmount(params.shipping, params.currency || 'USD')` for shipping field

### Static Code Review:

| Aspect | Status | Details |
|--------|--------|---------|
| USD format (toFixed 2) | ✅ | `utils.ts:138` `amount.toFixed(2)` always produces 2 decimal places |
| KHR format (integer) | ✅ | `utils.ts:140` `Math.round(amount).toString()` produces integer string |
| USD validation (2 decimals) | ✅ | `utils.ts:31` `Math.abs(amount - rounded) > 1e-10` check |
| KHR validation (integer) | ✅ | `utils.ts:34` `!Number.isInteger(amount)` check |
| Payload integration | ✅ | `checkout.ts:108` formats amount via `formatAmount()` before payload construction |

### Dynamic Testing:

- All 181 tests pass, including:
  - `formatAmount > formats USD with exactly 2 decimal places`
  - `formatAmount > rounds USD amounts to 2 decimal places`
  - `formatAmount > formats KHR as rounded integer (no decimals)`
  - `formatAmount > handles zero correctly for both currencies`
  - `validatePositiveAmount > accepts positive USD amounts with up to 2 decimals`
  - `validatePositiveAmount > accepts positive integer KHR amounts`
  - `validatePositiveAmount > throws for KHR amounts with decimals`
  - `validatePositiveAmount > throws for USD amounts with more than 2 decimals`

**Status**: [PASS] Monetary amounts correctly formatted as integers (KHR) or decimal strings (USD) per API requirements

---

## 2.2.3 DateTime Format per API Requirements

### Checklist Items:

- **Request timestamp format**: ✅ Correct - `formatRequestTime` in `utils.ts:3-14` generates UTC timestamp in `YYYYMMDDHHmmss` format (14 characters)
- **Timestamp usage in requests**: ✅ Correct - `client.ts:765-767` auto-fills `req_time` field via `formatRequestTime()` if not provided in payload
- **Timestamp field naming**: ✅ Correct - Uses `req_time` for most endpoints, `request_time` only for refund/pre-auth endpoints (per API spec)
- **ISO format fallback**: Not applicable - SDK uses PayWay's required format, not ISO

### Static Code Review:

| Aspect | Status | Details |
|--------|--------|---------|
| Format YYYYMMDDHHmmss | ✅ | `utils.ts:6-12` pads each component with `String(n).padStart(2, '0')` using UTC methods |
| UTC usage | ✅ | All date methods are UTC (`getUTCFullYear()`, `getUTCMonth()`, etc.) |
| Auto-fill when omitted | ✅ | `client.ts:765-767` sets `fullBody.req_time = formatRequestTime()` if not present |
| Field name consistency | ✅ | `req_time` for purchase/check/close/generate-qr; `request_time` for refund/pre-auth |
| Minimum seconds granularity | ✅ | Seconds included in format |

### Dynamic Testing:

- All 181 tests pass, including:
  - `formatRequestTime > formats a specific UTC date as YYYYMMDDHHmmss`
  - `formatRequestTime > pads single-digit months, days, hours, minutes, seconds with leading zeros`
  - `formatRequestTime > handles midnight correctly`
  - `formatRequestTime > handles end-of-day correctly`
  - `formatRequestTime > returns a 14-character string when no date is passed (uses current time)`

**Status**: [PASS] DateTime format correctly matches API requirements (UTC YYYYMMDDHHmmss)

---

## 2.2.4 UTF-8 Encoding

### Checklist Items:

- **Base64 encoding with UTF-8**: ✅ Correct - `toBase64` in `utils.ts:143-145` uses `Buffer.from(s, 'utf8').toString('base64')`
- **RSA encryption UTF-8**: ✅ Correct - `encryptMerchantAuth` in `auth.ts:33-34` uses `Buffer.from(jsonStr, 'utf8')` before RSA encryption
- **Callback signature UTF-8**: ✅ Correct - `verifyCallbackSignature` in `auth.ts:80-81` uses `Buffer.from(computedSignature, 'utf8')` and `Buffer.from(receivedSignature, 'utf8')` for comparison
- **Unicode/base64 test coverage**: ✅ Tests verify UTF-8 characters are correctly base64-encoded

### Static Code Review:

| Aspect | Status | Details |
|--------|--------|---------|
| Buffer.from with 'utf8' | ✅ | `utils.ts:144` `Buffer.from(s, 'utf8')` for base64 encoding |
| RSA encryption UTF-8 | ✅ | `auth.ts:34` `Buffer.from(jsonStr, 'utf8')` before encryption |
| Signature comparison UTF-8 | ✅ | `auth.ts:80-81` both computed and received signatures converted to UTF-8 Buffers |
| UTF-8 string round-trip | ✅ | Base64 encode/decode preserves original UTF-8 content |

### Dynamic Testing:

- All 181 tests pass, including:
  - `toBase64 > encodes UTF-8 characters`
  - `encryptMerchantAuth > decrypts RSA-encrypted payload back to the original JSON payload`
  - `verifyCallbackSignature > returns true for a valid signature`
  - `verifyCallbackSignature > handles null/undefined values as empty string`

**Status**: [PASS] UTF-8 encoding correctly applied across base64, RSA encryption, and signature verification

---

## 2.2.5 Request Signing (HMAC-SHA512)

### Checklist Items:

- **HMAC generation**: ✅ Correct - `generateHmac` in `auth.ts:8-24` generates HMAC-SHA512
- **Field ordering**: ✅ Correct - Fields concatenated in the exact order specified by `fieldList` parameter (not alphabetical)
- **Null/undefined handling**: ✅ Correct - Missing/null/undefined values substituted with empty string `''` before concatenation
- **Numeric value coercion**: ✅ Correct - Numbers coerced to string via `String(val)` before concatenation
- **Hash encoding selection**: ✅ Correct - Supports both `base64` (default) and `hex` encoding options
- **HMAC application in requests**: ✅ Correct - Applied in `client.ts:769` for standard requests and `client.ts:820` for merchant auth requests
- **x-hmac-fields adherence**: ✅ Correct - Field lists per-operation match PayWay's documented field ordering (verified via sandbox testing)

### Static Code Review:

| Aspect | Status | Details |
|--------|--------|---------|
| HMAC-SHA512 algorithm | ✅ | `auth.ts:24` `crypto.createHmac('sha512', apiKey)` |
| Field order preservation | ✅ | `auth.ts:14-22` iterates `fieldList` in order, concatenates values |
| Null/undefined → empty string | ✅ | `auth.ts:17-19` `if (val === undefined || val === null) return ''` |
| Numeric to string coercion | ✅ | `auth.ts:20` `return String(val)` |
| Base64 encoding (default) | ✅ | `auth.ts:24` `.digest('base64')` |
| Hex encoding support | ✅ | `auth.ts:12` `encoding: 'base64' \| 'hex' = 'base64'` parameter |
| Integration in request flow | ✅ | `client.ts:769` `fullBody.hash = generateHmac(fullBody, hmacFields, this.config.apiKey, hashEncoding)` |
| Merchant auth HMAC | ✅ | `client.ts:820` `body.hash = generateHmac(body, hmacFields, this.config.apiKey)` |

### Dynamic Testing:

- All 181 tests pass, including:
  - `generateHmac > concatenates field values in fieldList order and returns base64 HMAC-SHA512`
  - `generateHmac > treats missing/null/undefined fields as empty string`
  - `generateHmac > coerces numeric values to string`
  - `generateHmac > returns a valid base64 string`
  - `generateHmac > supports hexadecimal HMAC-SHA512 for the payout endpoint`
  - `generateHmac > produces different hashes for different keys`
  - `generateHmac > produces different hashes for different field orders`
  - `verifyCallbackSignature > returns true for a valid signature`
  - `verifyCallbackSignature > JSON-stringifies object/array values before concatenation`

**Status**: [PASS] Request signing (HMAC-SHA512) correctly implemented with proper field ordering, null handling, and encoding

---

## Summary

| Sub-component | Status | Key Issues |
|---------------|--------|------------|
| 2.2.1 JSON Serialization | [PASS] | None |
| 2.2.2 Monetary Amounts | [PASS] | None |
| 2.2.3 DateTime Format | [PASS] | None |
| 2.2.4 UTF-8 Encoding | [PASS] | None |
| 2.2.5 Request Signing | [PASS] | None |

### Overall Assessment:

The PayWay SDK CLI implementation demonstrates strong adherence to dimension 2.2 requirements across all serialization and request building aspects. All critical areas are correctly implemented:

- **JSON serialization** properly handles nested objects, arrays, and null values with `filterParams` removing undefined/null before serialization
- **Monetary amounts** are correctly formatted as 2-decimal strings for USD and integer strings for KHR, with corresponding validation
- **DateTime format** matches API requirements: UTC `YYYYMMDDHHmmss` (14-character string)
- **UTF-8 encoding** consistently applied across base64 encoding, RSA encryption, and HMAC signature verification
- **Request signing** (HMAC-SHA512) correctly implements field ordering, null/undefined handling, numeric coercion, and supports both base64 and hex encoding

The only observed minor consideration is that `filterParams` preserves defined falsy values (`0`, `false`, `""`) while removing `undefined`/`null` - this is the expected behavior and aligns with PayWay API requirements where `0` amounts may be valid (e.g., shipping fee of 0).

All 181 existing tests pass, confirming the correctness of the implementation across dimension 2.2.

**Status**: [PASS] Dimension 2.2 - Request Building & Serialization fully compliant

---