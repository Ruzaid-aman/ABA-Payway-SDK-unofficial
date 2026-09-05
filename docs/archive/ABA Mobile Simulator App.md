# ABA Mobile Simulator App

Use the **ABA Mobile Simulator App** to test your PayWay integration with different payment methods before going live.

The Simulator is a sandbox version of ABA Mobile designed specifically for integration testing. **No real money is moved**, and it works only with PayWay sandbox merchants and sandbox endpoints.

> Production ABA mobile cannot be used for ABA PayWay sandbox. For QR payment testing, use the test account and test app  provided

## What You Can Test

The ABA Mobile Simulator App allows you to:

- Scan and pay sandbox **KHQR** and **ABA PAY QR** codes
- Test **ABA PAY Deep Link** flows using `"payment_method": "aba_pay_deeplink"`
- Validate payment, including `return_deeplink`
- Test supported partner onboarding APIs
- Verify transaction status and end-to-end payment flows

## Test Account Limits

- Each tester can have up to **2 simulator accounts**
- Simulator accounts are valid for **90 days**
- OTPs are sent to the **registered mobile number**
- Default PIN: `1234`
- Secret word: `TEST1`

## Request Simulator Access

To obtain a sandbox test account and access to the ABA Mobile Simulator App:

### 1. Prepare Tester Information

Provide the following details for each tester:

- First name
- Last name
- Mobile number with country code
- Email address

A maximum of **2 test accounts per tester** can be requested.

### 2. Contact the PayWay Integration Team

Send the tester information through your usual PayWay integration communication channel or Digital Support email.

Specify that you require:

- A **PayWay sandbox test account**
- Access to the **ABA Mobile Simulator App** for sandbox testing

### 3. Receive Your Test Account and App

The PayWay Integration Team will provide:

- Test account details
- Registered mobile number
- Installation instructions for the Simulator App
  - **iOS:** TestFlight invitation — [Download via TestFlight]
  - **Android:** APK/installer — [Download]
- Sandbox API credentials or Merchant Portal activation information, if required

## Start Testing

1. Install the ABA Mobile Simulator App.
2. Log in using your sandbox test account.
3. Enter the OTP sent to your registered mobile number.
4. Use PIN `1234` and secret word `TEST1` when required.
5. Use your **sandbox merchant credentials and endpoints** to generate the payment request or QR.
6. Complete the payment using the Simulator App.
7. Verify the callback and transaction status from your system.

## Important

The ABA Mobile Simulator App must be used **only with the PayWay sandbox environment**.

Do not use production merchant credentials, production endpoints, or real payment information when testing with the Simulator.
