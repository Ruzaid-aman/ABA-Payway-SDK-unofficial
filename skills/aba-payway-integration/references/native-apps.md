# Chapter 4 — Native App Implementation (iOS & Android)

> **Estimated reading time:** 5 minutes
> **Goal:** Connect a merchant's mobile app to a server-side PayWay integration.

This chapter describes the boundary between the mobile client and a TypeScript backend. The repository's standalone Android/iOS projects and platform example files were removed by owner decision on 2026-10-03. Mobile app builds and device journeys require validation in the merchant's own project.

## Flow at a glance

```mermaid
sequenceDiagram
    autonumber
    participant App as Mobile app
    participant Backend as Merchant backend
    participant PayWay as PayWay
    participant Customer as Customer

    App->>Backend: request payment for an authorized order
    Backend->>Backend: read price and currency; persist a payment attempt
    Backend->>PayWay: create the selected payment interaction
    PayWay-->>Backend: QR data or hosted checkout artifact
    Backend-->>App: customer-facing artifact and attempt identity
    App->>PayWay: present checkout or launch ABA Pay
    Customer->>PayWay: complete payment
    PayWay-->>Backend: callback or unsigned notification
    Backend->>Backend: verify evidence and accept durably
    App->>Backend: request authorized order status
    Backend-->>App: verified customer state
    Note over App,Backend: Redirects and app returns trigger a status refresh; they never prove payment.
```

## Architecture

The merchant backend owns prices, order authorization, credentials, payment attempts, callback handling, inquiry and fulfillment. Use the integration skill and its Express/Next recipes to implement that boundary.

The mobile app receives only the customer-facing QR, deep link or hosted checkout interaction it needs. Keep API keys, RSA configuration, reusable payment tokens and signing logic on the server.

Follow [default checkout UI requirements](integration-ui.md#default-e-commerce-checkout-requirements): all enabled methods selectable, exact KHQR copy/current assets, and policy links/acceptance above Pay. Merchant-controlled WebViews use full-screen hosted checkout with a static merchant header and hidden app-owned browser/address toolbars; ordinary browsers own their chrome. Configure supported customer continuation/app return separately from purchase returnUrl. Only verified backend acceptance updates paid state, clears purchased cart contents and shows merchant confirmation. Keep PIN/card entry in provider-controlled surfaces; record Integration Team checkout/KHQR screen review before production credentials.

For hosted checkout, use the gateway's browser-form submission flow from [Chapter 3](web-implementation.md). Preserve its gateway origin and assets; a saved HTML response is not a standalone mobile checkout page. For QR/deep links, follow [Chapter 7](qr-handling.md) and [Chapter 8](deep-linking.md).

## iOS integration checklist

- Adapt the merchant app's existing browser/WebView presentation and navigation handling.
- Configure only the return URLs and application schemes required by the chosen flow.
- Recognize the expected return destination and ask the authenticated backend for status.
- Test ABA Pay installed and unavailable, cancellation, app background/resume and network loss on supported devices.
- Keep production transport protections enabled.

## Android integration checklist

- Adapt the merchant app's existing browser/WebView presentation, intents and lifecycle handling.
- Configure the app's return destination and ABA Pay launch/fallback behavior for the chosen flow.
- Refresh the authorized backend status after return or resume.
- Test process/activity recreation, cancellation, external app availability and network loss on supported devices.
- Keep production transport protections enabled.

Use [WebView guidance](webviews.md) and [deep-link guidance](deep-linking.md) for presentation details. Platform configuration must be reviewed against the merchant's actual application; this repository does not certify it through TypeScript tests.

## Result handling

1. Persist the attempt on the server before submission. If the response is lost, recover by inquiry before creating a replacement attempt.
2. Verify signed online callbacks with the SDK helper. Confirm unsigned notifications through inquiry; follow the endpoint-specific contract in [Chapter 11](callbacks-webhooks.md).
3. Match transaction identity, amount and currency to the server-owned obligation before accepting payment.
4. Durably accept evidence and fulfill idempotently. UI status requests must be authenticated and authorized for the order.
5. Treat redirects, missing callbacks and `PENDING` as insufficient payment evidence. App cancellation or a local timeout must not create a replacement charge while an earlier attempt is ambiguous.

Display the backend's verified customer state using [integration UI guidance](integration-ui.md). An app returning to the foreground should refresh status even if a redirect was missed.

For Flutter presentation, see the Flutter WebView example and [Chapter 5](webviews.md#flutter-webview_flutter). Its client behavior still needs platform/device testing.

## Native companion products

If the merchant requires a native companion SDK, request current supported installation instructions and scope from ABA. This repository supplies the TypeScript backend integration and does not distribute Android/iOS companion packages.

## Next steps

- [Chapter 5 — WebView Implementation](webviews.md)
- [Chapter 8 — Deep Linking](deep-linking.md)
- [Chapter 11 — Callbacks & Webhooks](callbacks-webhooks.md)
- [Integration merchant gates](integration-onboarding.md#merchant-gates)

> ← [Previous: Web Implementation](web-implementation.md) | [Next: WebView Implementation →](webviews.md)
