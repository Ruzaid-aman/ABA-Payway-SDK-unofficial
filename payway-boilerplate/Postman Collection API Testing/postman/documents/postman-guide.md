# PayWay API — Postman Developer Guide

> **Unofficial and unsupported**, like the collection itself: this guide helps merchant developers test the ABA PayWay APIs quickly in Postman. It is not an official PayWay SDK, integration, or support channel — always confirm request formats, security requirements, and production-readiness with the official [PayWay documentation](https://developer.payway.com.kh/) and the PayWay support team. Maintainer-facing docs live in [README.md](README.md).

> 📷 *Screenshot placeholders are marked like this — drop in Postman captures when publishing this guide externally.*

## Prerequisites

- **[Postman](https://www.postman.com/downloads/)** — the **desktop app** is strongly recommended (see [FAQ](#faq) for why the web build is slower).
- A **PayWay merchant account** with your credentials at hand — unless you just want to try the pre-configured sandbox demo:
  - `merchant_id`
  - `secret_key` (the API secret used for the `hash` field)
  - `rsa_public_key` (the RSA public key ABA registered for your profile — needed only for RSA endpoints: refund, pre-auth completion, payout whitelist, payment link, CoF)
- For **callback/webhook** testing: a receiver URL — create one at [webhook.site](https://webhook.site/), or let the collection create one for you (folder 09 does it via API).

## Quick start

### Step 1 — Get the collection into Postman

**Recommended (one file):** download `dist/PayWay API — Complete Collection.postman_collection.json` and import it via the **Import** button (top-left) or **File → Import**.

> 📷 *Screenshot: Postman Import dialog with the collection file selected.*

The single file is self-contained: all 46 requests, the signing/encryption helpers, the pre-filled sandbox demo merchant, and **69 saved response examples** (one on every API request — success and common error shapes) so you can see expected responses before sending anything.

**Maintainers:** work in the file-backed Postman workspace instead — `.postman/resources.yaml` maps `postman/collections/PayWay API — Complete Collection/` (editable YAML sources). Don't edit the imported copy for changes you want to keep.

> A public Postman cloud workspace with a **fork + "Run in Postman" button** is planned for external publication, pending the release owner's authorization check. Until then, import the file.

### Step 2 — Configure your environment

**Zero-setup route:** the collection ships with a **pre-configured sandbox demo merchant** (merchant `ec476910`, sandbox `secret_key`, full `rsa_public_key`, seeded payout beneficiary, test customer `customer123`) as collection variables. Your first purchase request works with nothing to configure.

**Bring-your-own-credentials route:** import `postman/environments/PayWay - Merchant Template.environment.yaml` (every value empty; `secret_key` typed **secret**) and fill in your own merchant values. Environment variables override collection variables once selected, so your credentials win over the demo values.

| Variable | Required | Description |
| --- | --- | --- |
| `baseUrl` | Yes | `https://checkout-sandbox.payway.com.kh` (sandbox) or `https://checkout.payway.com.kh` (production) |
| `merchant_id` | Yes | Your PayWay merchant ID |
| `secret_key` | Yes | API secret for the HMAC-SHA512 `hash` field. Keep it **secret**-typed and put the value in **Current value** (see [Security](#security-notes)) |
| `rsa_public_key` | RSA endpoints | The RSA public key PEM registered for your merchant profile |
| `ctid` | CoF / subscriptions | Your stable per-customer key (e.g. `customer123`) — stored credentials link to it |
| `whitelist_payee` | Payout | A whitelisted beneficiary account number |

> 📷 *Screenshot: the Merchant Template environment with variables filled (secret masked).*

To use **another sandbox merchant**, replace `merchant_id` / `secret_key` / `rsa_public_key` in the environment (or the collection's Variables tab). The `PayWay - Sandbox.environment.yaml` mirrors the pre-filled demo values; `PayWay - Production.environment.yaml` carries placeholders — select it only once you've filled in real production credentials.

### Step 3 — Send your first request

1. Open **03 - Ecommerce Checkout → 1. Purchase (Hosted Checkout)** and hit **Send** — the pre-request script signs everything for you.
2. Success is the **hosted checkout page** (HTTP 200 HTML), not JSON. Open the **Visualize** tab and click **Open payment page →**, then pay with a sandbox test card (table in the collection's **Overview** tab and folder 01).
3. Return to Postman and send **3. Check Transaction** — the transaction ID was saved automatically to `{{last_tran_id}}`. Confirm status, amount, currency, and reference.
4. Every request's description starts with a **⚡ Quick test** block (what to set, what to expect, what to send next), and the **Console** (`Alt+Ctrl+I`) prints `NEXT:` hints and the `b4hash:` signing string after each send.

> 📷 *Screenshot: the Purchase request's Visualize tab with "Open payment page →".*

After hosted checkout works, explore the folders: **04** QR API, **05** Payment Links, **06** Pre-auth, **07** Payout, **08** Credentials on File & subscriptions, **09** offline KHQR + webhook receiver, **10** callbacks, **11** Collection-Runner flows (QR purchase → poll → refund, and the full CoF token lifecycle).

## How it works

Postman executes each request's **pre-request script** before sending. For this collection it:

1. Loads the shared helper library — stored as **source code in a collection variable** (`__helpers_v20260923_portable_v2`), so nothing is downloaded per request and the collection works offline.
2. Reads the merchant variables (environment first, then collection).
3. Stamps a UTC `req_time` (`YYYYMMDDHHmmss`), generates a unique `tran_id`, and computes the **HMAC-SHA512 `hash`** over the documented field order — every request's description lists its exact order, and the pre-send string is printed as `b4hash:` in the Console.
4. On **RSA endpoints**, additionally encrypts the `merchant_auth` payload in-page (PKCS#1 v1.5, no package download; needs a runtime with `crypto.getRandomValues`). If secure randomness is unavailable the test script reports `SKIPPED` and names the manual fallback variable to paste a pre-encrypted value into.

Each request's **test script** asserts the response shape, saves the variables the next step needs (`{{last_tran_id}}`, `{{payment_link_id}}`, `{{pwt}}`, …), validates JSON Schema on five endpoints, and prints the suggested next request. Saved response examples (in the dist export) show the expected success and error bodies per request without sending anything.

### Parameter variables

| Variable | Required | Description |
| --- | --- | --- |
| `amount` / `currency` | Yes | USD uses 2 decimals, KHR is an integer — the scripts normalize via `fmtAmt` |
| `payment_option` | Purchase/QR | `cards`, `abapay`, `abapay_khqr`, `abapay_khqr_deeplink`, `abapay_deeplink`, `alipay`, `wechat`, `google_pay` |
| `callback_listener` / `callback_url` | Callback tests | Your webhook.site bin (folder 09 can create and wire one) |
| `return_url`, `cancel_url`, `continue_success_url` | Purchase | Browser redirects; https URLs are base64-encoded by the helper automatically |
| `lifetime` | Purchase/QR | Session lifetime in seconds; sandbox hosted sessions are short (~3–5 min) |

Everything else is pre-filled per request; each request's description documents its own fields (hover any form field in Postman to see the tooltip).

## Security notes

The merchant `secret_key` is highly sensitive. When using this collection:

- Keep any workspace holding **real credentials** set to **Personal** or **Private** — never Public.
- Store `secret_key` as a **secret**-typed variable, and put the value in **Current value** — it stays in your local Postman session and is not synced to Postman's cloud. **Initial value** is the shared template.
- Know what's on disk: the YAML/JSON files in this repository store every value — including the demo `secret_key` — as **plain text**. That's safe only because the demo identity is a sandbox credential committed by maintainer direction; the distribution scan (`_build/distribution-scan.js`, CI-enforced) rejects any other credential-shaped value in the export. **Never paste live production secrets into these files** — keep them in Postman-side current values, or in your own un-versioned environment.
- If you import a Postman collection from a third party, audit its variables and scripts first — this collection's scripts are repo-governed and reviewed in CI, which is the point of importing from this repository rather than a shared link.

## Getting updates

This collection is updated in the repository; your imported copy does **not** auto-update.

1. Download the latest `dist/PayWay API — Complete Collection.postman_collection.json` and import it again (Postman's replace-by-ID prompt updates in place).
2. The export version/freshness is CI-gated (`export_json.js --check`), so any committed export matches the YAML sources.
3. If a fix "doesn't apply" after re-import: collection-variable **current values persist** across re-imports and restarts. Reset the variable in the collection's **Variables** tab (or Delete and re-import) so the new initial value takes effect.

Once the collection is published to a public Postman workspace, this section will switch to the fork → **watch** → **pull changes** flow (forks don't auto-sync; watching the workspace gets you a notification on upstream changes).

## FAQ

### "Wrong hash" (code 1)

Compare the `b4hash:` line in the Console against the hash order in the request's description. The usual culprit is a hand-edited `{{amount}}` — USD needs exactly 2 decimals, KHR none (the scripts handle it; don't pre-round).

### Script reads an empty variable you did set

Environment values go in the **Current value** column; **Initial value** is only the template. Secret-typed variables render masked, which can look empty — paste again and re-send.

### A fix on disk doesn't reach your running request

Collection variables keep their **current value** across re-imports, restarts, and file syncs. Overwrite the variable in the collection's **Variables** tab (initial *and* current), then re-send.

### RSA endpoints answer `SKIPPED`

Your Postman runtime lacks secure randomness (`crypto.getRandomValues`). Use the desktop app, or paste a pre-encrypted value into the fallback variable named in the request (e.g. `{{pl_merchant_auth}}`).

### `Too few bytes to parse DER` / `Invalid PEM formatted message`

The RSA key must be a complete PEM block — from `-----BEGIN PUBLIC KEY-----` to `-----END PUBLIC KEY-----`, with no placeholder text or stray characters pasted in.

### Requests are slow (web Postman)

Use the **desktop app**. The web build relays requests through Postman's backend because of browser CORS limits.

### TLS errors against the sandbox

The sandbox presents a self-signed certificate chain — that's expected, and production is unaffected. In Node-based tooling, scope `NODE_TLS_REJECT_UNAUTHORIZED='0'` to the single command; never set it globally.

### A response code you don't recognize

Look it up in [`postman/documents/error-codes.json`](error-codes.json) (83 codes, 8 families, with meanings and first fixes) or the error table in the collection's **Overview** tab. If a code is missing there, it's worth reporting to the maintainers.
