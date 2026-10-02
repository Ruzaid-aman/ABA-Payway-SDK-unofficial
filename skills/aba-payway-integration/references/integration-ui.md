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

Display merchant identity, invoice and explicit currency. If FX/discount changes payable amount, show its basis before agreement. Use approved method logos/order/assets. Hosted signed form is browser POST transport; do not render saved gateway HTML as an arbitrary iframe or switch to raw-card data for custom styling.

## QR and mobile

Preserve readable payload, proportion, contrast and quiet zone with approved merchant frame/amount/reference/lifetime. Distinguish QR payload, encoded image and branded frame. Verify physical-phone scans against desktop/mobile/customer screen and printed invoices when applicable. Same-device customers need documented deeplink/fallback, not instructions to scan their own screen.

Test iOS/Android, app installed/missing, external/embedded browsers, canceled authentication, network loss, background/process death and callback before/after return. Verify navigation/focus/session restoration for hosted/modal/bottom-sheet. Validate return destinations; arbitrary redirects and success-looking query strings are not financial evidence. A hosted QR URL can be used only when its actual response/entitlement contract is confirmed.

## Accessibility and evidence

Use semantic controls, labels/keyboard/focus, polite status announcements, readable contrast, touch targets, localization, zoom and safe areas. Engineering test widths 320/375/768/1280 CSS pixels are useful targets, not asserted ABA policy. Record browser/device/OS/app build, selected method/currency/profile, screenshots, scan/handoff/return, authoritative backend result and ledger/job effect.

Backend handler tests are not physical-device or brand/UI acceptance. Keep unrun cases pending. Merchant operational screens require separate inquiry and funds-movement permissions, audited actions and verified local/report outlet/terminal mappings.
