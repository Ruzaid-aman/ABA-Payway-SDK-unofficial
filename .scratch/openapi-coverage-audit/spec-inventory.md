# Spec Inventory — `docs/archive/Default module.openapi.json`

- **Source**: `D:\Antigravity_google\SDK-prepration\docs\archive\Default module.openapi.json` (note the space in the filename)
- **OpenAPI version**: `3.1.0`, info.title `Default module`, info.version `1.0.0`
- **Endpoint count**: **33 paths, all POST** (one operation per path; zero GET/PUT/DELETE)
- **Auth**: `components.securitySchemes` is an empty object `{}`; top-level `security` is `[]`; no per-operation `security`. The spec models auth *inside* the body as a `hash` field (HMAC-SHA512/SHA256 with `public_key`) on every request, plus RSA-chunk-encrypted `merchant_auth`/`request_data`/`beneficiaries` fields on merchant-portal/payout endpoints.
- **Request content types**: `application/json` (28 endpoints) or `multipart/form-data` (5 endpoints: `payments/purchase`, `cof/initial`, `v3/cof/link-card`, `payment-link/create`, and `payments/purchase` uses multipart; also `cof/initial` and `payment-link/create`).
- **`operationId`**: present on only 4 operations (`link-account`, `renew-expired-account-token`, `remove-token` under payment-credential, plus none others). All others omit it.
- **`components.schemas` names** (7 schemas — none referenced by any path; boilerplate/petstore leftovers): `Transaction`, `Pet`, `Category`, `Tag`, `PayWayPaymentGateway_Features_AccountOnFile_AofRequestQr_AofRequestQrRequest`, `PayWayPaymentGateway_Features_TokenManagement_CheckPushbackStatus_CheckPushbackStatusRequest`, `PayWayPaymentGateway_Features_TokenManagement_RemoveToken_RemoveTokenRequest`, `PayWayPaymentGateway_Features_TokenManagement_RenewExpiredToken_RenewExpiredTokenRequest`, `Woocommerce` (9 entries; 4 are PayWay-named request models that duplicate the legacy `/api/aof/*` bodies). `components.responses`: `Record not found`, `Invalid input`. All path schemas are inline.
- **Response content types**: `application/json` (most), `text/html` (`payments/purchase` 200 and `cof/initial` 200 and `v3/cof/link-card` 200).

## Summary table (33 endpoints)

| # | Path | Summary |
|---|------|---------|
| 1 | `/api/payment-gateway/v1/payments/purchase` | Subscription |
| 2 | `/api/payment-gateway/v1/payments/transaction-detail` | Get a transaction details |
| 3 | `/api/payment-gateway/v1/payments/close-transaction` | Close transaction |
| 4 | `/api/payment-gateway/v1/payments/check-transaction-2` | Check transaction |
| 5 | `/api/merchant-portal/merchant-access/online-transaction/refund` | Refund API |
| 6 | `/api/payment-gateway/v1/payments/transaction-list-2` | Get transaction list |
| 7 | `/api/payment-gateway/v1/exchange-rate` | Exchange rate |
| 8 | `/api/aof/request-qr` | Link Account |
| 9 | `/api/payment-gateway/v1/cof/initial` | Link Card |
| 10 | `/api/aof/remove-account` | Remove account token |
| 11 | `/api/payment-gateway/v1/cof/remove` | Remove card token |
| 12 | `/api/aof/renew-expired-account` | Renew account token |
| 13 | `/api/aof/pushback-status` | Get linked account details |
| 14 | `/api/payment-credential/v3/aof/link-account` | Link Account |
| 15 | `/api/payment-credential/v3/cof/link-card` | Link Card |
| 16 | `/api/payment-gateway/v3/purchase/payment-credential` | Payment |
| 17 | `/api/payment-credential/v3/token-management/renew-expired-account-token` | Renew Token |
| 18 | `/api/payment-credential/v3/token-management/get-token-details` | Get token details |
| 19 | `/api/payment-credential/v3/token-management/remove-token` | Remove token |
| 20 | `/api/payment-gateway/v1/payments/request-qr` | QR API for Soundbox |
| 21 | `/api/payment-gateway/v1/payments/generate-qr` | QR API |
| 22 | `/api/merchant-portal/merchant-access/payment-link/void` | Void payment link |
| 23 | `/api/merchant-portal/merchant-access/payment-link/create` | Create payment link |
| 24 | `/api/merchant-portal/merchant-access/payment-link/detail` | Get payment link details |
| 25 | `/api/merchant-portal/merchant-access/online-transaction/pre-auth-completion` | Complete pre-auh transaction with payout |
| 26 | `/api/merchant-portal/merchant-access/online-transaction/pre-auth-cancellation` | Cancel pre-purchase transaction |
| 27 | `/api/payment-gateway/v2/direct-payment/merchant/payout` | Payout |
| 28 | `/api/merchant-portal/merchant-access/whitelist-account/update-whitelist-status` | Update a beneficiary status |
| 29 | `/api/merchant-portal/merchant-access/whitelist-account/add-whitelist-payout` | Add a beneficiary to whitelist |
| 30 | `/api/merchant-portal/online-self-activation/new-merchant` | Register a merchant |
| 31 | `/api/merchant-portal/online-self-activation/get-mc-credential-info` | Inquiry merchant info |
| 32 | `/api/merchant-portal/online-self-activation/get-mc-info` | Get Merchant API  |
| 33 | `/api/payment-gateway/v1/payments/get-transactions-by-mc-ref` | Get transactions |

Template used below:
- Summary / operationId / content-type
- Request fields: `name` (type, required?, maxLength, enum/notes)
- Response fields per status code
- Hash concatenation order (verbatim from the spec's PHP sample `b4hash` line, when present)

---

### /api/payment-gateway/v1/payments/purchase
- Summary: Subscription — "make a purchase transaction while at the same time linking the customer's card and ABA account to the merchant's system" (purchase + token in one call)
- operationId: none. Request content-type: `multipart/form-data`
- Request fields (28):
  - `req_time` (string, REQUIRED) — Request date/time UTC `YYYYMMDDHHmmss`
  - `merchant_id` (string, REQUIRED, maxLength 30) — unique merchant key
  - `tran_id` (string, REQUIRED, maxLength 20) — unique transaction identifier
  - `firstname` (string, maxLength 20) — buyer's first name (note: `firstname`, not `first_name`)
  - `lastname` (string, maxLength 20) — buyer's last name
  - `email` (string, maxLength 50) — buyer's email
  - `phone` (string, maxLength 20) — buyer's phone
  - `type` (string, maxLength 20) — values: `purchase` (for full purchase)
  - `payment_option` (string, REQUIRED, maxLength 20) — enum in description: `cards`, `abapay`, `abapay_deeplink`
  - `items` (string, maxLength 500) — base64-encoded JSON array of items
  - `shipping` (number) — shipping fee
  - `amount` (number, REQUIRED) — purchase amount
  - `currency` (string) — `KHR` or `USD`; defaults to merchant profile currency
  - `return_url` (string) — payment notification URL
  - `cancel_url` (string) — redirect after cancel/close
  - `skip_success_page` (integer) — override profile-level setting
  - `continue_success_url` (string) — redirect after success
  - `return_deeplink` (string) — base64-encoded iOS+Android schemes
  - `custom_fields` (string) — base64-encoded JSON
  - `return_params` (string) — data returned to return URL
  - `view_type` (string) — `hosted_view` | `popup`
  - `payment_gate` (integer) — set `0` to use Checkout service when profile supports QR Payment API
  - `payout` (string) — base64 JSON `[{"acc": ..., "amt": ...}]` (keys `acc`/`amt`)
  - `lifetime` (integer) — minutes; default 30 days, min 3 mins, max 30 days
  - `ctid` (string, REQUIRED) — no description in spec ("none")
  - `token_flag` (string) — supported token flag `CITR_FIX`
  - `frequency` (string) — required when `token_flag` = `CITR_FIX`; values `1W` (weekly), `1M` (monthly), `2M` (every 2 months)
  - `hash` (string, REQUIRED) — HMAC-SHA512; b4hash order (verbatim): `$req_time . $merchant_id . $tran_id . $amount . $items . $shipping . $firstname . $lastname . $email . $phone . $type . $payment_option . $return_url . $cancel_url . $continue_success_url . $return_deeplink . $currency . $custom_fields . $return_params . $payout . $lifetime . $additional_params . $skip_success_page . $token_flag . $frequency` (note: includes `$additional_params` although there is NO `additional_params` request field defined in this schema)
- Response (200, `text/html`): schema is an empty inline object (`properties: {}`) with a stray `required: ["01JME5PQCH7BA4JH9V9C51N1FV"]` (ULID-looking junk). Two named examples: (1) "Success" = PayWay Checkout HTML page, (2) "Success" = JSON body `{ "status": { "code": "00", "message": "Success!", "tran_id": "trx-20201019130949" }, "qr_string": "...", "abapay_deeplink": "...", "checkout_qr_url": "..." }`

### /api/payment-gateway/v1/payments/transaction-detail
- Summary: Get a transaction details — "does not support real-time payment status checks during payment processing"; supports history/related operations
- Request content-type: `application/json`
- Request fields (4, all REQUIRED):
  - `req_time` (string) — UTC `YYYYMMDDHHmmss`
  - `merchant_id` (string, maxLength 20) — unique merchant key
  - `tran_id` (string, maxLength 20) — the purchase transaction ID (spec typo: "purcahse")
  - `hash` (string) — b4hash: `$req_time . $merchant_id . $tran_id`
- Response (200, `application/json`):
  - `data` (object): `transaction_id`, `payment_status_code` (number; `0`=APPROVED/PRE-AUTH, `2`=PENDING, `3`=DECLINDED, `4`=REFUNDED, `7`=CANCELLED), `payment_status` (string; `APPROVED`, `PRE-AUTH`, `PENDING`, ...), `original_amount`, `original_currency`, `payment_amount`, `payment_currency`, `total_amount`, `refund_amount`, `discount_amount`, `apv`, `transaction_date`, `first_name`, `last_name`, `email`, `phone`, `bank_ref`, `payment_type` (`ABA Pay`, `Alipay`, `Wechat`, ...), `payer_account`, `bank_name`, `card_source` (`ONUS`, `OFFUS_DOMESTIC`, `OFFUS_INTERNATIONAL`), `transaction_operations` (array of objects: `status`, `amount`, `transaction_date`, `bank_ref`)
  - `data.status` (object): `code` (string; `00`, `5`, `6`, `8`, `11`, `429`), `message`, `tran_id`

### /api/payment-gateway/v1/payments/close-transaction
- Summary: Close transaction — closed transaction's payment status becomes CANCELLED
- Request content-type: `application/json`
- Request fields (4, all REQUIRED): `req_time` (string), `merchant_id` (string, maxLength 20), `tran_id` (string, maxLength 20, original purchase transaction id to close/cancel), `hash` (string) — b4hash: `$req_time . $merchant_id . $tran_id`
- Response (200, `application/json`): `status` (object, all REQUIRED): `code` (string; `00` Success, `1` Wrong Hash, `5` Transaction not found, `26` Invalid merchant profile), `message`, `tran_id` (purchase transaction id that has been cancelled)

### /api/payment-gateway/v1/payments/check-transaction-2
- Summary: Check transaction — status check; only transactions created within 7 days
- Request content-type: `application/json`
- Request fields (4, all REQUIRED): `req_time` (string), `merchant_id` (string), `tran_id` (string) — hash description's b4hash line says `$req_time . $merchant_id . $tran_id` but the prose says "concatenates values `merchant_id`, and `tran_id`" (inconsistency: prose omits `req_time`, sample includes it)
- Response (200, `application/json`):
  - `data` (object): `payment_status_code` (integer; `0`,`2`,`3`,`4`,`7` as above), `total_amount`, `original_amount`, `refund_amount`, `discount_amount`, `payment_amount`, `payment_currency`, `apv`, `payment_status`, `transaction_date`
  - `data.status` (object): `code` (string; `00`, `5` Invalid hash, `6` Transaction not found, `8` Invalid merchant profile, `11` Internal server error, `429` Reach request limit), `message`, `tran_id`

### /api/merchant-portal/merchant-access/online-transaction/refund
- Summary: Refund API — full/partial refunds within 30 days; ABA PAY and KHQR immediate
- Request content-type: `application/json`
- Request fields (4, all REQUIRED):
  - `request_time` (string) — UTC `YYYYMMDDHHmmss` (note `request_time`, not `req_time`)
  - `merchant_id` (string, maxLength 20)
  - `merchant_auth` (string) — RSA-chunk-encrypted JSON containing: `mc_id` (string, mandatory, same as merchant_id), `tran_id` (string, mandatory, purchase transaction id to refund), `refund_amount` (decimal, mandatory)
  - `hash` (string) — b4hash: `$request_time . $merchant_id . $merchant_auth`
- Response (200, `application/json`): `grand_total` (number, format double), `total_refunded` (number, double), `currency` (string), `transaction_status` (string — always `REFUNDED`), `status` (object): `code` (`00`, `PTL02` Invalid hash, `PTL04`, `PTL05`, `PTL06`, `PTL37`, `PTL57`, `PTL58`, `PTL62`, `PTL63`, `PTL168` concurrent requests, `PTL169` settlement account closed, `PTL181` balance not enough, `PTL186` invalid amount format, `PTL187` below minimum), `message`

### /api/payment-gateway/v1/payments/transaction-list-2
- Summary: Get transaction list — filter by date/amount/payment type/status, paginated
- Request content-type: `application/json`
- Request fields (10; 3 REQUIRED):
  - `req_time` (string, REQUIRED) — UTC `YYYYMMDDHHmmss`
  - `merchant_id` (string, REQUIRED) — merchant key
  - `from_date` (string, optional) — format `YYYY-MM-DD HH:mm:ss`; default today `00:00:00`
  - `to_date` (string, optional) — format `YYYY-MM-DD HH:mm:ss`; default today `23:59:59`
  - `from_amount` (number, double, optional) — search purchased amount from
  - `to_amount` (number, double, optional) — search purchased amount to
  - `status` (string, optional) — values: `APPROVED`, `PRE-AUTH`, `REFUNDED`, `PENDING`, `DECLINDED`, `CANCELLED`; case-insensitive; multiple values separated (description truncated in spec)
  - `page` (string, optional) — default `1`
  - `pagination` (string, optional) — records per page; default `40`, max `1000`
  - `hash` (string, REQUIRED) — b4hash (verbatim, includes a literal `+` operator where `.` was presumably meant): `$req_time . $merchant_id . $from_date . $to_date + $from_amount . $to_amount . $status . $page . $pagination`
- Response (200, `application/json`):
  - `data` (array of objects, each): `transaction_id`, `transaction_date`, `apv`, `payment_status`, `payment_status_code`, `original_amount`, `original_currency`, `total_amount`, `discount_amount`, `refund_amount`, `payment_amount`, `payment_currency`, `first_name`, `last_name`, `email`, `phone`, `bank_ref`, `payment_type`, `payer_account`, `bank_name`, `card_source` (21 props, none required)
  - `page` (string), `pagination` (string)
  - `status` (object): `code` (`anyOf` string|integer; `00`, `1` Wrong hash, `8` Invalid merchant profile, `11` Internal server error, `429` Rate limit exceeded), `message`, `tran_id`

### /api/payment-gateway/v1/exchange-rate
- Summary: Exchange rate — latest ABA rates as on ababank.com forex page
- Request content-type: `application/json`
- Request fields (3, all REQUIRED): `req_time` (string), `merchant_id` (string), `hash` (string) — b4hash: `$req_time . $merchant_id`
- Response (200, `application/json`):
  - `status` (object, all REQUIRED): `code` (`00` Success, `1` Wrong hash, `26` Invalid merchant profile), `message`
  - `exchange_rates` (object, REQUIRED) — currency sub-objects, each `{ sell: string, buy: string }` (all REQUIRED): `aud` (Australia dollar), `sgd` (Singapore dollar), `eur` (Euro), `gbp` (Pound sterling), `myr` (Malaysian Ringgit), `thb` (Thai Baht), `hkd` (Hong Kong Dollar), `cny` (Chinese Yuan), `cad` (Canadian Dollar), `krw` (South Korean won), `jpy` (Japanese Yen), `vnd` (Vietnamese dong) — 12 currencies

### /api/aof/request-qr  (legacy v1 AOF — suspected NOT implemented in SDK)
- Summary: Link Account — returns QR or ABA Mobile deeplink to link an ABA account; pushback sends token
- Request content-type: `application/json`
- Request fields (6; 4 REQUIRED):
  - `req_time` (string, REQUIRED) — UTC `YYYYMMDDHHmmss`
  - `merchant_id` (string, REQUIRED, maxLength 20) — merchant key
  - `return_param` (string, REQUIRED) — extra info included when gateway calls `return_url` (singular `return_param`, vs v3's `return_params`/`callback_url`)
  - `return_url` (string, optional) — token details sent here; defaults to merchant profile pushback URL if empty
  - `return_deeplink` (string, optional) — embedded in Done button after linking
  - `hash` (string, REQUIRED) — b4hash: `$merchant_id . $req_time . $return_deeplink` (note: hash includes `return_deeplink` even though that field is optional; omits `return_param`)
- Response (200, `application/json`, all fields REQUIRED): `deeplink` (string), `qr_string` (string), `qr_image` (string — full URL of the QR image), `expire_in` (number — token expiry timestamp), `status` (object): `code` (`00` Success, `04` Request parameter required, `11` Server-side error), `message`

### /api/payment-gateway/v1/cof/initial  (v1 COF — suspected NOT implemented in SDK)
- Summary: Link Card — returns HTML for card entry (Visa, Mastercard, JCB, UPI); token sent to `return_url`
- Request content-type: `multipart/form-data`
- Request fields (10; 3 REQUIRED; note NO `req_time` in the schema):
  - `merchant_id` (string, REQUIRED) — merchant key (no maxLength in spec)
  - `ctid` (string, optional) — consumer identification number
  - `return_param` (string, REQUIRED) — extra info for return_url call (singular)
  - `firstname` (string, optional) — consumer first name (note `firstname`)
  - `lastname` (string, optional) — consumer last name
  - `email` (string, optional) — spec description says "Your consumer name." (copy-paste error)
  - `phone` (string, optional)
  - `return_url` (string, optional) — defaults to profile pushback URL
  - `continue_add_card_success_url` (string, optional) — embedded in Done button
  - `hash` (string, REQUIRED) — b4hash: `$merchant_id . $ctid . $return_param` (no req_time — none exists)
- Response (200, `text/html`): inline schema `{"type":"object","properties":{}}` with `example` of a full PayWay Checkout HTML page — no structured properties

### /api/aof/remove-account  (legacy v1 AOF — suspected NOT implemented in SDK)
- Summary: Remove account token — irreversible
- Request content-type: `application/json`
- Request fields (5, all REQUIRED): `req_time` (string), `merchant_id` (string, maxLength 20), `ctid` (string, maxLength 250), `pwt` (string, maxLength 250) — token generated by the payment gateway, `hash` (string) — b4hash: `$merchant_id . $req_time . $ctid . $pwt`
- Response (200, `application/json`): `status` (object, all REQUIRED): `code` (`00` Success, `04` Missing required parameter, `29` Invalid `ctid` or `pwt`, `500` Server-side error), `message`

### /api/payment-gateway/v1/cof/remove  (v1 COF — suspected NOT implemented in SDK)
- Summary: Remove card token — irreversible
- Request content-type: `application/json`
- Request fields (4, all REQUIRED; NO `req_time` field): `merchant_id` (string, maxLength 20), `ctid` (string, maxLength 250), `pwt` (string, maxLength 250), `hash` (string) — b4hash: `$merchant_id . $ctid . $pwt`
- Response (200, `application/json`): `status` (object, all REQUIRED; the `status` property itself carries a description "status"): `code` (`00` Success, `1` Invalid hash value, `11` Unexpected error, `26` Merchant profile invalid, `29` Invalid `ctid`/`pwt`), `message`

### /api/aof/renew-expired-account  (legacy v1 AOF — suspected NOT implemented in SDK)
- Summary: Renew account token — required once account token expires
- Request content-type: `application/json`
- Request fields (5, all REQUIRED; no maxLengths): `req_time` (string — "Request timestamp (UTC) in YmdHis format"), `merchant_id` (string), `ctid` (string), `pwt` (string), `hash` (string) — b4hash: `$merchant_id . $ctid . $pwt . $req_time` (NOTE: different order from `/api/aof/remove-account`, which is `$merchant_id . $req_time . $ctid . $pwt`)
- Response (200, `application/json`, all REQUIRED): `status` (object): `code` (`00`, `04`, `29` Invalid ctid or pwt, `500`), `message`; `expired_in` (number — new expiry timestamp) — note `expired_in` is a TOP-LEVEL sibling of `status` here, unlike pushback-status where it is inside `data`

### /api/aof/pushback-status  (legacy v1 AOF — suspected NOT implemented in SDK)
- Summary: Get linked account details — manual retrieval if pushback missed; account tokens ONLY, not card tokens
- Request content-type: `application/json`
- Request fields (4, all REQUIRED): `req_time` (string), `merchant_id` (string, maxLength 20), `return_param` (string, maxLength 255 — "unique request of a transaction"), `hash` (string) — b4hash: `$merchant_id . $req_time . $return_param` (the prose contains a stray space: "` req_time`")
- Response (200, `application/json`):
  - `data` (object, REQUIRED): `ctid` (string, REQUIRED), `pwt` (string, REQUIRED), `mask_account` (string, REQUIRED — last 4 digits only), `expired_in` (number, REQUIRED)
  - `status` (object, REQUIRED): `code` (`403` Not Found, `PW59` Invalid Merchant Profile, `04` Parameter Validation Required), `message`, `tran_id` (all REQUIRED)

### /api/payment-credential/v3/aof/link-account
- Summary: Link Account (v3) — QR/deeplink for account linking; token via callback
- operationId: `link-account`. Request content-type: `application/json`
- Request fields (9; 7 REQUIRED):
  - `request_id` (string, REQUIRED) — unique per merchant, 5–24 chars, letters+numbers only; used to fetch token details later
  - `request_time` (string, REQUIRED) — UTC `YYYYMMDDHHmmss`
  - `merchant_id` (string, REQUIRED, maxLength 20)
  - `ctid` (string, REQUIRED) — 5–24 chars, letters and numbers only
  - `return_deeplink` (string|null, optional) — base64-encoded; embedded in Done button
  - `token_flag` (string, REQUIRED) — values: `CITI_FLEX`, `CITO_FLEX`
  - `currency` (string, REQUIRED) — `KHR` or `USD`
  - `callback_url` (string|null, optional) — defaults to profile `pushback_url`
  - `hash` (string, REQUIRED) — b4hash: `$merchant_id . $request_time . $ctid . $return_deeplink . $callback_url . $request_id . $token_flag . $currency`
- Responses:
  - 200 (`application/json`): `status` (object, all REQUIRED): `code` (`00` Success), `message`, `trace_id`; `data` (object, all REQUIRED): `deeplink`, `qr_string`, `expire_in` (integer, int32 — deeplink/qr expire 10 minutes after request)
  - 400: `status` (all REQUIRED): `code` (`04` The given data was invalid), `message`, `trace_id`, `errors` (object — map of property → array of strings)
  - 403: `status` (all REQUIRED): `code` (`01` Wrong Hash, `98` Merchant id not found, `104` Merchant not enabled token flag), `message`, `trace_id`

### /api/payment-credential/v3/cof/link-card
- Summary: Link Card (v3) — HTML card-entry page; token via `callback_url`
- operationId: none. Request content-type: `multipart/form-data`
- Request fields (8; 7 REQUIRED):
  - `request_id` (string, REQUIRED) — unique, 5–24 chars letters+numbers
  - `request_time` (string, REQUIRED) — UTC `YYYYMMDDHHmmss`
  - `merchant_id` (string, REQUIRED, maxLength 20)
  - `ctid` (string, REQUIRED) — 5–24 chars letters+numbers
  - `token_flag` (string, REQUIRED) — `CITI_FLEX`, `CITO_FLEX` ("Make sue the flag is enable on your profile" — typo in spec)
  - `currency` (string, REQUIRED) — `KHR`/`USD`
  - `callback_url` (string, optional) — non-nullable here (v3 AOF's `callback_url` was `string|null`); defaults to profile pushback URL
  - `hash` (string, REQUIRED) — b4hash: `$merchant_id . $request_time . $ctid . $callback_url . $request_id . $token_flag . $frequency . $currency` (NOTE: includes `$frequency` although NO `frequency` field exists in this request schema)
- Response (200, `text/html`): description only — "Regardless of whether the request is successful or results in an error, PayWay will respond with an HTML page." No structured schema.

### /api/payment-gateway/v3/purchase/payment-credential  (full field list)
- Summary: Payment — purchase using a token (PWT)
- operationId: none. Request content-type: `application/json`
- Request fields (20; 9 REQUIRED):
  - `request_time` (string, REQUIRED) — UTC `YYYYMMDDHHmmss`
  - `merchant_id` (string, REQUIRED, maxLength 20)
  - `tran_id` (string, REQUIRED, maxLength 20)
  - `ctid` (string, REQUIRED, maxLength 24)
  - `pwt` (string, REQUIRED) — PayWay Token
  - `first_name` (string|null, maxLength 20) — note `first_name` here vs `firstname` on v1 purchase
  - `last_name` (string|null, maxLength 20)
  - `email` (string|null, maxLength 50)
  - `phone` (string|null, maxLength 20)
  - `amount` (number, REQUIRED, format double) — excl. shipping; KHR ≥ 100, USD ≥ 0.01
  - `shipping_fee` (number, double) — shipping fee (v1 purchase names it `shipping`)
  - `currency` (string, REQUIRED) — `KHR`/`USD`
  - `token_flag` (string, REQUIRED) — values: `CITU_FLEX`, `MITU_FLEX`, `MITR_FIX`
  - `purchase_type` (string|null) — `pre-auth` | `purchase` (default `purchase`)
  - `callback_url` (string) — base64-encoded
  - `items` (string|null, maxLength 500) — base64 JSON array
  - `return_params` (string|null, maxLength 500)
  - `payout` (string|null, maxLength 500) — base64 JSON `[{"acc": ..., "amt": ...}]`
  - `custom_fields` (string|null, maxLength 500) — base64 JSON
  - `hash` (string, REQUIRED) — b4hash: `$request_time . $merchant_id . $tran_id . $amount . $currency . $items . $ctid . $pwt . $first_name . $last_name . $email . $phone . $purchase_type . $callback_url . $custom_fields . $return_params . $payout . $token_flag . $shipping_fee`
- Responses:
  - 200: `status` (all REQUIRED): `code` (`00` Success), `message`, `trace_id`
  - 400: `status` (all REQUIRED): `code` (`04` The given data was invalid), `message`, `trace_id`, `errors` (object)
  - 403: `status` (all REQUIRED): `code` (`01` Wrong Hash, `98` Merchant id not found), `message`, `trace_id`

### /api/payment-credential/v3/token-management/renew-expired-account-token
- Summary: Renew Token — account tokens expire 90 days after link or last successful purchase; user must authorize in ABA Mobile
- operationId: `renew-expired-account-token`. Request content-type: `application/json`
- Request fields (6, all REQUIRED): `request_time` (string), `merchant_id` (string, maxLength 20), `request_id` (string — 5–24 chars letters+numbers; the ORIGINAL link request's id), `ctid` (string), `pwt` (string), `hash` (string) — b4hash: `$ctid . $request_time . $pwt . $merchant_id . $request_id`
- Responses: 200: `status` (`code` `00`, `message`, `trace_id`, all REQUIRED); 400 ("The given data was invalid"): `status` + `errors`; 403 ("Logical validation failed"): `code` (`01` Wrong hash, `98` Merchant id not found, `105` Invalid payment credential token)

### /api/payment-credential/v3/token-management/get-token-details
- Summary: Get token details — manual retrieval if callback missed (account OR card)
- operationId: none. Request content-type: `application/json`
- Request fields (4, all REQUIRED; NO `ctid`/`pwt`): `request_time` (string), `request_id` (string), `merchant_id` (string, maxLength 20), `hash` (string) — b4hash: `$merchant_id . $request_time . $request_id`
- Responses:
  - 200: `status` (all REQUIRED): `code` (`00`), `message`, `trace_id`; `data` (object, all REQUIRED): `ctid`, `pwt`, `source_of_fund` (masked card/account number, last 4 digits), `type` (`Visa`, `MC`, `CUP` (UnionPay), `JCB`, `ABA ACCOUNT`), `status` (integer; `0` removed, `1` active, `2` frozen), `expired_at` (string, format date-time), `token_flag` (`CITI_FLEX`, `CITO_FLEX`, `CITR_FIX`), `frequency` (string|null; `1W`, `1M`, `2M` when `CITR_FIX`, else empty), `subscribed_amount` (number, double; 0 unless CITR_FIX), `amount_limit_per_tran` (number, double), `currency` (string)
  - 400: `status` fields typed `string|null` (not required): `code` (`04`), `message`, `trace_id`, `errors`
  - 403: `status` fields typed `string|null`: `code` (`01` Wrong hash, `98` Merchant id not found, `104` Data not found), `message`, `trace_id`

### /api/payment-credential/v3/token-management/remove-token
- Summary: Remove token — irreversible; push notification sent
- operationId: `remove-token`. Request content-type: `application/json`
- Request fields (5, all REQUIRED): `request_time` (string), `merchant_id` (string, maxLength 20), `ctid` (string), `pwt` (string), `hash` (string) — b4hash: `$merchant_id . $ctid . $request_time . $pwt` (NOTE: differs from renew's order)
- Responses: 200: `status` (`code` `00`, `message`, `trace_id`); 400: `status` + `errors` (`04`); 403: `code` (`01`, `98`). All 200/400/403 fields REQUIRED (unlike get-token-details where 400/403 are nullable).

### /api/payment-gateway/v1/payments/request-qr
- Summary: QR API for Soundbox
- Request content-type: `application/json`
- Request fields (10; 7 REQUIRED):
  - `req_time` (string, REQUIRED) — UTC `YYYYMMDDHHmmss`
  - `merchant_id` (string, REQUIRED, maxLength 30)
  - `tran_id` (string, REQUIRED, maxLength 20)
  - `amount` (number|null, optional) — min 100 KHR / 0.01 USD (nullable — soundbox can enter amount later)
  - `currency` (string, REQUIRED, maxLength 3) — `KHR`/`USD`
  - `purchase_type` (string, maxLength 20) — `pre-auth` | `purchase` (default); Alipay & WeChat do not support pre-auth
  - `payment_option` (string, REQUIRED, maxLength 20) — values: `abapay`, `abapay_khqr`, `wechat` (USD only), `alipay` (USD only)
  - `callback_url` (string, REQUIRED, maxLength 255) — base64-encoded
  - `lifetime` (integer|null) — minutes; default 30 days; min 3 mins, max 30 days
  - `hash` (string, REQUIRED) — b4hash (verbatim, includes the spec's line-wrapping and a `+` typo: `$req_time . $merchant_id . $tran_id . $amount . $items . $first_name . $last_name+ email\n. $phone . $purchase_type . $payment_option . $callback_url . $return_deeplink . $currency .\n$custom_fields . $return_params . $payout . $lifetime . $qr_image_template`) — NOTE: references `$items`, `$first_name`, `$last_name`, `$email`, `$phone`, `$return_deeplink`, `$custom_fields`, `$return_params`, `$payout`, `$qr_image_template`, NONE of which are request fields of this endpoint (copy-paste from generate-qr)
- Response (200, `application/json`, all REQUIRED): `tran_id` (string, no description), `qr_string`, `amount` (number), `currency`, `status` (object): `code` (`0` Success, `1` Invalid Hash, `6` Domain Not Whitelisted, `8` Internal Error, `12` Unsupported Currency, `21` API Expired, `23` Payment Option Disabled, `32` Service Unavailable, `44` Transaction Limit Exceeded, `47` Invalid KHR Amount, `48` Parameter Error, `96` Invalid Merchant, `102` Unapproved URL, `403` Duplicate Transaction ID, `429` Rate Limit Exceeded), `message`, `trace_id`

### /api/payment-gateway/v1/payments/generate-qr
- Summary: QR API — online/instore; KHR supports ABA PAY + KHQR; USD supports ABA PAY, KHQR, WeChat, Alipay
- Request content-type: `application/json`
- Request fields (20; 9 REQUIRED):
  - `req_time` (string, REQUIRED) — UTC `YYYYMMDDHHmmss`
  - `merchant_id` (string, REQUIRED, maxLength 30) — NOTE maxLength 30 here vs 20 elsewhere
  - `tran_id` (string, REQUIRED, maxLength 20)
  - `first_name` (string, maxLength 20)
  - `last_name` (string, maxLength 20)
  - `email` (string, maxLength 50)
  - `phone` (string, maxLength 20)
  - `amount` (number, REQUIRED) — min 100 KHR / 0.01 USD
  - `currency` (string, REQUIRED, maxLength 3) — `KHR`/`USD`, not case-sensitive
  - `purchase_type` (string, maxLength 20) — `pre-auth` | `purchase` (default `purchase`); Alipay & WeChat don't support pre-auth
  - `payment_option` (string, REQUIRED, maxLength 20) — **values (NO `enum` keyword; values only in description)**: `abapay_khqr` (ABA KHQR), `wechat` (USD only), `alipay` (USD only). NOTE: NO `abapay` option here (unlike request-qr/purchase).
  - `items` (string, maxLength 500) — base64-encoded JSON item list, max 10 items
  - `callback_url` (string, maxLength 255) — base64-encoded
  - `return_deeplink` (string, maxLength 255) — base64-encoded `{"android_scheme": ..., "ios_scheme": ...}`
  - `custom_fields` (string, maxLength 255) — base64-encoded JSON
  - `return_params` (string) — extra data returned in pushback
  - `payout` (string, maxLength 255) — base64 JSON with keys `{"account": ..., "amount": ...}` (NOTE: `account`/`amount` here, vs `acc`/`amt` on purchase/checkout paths)
  - `lifetime` (integer, REQUIRED) — minutes; default 30 days; min 3 mins, max 30 days
  - `qr_image_template` (string, REQUIRED, maxLength 20) — QR image template (link to apidog templates folder; no enumerated values in spec)
  - `hash` (string, REQUIRED) — b4hash (verbatim, same typo'd string as request-qr, see above): `$req_time . $merchant_id . $tran_id . $amount . $items . $first_name . $last_name+ email\n. $phone . $purchase_type . $payment_option . $callback_url . $return_deeplink . $currency .\n$custom_fields . $return_params . $payout . $lifetime . $qr_image_template`
- Response (200, `application/json`): `qrString` (string, REQUIRED — camelCase; "QR conent as string" typo), `qrImage` (string, REQUIRED — base64 image), `abapay_deeplink` (string, REQUIRED), `app_store` (string, REQUIRED), `play_store` (string, REQUIRED), `amount` (number, REQUIRED), `currency` (string, REQUIRED), `status` (object, REQUIRED): `code` (string, REQUIRED — `0` Success, `1` Wrong Hash, `6` Domain not whitelisted, `8` Something went wrong, `12` Payment currency not allowed, `16` Invalid First Name, `17` Invalid Last Name, `18` Invalid Phone Number, `19` Invalid Email, `21` End of API lifetime, `23` Payment option not enabled, `32` Service not enabled, `35` Payout info invalid, `44` Amount reached transaction limit, `47` KHR must be > 100, `48` Parameter error, `96` Invalid merchant data, `102` URL not whitelisted, `403` Duplicated Transaction ID, `429` Rate limit), `message` (string, REQUIRED), `trace_id` (string, REQUIRED)

### /api/merchant-portal/merchant-access/payment-link/void
- Summary: Void payment link — cancel an unpaid link
- Request content-type: `application/json`
- Request fields (4, all REQUIRED): `request_time` (string), `merchant_id` (string), `merchant_auth` (string — RSA-encrypted JSON: `mc_id`, `id` (payment link id)), `hash` (string) — b4hash: `$request_time . $merchant_id . $merchant_auth`
- Response (200, `application/json`):
  - `data` (object, REQUIRED): `id` (string, REQUIRED), `title` (string), `image` (object: `image`, `filename`, `size`), `amount` (number, REQUIRED), `currency` (string, REQUIRED, maxLength 3), `status` (string, REQUIRED — `OPEN` when `payment_limit > total_trxn`; `PAID` when limit reached), `description` (string, REQUIRED), `payment_limit` (number, REQUIRED), `total_amount_org` (string, REQUIRED), `total_refund` (string, REQUIRED), `total_amount` (number, REQUIRED), `total_trxn` (number, REQUIRED), `created_at` (string, REQUIRED), `updated_at` (string, REQUIRED), `expired_date` (number, REQUIRED — timestamp), `pushback_url` (string), `payment_link` (string)
  - `status` (object, REQUIRED): `code` (`PTL02` Wrong hash, `PTL132` Invalid payment link), `message`
  - `tran_id` (string, REQUIRED) — log id

### /api/merchant-portal/merchant-access/payment-link/create
- Summary: Create payment link
- Request content-type: `multipart/form-data`
- Request fields (5; 4 REQUIRED):
  - `request_time` (string, REQUIRED) — UTC `YYYYMMDDHHmmss`
  - `merchant_id` (string, REQUIRED)
  - `merchant_auth` (string, REQUIRED) — RSA-encrypted JSON: `mc_id` (mandatory), `title` (mandatory, max 250), `amount` (mandatory — min 100 KHR / 0.01 USD), `currency` (mandatory — `KHR`/`USD`), `description` (optional, max 250), `payment_limit` (optional — blank = no limit), `expired_date` (mandatory — null means no expiry; example uses `time()`), `return_url` (mandatory — base64-encoded), `merchant_ref_no` (optional, max 50 — no duplicate validation), `payout` (optional — "Total payout amount must equal to payment link amount")
  - `image` (string, format binary) — JPG/JPEG/PNG, max 3MB
  - `hash` (string, REQUIRED) — b4hash: `$request_time . $merchant_id . $merchant_auth`
- Response (200, `application/json`):
  - `data` (object): `id`, `title`, `image` (object: `image`, `filename`, `size`), `amount` (double), `currency` (maxLength 3), `status` ("OPEN" once created), `description`, `payment_limit`, `total_amount_org`, `total_amount`, `total_refund` (number here; string in detail/void), `total_trxn`, `created_at`, `updated_at`, `expired_date`, `return_url`, `merchant_ref_no`, `outlet_id`, `outlet_name`, `payment_link`
  - `payout` (array of objects: `acc`, `amt`, `acc_name`) — payout instructions
  - `status` (object): `code` (`PTL02` Wrong Hash, `PTL05` Parameter Invalid Format, `PTL99` Merchant invalid currency, `PTL132` Invalid payment link), `message`
  - `tran_id` (string)

### /api/merchant-portal/merchant-access/payment-link/detail
- Summary: Get payment link details
- Request content-type: `application/json`
- Request fields (4, all REQUIRED): `request_time` (string), `merchant_id` (string), `merchant_auth` (string — RSA-encrypted JSON: `mc_id`, `id` (payment link id from create's `data.id`)), `hash` (string) — b4hash: `$request_time . $merchant_id . $merchant_auth`
- Response (200, `application/json`):
  - `data` (object, REQUIRED): `id` (REQUIRED), `title`, `image` (object: `image`, `filename`, `size`), `amount` (REQUIRED), `currency` (REQUIRED, maxLength 3), `status` (REQUIRED — `OPEN`/`PAID` semantics as void), `description` (REQUIRED), `payment_limit` (REQUIRED), `total_amount_org` (string, REQUIRED), `total_refund` (string, REQUIRED), `total_amount` (REQUIRED), `total_trxn` (REQUIRED), `created_at` (REQUIRED), `updated_at` (REQUIRED), `expired_date` (number, REQUIRED), `pushback_url` (string — note: `pushback_url` here vs `return_url` in create's response), `payment_link` (string)
  - `status` (object, REQUIRED): `code` (`PTL02`, `PTL132`), `message` (REQUIRED)
  - `tran_id` (string, REQUIRED)

### /api/merchant-portal/merchant-access/online-transaction/pre-auth-completion
- Summary: Complete pre-auh transaction with payout (typo "auh" in spec)
- Request content-type: `application/json`
- Request fields (4, all REQUIRED): `request_time` (string), `merchant_id` (string, maxLength 20), `merchant_auth` (string — RSA-encrypted JSON: `mc_id` (mandatory), `tran_id` (mandatory — pre-auth transaction to complete), `complete_amount` (decimal, mandatory), `payout` (string, mandatory — payout instruction `[{"acc": ..., "amt": ...}]`)), `hash` (string) — b4hash: `$merchant_auth . $request_time . $merchant_id` (NOTE: `merchant_auth` FIRST — different from refund/create/detail/void)
- Response (200, `application/json`, all REQUIRED): `grand_total` (number — original authorized amount), `currency` (string, maxLength 3), `transaction_status` (string — `COMPLETED` on success), `status` (object): `code` (`00`, `PTL02`, `PTL04`, `PTL06` request expired, `PTL36` Invalid transaction, `PTL62`, `PTL63`, `PTL59` Unable to complete/cancel, `PTL60` amount exceeds authorized limit, `PTL61` Invalid action type, `PTL153` multiple settlement accounts, `PTL157`, `PTL168` concurrent, `PTL169` settlement account closed, `USD-NOT-ALLOW`, `KHR-LESS-100`, `KHR-CONTAIN-DECIMAL`), `message`

### /api/merchant-portal/merchant-access/online-transaction/pre-auth-cancellation
- Summary: Cancel pre-purchase transaction — release the authorization hold
- Request content-type: `application/json`
- Request fields (4, all REQUIRED): `request_time` (string), `merchant_id` (string, maxLength 20), `merchant_auth` (string — RSA-encrypted JSON: `mc_id`, `tran_id`), `hash` (string) — b4hash: `$merchant_id . $merchant_auth . $request_time` (NOTE: yet another order — `merchant_id` first)
- Response (200, `application/json`, all REQUIRED): `grand_total` (number), `currency` (string, maxLength 3), `transaction_status` (string — `CANCELLED`), `status` (object): `code` (same PTL family as completion incl. `USD-NOT-ALLOW`, `KHR-LESS-100`, `KHR-CONTAIN-DECIMAL`), `message`

### /api/payment-gateway/v2/direct-payment/merchant/payout
- Summary: Payout — split/distribute funds to third parties (Funds Route API)
- Request content-type: `application/json`
- Request fields (7; 6 REQUIRED; NO `req_time`/`request_time` field):
  - `merchant_id` (string, REQUIRED, maxLength 255 — NOTE: maxLength 255 here vs 20/30 elsewhere)
  - `tran_id` (string, REQUIRED, maxLength 20)
  - `beneficiaries` (string, REQUIRED, maxLength 1000) — RSA-chunk-encrypted JSON array: `[{"account": "200030000", "amount": 100}, ...]` (keys `account`/`amount`; mixed MID and Account allowed; all must share the transaction currency)
  - `amount` (number, REQUIRED, format float) — total = sum of beneficiary amounts; KHR ≥ 100, USD ≥ 0.01
  - `currency` (string, REQUIRED, maxLength 3) — `KHR` or `USD`
  - `custom_fields` (string, maxLength 255) — JSON string (NOT base64, NOT encrypted)
  - `hash` (string, REQUIRED, maxLength 512) — b4hash: `$merchant_id . $tran_id . $beneficiaries . $amount . $custom_fields . $currency`
- Response (200, `application/json`): `transaction_id` (string), `transaction_date` (string), `external_reference` (string), `apv` (string — random 6 digits), `transaction_amount` (number, double), `transaction_currency` (string), `beneficiaries` (array of objects: `payout_id`, `name`, `mid_acccount` (typo — three c's), `amount`, `currency`), `status` (object): `code` (`0` Success, `4` Duplicated Transaction ID, `11`, `24` Cannot decrypt, `25` Max 10 beneficiaries, `26` Invalid Merchant Profile, `36` Payout account/amount invalid, `37` Payout accounts not in whitelist, `44` Transaction limit, `48`, `70` Daily limit, `79` Payment Rejected, `80` Custom fields invalid, `81`, `82` Invalid currency, `83` Duplicated, `84`, `85`, `86`, `87`, `88`, `89`, `90`, `91`, `92` Total mismatch, `93` Insufficient balance, `400` Bad request, `LAM01 ` Daily limit (trailing space in spec), `LAM02 ` Monthly limit), `message`, `tran_id`, `trace_id`

### /api/merchant-portal/merchant-access/whitelist-account/update-whitelist-status
- Summary: Update a beneficiary status — toggle active/inactive
- Request content-type: `application/json`
- Request fields (4, all REQUIRED): `request_time` (string), `merchant_id` (string, maxLength 20), `merchant_auth` (string — RSA-encrypted JSON: `mc_id` (mandatory), `payee` (mandatory — MID or ABA account), `status` (int, mandatory — `0` disable, `1` activate)), `hash` (string) — b4hash: `$request_time . $merchant_auth` (NOTE: only two values — `merchant_id` NOT in the hash)
- Response (200, `application/json`): `data` (object): `name` (string), `payee` (string, maxLength 250), `currency` (string), `type` (string, maxLength 20 — "Merchant" or "ABA Account"), `status` (integer — `1` Active, `0` Inactive), `created_at` (string); `status` (object): `code` (`00`, `PTL02`, `PTL04`, `PTL46` Merchant not found, `PTL149` Invalid whitelist account, `PTL150` Business profile not found), `message`

### /api/merchant-portal/merchant-access/whitelist-account/add-whitelist-payout
- Summary: Add a beneficiary to whitelist — must whitelist before payout
- Request content-type: `application/json`
- Request fields (4, all REQUIRED): `request_time` (string), `merchant_id` (string, maxLength 20), `merchant_auth` (string — RSA-encrypted JSON: `mc_id` (mandatory), `payee` (mandatory — MID or ABA account)), `hash` (string) — b4hash: `$request_time . $merchant_auth` (two values only)
- Response (200, `application/json`): `data` (object): `name` (string, maxLength 255), `payee` (string, maxLength 250), `currency` (string, maxLength 10), `type` (string, maxLength 20), `status` (integer — `1`/`0`), `created_at` (string); `status` (object): `code` (`PTL02`, `PTL04`, `PTL25` Invalid account class, `PTL99` Merchant invalid currency, `PTL134` Account not found, `PTL146` Payee invalid, `PTL147` Currency mismatch, `PTL148` Payee already exists, `PTL150`, `PTL151` Failed to whitelist — note: NO `00` success code listed), `message`

### /api/merchant-portal/online-self-activation/new-merchant  (suspected NOT implemented in SDK)
- Summary: Register a merchant
- Request content-type: `application/json`
- Request fields (5; 4 REQUIRED):
  - `request_time` (string, REQUIRED) — UTC `YYYYMMDDHHmmss`
  - `partner_id` (string, REQUIRED, maxLength 250) — encryption string of partner id, provided by ABA
  - `request_data` (string, REQUIRED) — RSA-chunk-encrypted JSON: `pushback_url` (string, mandatatory [sic] — receives merchant details after registration), `redirect_url` (string, mandatory — `{"ios_scheme": ..., "android_scheme": ...}` for native apps or `https://...` for web), `type` (int, optional — `1` native app, `0` web, default `0`), `register_ref` (string, mandatatory [sic] — unique request reference), `merchant_type` (int, optional — `0` instore, `1` online (default)), `currency` (string, mandatatory [sic] — `KHR` or `USD`)
  - `reference_id` (string, optional, maxLength 250) — must match `register_ref` inside `request_data`; unique per request
  - `hash` (string, REQUIRED) — HMAC **SHA256** (not SHA512): b4hash: `$partner_id . $request_data . $request_time`
- Response (200, `application/json`): `url` (string — onboarding form URL to redirect the user to), `token` (string — unique session token), `status` (object): `code` (`00`, `PTL02`, `PTL04`, `PTL06` Request expired, `PTL141` redirect url empty, `PTL142` pushback url empty, `PTL137` Partner id not found, `PTL165` register ref empty, `PTL166` register ref invalid format, `PTL164` register ref already exists, `PTL171` invalid encryption, `PTL170` profile deactivated, `PTL175` Domain not whitelisted), `message` (`code`+`message` REQUIRED, `url`/`token` not)

### /api/merchant-portal/online-self-activation/get-mc-credential-info  (suspected NOT implemented in SDK)
- Summary: Inquiry merchant info
- Request content-type: `application/json`
- Request fields (4, all REQUIRED): `request_time` (string), `partner_id` (string, no maxLength), `request_data` (string — RSA-encrypted JSON: `register_ref` (your request reference number, e.g. `'REQ-0012'`)), `hash` (string) — HMAC **SHA512** here (the prose says "hmac sha512" — contradicts new-merchant/get-mc-info's SHA256); b4hash: `$partner_id . $request_data . $request_time`
- Response (200, `application/json`): `data` (string, REQUIRED — "Encrypted merchant detail", i.e. an encrypted blob, not a structured object), `status` (object, REQUIRED): `code` (`00`, `PTL02`, `PTL04`, `PTL06`, `PTL46` Merchant not found, `PTL137`, `PTL170`, `PTL175`), `message` (REQUIRED)

### /api/merchant-portal/online-self-activation/get-mc-info  (suspected NOT implemented in SDK)
- Summary: Get Merchant API  (trailing space in spec)
- Request content-type: `application/json`
- Request fields (4, all REQUIRED): `request_time` (string), `partner_id` (string), `request_data` (string — RSA-encrypted JSON: `merchant_key` (required), `public_key_hash_encrypt` (required — `hash_hmac('sha512', $partner_id . $merchant_key . $request_time, Merchant public_key)`), `rsa_public_key_hash_encrypt` (optional — `opensslEncrypt($hash_encrypt_string, Merchant rsa_public_key)`)), `hash` (string) — HMAC **SHA256**: b4hash: `$partner_id . $request_data . $request_time`
- Response (200, `application/json`): `data` (object, all REQUIRED): `outlet_name` (string), `aba_account_khr` (string), `aba_account_usd` (string), `available_payment_methods` (object — `properties: {}`, empty schema), `enabled_payment_methods` (object — empty schema), `pending_payment_methods` (object — empty schema); `status` (object): `code` (`00`, `PTL02`, `PTL04`, `PTL06`, `PTL46`, `PTL137`, `PTL170`, `PTL175`), `message` (REQUIRED)

### /api/payment-gateway/v1/payments/get-transactions-by-mc-ref
- Summary: Get transactions — by `merchant_ref`; last 50 transactions; rate-limited (10 requests per ... truncated)
- Request content-type: `application/json`
- Request fields (4, all REQUIRED): `req_time` (string), `merchant_id` (string, maxLength 20), `merchant_ref` (string, maxLength 20 — merchant reference #), `hash` (string) — b4hash: `$req_time . $merchant_id . $merchant_ref`
- Response (200, `application/json`):
  - `data` (array of objects): `transaction_id`, `transaction_date`, `apv`, `payment_status`, `payment_status_code`, `original_amount`, `original_currency`, `total_amount`, `discount_amount`, `refund_amount`, `payment_amount`, `payment_currency`, `bank_ref`, `payment_type`, `payer_account`, `bank_name`, `merchant_ref` (17 props — like transaction-list minus `first_name`/`last_name`/`email`/`phone`/`card_source`, plus `merchant_ref`)
  - `status` (object): `code` (`anyOf` string|integer; `00`, `1` Wrong hash, `8` Invalid merchant profile, `11`, `429`), `message`, `merchant_ref`

---

## Cross-cutting spec oddities (extraction notes)

1. **Mixed timestamp field naming**: payment-gateway v1 + aof v1 use `req_time`; merchant-portal + v3 + self-activation use `request_time`.
2. **Mixed name-field naming**: v1 purchase/cof-initial use `firstname`/`lastname`; v3 purchase + generate-qr/check-transaction responses use `first_name`/`last_name`.
3. **Payout key inconsistency (in spec)**: `generate-qr --payout` + payout-domain `beneficiaries` use `{"account", "amount"}`; purchase/v3-purchase/pre-auth-completion/payment-link use `{"acc", "amt"}`.
4. **Hash orders differ between sibling v1 AOF ops**: remove-account = `merchant_id, req_time, ctid, pwt` but renew-expired-account = `merchant_id, ctid, pwt, req_time`.
5. **v1 vs v3 same-operation shape diffs**: v1 AOF/COF hash `merchant_id . req_time . ...`; v3 hashes start `merchant_id . request_time . ctid . ...` and add `request_id`, `token_flag`, `currency`. v3 token-management ops each have a DIFFERENT hash order (renew: `ctid, request_time, pwt, merchant_id, request_id`; details: `merchant_id, request_time, request_id`; remove: `merchant_id, ctid, request_time, pwt`).
6. **Hash typos in spec**: transaction-list-2 b4hash uses `+` instead of `.` once; request-qr/generate-qr b4hash contains `$last_name+ email` with embedded newlines; purchase's b4hash includes `$additional_params` but the schema has no such field; v3 cof/link-card b4hash includes `$frequency` but the schema has no `frequency` field; request-qr's hash lists ~10 fields that are not in its request schema.
7. **HMAC algorithm inconsistency on self-activation**: new-merchant + get-mc-info say HMAC SHA256; get-mc-credential-info says HMAC SHA512 (all three share the same b4hash order).
8. **`qr_image_template` is REQUIRED on generate-qr** with no enumerated template values (only an apidog link); `lifetime` is REQUIRED on generate-qr but nullable-optional on request-qr.
9. **Missing success code**: add-whitelist-payout's `status.code` list has no `00` entry (update-whitelist-status does).
10. **Response typing inconsistencies**: transaction-list-2 and get-transactions-by-mc-ref type `status.code` as `anyOf [string, integer]`; get-token-details 400/403 fields are `string|null` while all other v3 400/403 fields are required non-null strings.
11. **Boilerplate leftovers**: petstore schemas (`Pet`, `Category`, `Tag`, `Transaction`, `Woocommerce`) and unused `Record not found` / `Invalid input` responses in `components`; purchase 200 schema has junk `required: ["01JME5PQCH7BA4JH9V9C51N1FV"]`.
12. **merchant_id maxLength varies**: 30 (purchase, request-qr, generate-qr), 20 (most others), 255 (payout), none (exchange-rate, transaction-list-2, void, create, detail, self-activation, cof/initial, aof/renew).
13. **payment-link create response `total_refund` is number** but detail/void response `total_refund` is **string**; create returns `return_url` + `outlet_id`/`outlet_name`/`merchant_ref_no` while detail/void return `pushback_url` and lack those outlet fields.
14. **v1 cof/remove and cof/initial have NO `req_time` field at all** (all other v1 gateway/aof ops have it).
15. **`check-transaction-2` hash prose vs sample mismatch**: prose omits `req_time`, PHP sample includes it.
