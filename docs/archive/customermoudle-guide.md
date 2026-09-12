# ABA PayWay Customer Module — Complete Knowledge Base

This knowledge base consolidates all available information about the ABA PayWay Customer Module, covering its purpose, benefits, end‑to‑end payment flow, merchant portal configuration, customer management, QR code generation, payment monitoring, notifications, reconciliation fallbacks, security requirements, and important system behaviors. It incorporates answers to merchant and integration support team questions to provide a comprehensive reference.

---

## 1. Introduction

The **Customer Module** in ABA PayWay, accessed via the PayWay Merchant Portal, enables businesses to manage customer records and generate customer‑specific QR codes for seamless future payments.

This module helps businesses:
- Collect payments more efficiently
- Track transactions for each customer
- Automate payment status updates

It is especially useful for:
- Schools
- Utilities
- Real estate
- Membership‑based services
- Vending machines, laundry machines, and other IoT‑enabled collection points

---

## 2. Benefits

### 2.1 Flexible Customer Payments
- Customers can pay with KHQR in any amount, at any time.
- QR codes can be shared digitally (email, SMS, in‑app) or printed (receipts, POS terminals).
- **Reusability:** Each QR code is **static and reusable indefinitely**. Customers can make multiple payments using the same QR code; there is no expiry or usage limit.

### 2.2 Complete Visibility & Tracking
- Track every customer transaction in real time.
- Monitor outstanding balances.
- View total collections, which includes transactions from:
  - Printed QR
  - Invoicing Tool
  - Virtual Terminal (coming soon)

### 2.3 Smart Settlement Control
- Payments can be linked to:
  - One central main business account, or
  - Customer‑specific virtual accounts (override settlement).
- When override settlement is enabled, only **ABA Pay** and **KHQR** are allowed payment methods.
- All accounts must belong to the same **CIF/owner**.
- **ABA Virtual Accounts** are configurable for override settlement.
- If override settlement is disabled:
  - Payments revert to the default merchant account.
  - Existing QR codes will stop receiving payments.
  - QR download options are disabled.

### 2.4 Easy Reconciliation
- Seamlessly reconcile payments with clear customer‑level visibility.
- Each transaction is automatically recorded and linked to track collections efficiently.
- Simplifies financial reconciliation and reporting.
- **Instant settlement:** All QR payments are credited to the merchant account in **real time**.

---

## 3. How It Works (End‑to‑End Flow)

The Customer Module follows a simple workflow:

1. **Create or upload** customer information in the Merchant Portal.
2. **Generate a unique QR code** for each customer (or entity such as a student, distributor, vending machine, or laundry machine).
3. **Share the QR code** (digitally or printed).
4. Customer scans the QR and completes payment using any KHQR‑compatible banking app.
5. Payment is recorded under the customer record.
6. **Receive payment updates** via webhook, API, Telegram, or the Merchant Portal.
7. Payments are settled **instantly** into the business account (or an overridden settlement account).

---

## 4. Environment Setup & Access

### 4.1 Production Environment
- **Credentials:** Production merchant profile credentials are sent to the designated contact email/phone specified in the service agreement.
- **Access:** Credentials grant access to the live dashboard (Merchant Portal) and all production API endpoints.
- **Security:** Treat these credentials as highly sensitive. Store them in a secure vault, restrict access to authorized personnel, and rotate them periodically.

### 4.2 Sandbox Environment (Development / Testing)
- **Self‑registration:** Visit `developer.payway.com.kh` to create a sandbox account.
- **Manual provisioning:** If self‑registration fails, ABA can provision a sandbox account manually.
- **Credentials delivery:** Sandbox API keys are delivered when you self‑register or when the integration support team creates an account and sends credentials to your email.

### 4.3 Simulator Application
- **What it is:** ABA provides a Simulator Application (mobile or web) that mimics a customer scanning a QR code and authorizing a payment.
- **Why it matters:** The simulator lets you test the complete payment lifecycle—QR generation, customer payment, callback reception, and reconciliation—in a controlled environment.
- **Availability:** Request the simulator from your ABA integration contact during onboarding.

---

## 5. Customer Management in Merchant Portal

### 5.1 Accessing the Customer Module
1. Log in to the Merchant Portal.
2. Click **Customers** in the left navigation menu.
3. From here you can:
   - Configure the customer form.
   - Create customers.
   - Generate and manage QR codes.

**Prerequisite:** The Customer Module is accessible only if **Invoicing Tool** or **Payment Links** is enabled on the merchant profile.

### 5.2 Configuring the Customer Form

#### 5.2.1 Default Fields
When you first open **Customize Fields** (via the settings icon in the top‑right corner), you will see these default fields:

| Field          | Required | Removable |
|----------------|----------|-----------|
| Customer Name  | Mandatory| No        |
| VAT TIN        | Optional | Yes       |
| Phone Number   | Optional | Yes       |
| Email          | Optional | Yes       |
| Address        | Optional | Yes       |
| Remark         | Optional | Yes       |

- **Customer Name** is mandatory and cannot be removed or made optional.
- All other fields can be removed or changed from optional to mandatory.

#### 5.2.2 Customizing Field Properties
1. Go to the top‑right corner and click the **settings icon** (Customize Fields).
2. For each field (except Customer Name), you can:
   - Remove the field entirely.
   - Mark it as mandatory or optional.
3. Drag fields to reorder them; the form will reflect the order after save.
4. Click **Save**.

#### 5.2.3 Adding a Custom Field
1. In **Customize Fields**, click **+ Add Field**.
2. Enter:
   - **Field label** (must be unique — cannot duplicate existing field names).
   - **Data type:** Numbers & Letters, Numbers Only, Letters Only.
   - **Maximum length** (up to 250 characters).
3. Click **Save**.

**Limits:**

| Limit                       | Value          |
|-----------------------------|----------------|
| Maximum custom fields       | 10             |
| Maximum length per field    | 250 characters |

#### 5.2.4 Duplicate Customer Validation
- You can prevent duplicate customers by enabling validation on selected mandatory fields.
- Only **mandatory fields** are eligible for duplicate detection.
- **Address** and **Remark** are excluded from duplicate detection even when mandatory.
- If you remove the mandatory flag from a field used in duplicate detection, it is automatically removed from the rule.
- Duplicate detection also applies across different entry points (Customer Module, Invoicing Tool, Virtual Terminal).
- During onboarding, the Integration Manager works with the merchant to identify at least one unique identifier (e.g., Customer ID, phone number, email) to avoid duplicate QR creation. The system prompts if a record with the same identifier already exists.

#### 5.2.5 VAT TIN for Individual Customers
When the customer type is set to **Individual**, the VAT TIN field is hidden—even if it is configured as mandatory for Company customers. This behavior is automatic and cannot be overridden.

#### 5.2.6 Sub‑user Permissions
Sub‑users can only access **Customize Fields** if they are granted the **Customize Fields** permission, located under the **Update Customer** role.
- You can configure a user role to allow viewing or editing customer records and QR codes separately.

### 5.3 Creating Customers

You can create customers from three places:
- **Customer Module** – manually or via batch upload.
- **Invoicing Tool** – when creating a new invoice.
- **Virtual Terminal** – when creating a transaction (uses same customer configuration).

**Capacity:** There is no limit on the total number of customer records.

#### 5.3.1 Adding a Single Customer Manually
1. Click **Add Customer** (top‑right corner) and select **Single Entry**.
2. Enter the customer information.
3. (Optional) Assign a settlement account (override settlement).
4. Click **Add Customer** (or **Save**).

**Output:** The customer appears in the list.

**Unsaved data:** If you close the form accidentally, the system will prompt you to confirm before discarding unsaved data.
**Starting values:** Newly created customers start with `Total Paid`, `Unpaid`, and `Collected` amounts shown as `0` in the appropriate currency.

#### 5.3.2 Adding Customers in Batch

**Step 1 – Download the template**
1. Click **Add Customer** and select **Batch Upload**.
2. Click **Download Excel template**.

**Important:** The template dynamically matches your current form configuration. Always download a fresh template after changing the customer form.

**Step 2 – Fill in the file**

| Specification                 | Value                         |
|-------------------------------|-------------------------------|
| Maximum records per file      | 1,000                         |
| Maximum file size             | 5 MB                          |
| Sheets imported               | First sheet only              |

**Important:** Account USD and Account KHR columns use a 9‑digit or 11‑digit format to preserve leading zeros. Do not change the column formatting.

**Step 3 – Upload and validate**
1. Click **Upload** and select your file.
2. Review the validation summary.
3. Click **Submit** and **Confirm** to import valid records.
4. If there are errors, the system generates an **invalid file report**. Errors include:
   - Invalid column names.
   - Exceeding the record limit.
   - Duplicate entries.
5. Fix the errors, remove unnecessary columns, and re‑upload if needed.

**Batch upload behavior:** Batch upload only creates new customers. Duplicate records are flagged as invalid — existing customers will **not** be updated. If duplicate validation is enabled, rows with duplicate identifiers may be flagged.

---

## 6. QR Code Generation & Management

### 6.1 QR Code Overview
- The QR strictly adheres to the **National Bank of Cambodia (NBC) KHQR standard**, making it interoperable with any KHQR‑compatible banking app, not just ABA Mobile.
- **Customer Identification Tag:** Embed a unique **Merchant Customer Identification Tag** (e.g., `CUST_0001` or `INV-2026-001`) directly into the QR data layout during generation. This tag acts as the primary foreign key for your system. When the callback returns this ID, your system instantly knows which internal order/invoice to mark as paid.
  - **Decoded-payload note (verified):** In practice the Customer ID does **not** appear in any standard KHQR tag of the QR payload. PayWay embeds its own proprietary routing tags (see Section 6.8) that bind the QR to the customer record server-side, and returns your Customer ID as `merchant_ref` in the callback and fallback API. Your job is to (1) make Customer ID a mandatory, unique field in the portal and (2) match on `merchant_ref` — not to parse the QR payload itself.
- **Optional Visual Branding:** Add merchant branding/logo to the QR footer for visual recognition. The identification tag is the primary driver for accurate reconciliation; visual branding is secondary for user trust.

### 6.2 QR Reusability and Amount Flexibility
- **Static QR:** Each customer‑specific QR is **static** and can be used for **unlimited payments**. It does not expire or have a usage limit.
- **No minimum or maximum amount:** The QR does not enforce transaction amount limits. The customer enters the amount they wish to pay and selects the currency (USD or KHR, if dual‑currency).
- **Fixed amount (optional):** You can set a fixed amount when generating the QR if you want to accept only a specific payment (e.g., $1 for a vending machine dispense). This is useful for IoT triggers or single‑price services.
- **Best practice:** Generate **one QR per entity** (e.g., one per student, distributor, vending machine, laundry machine). This works best when you expect multiple payments from the same entity with flexible amounts and need payment confirmation.

### 6.3 Generate QR for a Single Customer
1. Go to **Customers** and locate the customer.
2. Click the customer’s row, then click **Create ABA QR for Customer**.
3. If you have multiple outlets, select the outlet for the QR. With one outlet, the system will not ask you to select.
4. On the preview screen:
   - Choose what additional information to display on the QR.
   - Remove any selected info before downloading if needed.
   - Click **Download QR**.

**Output format:** The QR is downloaded as a **JPG** image with dimensions **1184px × 1770px**. This resolution is suitable for both digital display and high‑quality printing.

### 6.4 Batch Generate Customer QR Codes
1. Go to **Customers**.
2. Use the checkboxes to select up to **100 customers**.
3. Click **Batch Generate QR**.
4. Select the outlet (if you have multiple).
5. Review the preview and click **Generate** and **Download**.

**Output:** A ZIP file containing one JPG file per QR, or a PDF. The file name is a system‑generated unique ID followed by the customer name.

### 6.5 Re‑downloading or Regenerating QR Codes
- You can **re‑download or regenerate** a QR code later if it is lost or damaged.
- Go to the customer’s record and click **Download QR** again. The QR remains valid as long as the customer exists and no blocking conditions apply.

### 6.6 Co‑Branding
- QR co‑branding (logo and color) can only be configured by an **MMP admin**—not by the merchant directly.
- If no co‑branding logo is uploaded but a merchant icon is set, the system uses the merchant icon instead.
- To request co‑branding, contact your ABA PayWay integration manager.

### 6.7 Voucher Behavior
- Vouchers do **not** apply to customer Printed QR codes. If your business uses vouchers, they will not be valid for payments made via these QR codes.

### 6.8 Customer QR Payload Anatomy (Decoded from a Real Sample)

The following is an actual Customer Module QR generated from the Merchant Portal (outlet "Donation outlet", customer "dhitraj"), decoded and parsed against the EMVCo/KHQR TLV specification. The raw payload is a 203-character KHQR string:

```
00020101021130510016abaakhppxxx@abaa01153250602141550800208ABA Bank5204787653038405802KH5915Donation outlet6010BATTAMBANG624268380010PAYWAY@ABA0104693002071620916050119924001317871247638256803mmp63049955
```

#### 6.8.1 TLV (Tag–Length–Value) Breakdown

| Tag | Len | Value | Meaning |
|------|-----|--------------------------|---------|
| `00` | 2 | `01` | Payload Format Indicator (EMVCo QR Code Specification) |
| `01` | 2 | `11` | Point of Initiation Method — **`11` = static QR** (reusable, no expiry); `12` would mean dynamic/single-use |
| `30` | 51 | *(template)* | Merchant Account Information — Bakong/KHQR account template |
| `30`·`00` | 16 | `abaakhppxxx@abaa` | Bakong Account ID (merchant's ABA account handle) |
| `30`·`01` | 15 | `325060214155080` | Merchant bank account number |
| `30`·`02` | 8 | `ABA Bank` | Bank name |
| `52` | 4 | `7876` | Merchant Category Code (MCC) from the merchant profile |
| `53` | 3 | `840` | Transaction Currency — ISO 4217 numeric `840` = **USD** (QR default currency) |
| `58` | 2 | `KH` | Country Code (Cambodia) |
| `59` | 15 | `Donation outlet` | Merchant Name (printed as the poster heading) |
| `60` | 10 | `BATTAMBANG` | Merchant City |
| `62` | 42 | *(template)* | Additional Data — carries the PayWay-proprietary routing template |
| `62`·`68` | 38 | *(template)* | **PayWay routing template** (proprietary) |
| `62`·`68`·`00` | 10 | `PAYWAY@ABA` | PayWay scheme/routing identifier |
| `62`·`68`·`01` | 4 | `6930` | PayWay outlet/merchant short code |
| `62`·`68`·`02` | 7 | `1620916` | PayWay merchant ID |
| `62`·`68`·`05` | 1 | `1` | QR type/flag (PayWay-internal) |
| `99` | 24 | *(template)* | **PayWay root extension** (non-EMVCo, proprietary) |
| `99`·`00` | 13 | `1787124763825` | PayWay Merchant Profile ID |
| `99`·`68` | 3 | `mmp` | MMP membership marker |
| `63` | 4 | `9955` | CRC-16 checksum (payload integrity) |

#### 6.8.2 Key Observations from the Decoded Payload

1. **Static QR confirmed:** Tag `01 = 11` proves the QR is static — unlimited scans, no expiry. This matches the reusability rules in Section 6.2.
2. **No amount tag (`54` absent):** No fixed amount is enforced. The payer enters the amount and confirms it in their banking app. (A fixed-amount QR would carry Tag `54`.)
3. **Default currency USD:** Tag `53 = 840` (USD). The payer's app pre-selects USD; for dual-currency merchants the payer can still change currency/amount in-app before confirming.
4. **The Customer ID is NOT in the QR payload.** There is no standard reference/bill-number tag containing the customer identifier (e.g., `dt-one-8989` does not appear anywhere in the payload). Customer attribution is handled **server-side**: the PayWay routing tags (`62·68` and `99`) bind the QR to the PayWay merchant profile and the specific customer record created in the portal. When a payment lands, PayWay resolves the customer and returns the Customer ID as `merchant_ref` in the callback and in `get-transactions-by-mc-ref` responses.
5. **KHQR interoperability preserved:** The core follows EMVCo/NBC KHQR (tags `00`–`63`), so any KHQR-compatible banking app can scan it; PayWay's proprietary tags ride along in `62` and `99` without breaking interoperability.
6. **CRC protected:** Tag `63` carries the CRC-16 checksum; apps reject QRs whose checksum fails, so never hand-edit or re-type a QR payload — always re-download from the portal.

> **Tooling:** A bundled decoder/validator script (`decode-khqr.cjs`) lives next to this knowledge in the PayWay SDK repo at `skills/aba-payway-customer-qr/scripts/`. It accepts a raw KHQR string or a QR image, prints the TLV tree, and verifies the CRC-16 checksum — handy for validating a customer QR before printing or investigating a disputed payment. The repo also ships `qr-manifest.cjs` (batch-audit a folder of QR JPGs into a CSV manifest), `verify-callback.cjs` / `sign-request.cjs` / `mock-callback.cjs` (hash debugging, in `skills/aba-payway-hash/scripts/`), `reconcile.cjs` (cron-ready §10 fallback job, in `skills/aba-payway-transaction-by-merchant-ref/scripts/`), and `decode-status.cjs` (human-readable status decoding, in `skills/aba-payway-check-transaction/scripts/`).

#### 6.8.3 How This QR Differs from Online QR and Offline QR

| Aspect | Online QR (API-generated) | Offline QR (locally built EMVCo) | Customer Module QR (Merchant Portal) |
|--------|---------------------------|----------------------------------|--------------------------------------|
| Generated by | `request_transaction`/QR API | Your own code (SDK EMVCo builder) | PayWay Merchant Portal |
| Type | Dynamic, transaction-specific | Static | Static, customer-specific |
| Amount | Fixed in payload | Fixed in payload | Open (payer enters) |
| Single/Multi-use | Single-use | Multi-use | Multi-use, unlimited |
| PayWay routing tags | Yes (online session) | **No** | Yes (`62·68`, `99`) |
| Webhook/callback | Yes | No | Yes |
| Reconciliation API | Check transaction | None (self-managed) | `get-transactions-by-mc-ref` (Customer ID = `merchant_ref`) |

**Practical implication:** Because the Customer Module QR is portal-generated, there is no API request/response to integrate for QR creation — integration effort concentrates entirely on the **callback handler** and the **`get-transactions-by-mc-ref` fallback job**, which behave the same as in the online QR flow (Sections 7 and 10).

### 6.9 Override Settlement Account
Override settlement lets you route a specific customer’s payments to a dedicated settlement account instead of your default merchant account.

#### 6.9.1 Setting Up Override Settlement
1. Open the customer’s detail page (or while creating a new customer).
2. Scroll to the **Override Settlement** section.
3. Enter the **Account USD** and/or **Account KHR**.
   - Account number formats: 9 digits or 11 digits.
   - **Dual‑currency merchants:** You must fill in both currencies.
   - **Single‑currency merchants:** Only the matching currency is required.
   - The override settlement account must belong to the **same CIF** as the merchant profile.
4. Click **Save**.

#### 6.9.2 Supported Payment Methods
When override settlement is configured, customers can pay **only** via:
- ABA Pay
- KHQR

**Not supported:** Card, WeChat Pay, and Alipay for these QR codes.

#### 6.9.3 Disabling Override Settlement
If you disable the override settlement feature after using it, the following will happen:
1. The **Settlement Details** section and **ABA QR download** option are hidden on customer details.
2. **Batch QR download** is disabled on the customer list.
3. Existing customer QR codes are **blocked from receiving payments**.
4. QR paymetns will settle to your default merchant account (set on merchant profile or outlet) instead of the customer override account.

---

## 7. Payment Flow (Technical Integration)

### 7.1 Customer Payment Execution
- The customer completes the transaction by scanning the provided QR code using any KHQR‑compatible banking application.
- The QR can be delivered digitally (email, SMS, in‑app display) or physically (printed as Static QR, of Image).
- Because the QR adheres to the KHQR standard, it works across all participating banks, not just ABA.
- **Currency handling:** If the merchant account is USD only, the QR will only support USD; the customer enters the amount in USD, and any FX cost is borne by the customer. If the merchant is dual‑currency (USD and KHR), the customer can enter an amount and select either currency; the payment is settled to the corresponding currency account.

### 7.2 Callback URL Configuration (Pre‑requisite)
- **Technical requirement:** Your technical team must provide a **publicly accessible HTTPS endpoint (URL)** to the ABA PayWay integration team. This endpoint will receive all asynchronous payment notifications.
- **Configuration:** The ABA integration team securely configures this URL against your Merchant Profile ID in the PayWay core system.
- **Change management:** Any change to this URL in production must be communicated via a formal support ticket to prevent security flags.
- **High availability:** Your endpoint should be highly available and auto‑scaled, because spikes in payments lead to spikes in concurrent callbacks.
- **Multiple URLs:** You can configure **only one callback URL** for the Customer Module. It is not possible to set separate URLs for different environments or payment types.

### 7.3 Callback Notification & Security Validation
- **Trigger:** On successful deduction of funds from the customer’s account, ABA PayWay sends an HTTP POST request to the configured callback URL.
- **Payload details:** The callback is a structured JSON/XML containing at minimum:
  - `paymentTimestamp` (ISO 8601 format)
  - `customerIdentifiableId` (the unique tag you embedded in the QR)
  - `settlementReference` (ABA’s internal transaction ID for ledger reconciliation)
  - `payerName` (name of the paying customer)
  - `maskedAccountNumber` (partially redacted payer account number for audit trails)

- **Mandatory security enforcement (MITM protection):**
  - The callback header includes a **Hash/Signature** — `X-PAYWAY-HMAC-SHA512` (HMAC‑SHA512, Base64).
  - Your backend **must** compute its own hash using the shared secret (provided during onboarding) and the raw payload body, then compare it with the header hash.
  - **Failure to validate this hash exposes your system to Man‑in‑the‑Middle (MITM) attacks and fake notification spoofing.** Do not process any callback that fails hash validation; log and discard it immediately.

- **Retry policy:** ABA PayWay does **not** retry webhooks. If your endpoint is down or does not respond with HTTP 200 within **5 seconds**, the callback is considered failed and will not be re‑sent. You must rely on fallback APIs to recover missed payments.

### 7.4 Example Callback Notification
Example callback for a payment made using a Customer Dedicated KHQR:

```json
{
  "payment_status_code": 0,
  "transaction_id": "178702944869996",
  "payment_status": "APPROVED",
  "apv": "118954",
  "original_amount": 0.38,
  "original_currency": "USD",
  "payment_amount": 0.38,
  "payment_currency": "USD",
  "payment_type": "ABA Pay",
  "transaction_date": "2026-08-18 12:04:08",
  "bank_ref": "100SB1787029448",
  "payer_account": "*001",
  "payer_name": "Payer Name",
  "bank_name": "ABA Bank",
  "merchant_ref": "dt-one-8989",
  "customer": {
    "type": "individual",
    "customer_id": "dt-one-8989",
    "customer_name": "dhitraj",
    "vat_tin": "Test organization",
    "email": "ruzaid0101+alavps@gmail.com",
    "phone": "+85596 407 4052",
    "address": "2740 Barnes Avenue Bronx,",
    "remark": ""
  }
}
```

---

## 8. Payment Monitoring & Reconciliation

### 8.1 Transaction Visibility
- When a customer pays via a Customer‑specific QR, the transaction appears in the merchant portal with the **channel label "Printed QR"**.
- You can filter the transaction list by the **Printed QR** channel to see all such payments.
- You can export this information in Excel from the merchant portal for offline reconciliation.

### 8.2 Customer‑Level Details
Each customer’s detail page shows:
- Total paid amount.
- Unpaid amount.
- Total collected (includes Printed QR, Invoicing Tool, Virtual Terminal coming soon).
- Transaction history.
- The receiving settlement account (if override is set).

### 8.3 Refunds
- You can initiate a refund from the Merchant Portal for any transaction.
- Refund via API is available on request and requires additional API keys and RSA keys for implementation from the merchant system.
- Refunds can be **partial or full**.
- Once refunded, the transaction status changes to **REFUNDED**.

---

## 9. Notifications & Verification

ABA PayWay offers multiple channels to receive payment updates and verify transactions.

### 9.1 Webhook Notification
- Payment status is automatically sent to your configured callback URL via an HTTP POST request.
- The webhook payload is a structured JSON/XML containing all transaction details.
- **Security:** Validate the hash/signature in the callback header before processing (see Section 11).
- **No retries:** ABA does not retry webhooks; if your endpoint fails to respond with 200 within 5 seconds, the notification is lost.

### 9.2 API Verification
- You can verify transactions via API using the **Get Transaction API Endpoint** (or the “Get Transaction‑by‑Ref” API).
- This is essential for reconciliation and for catching missed callbacks.

### 9.3 Telegram Bot
- Payment notifications are automatically sent to a configured Telegram bot.
- This ensures real‑time confirmation for your operations team.
- Contact ABA PayWay support to set up Telegram bot notifications if required.

### 9.4 Merchant Portal
- All transactions are displayed in the transaction list in the Merchant Portal.
- You can identify all transactions related to a specific customer directly from the portal.
- A basic dashboard shows total lifetime collection per customer, but there are no advanced analytics or aging reports.

---

## 10. Fallback Mechanisms for Notification Failures

### 10.1 Problem
Network timeouts, DNS resolution failures, or temporary downtime of your callback server can cause missed payment notifications. Because ABA does **not** retry webhooks, you must implement a fallback to avoid missed payments.

### 10.2 Recovery Solution: Get Transaction‑by‑Ref API
ABA PayWay provides a **Get Transaction‑by‑Ref** RESTful API as a robust fallback.

- **Implementation:** Your system must implement a scheduled background job (e.g., a cron job) that runs periodically (every 5–10 minutes) to catch missed payments.
- **Technical constraints:**
  - The API returns the latest **50 transactions** per request, ordered chronologically (newest first).
  - For high volumes, use pagination logic (`nextToken` or timestamp offset) to iteratively fetch all transactions until reaching the last successfully processed timestamp.
- **API key provisioning:** The required API keys (`client_id` and `client_secret` or Bearer tokens) are generated and securely delivered by ABA during onboarding. Separate keys exist for sandbox and production.

### 10.3 Query Transactions by Merchant Reference (Customer‑Specific QR)
Since the customer‑specific QR is offline in nature, and each QR is generated for a specific customer, you can query transactions performed on that QR using the **merchant reference** you assigned.

- Set a unique identifier for each customer (e.g., `dt-one-8989`).
- Configure the Customer ID as a mandatory field in the Merchant Portal.
- Include the Customer ID when generating the QR.
- Use that Customer ID as the `merchant_ref` in API queries.

**Production API endpoint:**
```
https://checkout.payway.com.kh/api/payment-gateway/v1/payments/get-transactions-by-mc-ref
```

**Sandbox API endpoint:**
```
https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/get-transactions-by-mc-ref
```

**API documentation:**
```
https://developer.payway.com.kh/get-transactions-22366268e0
```

### 10.4 Example API Response

```json
{
    "data": [
        {
            "transaction_id": "9495966779",
            "transaction_date": "2025-10-08 09:55:15",
            "bank_ref": "100FT153432232",
            "apv": "123456",
            "discount_amount": 0,
            "payment_status": "APPROVED",
            "payment_amount": 0.01,
            "payment_currency": "USD",
            "payment_type": "ABA Pay",
            "payer_account": "*123",
            "total_amount": 0.01,
            "original_amount": 0.01,
            "original_currency": "USD",
            "payment_status_code": 0,
            "bank_name": "ABA Bank",
            "refund_amount": 0,
            "merchant_ref": "INV-12345678"
        },
        {
            "transaction_id": "1571517653",
            "transaction_date": "2025-10-08 09:53:25",
            "bank_ref": "100FT9343333",
            "apv": "654321",
            "discount_amount": 0,
            "payment_status": "APPROVED",
            "payment_amount": 10.00,
            "payment_currency": "USD",
            "payment_type": "ABA Pay",
            "payer_account": "*123",
            "total_amount": 0.01,
            "original_amount": 0.01,
            "original_currency": "USD",
            "payment_status_code": 0,
            "bank_name": "ABA Bank",
            "refund_amount": 0,
            "merchant_ref": "INV-12345678"
        },
        {
            "transaction_id": "2352051686",
            "transaction_date": "2025-10-08 09:43:54",
            "bank_ref": "100FT93434333",
            "apv": "111111",
            "discount_amount": 0,
            "payment_status": "APPROVED",
            "payment_amount": 40000,
            "payment_currency": "KHR",
            "payment_type": "ABA Pay",
            "payer_account": "*124",
            "total_amount": 10,
            "original_amount": 10,
            "original_currency": "USD",
            "payment_status_code": 0,
            "bank_name": "ABA Bank",
            "refund_amount": 0,
            "merchant_ref": "INV-12345678"
        }
    ],
    "status": {
        "code": "00",
        "merchant_ref": "INV-12345678",
        "message": "Success!"
    }
}
```

---

## 11. Security & Hash Specifications

### 11.1 Callback Hash Validation
- The callback header includes an **HMAC‑SHA512** hash/signature (header `X-PAYWAY-HMAC-SHA512`, Base64).
- You compute your own hash using the **shared secret** (provided during onboarding) and the **raw payload body**, then compare it against the header hash.
- If the hashes do not match, discard the callback and log the event for investigation.
- **Important:** Hash validation failure does **not** trigger a retry by ABA. The notification is lost.

### 11.2 API Request Hash Format (for Fallback Queries)
When calling the fallback APIs, you must include a hash for authentication.

**Format:** A Base64‑encoded string of **HMAC SHA‑512** hash generated by concatenating `req_time`, `merchant_id`, and `merchant_ref`, using your `public_key` (API key).

**Steps:**
1. Generate an HMAC SHA‑512 hash using the concatenated string of `req_time + merchant_id + merchant_ref` and your `public_key` (API key).
2. Base64‑encode the resulting hash output.
3. Include the resulting string in the `hash` field of the request.

> **Verified against the PayWay TS SDK (`src/auth.ts`):** request signing is HMAC‑SHA512 over the preset's field values concatenated in exact order (empty string for missing fields), Base64‑encoded. Callback verification additionally **sorts body keys ascending** and JSON‑encodes nested objects before concatenation, then compares timing‑safely.

**`req_time` format:** `YYYYMMDDHHmmss` (e.g., `20250213084236`). It does **not** require milliseconds.

### 11.3 Example Hash Request

```json
{
    "req_time": "20250213084236",
    "merchant_id": "ec000002",
    "merchant_ref": "17394277693",
    "hash": "QskVi2gEctW...j7Td6kEi/KLPvGcK3ZiA=="
}
```

---

## 12. Mandatory Configuration Requirements

To complete the integration successfully, ensure the following architectural setups are finalized.

### 12.1 Unique Customer Identification (The Golden Key)
- Every customer transaction must be linked to a **unique reference ID** generated by your internal CRM (e.g., `CUST_0001`, `INV-2026-001`).
- This ID must be passed during QR generation.
- **Why it matters:** It acts as the primary foreign key for your system. When the callback returns this ID, your system instantly knows which internal ID to updated as payment recived, eliminating manual matching errors.
- During onboarding, the Integration Manager helps identify at least one mandatory field to enforce uniqueness.

### 12.2 Invoicing Tool Enablement & Customer Module Access
- The merchant must enable **Invoicing Tool** or **Payment Links** to access the Customer Module.
- Once enabled, your internal operations team gains access to the **Customer Module** in the portal. This allows them to view payment histories, send e-invoices, or manually trigger email reminders directly from the PayWay interface.

### 12.3 QR Payment API Key Generation
- You must request distinct API keys specifically scoped for **QR Payment functionalities**.
- **Critical requirement:** These specific keys are mandatory because you intend to use the **“Fetch Transaction Details by QR”** endpoint. This endpoint allows your system to query the status or details of a transaction solely based on the QR reference string, which is essential for administrative reconciliation dashboards.

---

## 13. Important System Behaviors & Notes

### 13.1 Duplicate Prevention
- Duplicate detection is based **only on mandatory fields**.
- **Address** and **Remark** are excluded even when mandatory.
- Duplicate customers cannot be created from different entry points (Customer Module, Invoicing Tool, Virtual Terminal).

### 13.2 Customer Deletion
- You **cannot delete** a customer who has already made at least one payment.
- You **can delete** a customer only if no payments have been made using their QR code.
- Deletion is permanent and cannot be restored.

### 13.3 Customer Data Behavior
- **Deleting a custom field:** Old data remains visible in existing customer records; new customers will not include that field.
- **Updating customer details after QR generation:** **To be confirmed.** (Based on current information, it is not explicitly stated whether updating customer details affects an existing QR. Verify with ABA PayWay support.)

### 13.4 Override Settlement Behavior
- If override settlement is disabled after being used:
  - QR download is disabled.
  - Existing customer QR codes cannot receive payments.
  - Settlement returns to the default merchant account.

### 13.5 API for QR Generation and Customer Management
- **No API exists** to generate customer‑specific QR codes programmatically. QR generation is only via the Merchant Portal.
- **No API exists** to create or update customers from an external system (CRM sync). The only programmatic method is **batch upload** via Excel.
- There are other APIs to generate **dynamic QR codes** (with fixed amount and lifetime), but those are for transaction/invoice‑specific use cases, not for customer‑specific static QRs.

### 13.6 Export Customer List
- You can export the customer list in **batches of 100 records** per export from the Merchant Portal.

---

## 14. Operational Best Practices

- **Response speed:** Your callback endpoint should respond with HTTP `200 OK` within **5 seconds**. ABA does **not** retry; exceeding 5 seconds means the notification is lost.
- **Logging:** Enable verbose logging for all incoming callbacks, including headers, raw payloads, and computed hashes. Store these logs in a separate file for at least **30 days**. This is invaluable when debugging discrepancies with the ABA support team.
- **Fallback cron job:** Implement a scheduled reconciliation job every 5–10 minutes using the `get-transactions-by-mc-ref` API to catch missed callbacks.
- **Duplicate handling:** Use an idempotency key or transaction ID in your database to avoid processing the same payment twice when using both webhooks and fallback APIs.

---

## 15. Quick Reference Summary

| Topic                          | Key Details                                                                                                                                 |
|--------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| **Default Fields**             | Customer Name (mandatory, non‑removable), VAT TIN, Phone, Email, Address, Remark (all optional/removable)                                     |
| **Custom Fields**              | Max 10, 250 chars each, unique labels, data types: alphanumeric, numbers only, letters only                                                   |
| **VAT TIN**                    | Hidden for Individual; available for Company                                                                                                  |
| **Sub‑user Permissions**       | Customize Fields permission under Update Customer role; separate view/edit permissions possible                                                |
| **Batch Upload**               | Max 1,000 records, 5 MB, first sheet only, no updates to existing customers, download fresh template after form changes                         |
| **Account Format**             | USD/KHR columns use 9‑ or 11‑digit text format to preserve leading zeros                                                                      |
| **QR Reusability**             | Static, reusable indefinitely, no expiry, no usage limit                                                                                        |
| **QR Amount**                  | No min/max; customer enters amount and selects currency (if dual‑currency). Fixed amount possible for single‑price use cases.                  |
| **QR Image Format**            | JPG, 1184×1770 px                                                                                                                              |
| **QR Payload**                 | 203-char KHQR/EMVCo TLV; Tag 01=`11` (static); no amount tag; currency `840` USD; PayWay routing tags 62·68 + 99; CRC-16; Customer ID NOT in payload (server-side attribution — see Section 6.8) |
| **QR Limits**                  | No limit on number of QRs; one per entity recommended. Batch download up to 100 customers.                                                     |
| **Settlement**                 | Instant, real‑time credit to merchant account                                                                                                   |
| **Fees**                       | No transaction fees as of August 2026; merchants will be notified of changes                                                                   |
| **Currency**                   | USD‑only merchant: QR accepts USD only; customer bears FX. Dual‑currency: customer selects currency; settled to corresponding account.         |
| **Override Settlement**        | Only ABA Pay and KHQR; same CIF required; disabling blocks existing QRs and reverts to default account                                         |
| **Refunds**                    | From Merchant Portal; API on request with extra keys/RSA; partial or full                                                                      |
| **Payment Monitoring**         | Channel label “Printed QR”; filterable; exportable to Excel; payer details in transaction detail                                                |
| **Notifications**              | Webhook (no retries), API verification, Telegram bot, Merchant Portal                                                                          |
| **Callback URL**               | Only one URL; change requires support ticket                                                                                                    |
| **Fallback API**               | Get Transaction‑by‑Ref (latest 50, paginate); Get Transactions by Merchant Reference (production URL: `https://checkout.payway.com.kh/...`)   |
| **Hash Validation**            | Callback: HMAC‑SHA512 Base64, sorted-key concat, header `X-PAYWAY-HMAC-SHA512`, timing-safe compare; API: HMAC‑SHA512 Base64 of req_time + merchant_id + merchant_ref with public_key |
| **req_time Format**            | `YYYYMMDDHHmmss`, no milliseconds                                                                                                               |
| **Customer Deletion**          | Only if no payments; permanent; not possible after payment                                                                                      |
| **API for Customer/QR**        | No API for customer creation or customer‑specific QR generation; batch upload only                                                              |
| **Export Customer List**       | Batches of 100 records per export                                                                                                               |
| **Dependencies**               | Invoicing Tool or Payment Links must be enabled                                                                                                 |
| **Support**                    | Live merchants: digitalsupport@ababank.com                                                                                                       |
| **Dashboards**                 | Basic lifetime collection per customer; no advanced analytics                                                                                   |
| **Best Practices**             | Respond within 5 sec, offload heavy writes, verbose logs for 30 days, implement fallback cron, use idempotency                                  |

---

This knowledge base is intended to serve as the single source of truth for integrating and operating the ABA PayWay Customer Module. For further clarification, contact your ABA PayWay integration team or digitalsupport@ababank.com for live merchant support.