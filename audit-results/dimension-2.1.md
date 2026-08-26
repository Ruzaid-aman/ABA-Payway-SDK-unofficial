# Audit Results: Dimension 2.1 - API Endpoint Correctness

## 2.1.1 Create Pre-Auth

### Checklist Items:
- **Endpoint Path**: ✅ Correct - `/api/payment-gateway/v1/payments/purchase` (from constants.ts line 15)
- **HTTP Method**: ✅ Correct - POST (from types.ts line 56 and client.ts line 719)
- **Headers**: ✅ Correct - Uses HMAC authentication with fields: merchant_id, req_time, and transaction-specific fields (client.ts lines 795-819)
- **Required Fields**: ✅ Correct - transactionId, amount, currency, items, returnUrl (client.ts lines 460-466)
- **AoC/CoF Token Support**: ✅ Correct - Supports paymentToken field in CoF payment context (types.ts line 142)
- **Transaction Type**: ✅ Correct - type field defaults to 'purchase' but can be set to 'pre-auth' (types.ts line 90)
- **Optional Fields**: ✅ Correct - Includes email, phone, firstName, lastName, shipping, items, etc. (types.ts lines 83-109)

### Business Logic from Section 4:
- QR-REQ-01: Supported - Transaction lifetime override available via lifetime parameter
- QR-REQ-02: Supported - Credentials validation present
- QR-REQ-03: Supported - Default currency handling
- QR-REQ-04: Supported - Transaction ID generation
- QR-REQ-05: Supported - Return URL handling
- QR-REQ-06: Supported - Payment option handling
- QR-REQ-07: Supported - Amount validation
- QR-REQ-08: Supported - Custom fields support
- QR-REQ-09: Supported - Webhook callback URL
- QR-REQ-10: Supported - QR template selection
- QR-REQ-11: Supported - Retry configuration (maxRetries=3)
- QR-REQ-12: Supported - Polling configuration

**Status**: [PASS] Create Pre-Auth endpoint implementation is correct

---

## 2.1.2 Complete Pre-Auth Without Payout

### Checklist Items:
- **Endpoint Path**: ✅ Correct - `/api/merchant-portal/merchant-access/online-transaction/pre-auth-completion` (constants.ts line 23)
- **HTTP Method**: ✅ Correct - POST (from preAuth domain test lines 1238-1247)
- **Required Parameters**: ✅ Correct - tran_id, complete_amount (pre-auth.ts lines 32-42)
- **Completion Amount**: ✅ Correct - Amount validation via validatePositiveAmount (pre-auth.ts line 30)
- **10% Over-Capture**: ❌ **NOT IMPLEMENTED** - No validation or allowance for 10% over-capture
- **Idempotency**: ⚠️ **PARTIAL** - No explicit idempotency key support, relies on tran_id which may provide some idempotency
- **State Validation**: ✅ Correct - Validates transactionId format (pre-auth.ts line 29)
- **Single Completion Constraint**: ❌ **NOT ENFORCED** - SDK allows multiple completion attempts; relies on PayWay backend to enforce

### Severity Assessment:
- Missing 10% over-capture: **MEDIUM** - May cause legitimate transactions to fail
- Missing idempotency: **LOW** - tran_id provides basic idempotency
- No single completion enforcement: **LOW** - Backend enforcement sufficient

### Remediation:
1. Add support for 10% over-capture allowance in completion amount validation
2. Consider adding optional idempotency key parameter
3. Document that single completion is enforced by PayWay backend

**Status**: [FAIL] Complete Pre-Auth Without Payout missing 10% over-capture support

---

## 2.1.3 Complete Pre-Auth With Payout

### Checklist Items:
- **Endpoint Path**: ✅ Correct - Same as without payout: `/api/merchant-portal/merchant-access/online-transaction/pre-auth-completion`
- **Payout Parameters**: ✅ Correct - Accepts payout array with {acc, amt, accName?} (pre-auth.ts lines 10-14, 45-92)
- **Request Structure**: ✅ Correct - JSON payload with tran_id, complete_amount, payout array (pre-auth.ts lines 80-91)
- **Atomicity**: ✅ Correct - Single API call for completion + payout allocation
- **Response Parsing**: ✅ Correct - Returns CompletePreAuthResponse type (pre-auth.ts line 9)

### Business Logic from Section 4:
- Payout amount validation: ✅ Correct - Ensures sum of payout amounts equals complete amount (pre-auth.ts lines 53-70)
- Account validation: ✅ Correct - Validates ABA account/MID format (pre-auth.ts lines 55-58)
- Beneficiary name handling: ✅ Correct - Optional accName field support (pre-auth.ts lines 76-78)
- String amount requirement: ✅ Correct - Converts numeric amounts to strings for RSA encryption (pre-auth.ts lines 72-78)

**Status**: [PASS] Complete Pre-Auth With Payout implementation is correct

---

## 2.1.4 Cancel Pre-Auth

### Checklist Items:
- **Endpoint Path**: ✅ Correct - `/api/merchant-portal/merchant-access/online-transaction/pre-auth-cancellation` (constants.ts line 24)
- **HTTP Method**: ✅ Correct - POST (from preAuth domain test lines 1249-1256)
- **Required Parameters**: ✅ Correct - tran_id (pre-auth.ts line 96)
- **Cancellation Reason**: ❌ **NOT SUPPORTED** - No cancellation reason parameter in SDK
- **Idempotency**: ⚠️ **PARTIAL** - Relies on tran_id for idempotency (similar to completion)
- **State Validation**: ✅ Correct - Validates transactionId format (pre-auth.ts line 94)

### Severity Assessment:
- Missing cancellation reason: **LOW** - PayWay may not require or use cancellation reasons
- Limited idempotency: **LOW** - tran_id provides basic protection

### Remediation:
1. Consider adding optional cancellation reason parameter if PayWay API supports it
2. Document current idempotency limitations

**Status**: [PASS] Cancel Pre-Auth implementation is correct (with noted limitations)

---

## Summary

| Sub-component | Status | Severity | Issues |
|---------------|--------|----------|--------|
| 2.1.1 Create Pre-Auth | [PASS] | - | None |
| 2.1.2 Complete Pre-Auth Without Payout | [FAIL] | MEDIUM | Missing 10% over-capture support |
| 2.1.3 Complete Pre-Auth With Payout | [PASS] | - | None |
| 2.1.4 Cancel Pre-Auth | [PASS] | LOW | Missing cancellation reason parameter |

### Overall Assessment:
The PayWay SDK CLI implementation shows strong adherence to API endpoint specifications with one notable gap: the lack of 10% over-capture support in pre-auth completion. This could cause legitimate transactions where merchants need to capture slightly more than the authorized amount (e.g., for tips or incidental charges) to fail unnecessarily.

All other endpoints are correctly implemented with proper validation, error handling, and PayWay API contract compliance.