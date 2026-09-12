

### Comprehensive Integration Guide: ABA PayWay Customer module Payment Flow

This document outlines the end-to-end integration lifecycle for ABA PayWay’s Customer Module payment solution, covering environment setup, payment flow, callback handling, reconciliation fallbacks, and mandatory configuration prerequisites.

---

#### 1. High-Level Process Flow (Detailed)

**1.1 QR Code Generation (Merchant Portal)**
- **Action:** The merchant generates customer-specific QR codes via the merchant portal or through the QR generation API.
- **Environment Access:**
  - **Production:** Login credentials for the production merchant profile will be sent to the designated contact email/phone as per the service agreement. These credentials grant access to the live dashboard and API endpoints.
  - **Sandbox (Development/Testing):** For integration testing, self-registration is available at `developer.payway.com.kh`. If you encounter issues during self-registration, the ABA team can provision a sandbox account manually on your behalf.
- **Testing Toolkit:** To simulate the complete payment lifecycle without using real funds, the ABA team will provide a **Simulator Application** (mobile or web-based) that mimics customer scanning and payment authorization. This allows your system to handle callbacks and validations in a controlled environment before going live.

**1.2 Customer Payment Execution**
- **Payment Action:** The end-customer completes the transaction by scanning the provided QR code using their preferred banking application.
- **QR Delivery Methods:** You may deliver the QR code to your customer via digital channels (email, SMS, in-app display) or as a physical copy (printed on invoices, receipts, or point-of-sale terminals).
- **KHQR Compliance & Interoperability:** The generated QR strictly adheres to the **National Bank of Cambodia (NBC) KHQR standard**. Consequently, it is interoperable and can be scanned by *any* KHQR-compatible banking app in the Kingdom, not just ABA Mobile.
- **Customization for Identification (Critical for Routing):** 
  - To ensure the callback correctly identifies the end-user, we highly recommend embedding the **Merchant Customer Identification Tag** directly into the QR’s data layout during generation. 
  - Alternatively, for branding and visual recognition, you may add your Merchant branding/logo to the footer of the QR image. *Note: The identification tag is the primary driver for accurate reconciliation; visual branding is secondary for user trust.*

**1.3 Callback URL Configuration (Pre-requisite)**
- **Technical Requirement:** The Merchant’s technical team must provide a **publicly accessible HTTPS endpoint (URL)** to the ABA PayWay integration team. This endpoint will receive all asynchronous payment notifications.
- **Configuration Action:** The ABA PayWay integration team will securely configure this URL against your Merchant Profile ID within the PayWay core system. *Note: Changes to this URL in production must be communicated via a formal support ticket to prevent security flags.*
- **High Availability:** It is recommended that your endpoint is highly available and configured with auto-scaling, as spikes in payments will result in a spike in concurrent callbacks.

**1.4 Callback Notification & Security Validation**
- **Trigger:** Upon successful deduction of funds from the customer's account, ABA PayWay will send an HTTP POST request to the configured callback URL.
- **Payload Details:** The callback message is a structured JSON/XML payload containing, at minimum, the following fields:
  - `paymentTimestamp` (ISO 8601 format)
  - `customerIdentifiableId` (The unique tag you embedded in the QR)
  - `settlementReference` (ABA’s internal transaction ID for ledger reconciliation)
  - `payerName` (Name of the paying customer)
  - `maskedAccountNumber` (Partially redacted payer account number for audit trails).
- **Mandatory Security Enforcement (MITM Protection):**
  - The callback header will include a **Hash/Signature** (e.g., HMAC-SHA256).
  - The Merchant’s backend *must* compute its own hash using the shared secret (provided during onboarding) and the raw payload body, comparing it against the header hash. 
  - **Failure to validate this hash exposes your system to Man-in-the-Middle (MITM) attacks and fake notification spoofing.** Do not process any callback that fails hash validation; log and discard it immediately.

here is an example callback notification for a payment made using a Customer Dedicated KHQR. The settlement will be credited to the account configured for the QR.
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

---

#### 2. Fallback Mechanism for Notification Failures

- **The Problem:** Network timeouts, DNS resolution failures, or temporary downtime of the merchant’s callback server can result in missed payment notifications, leading to desynchronized order statuses.
- **The Recovery Solution:** ABA PayWay provides a **Get Transaction-by-Ref** RESTful API as a robust fallback.
- **Implementation Logic:** The merchant system must implement a scheduled background job (e.g., a Cron job) that runs periodically (e.g., every 5–10 minutes) specifically to catch missed payments. 
- **Technical Constraints & Handling:**
  - The API returns the **latest 50 transactions** per request, ordered chronologically (newest first).
  - **Implication:** If your merchant experiences high volumes, you may have more than 50 transactions in the interval. Your system must utilize pagination logic (checking the `nextToken` or timestamp offset in the response) to iteratively fetch all transactions until it reaches the last timestamp it successfully processed.
- **API Key Provisioning:** The API keys required to authenticate these fallback requests (usually `client_id` and `client_secret` or Bearer tokens) will be generated and securely delivered by the ABA PayWay integration team during the onboarding phase.

The hash format shall follow this specification: A Base64-encoded string of HMAC SHA-512 hash generated by concatenating req_time, merchant_id, and merchant_ref, using your public_key.
This means you first generate the HMAC SHA-512 hash using the required fields and then Base64-encode the resulting output.

example request
Example
{
    "req_time": "20250213084236",
    "merchant_id": "ec000002",
    "merchant_ref": "17394277693",
    "hash": "QskVi2gEctW...j7Td6kEi/KLPvGcK3ZiA=="
}




Since the customer-specific QR is offline in nature, and the QR is generated for the sepcific customer, you can query transactions performed on that QR.
You can set a unique identifier for each customer. In your case, you should configure the Customer ID as a mandatory field in the Merchant Portal and include the Customer ID when generating the QR. You can then use the Customer ID from your system as the merchant_ref, for example, "dt-one-8989".
You can then use the following API to query transactions using the merchant reference:
API ->  https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/get-transactions-by-mc-ref
 API documentation ->  https://developer.payway.com.kh/get-transactions-22366268e0

example response 

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


---

#### 3. Additional Best Practices & Operational Recommendations

- **Response Speed:** Your callback endpoint should respond with an HTTP `200 OK` status code within **5 seconds**. Failing to respond quickly may trigger ABA's retry mechanism, leading to duplicate processing attempts. If you need to perform heavy database writes, offload them to a message queue and acknowledge the callback immediately.
- **Logging:** Enable verbose logging for all incoming callbacks (including headers, raw payloads, and computed hashes) in a separate log file for at least 30 days. This is invaluable when debugging discrepancies with the ABA support team.

---

#### 4. Mandatory Configuration Requirements for the Integration Team

To complete the integration successfully, the merchant team must ensure the following architectural setups are finalized:

- **Unique Customer Identification (The Golden Key):**
  - Every customer transaction must be linked to a **unique reference ID** (e.g., `CUST_0001`, `INV-2026-001`) generated by your internal CRM.
  - This ID must be passed during QR generation. **Why it matters:** It acts as the primary foreign key for your system. When the callback returns this ID, your system instantly knows *which* internal order/invoice to mark as paid, eliminating manual matching errors.

- **Invoicing Tool Enablement & Customer Module Access:**
  - The merchant must enable the invoicing tool feature within the merchant dashboard.
  - Once enabled, your internal operations team gains access to the **Customer Module** within the portal. This allows them to view payment histories, resend invoices, or manually trigger email reminders directly from the PayWay interface, reducing the load on your internal helpdesk.

- **QR Payment API Key Generation (For Fetching Details):**
  - You must request distinct API keys specifically scoped for **QR Payment functionalities**.
  - **Critical Requirement:** These are not the same as the general merchant API keys. These specific keys are mandatory because the merchant intends to use the **"Fetch Transaction Details by QR"** endpoint. This endpoint allows your system to query the status or details of a transaction solely based on the QR reference string, which is essential for your administrative reconciliation dashboards.

