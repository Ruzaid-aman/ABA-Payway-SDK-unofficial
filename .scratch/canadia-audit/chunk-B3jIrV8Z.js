var e={id:`init-khqr-landing`,method:`POST`,path:`/tps/api/payment/init`,title:`KHQR Landing Page`,categoryId:`payments`,description:`Initialize a payment flow for KHQR Landing Page. Returns a QR code and link for customers to complete the payment.`,diagram:`---
title: KHQR Landing Page Payment Flow
config:
  theme: base  
---
sequenceDiagram
    participant Merchant
    participant Payment Gateway
    participant Customer
    participant Bank App

    Merchant->>Payment Gateway: Request web landing URL
    Payment Gateway->>Merchant: Return web landing URL
    Merchant->>Customer: Redirect to web landing
    Customer->>Payment Gateway: Access landing page
    Customer->>Bank App: Scan KHQR code
    Bank App->>Payment Gateway: Initiate payment
    Payment Gateway->>Merchant: Notify payment status (webhook/polling)`,parameters:[{name:`externalId`,type:`string`,required:!0,description:`Unique identifier for the order (4-60 chars)`},{name:`amount`,type:`decimal`,required:!0,description:`Total payment amount`},{name:`ccy`,type:`string`,required:!0,description:`Currency code (e.g., "USD", "KHR")`},{name:`paymentType`,type:`string`,required:!0,description:`KHQR`},{name:`customerName`,type:`string`,required:!1,description:`Customer's name`},{name:`customerEmail`,type:`string`,required:!1,description:`Customer's email`},{name:`customerPhone`,type:`string`,required:!1,description:`Customer's phone number`},{name:`items`,type:`string`,required:!1,description:`base64_encode([{"name":"Item 1","qty":1,"price":1.00}])`},{name:`callbackUrl`,type:`string`,required:!1,description:`URL to receive the payment result after the transaction is completed.  
Note: URL's domain required whitelisted`},{name:`returnURL`,type:`string`,required:!1,description:`URL to redirect the customer after payment`},{name:`hash`,type:`string`,required:!0,description:`hash(amount,externalId,ccy,{timestamp},{apiKey})`}],requestBodyExample:{amount:100,ccy:`USD`,externalId:`order_12345`,paymentType:`KHQR`,customerName:`P Thann`,customerEmail:`pthann@gmail.com`,customerPhone:`+85512345678`,items:`W3sibmFtZSI6Ikl0ZW0gMSIsInF0eSI6MSwicHJpY2UiOjEuMDB9XQ==`,hash:`682474f1b0f01754b8fb89122abce979f0349f479bf3f6df55e0412fcd341788`},responseExample:{status:{code:0,message:null,errorCode:null,timestamp:`0x67287336`},data:{externalId:`order_12345`,paymentId:`dAHKveqeuxxe`,paymentQr:`00020101021230420016cadikhppxxx...`,paymentKHQRLink:`https://...`,paymentTimeoutMillis:1730704482371}},apiEditor:!0},t={id:`init-deeplink`,method:`POST`,path:`/tps/api/payment/init`,title:`Mobile Deeplink`,categoryId:`payments`,description:`Initialize a payment flow for Mobile App Deeplink. Returns a deeplink URL that opens the Canadia Bank App directly.`,diagram:`---
title: Mobile App Deeplink
config:
  theme: base  
---
  sequenceDiagram
      participant Merchant
      participant Payment Gateway
      participant Customer
      participant Bank App

      Merchant->>Payment Gateway: Request deeplink
      Payment Gateway->>Merchant: Return deeplink URL
      Merchant->>Customer: Share deeplink (SMS/email/app)
      Customer->>Bank App: Open deeplink
      Bank App->>Payment Gateway: Initiate payment
      Payment Gateway->>Merchant: Notify payment status (webhook/polling)`,parameters:[{name:`externalId`,type:`string`,required:!0,description:`Unique identifier for the order (4-60 chars)`},{name:`amount`,type:`decimal`,required:!0,description:`Total payment amount`},{name:`ccy`,type:`string`,required:!0,description:`Currency code (e.g., "USD", "KHR")`},{name:`paymentType`,type:`string`,required:!0,description:`DEEPLINK`},{name:`customerName`,type:`string`,required:!1,description:`Customer's name`},{name:`customerEmail`,type:`string`,required:!1,description:`Customer's email`},{name:`customerPhone`,type:`string`,required:!1,description:`Customer's phone number`},{name:`items`,type:`string`,required:!1,description:`base64_encode([{"name":"Item 1","qty":1,"price":1.00}])`},{name:`callbackUrl`,type:`string`,required:!1,description:`URL to receive the payment result after the transaction is completed.  
Note: URL's domain required whitelisted`},{name:`returnDeeplink`,type:`string`,required:!1,description:`base64_encode({"iosLink":"iOS app universal link", "androidLink":"Android app deeplink"})`},{name:`hash`,type:`string`,required:!0,description:`hash(amount,externalId,ccy,{timestamp},{apiKey})`}],requestBodyExample:{amount:100,ccy:`USD`,externalId:`order_12345`,paymentType:`KHQR`,customerName:`P Thann`,customerEmail:`pthann@gmail.com`,customerPhone:`+85512345678`,items:`W3sibmFtZSI6Ikl0ZW0gMSIsInF0eSI6MSwicHJpY2UiOjEuMDB9XQ==`,hash:`682474f1b0f01754b8fb89122abce979f0349f479bf3f6df55e0412fcd341788`},responseExample:{status:{code:0,message:null,errorCode:null,timestamp:`0x67287336`},data:{externalId:`order_12345`,paymentId:`dAHKveqeuxxe`,paymentQr:`00020101021230420016cadikhppxxx...`,paymentDynamicLink:`https://..`,paymentTimeoutMillis:1730704482371}},apiEditor:!0},n={id:`generate-qr-image`,method:`POST`,path:`/tps/api/payment/generate-qr-image`,title:`Generate KHQR Image`,categoryId:`payments`,description:`Generate a KHQR image with customizable templates for digital display or printed receipts.`,diagram:`---
title: KHQR Image Payment
config:
  theme: base  
---
sequenceDiagram
    participant Merchant
    participant Payment Gateway
    participant Customer
    participant Bank App

    Merchant->>Payment Gateway: Request KHQR code
    Payment Gateway->>Merchant: Return KHQR code
    Merchant->>Customer: Display KHQR code
    Customer->>Bank App: Scan KHQR code
    Bank App->>Payment Gateway: Initiate payment
    Payment Gateway->>Merchant: Notify payment status (webhook/polling)`,parameters:[{name:`amount`,type:`decimal`,required:!0,description:`Total payment amount`},{name:`ccy`,type:`string`,required:!0,description:`Currency code (e.g., "USD", "KHR")`},{name:`externalId`,type:`string`,required:!0,description:`Unique identifier for the payment`},{name:`qrTemplate`,type:`string`,required:!0,description:`Template Code (e.g. OPTION1, OPTION2, OPTION3)`},{name:`customerName`,type:`string`,required:!1,description:`Customer's name`},{name:`customerEmail`,type:`string`,required:!1,description:`Customer's email`},{name:`customerPhone`,type:`string`,required:!1,description:`Customer's phone number`},{name:`callbackUrl`,type:`string`,required:!1,description:`URL to receive the payment result after the transaction is completed. 
            Note: URL's domain required whitelisted `},{name:`items`,type:`string`,required:!1,description:`base64_encode([{"name":"Item 1","qty":1,"price":1.00}])`},{name:`hash`,type:`string`,required:!0,description:`hash(amount,externalId,ccy,qrTemplate,{timestamp},{apiKey})`}],requestBodyExample:{amount:100,ccy:`USD`,externalId:`order_12345`,qrTemplate:`OPTION3`,customerName:`P Thann`,customerEmail:`pthann@gmail.com`,customerPhone:`+85512345678`,hash:`318f1bce8c7d176719873ece511a9ad7f91e69246dc2aa3f9e6645e006a184ec`},responseExample:{status:{code:0,message:null,errorCode:null,timestamp:`0x67287336`},data:{externalId:`order_12345`,paymentId:`dAHKveqeuxxe`,paymentQr:`[base64_content_image]`,paymentTimeoutMillis:1730704482371}},apiEditor:!0,templates:[{code:`OPTION1`,imageUrl:`/developer/images/image_template_1.png`,description:`A minimal, unbranded QR layout ideal for compact digital displays, ensuring fast and reliable scanning on POS terminals and embedded devices.`},{code:`OPTION2`,imageUrl:`/developer/images/image_template_2.png`,description:`A clean, bank-branded QR layout, designed for receipt and invoice printing. Optimized for thermal printers and scan performance.`},{code:`OPTION2_COLOR`,imageUrl:`/developer/images/image_template_2_color.png`,description:`A clean, bank-branded QR layout, designed for receipt and invoice printing. Optimized for thermal printers and scan performance.`},{code:`OPTION3`,imageUrl:`/developer/images/image_template_3_no_amt.png`,description:`A clean, bank-branded QR layout, designed for digital displays and customer-facing screens. Ideal for POS displays, kiosks, and tablets.`},{code:`OPTION3_INCL_AMT`,imageUrl:`/developer/images/image_template_3.png`,description:`A color QR layout with merchant name and payment amount, designed for customer-facing digital screens.`},{code:`OPTION4_INCL_AMT`,imageUrl:`/developer/images/image_template_4.png`,description:`A minimal QR layout with merchant name and amount, ideal for space-constrained digital displays at checkout.`},{code:`OPTION4`,imageUrl:`/developer/images/image_template_4_no_amt.png`,description:`A compact, unbranded QR layout without bank logo and payment amount. Ideal for minimal digital displays.`},{code:`OPTION5`,imageUrl:`/developer/images/image_template_5.png`,description:`A horizontal QR layout with side-by-side elements, ideal for wide digital displays and landscape screens.`},{code:`OPTION5_AMT_OUTSIDE`,imageUrl:`/developer/images/image_template_5_amt_out.png`,description:`A horizontal QR layout with the amount displayed outside the QR, ideal for wide digital screens requiring clear amount visibility.`}]},r={id:`payments`,title:`Payments`,description:`Initiate and manage payments through various channels including KHQR Landing Page, Deeplink, and KHQR Image generation.`,endpoints:[e,t,n]};export{r as i,t as n,e as r,n as t};