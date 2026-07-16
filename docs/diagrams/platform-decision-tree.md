# Platform Decision Tree

Use this flowchart to determine which integration approach is right for your application.

```mermaid
flowchart TD
    Start([Start: What kind of app are you building?]) --> Q1{Does the customer interact<br/>via a web browser?}

    Q1 -->|Yes| Q2{Is it a standard website<br/>or a messaging platform?}
    Q1 -->|No| Q3{Is it a mobile app?}

    Q2 -->|Standard Website| PathWeb[**Chapter 3: Web Implementation**<br/>Use backend API + hidden form<br/>Redirect to PayWay checkout]
    Q2 -->|Telegram Bot / Mini App| PathTg[**Chapter 6: Telegram Mini App**<br/>Use WebView within Telegram<br/>tg.sendData for bot notification]

    Q3 -->|Yes| Q4{Does the app need<br/>in-app payment UI?}
    Q3 -->|No| Q5{Is it a backend-only<br/>or server-to-server flow?}

    Q4 -->|Yes — full native feel| PathNative[**Chapter 4: Native App**<br/>WKWebView iOS / WebView Android<br/>Intercept return URL redirect]
    Q4 -->|Yes — WebView is fine| PathWebView[**Chapter 5: WebView**<br/>JavaScript bridge patterns<br/>Cookie & session management]

    Q5 -->|Yes — API-based| Q6{What type of payment?}

    Q6 -->|QR Code| PathQR[**Chapter 7: QR Code Handling**<br/>generateQr API or offline KHQR<br/>Display QR image to customer]
    Q6 -->|Recurring / Stored cards| PathCoF[**Chapter 9: Link/Unlink/Renew**<br/>Credentials-on-File tokens<br/>payment with saved pwt]
    Q6 -->|Direct payout| PathPayout[**SDK README: Payout domain**<br/>payout.payout with beneficiaries<br/>RSA-encrypted merchant_auth]

    PathNative --> DeepLink{Need deep linking?}
    DeepLink -->|Yes| PathDeep[**Chapter 8: Deep Linking**<br/>abapay_khqr_deeplink option<br/>iOS Universal Links / Android App Links]
    DeepLink -->|No| PathDone([Done: Follow Chapter 4])

    PathWebView --> DeepLink
    PathWeb --> PathDone

    PathTg --> PathDone
    PathQR --> PathDone
    PathCoF --> PathDone
    PathPayout --> PathDone

    style PathWeb fill:#e1f5fe
    style PathTg fill:#e1f5fe
    style PathNative fill:#f3e5f5
    style PathWebView fill:#f3e5f5
    style PathQR fill:#e8f5e9
    style PathCoF fill:#e8f5e9
    style PathPayout fill:#e8f5e9
    style PathDeep fill:#fff3e0
```

---

## Quick Reference: Which Chapter for Which Platform

| Your Platform | Read These Chapters |
|---|---|
| **Web (Next.js, Express, PHP, etc.)** | 1 → 2 → 3 → 11 → 13 |
| **iOS App (Swift)** | 1 → 2 → 4 → 5 → 8 → 11 |
| **Android App (Kotlin)** | 1 → 2 → 4 → 5 → 8 → 11 |
| **React Native / Flutter** | 1 → 2 → 5 (WebView patterns apply) → 11 |
| **Telegram Mini App** | 1 → 2 → 6 → 11 |
| **QR-only (no frontend)** | 1 → 2 → 7 → 11 → 13 |
| **Recurring / Subscription** | 1 → 2 → 9 → 11 → 13 |
| **Payout / Marketplace** | 1 → 2 → (SDK README Payout section) → 11 |

> ← [Back to Documentation Home](../README.md)