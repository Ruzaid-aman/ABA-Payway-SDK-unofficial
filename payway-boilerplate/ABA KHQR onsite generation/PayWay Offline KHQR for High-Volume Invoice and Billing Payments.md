# PayWay Offline KHQR for High-Volume Invoice and Billing Payments

## 1. Purpose

This document defines the recommended PayWay integration architecture for merchants that need to generate **large volumes of QR codes locally or in batch**, without making an API request to PayWay for every QR.

Typical requirements include:

- Generate hundreds, thousands, or hundreds of thousands of invoice QRs in batch.
- Generate the QR payload and QR image locally within an ERP, billing system, or other backend.
- Avoid dependency on PayWay API availability, network latency, and QR-generation API rate limits during the batch process.
- Generate one unique QR per invoice, customer, bill, or payment reference.
- Support either:
  - a **fixed amount**, where the payer pays the invoice amount embedded in the QR; or
  - an **open amount**, where the payer enters the payment amount.
- Receive payment confirmation automatically through a PayWay webhook.
- Reconcile a payment back to the correct invoice using a merchant reference.
- Check payment transactions on demand when callback recovery, investigation, or reconciliation is required.
- Correctly manage duplicate, repeat, partial, and multiple payments.

---

# 2. Recommended Solution

The recommended architecture is:

> **Direct/local KHQR generation using the PayWay KHQR Guideline + PayWay payment webhook + PayWay Transaction Inquiry APIs.**

The normal PayWay QR API `generate-qr` endpoint should **not** be the primary QR-generation mechanism when the core requirement is to generate large batches without making an online API call for every QR.

The standard QR API requires the merchant to send transaction information such as amount and currency to PayWay for each QR-generation request. PayWay then generates the transaction/QR response. This remains an online, per-transaction integration and therefore does not eliminate the merchant's network and API dependency.

With direct KHQR generation, the merchant builds the KHQR payload locally according to the PayWay KHQR specification using the merchant information and PayWay-specific values provided by ABA. PayWay's current KHQR guideline explicitly defines the QR structure and separately supports payment notification through an HTTPS webhook.

### Important distinction

**Offline QR generation does not mean offline payment processing.**

Only the **creation of the QR payload and image** happens locally.

When the customer scans and pays the QR, the payment is still processed through the KHQR/PayWay ecosystem. PayWay can then notify the merchant system about the successful transaction.

The architecture is therefore:

```text
Invoice / Billing System
        │
        │ No QR-generation API call
        ▼
Generate KHQR locally
        │
        ▼
Render / Print QR
        │
        ▼
Customer scans with supported banking app
        │
        ▼
KHQR / PayWay payment processing
        │
        ├────────────► PayWay transaction record
        │
        ▼
PayWay Webhook
        │
        ▼
Merchant Payment Service
        │
        ├── Store payment
        ├── Match merchant_ref
        ├── Update invoice balance
        └── Detect duplicates / additional payments
```

---

# 3. PayWay Services Used in the Solution

The architecture deliberately separates **QR creation**, **payment notification**, and **transaction verification**.

| Requirement | Recommended PayWay Capability |
|---|---|
| Generate QR locally | PayWay KHQR Guideline / direct KHQR generation |
| Generate thousands of QRs in batch | Merchant's ERP/billing system |
| Exact/fixed amount QR | Dynamic KHQR |
| Open/flexible amount QR | Static KHQR |
| Link QR to invoice | Merchant Reference Number — QR field `62.01` |
| Receive real-time payment notification | PayWay KHQR Webhook |
| Find transactions using invoice/reference | Get Transactions by Merchant Reference |
| Check recent transaction status using transaction ID | Check Transaction |
| Retrieve historical transaction details | Get a Transaction Details |
| Standard online QR creation | QR API `generate-qr` — not required for this architecture |

---

# 4. KHQR Data Required for Local Generation

The merchant system must construct the QR exactly according to the current KHQR guideline.

Important fields include:

| KHQR Field | Purpose |
|---|---|
| `00` | Payload Format Indicator |
| `01` | Point of Initiation Method |
| `30` | Merchant Account Information provided by ABA |
| `52` | Merchant Category Code |
| `53` | Transaction Currency |
| `54` | Transaction Amount, when applicable |
| `58` | Country Code |
| `59` | Merchant Name |
| `60` | Merchant City |
| `62` | Additional Data Field Template |
| `62.01` | Merchant Reference Number |
| `62.68` | PayWay Data Field provided by ABA |
| `99` | Additional information used by Bakong |
| `63` | CRC |

The current PayWay guideline specifies `116` for KHR and `840` for USD. It also defines the Merchant Reference Number under `62.01` with a maximum length of 25 characters. Merchant Account Information and the PayWay-specific data field must be provided by ABA rather than invented by the merchant.

---

# 5. Model A — Fixed-Amount Invoice QR

This is the recommended model when:

> **The customer must pay exactly the amount stated on the invoice.**

Use a **Dynamic KHQR**.

### KHQR configuration

```text
Point of Initiation Method (01) = 12
Transaction Amount (54)         = invoice amount
Merchant Reference (62.01)      = unique invoice reference
```

The current KHQR specification defines:

- `11` = Static QR without amount
- `12` = Dynamic QR with amount

Field `54` carries the transaction amount.

### Example

```text
INV-2026-000001
Amount: USD 125.00
merchant_ref: INV-2026-000001

                  │
                  ▼

          Dynamic KHQR
          Amount = 125.00
          Ref = INV-2026-000001
```

The ERP can therefore process a batch such as:

```text
INV-2026-000001 → USD 125.00 → QR
INV-2026-000002 → USD  86.50 → QR
INV-2026-000003 → USD 210.00 → QR
...
INV-2026-010000 → USD  32.00 → QR
```

All 10,000 QR payloads can be generated locally without sending 10,000 `generate-qr` requests to PayWay.

### Payment experience

When the payer scans the dynamic QR, the transaction amount is already encoded in the KHQR.

This is therefore the correct QR model where the business requirement is:

> **The payer should not manually choose or change the invoice amount.**

---

# 6. Using `merchant_ref` as the Reconciliation Key

Each generated QR should carry a unique merchant reference in KHQR field:

```text
62.01 — Merchant Reference Number
```

For an invoice integration, the natural mapping is:

```text
merchant_ref = invoice_number
```

For example:

```text
Invoice ID:      INV-2026-001582
Amount:          USD 48.50
KHQR 62.01:      INV-2026-001582
```

When PayWay receives the payment, its webhook returns the `merchant_ref` derived from QR subtag `62.01`.

The merchant system can therefore perform:

```text
PayWay Callback
      │
      ├── transaction_id
      ├── merchant_ref = INV-2026-001582
      ├── payment_amount = 48.50
      ├── payment_currency = USD
      └── payment_status = APPROVED
                     │
                     ▼
              Find Invoice
                     │
                     ▼
            INV-2026-001582
                     │
                     ▼
              Record Payment
```

This is the central reconciliation mechanism of the architecture.

---

# 7. Payment Notification Through Webhook

Generating the QR locally does **not** prevent the merchant from receiving PayWay payment notifications.

The PayWay KHQR guideline supports an HTTPS webhook. After a successful payment, PayWay sends transaction information to the merchant's webhook endpoint.

Documented information includes fields such as:

```text
transaction_id
transaction_date
merchant_ref
bank_ref
apv
payment_status_code
payment_status
original_amount
original_currency
payment_amount
payment_currency
payment_type
payer_account
bank_name
```

A simplified logical example is:

```json
{
  "transaction_id": "PAYWAY_TX_123456",
  "merchant_ref": "INV-2026-001582",
  "payment_status": "APPROVED",
  "payment_amount": 48.50,
  "payment_currency": "USD"
}
```

The payment service should use the callback to create a **Payment record**, rather than simply changing an invoice flag without recording the underlying transaction.

Recommended logical flow:

```text
Webhook received
      │
      ▼
Validate request
      │
      ▼
Read transaction_id
      │
      ▼
Already processed?
   │         │
  Yes        No
   │         │
 Ignore      ▼
         Store Payment
             │
             ▼
        Find merchant_ref
             │
             ▼
        Allocate Payment
             │
             ▼
       Update Invoice
```

The exact webhook security and authentication requirements should follow the PayWay configuration and documentation applicable to the merchant's implementation.

---

# 8. Do Not Treat `merchant_ref` as a Payment ID

This distinction is critical.

The `merchant_ref` identifies the **business reference**, such as:

```text
INV-10001
```

A PayWay `transaction_id` identifies an individual **payment transaction**.

Because a KHQR can be paid multiple times, several valid transactions may have the same merchant reference:

```text
merchant_ref = INV-10001

TX001 → $100
TX002 → $300
TX003 → $600
```

Therefore:

```text
merchant_ref ≠ unique payment ID
```

The payment-processing system should use PayWay's unique `transaction_id` as the principal transaction-level deduplication key.

The merchant reference should be used for **matching and reconciliation**, not as the sole idempotency key for webhook processing.

---

# 9. Important Limitation — A KHQR Can Be Paid Multiple Times

The current PayWay KHQR guideline explicitly states:

> **QR can be paid multiple times.**



This has an important architectural consequence.

A merchant may generate:

```text
INV-10001 → one unique QR
```

but this does **not** mean:

```text
INV-10001 → maximum one payment
```

The same QR may result in:

```text
INV-10001
   │
   ├── Payment TX001
   ├── Payment TX002
   └── Payment TX003
```

Therefore, **unique QR per invoice and single-use QR are two different requirements.**

---

# 10. Business Duplicate Detection vs. Payment Prevention

The merchant system can detect that an invoice has already been paid.

For example:

```text
Invoice amount: $100

TX001 = $100 APPROVED
Invoice becomes PAID

Customer scans same QR again

TX002 = $100 APPROVED
System detects:
Invoice already PAID
→ classify TX002 as duplicate/overpayment
→ send for exception handling
```

However, this is **business-level duplicate detection after the payment occurs**.

It is not the same as technically preventing the second payment at the payment network level.

Therefore:

### If the requirement is:

> "Detect if someone pays the invoice twice."

Direct KHQR generation can support this through the merchant's payment ledger and reconciliation logic.

### If the requirement is:

> "The QR must become technically impossible to pay immediately after the first successful payment."

The direct/local KHQR architecture should **not automatically be represented as satisfying that requirement**.

That requirement needs a server-controlled/single-use payment mechanism or specific confirmation from the PayWay Product/Integration team regarding an appropriate product capability.

---

# 11. QR Validity and Expiry

The documentation should also avoid describing an offline-generated KHQR as necessarily payable "forever."

The current KHQR guideline includes Bakong additional-data information and its example contains creation and expiry timestamps. At the same time, the guideline explicitly warns that the QR can be paid multiple times.

Therefore, the safe architectural interpretation is:

> **A QR may support multiple payment transactions during its applicable validity.**

QR creation/expiry fields and rules should be implemented according to the current ABA/KHQR specification supplied for the merchant.

"Can be paid multiple times" should not be interpreted as proof that the QR has unlimited lifetime.

---

# 12. Transaction Verification and Inquiry

Webhook notification should be the primary real-time event mechanism, but the merchant should also have transaction-inquiry capabilities for recovery, investigation, reconciliation, and support.

There are three important inquiry patterns.

## 12.1 Get Transactions by Merchant Reference

Use:

```text
POST
api/payment-gateway/v1/payments/get-transactions-by-mc-ref
```

This is particularly suitable for invoice reconciliation because the merchant can query:

```text
merchant_ref = INV-10001
```

and retrieve matching transactions.

The current PayWay documentation states that this API:

- supports online and in-store purchase transactions;
- supports past transactions;
- returns the latest 50 matching transactions; and
- is limited to 10 requests per minute.

This makes it particularly useful for:

```text
Invoice investigation
Callback recovery
Duplicate-payment investigation
Partial-payment reconciliation
Finance/support inquiries
```

---

## 12.2 Check Transaction

When the PayWay `transaction_id` is already known, use **Check Transaction** for recent payment-status verification.

Current documentation states that it supports transactions created within the previous seven days and currently allows up to 600 requests per second.

Conceptually:

```text
transaction_id
      │
      ▼
Check Transaction
      │
      ▼
APPROVED / payment status
```

This is useful for transaction-level verification.

---

## 12.3 Get a Transaction Details

For historical transaction details, PayWay provides:

```text
POST
api/payment-gateway/v1/payments/transaction-detail
```

The current documentation states that this API can retrieve details for past transactions but should not be used as a real-time payment-status checking mechanism. It is currently limited to 10 requests per minute.

It can return information such as:

```text
transaction ID
payment status
original amount/currency
payment amount/currency
refund amount
discount amount
approval code
transaction date
bank reference
payment type
payer information
transaction operations/history
```

---

# 13. Recommended Reconciliation Architecture

The system should not rely on callbacks alone.

Use:

```text
               REAL-TIME PATH

Customer
    │
    ▼
PayWay
    │
    │ Webhook
    ▼
Payment Service
    │
    ├── Store transaction
    ├── Deduplicate transaction_id
    ├── Match merchant_ref
    └── Allocate payment to invoice


              RECOVERY PATH

ERP / Reconciliation Job
    │
    │ merchant_ref / transaction_id
    ▼
PayWay Inquiry API
    │
    ▼
Compare PayWay records
with local ledger
    │
    ▼
Repair / flag discrepancies
```

This gives the merchant both:

**Event-driven processing**

```text
PayWay → Merchant
```

and:

**On-demand verification**

```text
Merchant → PayWay
```

---

# 14. Recommended Data Model

For a robust billing solution, keep these three concepts separate:

```text
INVOICE
PAYMENT
PAYMENT ALLOCATION
```

Do not make the accounting model:

```text
Invoice
 └── payment_status = paid
```

without preserving individual Payment records.

A better model is:

```text
CUSTOMER
   │
   ├──────────── INVOICE
   │                 │
   │                 ▼
   │          PAYMENT ALLOCATION
   │                 ▲
   │                 │
   └──────────── PAYMENT
```

### Invoice

Represents what the customer owes.

Typical information:

```text
invoice_id
customer_id
original_amount
currency
amount_paid
balance_due
status
```

### Payment

Represents an actual PayWay transaction.

Typical information:

```text
payment_id
transaction_id
merchant_ref
payment_amount
payment_currency
payment_status
transaction_date
bank_ref
payment_type
raw_callback
```

### Payment Allocation

Defines how much of a payment is applied to an invoice.

Example:

```text
Payment TX123 = $500

          ├── $300 → INV-001
          └── $200 → INV-002
```

This architecture naturally supports:

- partial payments;
- duplicate payments;
- overpayments;
- refunds;
- payment reallocations;
- accounting corrections;
- one payment covering several receivables;
- multiple payments against one invoice.

---

# 15. Model B — Open/Flexible-Amount QR

If the requirement changes from:

> "The payer must pay exactly the invoice amount"

to:

> "The payer should be able to choose how much to pay"

use a **Static KHQR without Transaction Amount field `54`**.

Configure:

```text
Point of Initiation Method (01) = 11
Transaction Amount (54)         = omitted
Merchant Reference (62.01)      = invoice/customer/reference
```

The current PayWay KHQR guideline defines `11` as Static QR without amount and `12` as Dynamic QR with amount.

The scanning application can then request the amount from the payer.

---

# 16. Invoice-Specific Open-Amount QR

A static QR does not have to mean that every customer uses exactly the same QR.

The merchant can generate:

```text
INV-001 → unique QR → merchant_ref INV-001 → no amount
INV-002 → unique QR → merchant_ref INV-002 → no amount
INV-003 → unique QR → merchant_ref INV-003 → no amount
```

The QR identifies **what account or invoice is being paid**, while the callback tells the merchant **how much was actually paid**.

Conceptually:

```text
QR
 │
 ├── merchant_ref = INV-001
 └── no amount
          │
          ▼
 Customer enters $300
          │
          ▼
 PayWay processes payment
          │
          ▼
 Webhook
          │
          ├── merchant_ref = INV-001
          └── payment_amount = $300
```

This model is appropriate for:

- installments;
- partial invoice payments;
- tuition collection;
- account-balance payments;
- membership dues;
- donations;
- flexible receivables.

---

# 17. Managing Multiple or Partial Payments

Consider:

```text
Invoice INV-10001
Original Amount = $1,000
```

The merchant issues one invoice-specific, open-amount KHQR.

The customer pays:

```text
TX001 = $100
TX002 = $300
TX003 = $600
```

The payment ledger becomes:

| Transaction | Amount | Invoice |
|---|---:|---|
| TX001 | $100 | INV-10001 |
| TX002 | $300 | INV-10001 |
| TX003 | $600 | INV-10001 |
| **Total Paid** | **$1,000** | |
| **Balance** | **$0** | |

The invoice changes state according to cumulative allocations:

```text
$0 paid
   ↓
UNPAID

$100 paid / $900 balance
   ↓
PARTIALLY_PAID

$400 paid / $600 balance
   ↓
PARTIALLY_PAID

$1,000 paid / $0 balance
   ↓
PAID
```

A fourth payment would create:

```text
Amount Due:   $1,000
Amount Paid:  $1,100
Balance:      $0
Overpayment:  $100
```

That transaction should not simply be discarded because it represents an actual successful payment. It should enter an exception/refund/credit workflow according to the merchant's accounting policy.

---

# 18. Recommended Payment Processing Rules

A production implementation should use clear transaction states and accounting rules.

For each received PayWay payment:

```text
1. Receive callback.

2. Identify transaction_id.

3. Check whether transaction_id already exists.

4. If already processed:
   do not create the same payment again.

5. If new:
   store the payment transaction.

6. Read merchant_ref.

7. Find the corresponding invoice/account.

8. Verify currency and expected business rules.

9. Allocate the received payment amount.

10. Recalculate:
    total paid
    outstanding balance
    overpayment

11. Update invoice state.

12. Preserve transaction information for audit/reconciliation.
```

The distinction between steps 3 and 7 is important.

### Deduplication

Use:

```text
transaction_id
```

### Reconciliation

Use:

```text
merchant_ref
```

Do not deduplicate merely because another payment already exists for the same `merchant_ref`, because multiple legitimate transactions may share the same reference.

---

# 19. Suggested Invoice Status Model

Instead of a simple Boolean:

```text
paid = true / false
```

a more useful state model is:

```text
UNPAID
PARTIALLY_PAID
PAID
OVERPAID
CANCELLED
EXCEPTION
```

For example:

| Due | Paid | Suggested State |
|---:|---:|---|
| $1,000 | $0 | UNPAID |
| $1,000 | $300 | PARTIALLY_PAID |
| $1,000 | $1,000 | PAID |
| $1,000 | $1,100 | OVERPAID |

Refund state should be managed at payment/transaction level according to the relevant PayWay refund capability and the merchant's accounting model rather than by simply reversing an invoice flag.

---

# 20. Failure and Recovery Scenarios

## Callback not received

Do not automatically conclude that payment failed.

Use transaction inquiry/reconciliation to recover the actual PayWay transaction.

```text
Expected callback missing
        │
        ▼
Search by merchant_ref
        │
        ▼
Matching APPROVED transaction?
       │       │
      Yes      No
       │       │
       ▼       ▼
Recover      Continue
Payment      investigation
```

## Same callback delivered/processed more than once

The system should check `transaction_id`.

```text
transaction_id already stored
        │
        ▼
Do not create another Payment
```

## Same QR genuinely paid twice

The second payment has a different PayWay transaction ID.

Therefore it is a **new payment**, not a duplicate webhook.

The system should store it and classify it according to invoice balance.

## Unknown merchant reference

Store the payment in an exception state rather than discarding it.

Finance/support can then investigate and allocate it correctly.

## Currency mismatch

Do not automatically allocate a transaction if its currency violates the invoice's expected business rules. Place it in an exception process for reconciliation.

---

# 21. Why the Normal QR API Is Not the Best Fit

PayWay's QR API is appropriate when the merchant wants PayWay to create an online QR transaction on demand.

The request contains information such as:

```text
merchant_id
tran_id
amount
currency
payment option
callback URL
lifetime
```

and calls:

```text
POST
api/payment-gateway/v1/payments/generate-qr
```



This is useful for interactive online systems, but it conflicts with the specific objective:

> "Generate thousands of invoice QRs locally without depending on thousands of PayWay QR-generation requests."

Even if a merchant takes a `qrString` returned by the QR API and renders the image locally, the QR transaction still had to be created through an online PayWay request.

Therefore:

```text
Local rendering of API-generated qrString
              ≠
Direct/local KHQR generation
```

---

# 22. Example — Utility Billing

Assume a utility company creates:

```text
200,000 bills every month.
```

Its billing run prepares:

```text
Customer 10001
Invoice SEP-10001
KHR 48,500
        │
        ▼
KHQR 10001


Customer 10002
Invoice SEP-10002
KHR 72,000
        │
        ▼
KHQR 10002


Customer 10003
Invoice SEP-10003
KHR 36,500
        │
        ▼
KHQR 10003
```

All QRs are generated inside the billing environment.

No 200,000 QR-generation API calls are required.

When Customer 10002 pays:

```text
Customer
   │
   ▼
Scan QR
   │
   ▼
PayWay / KHQR
   │
   ▼
Webhook
   │
   ├── merchant_ref = SEP-10002
   └── payment amount = KHR 72,000
   │
   ▼
Billing System
   │
   ▼
Invoice SEP-10002 = PAID
```

If the webhook is unavailable or an investigation is required:

```text
Billing System
      │
      │ merchant_ref = SEP-10002
      ▼
Get Transactions by Merchant Reference
      │
      ▼
PayWay transaction records
      │
      ▼
Reconciliation
```

---

# 23. Suitable Business Use Cases

This architecture is especially useful for high-volume receivables such as:

| Business | Example |
|---|---|
| Utilities | Electricity, water, internet bills |
| Education | Tuition, registration and examination fees |
| Property management | Rent, maintenance and unit fees |
| Wholesale/distribution | Delivery and trade invoices |
| Logistics | Shipment, freight and delivery charges |
| Government services | Permit, license and service fees |
| Insurance | Premium and renewal notices |
| Membership businesses | Monthly or annual membership fees |
| Healthcare | Hospital and clinic invoices |
| Enterprise ERP | SAP, Odoo or custom ERP invoice batches |

The key common pattern is:

```text
Many receivables
        +
Unique business reference
        +
Local QR generation
        +
Automatic reconciliation
```

---

# 24. Solution Selection Matrix

| Business Requirement | Recommended Approach |
|---|---|
| Generate thousands of QRs without per-QR PayWay calls | Direct/local KHQR |
| Customer must pay exact amount | Dynamic KHQR — `01 = 12`, field `54` populated |
| Customer chooses amount | Static KHQR — `01 = 11`, field `54` omitted |
| One reference per invoice | Use `62.01 merchant_ref` |
| Automatically identify paid invoice | Webhook + `merchant_ref` |
| Recover transactions by invoice number | Get Transactions by Merchant Reference |
| Verify recent known transaction | Check Transaction |
| Get detailed historical transaction | Get a Transaction Details |
| Support partial payments | Static invoice-specific QR + payment ledger |
| Detect repeated payment | Payment ledger + invoice balance |
| Technically prevent the QR from accepting a second payment | Requires separate PayWay product/capability confirmation |

---

# 25. Recommended Production Architecture

```text
                    ERP / BILLING SYSTEM
                           │
                           │ Invoice batch
                           ▼
                   KHQR GENERATION ENGINE
                           │
              ┌────────────┴────────────┐
              │                         │
        Dynamic QR                 Static QR
        fixed amount               open amount
              │                         │
              └────────────┬────────────┘
                           │
                           ▼
                     QR / INVOICE
                           │
                           ▼
                       CUSTOMER
                           │
                           ▼
                    KHQR PAYMENT
                           │
                           ▼
                        PAYWAY
                     ┌─────┴─────┐
                     │           │
                  Webhook     Inquiry APIs
                     │           │
                     ▼           │
                  PAYMENT        │
                  SERVICE ◄──────┘
                     │
             ┌───────┼─────────┐
             │       │         │
             ▼       ▼         ▼
          PAYMENT  ALLOCATION  RECONCILIATION
             │       │
             └───┬───┘
                 ▼
              INVOICE
                 │
                 ▼
          ACCOUNTS RECEIVABLE
```

---

# 26. Implementation Checklist

Before production, confirm that:

### QR generation

- KHQR construction follows the current ABA/PayWay KHQR specification.
- Merchant Account Information is obtained from ABA.
- PayWay Data Field information is obtained from ABA.
- Dynamic/static mode is selected correctly.
- Currency values follow the KHQR specification.
- KHR amount formatting follows the KHQR rules.
- `merchant_ref` fits the specification and is uniquely meaningful to the merchant's business process.
- CRC is generated correctly.
- QR rendering follows the applicable KHQR visual/design guideline.
- Applicable creation/expiry information is handled according to the current KHQR requirements.

### Payment processing

- HTTPS webhook endpoint is available.
- Successful transactions are stored as individual Payment records.
- `transaction_id` is used for transaction-level deduplication.
- `merchant_ref` is used for business reconciliation.
- Raw transaction/callback information is retained where required for audit and support.
- Multiple payments for one merchant reference are supported safely.

### Accounting

- Invoice amount is separate from Payment amount.
- Partial payments are supported if required.
- Overpayment handling is defined.
- Duplicate/repeated payment handling is defined.
- Refund and correction processes are defined.
- Payment Allocation is modeled separately where the business requires flexibility.

### Reconciliation

- Callback processing is not the only recovery mechanism.
- Get Transactions by Merchant Reference is available to operations/support.
- Check Transaction is used appropriately for recent known transactions.
- Historical transaction-detail lookup is available when required.
- Exception handling exists for unknown references, mismatches, and repeated payments.

---

# 27. Key Design Principle

The most important design principle is:

```text
QR identifies the payment context.
Payment represents the actual transfer of money.
Allocation determines what the money settles.
```

Do not collapse all three concepts into a single "invoice paid" flag.

This separation is what makes the solution resilient enough to handle:

```text
callbacks
retries
multiple payments
partial payments
overpayments
refunds
missing callbacks
reconciliation
accounting corrections
```

---

# 28. Final Recommendation

For the original requirement—**generate thousands of invoice QRs locally, use a fixed invoice amount, receive automatic payment confirmation, and perform transaction inquiry when necessary**—the recommended PayWay architecture is:

```text
Direct KHQR Generation
        +
Dynamic KHQR
01 = 12
Transaction Amount = field 54
merchant_ref = field 62.01
        +
PayWay KHQR Webhook
        +
Get Transactions by Merchant Reference
        +
Check Transaction / Transaction Details when required
        +
Merchant-side Payment Ledger and Reconciliation
```

For flexible or partial-payment scenarios, use:

```text
Direct KHQR Generation
        +
Static KHQR
01 = 11
No field 54 amount
Unique merchant_ref
        +
PayWay Webhook
        +
Payment Ledger
        +
Payment Allocation
```

The standard PayWay QR `generate-qr` API remains appropriate for online QR-creation use cases, but it is **not the preferred architecture when the primary requirement is eliminating per-QR API calls during a high-volume invoice batch**.

Finally, direct KHQR should not be described as a guaranteed **single-use QR solution**. The current PayWay KHQR guideline explicitly allows a QR to be paid multiple times. The merchant can detect and manage repeated payments through its ledger, but if the business requires the second payment to be technically rejected before funds are transferred, that requirement must be addressed through a separately confirmed PayWay capability.