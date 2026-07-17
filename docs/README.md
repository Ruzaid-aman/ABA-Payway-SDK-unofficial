# ABA PayWay SDK — Integration Documentation

> Complete, junior-developer-friendly integration guide for the ABA PayWay TypeScript SDK across Web, Native, WebView, and Telegram Mini Apps.

---

## How to Use This Documentation

This documentation is designed to be read **in order** if you're new to PayWay, or skipped to specific chapters if you're looking for reference material on a particular topic.

| Reader Profile | Recommended Path |
|---|---|
| **First-time integrator** | Read Chapters 1 → 2 → 3 → the chapter matching your platform → 11 → 12 → 13 |
| **Mobile developer** | Read Chapter 1 → 2, then skip to Chapter 4 (Native) or 5 (WebView) |
| **Backend developer** | Read Chapter 1 → 2 → 11 → 14 (code snippets) |
| **Debugging an issue** | Jump to Chapter 12 (Error Handling) or Chapter 13 (Deployment Checklist) |
| **Looking for a specific term** | Check the [Glossary](./glossary.md) |

> 💡 **Estimated reading time for the full guide:** ~2–3 hours  
> 💡 **Time to first successful integration:** ~30 minutes (Chapters 1–3)

---

## Table of Contents

### Part 1 — Foundation
| Chapter | File | Est. Read Time |
|---|---|---|
| 1. Overview & Core Concepts | [01-overview-and-concepts.md](./01-overview-and-concepts.md) | 15 min |
| 2. Prerequisites & Setup | [02-prerequisites-and-setup.md](./02-prerequisites-and-setup.md) | 15 min |
| Glossary | [glossary.md](./glossary.md) | Reference |

### Part 2 — Core Integration
| Chapter | File | Est. Read Time |
|---|---|---|
| 3. Web Implementation | [03-web-implementation.md](./03-web-implementation.md) | 20 min |
| 7. QR Code Handling | [07-qr-code-handling.md](./07-qr-code-handling.md) | 15 min |
| 9. Link / Unlink / Renew Lifecycle | [09-link-unlink-renew-lifecycle.md](./09-link-unlink-renew-lifecycle.md) | 15 min |

### Part 3 — Platform-Specific
| Chapter | File | Est. Read Time |
|---|---|---|
| 4. Native App Implementation | [04-native-app-implementation.md](./04-native-app-implementation.md) | 15 min |
| 5. WebView Implementation | [05-webview-implementation.md](./05-webview-implementation.md) | 15 min |
| 6. Telegram Mini App | [06-telegram-mini-app.md](./06-telegram-mini-app.md) | 10 min |
| 8. Deep Linking | [08-deep-linking.md](./08-deep-linking.md) | 10 min |

### Part 4 — Security & Customization
| Chapter | File | Est. Read Time |
|---|---|---|
| 10. UI Customization | [10-ui-customization.md](./10-ui-customization.md) | 10 min |
| 11. Callbacks & Webhooks | [11-callbacks-and-webhooks.md](./11-callbacks-and-webhooks.md) | 15 min |

### Part 5 — Production
| Chapter | File | Est. Read Time |
|---|---|---|
| 12. Error Handling & Debugging | [12-error-handling-and-debugging.md](./12-error-handling-and-debugging.md) | 15 min |
| 13. Deployment Checklist | [13-deployment-checklist.md](./13-deployment-checklist.md) | 10 min |
| 15. Merchant Scenario Requirements | [15-merchant-scenario-requirements.md](./15-merchant-scenario-requirements.md) | Reference |
| Coverage Report | [aba-payway-test-case-coverage.md](./aba-payway-test-case-coverage.md) | Audit |

### Part 6 — Appendix
| Chapter | File | Est. Read Time |
|---|---|---|
| 14. Full Code Snippets | [14-appendix-code-snippets.md](./14-appendix-code-snippets.md) | Reference |

### Diagrams
| Diagram | File |
|---|---|
| Payment Lifecycle | [diagrams/payment-lifecycle.md](./diagrams/payment-lifecycle.md) |
| Link / Unlink State Machine | [diagrams/link-unlink-state-machine.md](./diagrams/link-unlink-state-machine.md) |
| Callback Flow | [diagrams/callback-flow.md](./diagrams/callback-flow.md) |
| Platform Decision Tree | [diagrams/platform-decision-tree.md](./diagrams/platform-decision-tree.md) |

### Runnable Examples
| Platform | Location |
|---|---|
| Web Checkout Page | [examples/web/checkout.html](./examples/web/checkout.html) |
| Web QR Display | [examples/web/qr-display.html](./examples/web/qr-display.html) |
| Node.js Webhook Receiver | [examples/backend/webhook-receiver.js](./examples/backend/webhook-receiver.js) |
| PHP Webhook Receiver | [examples/backend/webhook-receiver.php](./examples/backend/webhook-receiver.php) |
| iOS Payment Controller | [examples/ios/PaymentViewController.swift](./examples/ios/PaymentViewController.swift) |
| Android Payment Activity | [examples/android/PaymentActivity.kt](./examples/android/PaymentActivity.kt) |
| Telegram Mini App | [examples/telegram/mini-app.html](./examples/telegram/mini-app.html) |

---

## Audience

This documentation is written for **junior to mid-level developers** who need to integrate ABA PayWay payments into their applications. Every technical term is defined in the [Glossary](./glossary.md), and code examples include inline comments explaining the "why" behind every line.

---

## Quick Links

- [ABA PayWay Developer Portal](https://developer.payway.com.kh)
- [SDK npm Package](https://www.npmjs.com/package/aba-payway-ts)
- [SDK Source Code](https://github.com/your-org/aba-payway-ts)
- [Sandbox Dashboard](https://checkout-sandbox.payway.com.kh)
- [Production Dashboard](https://checkout.payway.com.kh)
