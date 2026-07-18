# PayWay SDK Integration Test Report

**Date:** 2026-07-18T03:02:22.476Z
**Environment:** sandbox (https://checkout-sandbox.payway.com.kh)
**Merchant ID:** ec476910
**SDK Version:** aba-payway-ts@1.1.0

## Summary

**8/8 test categories passed**

| # | Test | Result |
|---|------|--------|
| 1 | SDK Instantiation & Domains | ✓ PASS |
| 2 | QR Templates (10/10) | ✓ PASS |
| 3 | Transaction Status Polling | ✓ PASS |
| 4 | Refunds (2 tests) | ✓ PASS |
| 5 | QR Lifetime (10 min) | ✓ PASS |
| 6 | Exchange Rate | ✓ PASS |
| 7 | HMAC Verification | ✓ PASS |
| 8 | Transaction List | ✓ PASS |

## 1. SDK Instantiation

- Domains: checkout, qr, credentialsOnFile, paymentLink, preAuth, payout, khqr
- Domains: checkout, qr, credentialsOnFile, paymentLink, preAuth, payout, khqr, verifyCallback: true

## 2. QR API — Template Variants

**Sandbox-valid templates:** template1, template1_color, template2, template2_color, template3_color, template4, template4_color, template5, template5_color, template6_color

| Template | OK | qr_string | qr_image | deeplink | Duration | Notes |
|----------|-----|-----------|----------|----------|----------|-------|
| template1 | ✓ | — | — | ✓ | 427ms | OK |
| template1_color | ✓ | — | — | ✓ | 566ms | OK |
| template2 | ✓ | — | — | ✓ | 563ms | OK |
| template2_color | ✓ | — | — | ✓ | 229ms | OK |
| template3_color | ✓ | — | — | ✓ | 312ms | OK |
| template4 | ✓ | — | — | ✓ | 764ms | OK |
| template4_color | ✓ | — | — | ✓ | 285ms | OK |
| template5 | ✓ | — | — | ✓ | 231ms | OK |
| template5_color | ✓ | — | — | ✓ | 242ms | OK |
| template6_color | ✓ | — | — | ✓ | 267ms | OK |

## 3. Transaction Status Polling

- Transaction: STSps5ncewk7
- QR generated: true
- Polls executed: 20
- Final status: PENDING

| # | Status | Duration |
|---|--------|----------|
| 1 | PENDING | 134ms |
| 2 | PENDING | 136ms |
| 3 | PENDING | 127ms |
| 4 | PENDING | 135ms |
| 5 | PENDING | 138ms |
| 6 | PENDING | 134ms |
| 7 | PENDING | 129ms |
| 8 | PENDING | 130ms |
| 9 | PENDING | 127ms |
| 10 | PENDING | 132ms |
| 11 | PENDING | 127ms |
| 12 | PENDING | 130ms |
| 13 | PENDING | 130ms |
| 14 | PENDING | 127ms |
| 15 | PENDING | 127ms |
| 16 | PENDING | 133ms |
| 17 | PENDING | 128ms |
| 18 | PENDING | 131ms |
| 19 | PENDING | 129ms |
| 20 | PENDING | 133ms |

## 4. Refunds

| Type | Amount | OK | Code | Notes |
|------|--------|----|------|-------|
| partial | $0.5 | ✗ | PTL36 | Expected: unpaid tx rejected (PTL36) |
| full | $1 | ✗ | PTL36 | Expected: unpaid tx rejected (PTL36) |

## 5. QR Lifetime

- Requested: 600s (10 minutes)
- Accepted: true
- Notes: {"qrString":"00020101021230510016abaakhppxxx@abaa01151111111111111110208ABA Bank52045999530384054040.015802KH5910ehanson25960006227050701276640712LIFps6ybumep997500131784343743317011317843797432156717

## 6. Exchange Rate

- {"usd":{"sell":"4012","buy":"3990"},"eur":{"sell":"4667.55","buy":"4466.96"},"vnd":{"sell":"0.15","buy":"0.14"},"jpy":{"sell":"25.38","buy":"23.6"},"sgd":{"sell":"3144.05","buy":"2957.07"},"hkd":{"sel

## 7. HMAC Verification

- All HMAC tests: PASSED

## 8. Transaction List

- {"data":[{"transaction_id":"LIFps6ybumep","transaction_date":"2026-07-18 10:02:23","apv":"","payment_status":"PENDING","payment_status_code":2,"payment_type":"ABA Pay","original_amount":0.01,"original

## Callbacks

*No callbacks received (expected — localhost cannot be reached by PayWay sandbox).*

## Key Findings

1. **tran_id max length: 20 chars** — Sandbox rejects longer IDs with code 04.
2. **Valid QR templates:** template1, template1_color, template2, template2_color, template3_color, template4, template4_color, template5, template5_color, template6_color. No template0/3/6.
3. **Callback URL must be public HTTPS** — localhost URLs fail validation.
4. **Refund requires RSA public key** for merchant_auth encryption.
5. **Exchange rate endpoint** is publicly accessible and returns live rates.

## Structured Logs

- JSONL: `D:\Antigravity_google\SDK-prepration\test-logs\integration-test-2026-07-18T03-01-13-351Z.jsonl`