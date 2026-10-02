# Chapter 10 — UI Customization

> **Goal:** Configure the merchant's checkout presentation using supported PayWay fields, profile settings and approved assets.

## Default checkout requirements

Follow [default e-commerce checkout requirements](../../knowledge/integration-ui.md#default-e-commerce-checkout-requirements) for the enabled method selector, exact ABA KHQR wording, policies/checkbox, popup and mobile presentation, merchant/vendor logo dimensions and Integration Team screen review. That guide records the team guidance and design exports received 2026-10-03, with remaining version/approval limits. It applies to the merchant checkout journey as well as the hosted payment interaction.

The merchant controls its order review, method selector, consent and confirmation UI. PayWay controls hosted payment fields and its branded checkout. A selected `paymentOption` is a route choice; it does not discover or enable the merchant's methods. Keep all enabled methods selectable in the merchant's default checkout before routing the customer's choice. SDK enum values and example card logos do not prove availability.

## Supported fields and their roles

`createTransaction()` builds a signed payload locally. The browser submits it to PayWay; `getCheckoutFormHtml()` can generate that form. Keep credentials and signing on the server, authorize the order and use its stored price/currency. Not every field is a visual customization setting.

| Setting | SDK field | Purpose and boundary |
|---|---|---|
| Amount/currency | `amount`, `currency` | Trusted payable amount and explicit USD/KHR formatting; not customer-controlled pricing |
| Customer details | `firstname`, `lastname`, `email`, `phone` | Optional purchase profile details; other SDK domains such as online QR use `firstName`/`lastName`, so preserve the selected endpoint's shape |
| Transaction identity | `transactionId` | Persisted attempt reference; keep the customer order/reference visible in merchant UI |
| Selected method | `paymentOption` | Supported selected route such as `cards`, `abapay_khqr`, `alipay` or `wechat`, subject to profile enablement |
| Presentation | `viewType` | Supported `hosted_view` or `popup` request shape; web popup also needs the plugin and targeted form |
| Notification destination | `returnUrl` | Purchase `return_url`, server notification destination; it does not move the browser to a Thank You page |
| Web success continuation | `continueSuccessUrl` | Purchase `continue_success_url`, merchant return page after the hosted success interaction; configure it for the web journey |
| App return | `returnDeeplink` | Purchase `return_deeplink`, supported `{ios_scheme, android_scheme}` or string; validate the destination and app context |
| Cancel destination | `cancelUrl` | Configured customer cancellation destination; cancellation navigation alone is not proof of a failed payment |
| Hosted success page | `skipSuccessPage` | Supported 0/1 behavior; skipping a provider screen cannot bypass backend verification |
| Response shape | `paymentGate` | Gate 0 selects the hosted response path, with endpoint/request-shape limits; not a universal checkout URL |
| QR image template | `qrImageTemplate` in the QR API | `template1`, `template1_color`, `template2`, `template2_color`, `template3_color`, `template4`, `template4_color`; see the [template gallery](../../knowledge/qr-handling.md#qr-image-template-gallery) |

For web popup checkout use `checkout2-0.js`, `target="aba_webservice"` and `AbaPayway.checkout()`. Setting `viewType: 'popup'` alone does not implement the popup. For mobile app WebViews use the approved full-screen presentation and static merchant header; ordinary browser chrome remains browser-owned. See [web implementation](../../knowledge/web-implementation.md#step-2-frontend-checkout-form) and [WebViews](../../knowledge/webviews.md).

## Example: selected card route in a merchant checkout

The method selector and Terms & Conditions / Refund Policy checkbox belong in the merchant UI before this signed form is invoked. Frontend validation must block submission until acceptance; the generated helper does not add the complete merchant policy UI. Do not use automatic submission to skip it.

```typescript
// Server-side after order authorization and persisting the payment attempt.
// `order`, `attempt` and `customer` come from the merchant's durable application.
const params = {
  transactionId: attempt.transactionId,
  amount: order.amount,
  currency: order.currency,
  firstname: customer.firstName,
  lastname: customer.lastName,
  paymentOption: 'cards', // Customer selected this enabled method.
  viewType: 'popup',
  paymentGate: 0,
  returnUrl: 'https://merchant.com/api/payway/callback',
  continueSuccessUrl: 'https://merchant.com/orders/result',
} as const;

const signedPayload = payway.checkout.createTransaction(params);
// Embed these fields in the merchant's policy-gated targeted browser form.
// Alternatively the SDK generates the form/plugin document:
const transportHtml = payway.checkout.getCheckoutFormHtml(params, { popupMode: true });
// Adapt the transport into the consent-gated merchant page; this is not a full UI.
```

A full-page browser form POST is also supported transport, but must not replace the popup where the reviewed web flow expects one. Gate-0 captured gateway HTML contains gateway-relative assets; do not re-serve it from the merchant origin. `checkout_qr_url` is available only for the supported hosted-QR response shape, not every purchase; check the typed [purchase routes](../../knowledge/web-implementation.md).

## Merchant and vendor branding

Configure branding with PayWay's merchant profile / Integration Team, using current approved files. The supplied guideline export specifies:

- Merchant checkout logo: **300 × 300 px**, JPG or PNG, **3 MB maximum**.
- Displayed merchant logo: **minimum height 40 px**, width auto, **10 px padding or margin** protection space.
- Separate vendor-logo guideline: **315 × 315 px**, circle, PNG, **3 MB maximum**, background in the brand's primary color. Apply it when a vendor logo is requested; it is not the merchant checkout upload size.
- Checkout color scheme based on merchant primary branding color; continuation button label is configurable. Confirm the supported profile settings with ABA.

The exported 40 × 40 payment-method icons do not prescribe tap-target sizes. Use the exact **ABA KHQR** title and **Scan to pay with any banking app** subtitle, current card-network branding and the approved **We accept** footer. Display all profile-enabled methods; the illustrated KHQR/card/Alipay/WeChat order is not a confirmed mandatory ordering rule.

| Hosted element | Customization boundary |
|---|---|
| ABA / PayWay branding | Use current official assets; do not remove or replace provider branding |
| Merchant logo/colors/continuation label | Supported profile configuration reviewed by ABA; no invented SDK logo/theme field |
| Card entry and authentication | Provider-controlled fields/apps; do not collect raw card data or banking PINs for custom styling |
| Browser address/security indicators | Browser-owned; hiding merchant app WebView toolbars does not suppress TLS validation |
| Custom CSS/JS in hosted checkout | Not supported by the existing confirmed contract; do not modify the provider plugin or hosted page |
| Hosted locale/labels | Portal/Integration Team profile configuration; no documented SDK language field |

The QR API permits a merchant payment page around the QR; it still requires correct official branding, policies, readable QR and screen review. Custom styling does not remove the default checkout requirements.

## Return, success and production acceptance

Read the authenticated backend's verified persisted receipt when the customer returns. Verify transaction identity, original amount and currency; use valid signed callbacks and inquiry recovery under the selected contract. Single best-effort callback delivery means waiting only for a callback is insufficient. A redirect or provider success screen is not payment proof.

After verified acceptance update the order, clear the purchased cart contents and show the merchant's Thank You / Order confirmed screen. Keep pending/unknown confirmation recoverable on the same attempt and distinguish paid from fulfillment completed. Configure `continueSuccessUrl` / `returnDeeplink` without treating their parameters as authoritative.

The Integration Team must review checkout/payment screens, including KHQR, for logo use, wording, labels, currency formatting and flow before releasing production credentials. Record its approval separately from automated tests and sandbox payment evidence. See [deployment checklist](../../knowledge/deployment-checklist.md) and [UI acceptance evidence](../../knowledge/integration-ui.md#integration-team-review).

Remaining ABA inputs include the currently approved guideline version, complete asset set and redistribution permission, exact submission/sign-off procedure, vendor-logo applicability, and any bottom-sheet/hosted-QR entitlement or native-device rules. These are tracked by maintainers in the existing ABA question register; merchants should obtain them from their Integration Team contact. Do not describe unrun screen/device checks as passed.

## Next Steps

- [Callbacks & Webhooks](../../knowledge/callbacks-webhooks.md)
- [QR Code Handling](../../knowledge/qr-handling.md)
- [Web Implementation](../../knowledge/web-implementation.md)

> ← [Previous: Link / Unlink / Renew Lifecycle](../../knowledge/link-lifecycle.md) | [Next: Callbacks & Webhooks →](../../knowledge/callbacks-webhooks.md)
