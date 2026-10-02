# Customer UI, mobile and acceptance

Use the existing merchant framework and authentication. Read the backend's **verified persisted status**; raw APPROVED, redirects or app-return parameters cannot produce a success receipt. The installed customer-state helper supplies teaching copy and safe state/action decisions, not ABA brand approval or a complete native UI.

## State and actions

| State | Display and action |
|---|---|
| Initial/loading | Trusted order/reference/amount/currency; disable repeated creation and preserve current intent |
| Awaiting payment | Only profile-enabled methods; approved QR/hosted/link and actual interaction lifetime |
| App handoff | Documented app scheme/allowlist, return context and supported missing-app fallback |
| Pending/unknown | Explain confirmation is being checked; restore same attempt; no automatic second payment |
| Verified success | Reference/money/currency/time/method from verified backend receipt; fulfillment may still be processing |
| Declined | Offer a deliberate new attempt only after authoritative final rejection |
| Local expired/canceled | Remove stale interaction; reconcile late/in-flight outcome before replacement; local expiry alone does not prove failure |
| Review/late or excess payment | Preserve evidence and invoice/stock policy; operator exception/refund is a separate authorized workflow |

Display merchant identity, invoice and explicit currency. If FX/discount changes payable amount, show its basis before agreement. Hosted signed form is browser POST transport; do not render saved gateway HTML as an arbitrary iframe or switch to raw-card data for custom styling.

## Default e-commerce checkout requirements

The following requirements come from PayWay Integration Team guidance relayed by the project owner and supplied design exports, received **2026-10-03**. This is a source receipt date, not a verified guideline effective date. Confirm the current approved version and merchant profile with ABA before production. The linked [merchant guideline](https://www.figma.com/design/xS8d19OkA9jMh4gGsxUZPe/-External-Use--Merchant-Integration-Guideline---2.11?node-id=18242-814) and [KHQR prototype](https://www.figma.com/proto/n8jtKYqV8DmiS3etym6NTC/KHQR-Checkout---Payout-Prototype?node-id=2004-16494) identify the supplied design sources; the exports do not certify every live frame or product entitlement.

### Payment methods and merchant policies

- Show a clear **Select payment method** section with **every method enabled in the merchant profile visible and selectable**. Obtain the profile's enabled set; do not infer it from SDK enums, example logos or sandbox registration. Include applicable enabled card networks in card branding.
- Label the QR option exactly **ABA KHQR**, with subtitle **Scan to pay with any banking app**. Use current official assets provided by PayWay, preserving proportions and readable contrast. The supplied method row illustrates a leading icon, title/supporting text and trailing action; its row order and exported icon size are not established universal layout requirements.
- Show current **We accept** logos for all registered payment options in the merchant website footer, readable on its actual background. Reconcile these with the profile's active options before release; request ABA guidance for any registration/enablement discrepancy.
- Above the **Pay** button, show Terms & Conditions / Refund Policy links and an acceptance checkbox. Frontend validation must block payment submission until checked; gate every checkout entry path, including keyboard and automatic submission. Show the refund/cancellation policy on the final step before placing the order. Continue to authorize orders and calculate prices on the server.

### Desktop and mobile presentation

For the reviewed web popup flow, use `checkout2-0.js` with `AbaPayway.checkout()` and the signed browser form targeting `aba_webservice`; do not replace the expected popup with a full-page redirect. `viewType: 'popup'` alone does not install or invoke the plugin. The SDK's `getCheckoutFormHtml(params, { popupMode: true })` supplies the transport, not a complete merchant method selector or policy-consent UI. Add these in the merchant application before invoking it; avoid `autoSubmit` before consent. See [web implementation](03-web-implementation.md#step-2-frontend-checkout-form).

For merchant-controlled mobile WebViews, present hosted checkout full-screen, hide address/browser toolbars and retain a static merchant header. Preserve OS safe areas, necessary authentication and safe navigation. Ordinary browsers control their own address bars; this is not a promise to hide browser chrome on a mobile website. Render a returned `checkout_qr_url` in a readable full-screen view/WebView only for its supported response shape and merchant entitlement. The QR presentation instruction does not make this URL a universal purchase response; see [hosted checkout routes](03-web-implementation.md).

Keep card entry and banking-app account/PIN authentication in provider-controlled surfaces. The exported ABA PAY, KHQR, card, Alipay and WeChat mobile journeys illustrate different handoffs; they do not authorize collecting banking PINs or prove those methods are enabled for every merchant. Bottom-sheet availability and exact native behavior still need a confirmed product contract.

### Return and confirmation

Configure web `continue_success_url` (SDK `continueSuccessUrl`) or app `return_deeplink` (SDK `returnDeeplink`) with validated merchant destinations. Purchase `return_url` (`returnUrl`) is the notification destination, not a substitute for the hosted success continuation. On return, read the authenticated backend's verified persisted receipt and match the original attempt, amount and currency. Once verified, update the order, clear only the purchased cart contents and show the merchant's Thank You / Order confirmed screen; describe fulfillment separately if still processing. A return, provider success screen, missing callback or PENDING status alone cannot trigger this transition. Preserve the same attempt while confirmation is pending or unknown.

### Branding configuration

The supplied **Merchant's Logo & Icons** export distinguishes three assets:

| Asset or setting | Supplied requirement | Scope |
|---|---|---|
| Merchant checkout logo upload | **300 × 300 px**, JPG or PNG, **3 MB maximum** | Merchant logo configured for PayWay checkout |
| Displayed merchant logo | **Minimum height 40 px**, width auto, **10 px padding or margin** protection space | Logo display; not a button/header minimum height |
| Vendor logo | **315 × 315 px**, circle, PNG, **3 MB maximum**; background in brand primary color | Separate vendor-logo guideline; apply when that asset is requested |
| Checkout color scheme | Merchant primary branding color | Supported profile/Integration Team configuration, not injected CSS/JS |
| Continuation button | Configurable label illustrated by Continue Shopping | Confirm the supported profile setting with ABA |

The supplied 40 × 40 payment-method SVGs are exported asset geometry, not mandatory touch-target dimensions. Do not stretch logos, substitute obsolete ABA branding or treat a composite logo strip as the complete enabled method set. Obtain approved files and permission from PayWay; this package does not redistribute the supplied design assets. See [UI customization](10-ui-customization.md) for supported SDK fields and configuration boundaries.

### Integration Team review

Before production credentials are released, submit sample checkout/payment screens **including KHQR** to the Integration Team for review of logos, wording, labels, currency formatting and flow behavior. Record the merchant/profile, methods, device/browser, guideline version, screenshots/recording and ABA approval reference. This UI approval is part of production readiness, alongside financial and security gates; passing code or package checks does not obtain it. Confirm the submission channel, exact evidence and approval process with ABA.

## QR and mobile

Preserve readable payload, proportion, contrast and quiet zone with approved merchant frame/amount/reference/lifetime. Distinguish QR payload, encoded image and branded frame. Verify physical-phone scans against desktop/mobile/customer screen and printed invoices when applicable. Same-device customers need documented deeplink/fallback, not instructions to scan their own screen.

Test iOS/Android, app installed/missing, external/embedded browsers, canceled authentication, network loss, background/process death and callback before/after return. Verify navigation/focus/session restoration for the selected supported hosted/modal flow; test bottom-sheet only when separately enabled and documented. Validate return destinations; arbitrary redirects and success-looking query strings are not financial evidence. A hosted QR URL can be used only when its actual response/entitlement contract is confirmed.

## Accessibility and evidence

Use semantic controls, labels/keyboard/focus, polite status announcements, readable contrast, touch targets, localization, zoom and safe areas. Engineering test widths 320/375/768/1280 CSS pixels are useful targets, not asserted ABA policy. Record browser/device/OS/app build, selected method/currency/profile, screenshots, scan/handoff/return, authoritative backend result and ledger/job effect.

Check that every enabled method is reachable, the exact KHQR text is present, unchecked consent blocks submission, policy links work, branding matches its asset scope, mobile headers/toolbars follow the approved presentation, and return/pending/restart never invent success. Backend handler tests are not physical-device or brand/UI acceptance. Keep unrun cases pending. Merchant operational screens require separate inquiry and funds-movement permissions, audited actions and verified local/report outlet/terminal mappings.
