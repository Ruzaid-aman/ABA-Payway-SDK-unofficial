var e={id:`notify-payment`,method:`POST`,path:`/your-callback-url`,apiEditor:!1,title:`Payment Success`,categoryId:`webhooks`,description:`Published when a Payment is paid successfully by the customer.`,diagram:`---
title: Notify Payment
config:
  theme: base  
---
sequenceDiagram
    participant Merchant as Merchant Backend
    participant Gateway as Payment Gateway

    Merchant->>Gateway: 1. Define Callback URL (https://yourdomain.com/api/payment/notify)
    Merchant->>Gateway: 2. Configure Callback URL (Submit to Canadia Bank)
    Gateway->>Merchant: 3. Payment Notification (HTTP POST)

    Note over Gateway, Merchant: Payment Completed

    Gateway->>Merchant: 4. Send Notification Payload
    Merchant->>Merchant: 5. Handle Notification
    Merchant->>Merchant: 6. Validate Source (Check headers/IP)
    Merchant->>Merchant: 7. Authenticate Request (Secret token/API key)
    Merchant->>Merchant: 8. Process Payment Details (Update order status, etc.)

    Note over Merchant: Ensure HTTPS for secure data transmission

    Merchant->>Gateway: 9. Respond to Notification (200 OK)`,parameters:[{name:`paymentId`,type:`string`,required:!0,description:`Unique identifier for the payment`},{name:`status`,type:`string`,required:!0,description:`Current status of the payment`},{name:`refNumber`,type:`string`,required:!0,description:`Bank transaction id`}],requestBodyExample:{paymentId:`v2-UYbmrQkFmzbu`,status:`SUCCESS`,refNumber:`FT24234Z7KLJ`},responseExample:{message:`OK`}},t={id:`webhooks`,title:`Webhooks`,description:`Receive real-time notifications on your server when payment events occur. Prepare your endpoint to securely handle incoming webhook payloads.`,endpoints:[e]};export{t as n,e as t};