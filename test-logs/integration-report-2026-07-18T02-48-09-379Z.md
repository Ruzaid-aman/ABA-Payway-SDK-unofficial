# PayWay SDK Integration Test Report

**Date:** 2026-07-18T02:48:14.734Z
**Environment:** sandbox
**Merchant ID:** ec476910
**Results:** 3/11 passed (8 failed)

## Summary

| Test | Result |
|------|--------|
| QR Templates (7 variants) | 0/7 passed |
| Transaction Status Polling | ✗ FAIL |
| Refunds (0 tests) | 0/0 passed |
| QR Lifetime (10 min) | ✓ PASS |
| SDK Instantiation | ✓ PASS |
| HMAC Verification | ✓ PASS |

## 1. QR API — Template Variants

| Template | HTTP | API Code | qr_string | qr_image | deeplink | Duration | Notes |
|----------|------|----------|-----------|----------|----------|----------|-------|
| template0 | 400 | 04 | ✗ | ✗ | ✗ | 365ms | HTTP 400; API code: 04; No QR data in response;  |
| template1 | 400 | 04 | ✗ | ✗ | ✗ | 120ms | HTTP 400; API code: 04; No QR data in response;  |
| template2 | 400 | 04 | ✗ | ✗ | ✗ | 120ms | HTTP 400; API code: 04; No QR data in response;  |
| template3 | 400 | 04 | ✗ | ✗ | ✗ | 120ms | HTTP 400; API code: 04; No QR data in response;  |
| template4 | 400 | 04 | ✗ | ✗ | ✗ | 120ms | HTTP 400; API code: 04; No QR data in response;  |
| template5 | 400 | 04 | ✗ | ✗ | ✗ | 121ms | HTTP 400; API code: 04; No QR data in response;  |
| template6 | 400 | 04 | ✗ | ✗ | ✗ | 122ms | HTTP 400; API code: 04; No QR data in response;  |

## 2. Transaction Status Polling

- **Transaction ID:** SDKSTATUS4342894070qboy
- **Initial Status:** QR_FAILED
- **Final Status:** QR_FAILED
- **Polls Executed:** 0


## 3. Refunds

*No refund tests ran (RSA key may be missing).*

## 4. QR Lifetime

- **Requested Lifetime:** 600s (10 minutes)
- **Accepted by Sandbox:** No
- **Notes:** HMAC rejected; HTTP 403; 

## 5. SDK Instantiation

- **Domains Available:** checkout, qr, credentialsOnFile, paymentLink, preAuth, payout, khqr
- **Notes:** Domains: checkout, qr, credentialsOnFile, paymentLink, preAuth, payout, khqr

## 6. HMAC Signature Verification

- **Result:** All HMAC tests: PASSED

## Callbacks

*No callbacks received during test run. This is expected if no QR was paid.*

## Findings

- FAILED QR templates: template0 (HTTP 400; API code: 04; No QR data in response; ); template1 (HTTP 400; API code: 04; No QR data in response; ); template2 (HTTP 400; API code: 04; No QR data in response; ); template3 (HTTP 400; API code: 04; No QR data in response; ); template4 (HTTP 400; API code: 04; No QR data in response; ); template5 (HTTP 400; API code: 04; No QR data in response; ); template6 (HTTP 400; API code: 04; No QR data in response; )
- Transaction status polling returned no results. Check network connectivity.
- Callback server received 0 callbacks.

## Structured Logs

Full JSONL logs: `D:\Antigravity_google\SDK-prepration\test-logs\integration-test-2026-07-18T02-48-09-377Z.jsonl`