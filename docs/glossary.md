# Glossary

> Every technical term a junior developer might encounter while integrating ABA PayWay. Terms are listed alphabetically.

---

## A

### API Key
A secret string of characters provided by ABA PayWay. Used as the HMAC key to sign all API requests and verify webhook signatures. **Never commit to version control or expose in frontend code.**

Example format: `[REMOVED-HISTORICAL-6f49ced9c4d9]`

---

## B

### Bakong
Cambodia's national payment system, operated by the National Bank of Cambodia. KHQR codes use the Bakong standard. PayWay supports Bakong payments through its QR API.

### Base64
An encoding format that represents binary data as ASCII text. PayWay uses Base64 for:
- HMAC signature output (most endpoints)
- QR image data (`qrImage` response field)
- RSA-encrypted payloads

### Beneficiary
A bank account that receives money through a **payout**. Before you can send money to an account, you must **add the beneficiary** and whitelist them via `payway.payout.addBeneficiary()`.

---

## C

### Callback
A server-to-server HTTP POST request sent by PayWay to your backend after a payment is confirmed. The callback payload includes the transaction result and is **cryptographically signed** with your API key for verification. Also called a **webhook**.

### Callback URL
The public HTTPS URL on your server where PayWay sends callbacks. Example: `https://yourdomain.com/api/payway-webhook`

### CIDR Notation
A way of representing IP address ranges. PayWay requires you to whitelist callbacks from its IP ranges. Format example: `203.0.113.0/24`

### Continue Success URL
A URL PayWay redirects to after a successful payment, **in addition to the return URL**. Used for deferred success pages or tracking.

### CoF (Credentials-on-File)
A feature that allows you to save a customer's payment method (card or bank account) as a token, then charge it later without the customer re-entering details. Essential for subscriptions and one-click checkout.

### CRC-16 CCITT
A 16-bit cyclic redundancy check used in KHQR offline QR generation. Appended at the end of the QR payload to detect transmission errors. Uses polynomial `0x1021` with initial value `0xFFFF`.

### CTID
**Customer Token Identifier.** A unique ID you assign to each customer for Credentials-on-File operations. Required for linking, renewing, and unlinking saved payment methods. Think of it as your internal customer reference number.

### Currency
PayWay supports two currencies:
- **KHR** — Cambodian Riel
- **USD** — United States Dollar

---

## D

### Deep Link URI
A special URL format (`abapay://...`) that opens the ABA Pay mobile app directly instead of a web browser. Used in mobile apps to provide a smoother payment experience. The exact URI scheme format is [TBD: confirm with ABA support].

---

## E

### EMVCo
The standards body (Europay, Mastercard, Visa) that defines the QR code payment standard used by KHQR. The EMVCo TLV (Tag-Length-Value) format is used to encode payment data into a QR payload.

### Environment
The PayWay endpoint cluster your SDK connects to:
- **sandbox** — `https://checkout-sandbox.payway.com.kh` (test mode, no real money)
- **production** — `https://checkout.payway.com.kh` (live, real money)

---

## F

### Frequency
For Credentials-on-File card linking, how often the saved card will be charged:
- `1W` — Once per week
- `1M` — Once per month
- `2M` — Once every 2 months

---

## H

### Hash
The HMAC-SHA512 signature computed from request parameters. Sent as the `hash` field in every API request. In webhook callbacks, the `hash` field is the signature you must verify.

### Hex
Hexadecimal encoding. Some PayWay endpoints (notably **Payout**) require the HMAC signature in hex format instead of the default Base64.

### HMAC-SHA512
**Hash-based Message Authentication Code** using the SHA-512 hash algorithm. PayWay uses this to sign all API requests and verify webhooks:
1. Specific parameter values are concatenated in a fixed order
2. The concatenated string is hashed with your API key as the secret
3. The result is Base64 (or hex) encoded and sent as the `hash` field

> ⚠️ **Important:** PayWay uses **HMAC-SHA512**, not HMAC-SHA256. Some older documentation may incorrectly reference SHA-256.

---

## K

### KHQR
Cambodia's national QR code payment standard, based on EMVCo specifications. KHQR allows customers to scan a QR code with any Cambodian banking app (ABA Pay, ACLEDA, etc.) to make a payment. The SDK supports two KHQR workflows:
1. **Online** via `payway.qr.generateQr()` — API-generated QR with server-side validation
2. **Offline** via `payway.khqr.generateOfflineQR()` — Generate QR locally without API call

---

## M

### Merchant Auth
An RSA-encrypted JSON object containing sensitive data (like payout beneficiary details). Required by endpoints such as Pre-Auth completion and Payout. The SDK automatically encrypts `merchant_auth` using your RSA public key in 117-byte chunks with PKCS1 padding.

### Merchant ID
The unique identifier assigned to you by ABA PayWay when you register as a merchant. This is NOT secret — it appears in plaintext in API requests. Format example: `ec476910`

### Merchant Reference Number (merchantRefNo)
Your internal reference for a payment link or transaction. Used to match PayWay records to your own order/ledger system.

---

## P

### Payment Token
See **PWT**.

### PayWay Code (paywayCode)
An internal error code returned by PayWay in API responses. Examples:
- `"1"` — Wrong Hash (HMAC signature mismatch)
- `"15"` — Invalid Merchant
- `"22"` — Expired Transaction

### PKCS1
**Public Key Cryptography Standard #1.** The padding scheme used by PayWay's RSA encryption. The SDK splits plaintext into 117-byte chunks (due to 1024-bit RSA keys) and encrypts each chunk with PKCS1 v1.5 padding.

### Pre-Auth (Pre-Authorization)
A two-step payment flow:
1. **Authorize** — Hold funds on a customer's card (e.g., hotel deposit)
2. **Capture** — Actually charge the held amount (or **Cancel** the hold)

### PWT (PayWay Token)
A token string representing a saved payment method in the Credentials-on-File system. Format example: `[REMOVED-HISTORICAL-81b242e05d38]`. The SDK field is named `pwt` (NOT `payment_token` — this was a verified sandbox finding).

---

## Q

### QR Payload
The raw string encoded in a QR code. For KHQR, this is an EMVCo TLV-encoded string containing merchant ID, transaction ID, amount, and a CRC-16 checksum. The `qrString` response field contains this payload.

### QR Image Template
PayWay's QR API supports multiple visual templates for the generated QR image. Valid values include `template1`, `template2`, etc. The `qrImage` response field contains the rendered QR as a Base64-encoded PNG.

---

## R

### Return URL
The URL PayWay redirects the customer's browser to after completing (or cancelling) a payment. **Do not trust the return URL alone to confirm payment** — it can be spoofed or the user may close the browser before it fires. Always verify via the server-side callback.

### RSA Public Key
A cryptographic key provided by ABA PayWay for RSA encryption. Required for endpoints like Pre-Auth, Payout, and Payment Link. Format: PEM-encoded public key (begins with `-----BEGIN PUBLIC KEY-----`).

---

## S

### Sandbox
PayWay's test environment where you can simulate payments without real money. Uses `checkout-sandbox.payway.com.kh` and dedicated test credentials.

### Status Code (PayWay)
PayWay uses numeric status codes to indicate transaction states:
- `0` — Approved / Successful
- `1` — Wrong Hash
- `6` — Pending
- `22` — Expired
- `49` — Invalid Request
- Others — See the full error table in [Chapter 12 — Error Handling](./12-error-handling-and-debugging.md)

---

## T

### Timing-Safe Comparison
A constant-time string comparison algorithm that prevents timing attacks. The SDK uses Node.js's `crypto.timingSafeEqual()` when verifying webhook signatures, ensuring attackers cannot guess the signature one character at a time.

### TLV (Tag-Length-Value)
A data encoding format used by EMVCo for KHQR QR payloads:
- **Tag** — A numeric ID identifying what the data is (e.g., `00` = Payload Format Indicator)
- **Length** — How many bytes the value is
- **Value** — The actual data

### Token
See **PWT**.

### Token Flag
A code that describes how a saved credential (CoF token) can be used:
- `CITR_FLEX` — Customer-Initiated Transaction, Recurring + Flexible
- Other flags as defined by PayWay documentation

### Transaction ID
Your unique identifier for a payment transaction. Must be unique per merchant account. Format: you decide (e.g., `order-20240101-001`). Used to check transaction status and handle idempotent callbacks.

---

## W

### Webhook
See **Callback**.

---

## References

- [ABA PayWay Developer Portal](https://developer.payway.com.kh)
- [National Bank of Cambodia — Bakong](https://bakong.nbc.gov.kh)
- [EMVCo QR Code Specifications](https://www.emvco.com/emv-technologies/qrcodes/)