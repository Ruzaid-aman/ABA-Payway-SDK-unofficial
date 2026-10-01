# Purchase payment-credential endpoint error table (ABA, retrieved 2026-10-01)

> Raw source table as received from the ABA dev team (Telegram relay). Folded into the
> explain maps (src/constants.ts GATEWAY_CODE_HINTS + src/cli/explain-code.ts QR/COF hints)
> on 2026-10-01; the machine-readable registry regenerates via npm run gen:error-registry.
> INTERNAL - never packaged (check-package-contents forbids docs/internal/).

```
API: POST /api/payment-gateway/v3/purchase/payment-credential
Scope: error codes reachable from THIS endpoint only.

CODE | MESSAGE | MEANING
-----------------------------------------------------------------------
00 | Success. | Payment approved (or redirect to 3DS page).

01 | Wrong Hash. | The hash value does not match the one computed from the request fields with the merchant public key.

04 | The given data was invalid. | Request body failed field validation (missing/too long/wrong format field).

3 | Invalid Transaction Amount. | Amount below minimum (USD < 0.01 or KHR < 100).

6 | Requested Domain is not in whitelist. | Referer/IP of the caller is not in the merchant whitelisted domains.

08 / 8 | Something went wrong. Please reach out to our digital support team for assistance. | Unexpected internal failure while processing the purchase.

11 | Something went wrong. Try again or contact the merchant for help. | No valid response returned from the payment processor.

12 | Payment currency is not allowed. | Merchant profile has no settlement account for the requested currency.

22 | This service is not enabled. Please contact support for assistance. | Requested transaction type is not supported for this merchant profile.

25 | Allow maximum 10 beneficiaries per requests. | Payout list contains more than 10 beneficiaries.

26 | Invalid Merchant Profile. | merchant_id not found, inactive, or not an online outlet.

32 | Service is not enable. | Feature not enabled on the merchant profile (pre-auth, payout, AOF or COF).

35 | Payout Info is invalid. | Payout data cannot be parsed or has invalid structure.

36 | Payout account or amount is invalid. | Payout amount total does not match or is invalid.

37 | Payout accounts are not in whitelist. | One of the payout accounts is not whitelisted for this merchant.

38 | Payout contain invalid Transaction ID. | A payout entry has an invalid tran_id.

39 | Payout contain Duplicated Account. | The same beneficiary account appears more than once.

40 | Payout contain Duplicated Transaction ID. | A payout tran_id already exists.

41 | Payout info contain mid not link with any Merchant Profile. | Payout MID is not linked to any merchant profile.

44 | Purchase has reached transaction limit. | Daily/monthly transaction or amount limit reached.

46 | Purchase amount for KHR currency could not contain decimal place. | KHR amount has decimals.

71 | Payout for card payment is not allowed to ABA account. | Card token payout cannot target an ABA account.

77 | Merchant transactions do not support transaction fees. | Consumer/merchant fee configuration is not supported for this card-on-file purchase.

80 | Custom fields invalid. | custom_fields or items cannot be decoded, or items exceed the max allowed per request.

83 | Transaction is duplicated. | tran_id already used for this merchant profile.

102 | The URL is not in the whitelist. | callback_url host is not whitelisted or is not a valid URL.

105 | Invalid payment credential token. | Token not found / removed / frozen / expired, token_flag not allowed, or amount exceeds the token per-transaction limit.

CDA45 | Payer account has insufficient funds. | Payer balance is not enough to complete the payment.

503 | System under maintenance. We'll update you when available. Thanks for your patience. | Service is in maintenance mode.
```
