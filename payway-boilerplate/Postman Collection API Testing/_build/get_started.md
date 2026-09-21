# 🚀 PayWay API — Get Started

**Welcome!** This collection is a complete playground for the [PayWay merchant APIs](https://developer.payway.com.kh/). It ships **pre-configured with the public sandbox demo merchant**, so your first request works immediately — no signup, no keys.

> **While testing:** open the Postman **Console** (bottom-left). Every request logs its `b4hash:` signing string there so you can verify it against the docs.

---

## 1 · Your first transaction (60 seconds, zero setup)

1. Open **03 - Ecommerce Checkout → 1. Purchase (Hosted Checkout)** → hit **Send**.
2. Open the **Visualize** tab of the response → click **Open payment page →**.
   The button form-POSTs your signed fields and the checkout page is served by PayWay itself — no CORS problems.
3. Pay with the sandbox test card:

   | Card | Number | Expiry | CVV | 3-D Secure |
   |---|---|---|---|---|
   | ✅ Success | `4286 0900 0000 0206` | 04/30 | 777 | Yes (any code) |
   | ✅ Success (no 3DS) | `5156 8399 3770 6777` | 01/30 | 993 | No |
   | ❌ Declined | `5156 8302 7256 1029` | 04/30 | 777 | Yes |

4. Back in Postman, send **3. Check Transaction** → `payment_status_code: 0 (APPROVED)` 🎉

That is the whole merchant lifecycle you are learning: **create → host the page → verify**.

> 💡 **Helper text everywhere:** every request's description starts with a **⚡ Quick test** block — what to set (usually nothing), what you'll see, and what to send next. After key responses the **Console** also prints a `NEXT:` hint.

## 2 · What happens automatically

- **Chaining** — every response saves what the next request needs: `{{last_tran_id}}`, `{{pwt}}`, `{{ctid}}`, `{{request_id}}`, `{{payment_link_id}}`. Just send requests in the documented order.
- **Signing** — every pre-request builds `hash = base64(HMAC-SHA512(field values in documented order, secret_key))` and logs the exact input as `b4hash:`. Amounts are formatted per `{{currency}}`: USD 2 decimals, KHR integer.
- **Polling** — **11 - Polling & Lifecycle Flows → Flow A** loops on `data.payment_status_code` while it is `2 (PENDING)`, budgeted by `{{max_polls}}`. Run the folder in the **Collection Runner** (delay ≥ 1000 ms).
- **Callbacks** — folder **10** documents payment/token payloads + `X-PayWay-Hmac-Sha512` verification, can replay samples to `{{callback_listener}}`, and can **pull** callbacks back from webhook.site into your variables.
- **RSA endpoints** (Refund, Payment Link, Pre-auth, Payout, Whitelist) encrypt `merchant_auth`/`beneficiaries` automatically once the **node-forge** library is installed (collection → **Libraries**); without it they **skip with setup instructions** instead of failing.
- **Prerequisite guards** — requests that need earlier state (`{{pwt}}`, `{{request_id}}`, `{{last_tran_id}}`) stop with a clear message telling you exactly which request to run first.

## 3 · Pick your journey

| You want to… | Go to |
|---|---|
| Take a card / ABA Pay / wallet payment | **03 - Ecommerce Checkout** |
| Show a QR to scan (ABA app) | **04 - ABA QR API**, then poll with **Flow A** in **11** |
| Link a card/account, charge later | **08 - Credentials on File (CoF)** |
| Sell via a shareable link | **05 - Payment Link** |
| Hold funds, capture or release later | **06 - Pre-auth** |
| Split payments to beneficiaries | **07 - Payout** |
| Look up KHQR payments by merchant ref | **09 - KHQR Guideline** |
| Test your webhook handling | **10 - Callbacks & Webhooks** |

## 4 · Switching to your own merchant (before real integration)

| Variable | Replace with | Notes |
|---|---|---|
| `{{merchant_id}}` | Your sandbox merchant ID | From PayWay onboarding |
| `{{secret_key}}` | Your sandbox secret | Stored as a **Postman secret** type — masked in UI/exports |
| `{{rsa_public_key}}` | Your RSA public key (PEM) | Needed by the RSA endpoints above |
| `{{ctid}}` | Your consumer ID | CoF folders |
| `{{baseUrl}}` | `https://checkout.payway.com.kh` | Production only |

> ⚠️ The pre-filled demo credentials are **public** — use them only to explore. Replace them before touching anything real, and never commit your secret into source control.

## 5 · Transaction statuses

`data.payment_status_code`: **0** APPROVED / PRE-AUTH · **2** PENDING · **3** DECLINED · **4** REFUNDED · **7** CANCELLED

Gateway `status.code` is `"00"`/`0` on success and otherwise an error code (string *or* number) — test scripts normalize both. Most common errors:

| Code | Meaning | | Code | Meaning |
|---|---|---|---|---|
| 1 | Wrong hash | | 5 | Transaction not found |
| 4 | Given data was invalid | | 6 | Domain not whitelisted |
| 2 | Invalid transaction ID | | 12 | Currency not allowed |
| 4 | Duplicated transaction ID | | 47 | KHR must be ≥ 100 |
| 23 | Payment option not enabled | | 429 | Rate limit exceeded |
| PTL02 | Wrong hash (portal APIs) | | 503 | Under maintenance |

Full table: [developer.payway.com.kh](https://developer.payway.com.kh/) · `b4hash:` in the Console is your first stop for any `Wrong hash`.

## 6 · 60-second fixes

The five snags that cost developers the most time, with the one-line fix:

| Symptom | Fix |
|---|---|
| `Wrong hash` (code 1) | Open the **Console** → compare the `b4hash:` line with the docs' field order (each request's description lists it too). USD amounts need 2 decimals, KHR none — the scripts handle this via `fmtAmt`. |
| RSA endpoints answer `SKIPPED` | Install **node-forge** under collection → **Libraries**, or paste a pre-encrypted value into the `{{…_merchant_auth}}` variable named in the description. |
| Code 5 / transaction not found | `check-transaction-2` only sees the **last 7 days** and **no KHQR** transactions — use **2. Get Transaction Details** instead. |
| Code 49 Invalid Start Date | Transaction List dates must be `yyyy-mm-dd hh:mm:ss` (auto-filled for you — don't shorten them). |
| Code 23 payment option not enabled | The demo profile doesn't allow that wallet — switch `{{payment_option}}` (try `cards` or `abapay_khqr`). |

## 7 · Environments

- **Sandbox (default):** `https://checkout-sandbox.payway.com.kh`
- **Production:** `https://checkout.payway.com.kh` — only after replacing the demo credentials
- **Docs:** [developer.payway.com.kh](https://developer.payway.com.kh/)
