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
| **Want the 1-page visual tour** | [Visual Guide](./VISUAL-GUIDE.md) — architecture → setup → onboarding → payment lifecycle |
| **Looking for a specific term** | Check the [Glossary](./glossary.md) |

> 💡 **Estimated reading time for the full guide:** ~2–3 hours  
> 💡 **Time to first successful integration:** ~30 minutes (Chapters 1–3)

---

## Table of Contents

### Part 1 — Foundation
| Chapter | File | Est. Read Time |
|---|---|---|
| 1. Overview & Core Concepts | [01-overview-and-concepts.md](./01-overview-and-concepts.md) | 15 min |
| 2. Prerequisites, Setup & Credential Profiles | [02-prerequisites-and-setup.md](./02-prerequisites-and-setup.md) | 15 min |
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
| 16. Webhook Setup (CLI) | [16-webhook-setup-guide.md](./16-webhook-setup-guide.md) | 10 min |
| 17. Payment Link API | [17-payment-link.md](./17-payment-link.md) | 15 min |

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

### Agent CLI & Operations
| Document | File |
|---|---|
| Agentic PayWay CLI — User Guide | [AGENTIC-PAYWAY-CLI-USER-GUIDE.md](./AGENTIC-PAYWAY-CLI-USER-GUIDE.md) |
| Agent Setup Playbook (manual path + maintainer gotchas) | [AGENT-SETUP-PLAYBOOK.md](./AGENT-SETUP-PLAYBOOK.md) |
| Recipe: capturing a PayWay callback contract (probe rig) | [agents/callback-capture-recipe.md](./agents/callback-capture-recipe.md) |
| Agentic CLI 1-Pager | [QUICK-START-1-PAGER.md](./QUICK-START-1-PAGER.md) |
| Project Status (session log + quick reference) | [PROJECT_STATUS.md](./PROJECT_STATUS.md) |
| Release Checklist (+ first npm publish) | [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) |
| Agent Handoff (for coding agents resuming work) | [../HANDOFF.md](../HANDOFF.md) |
| Versioning Policy | [VERSIONING.md](./VERSIONING.md) |
| Production Verification Plan (gated) | [PRODUCTION-VERIFICATION-PLAN.md](./PRODUCTION-VERIFICATION-PLAN.md) |
| Mutation-Testing Spike (2026-08-31) | [MUTATION-SPIKE-2026-08-31.md](./MUTATION-SPIKE-2026-08-31.md) |

### Sandbox Evidence & Audits
| Document | File |
|---|---|
| Sandbox Findings (§1–§14 gateway facts) | [SANDBOX-FINDINGS.md](./SANDBOX-FINDINGS.md) |
| Close-Transaction Findings (advisory-close dossier) | [CLOSE-TRANSACTION-FINDINGS.md](./CLOSE-TRANSACTION-FINDINGS.md) |
| Stripe-Standard DX Audit | [STRIPE-STANDARD-DX-AUDIT.md](./STRIPE-STANDARD-DX-AUDIT.md) |
| Edge-Case Audit — Findings (EC-01–EC-23) | [../audit-results/edge-case-report.md](../audit-results/edge-case-report.md) |
| Edge-Case Audit — Improvement Plan (batches 1–5) | [../audit-results/code-improvement-plan.md](../audit-results/code-improvement-plan.md) |
| Open Questions for ABA (incl. token-trio HMAC) | [../audit-results/four-pillars/ABA-OPEN-QUESTIONS.md](../audit-results/four-pillars/ABA-OPEN-QUESTIONS.md) |
| Cloudflare Workers Webhook Archiver | [cloudflare-free-webhook.md](./cloudflare-free-webhook.md) |
| TypeDoc API Reference (generated) | [api/index.html](./api/index.html) |

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
| Web Checkout Page (Redirect) | [examples/web/checkout.html](./examples/web/checkout.html) |
| Web Checkout Page (Popup Modal) | [examples/web/checkout-popup.html](./examples/web/checkout-popup.html) |
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
- [SDK Source Code](../src/) — repo-local; the package is not yet published to the npm registry (see RELEASE_CHECKLIST)
- [Sandbox Dashboard](https://checkout-sandbox.payway.com.kh)
- [Production Dashboard](https://checkout.payway.com.kh)
- [Agentic PayWay CLI (1-pager)](./QUICK-START-1-PAGER.md#agentic-payway-cli) — risk-gated, provider-driven payments
- [aba-payway-agent skill](../skills/aba-payway-agent/SKILL.md) and [aba-payway-first-payment skill](../skills/aba-payway-first-payment/SKILL.md)
- [All 30 AI skills](../skills/README.md) — task-focused agent guides; five bundle dependency-free `.cjs` tools (request signing, callback verification, KHQR decode/CRC validation, status decoding, reconciliation) under their `scripts/` folders

---

## Validation Behavior (SDK)

The SDK performs input validation in each domain to fail fast and give clear developer-facing errors (`PayWayConfigError`). This section summarizes the current, enforced checks so you know what the client will reject before any network call is made.

- **`checkout`**: validates `transactionId` presence, max 20 characters, and charset `[a-zA-Z0-9\-]`; validates `amount` positivity and currency rules (USD ≤ 2 decimals, KHR integer); validates `returnUrl`/`cancelUrl` are base64-encoded when URLs; validates `lifetime` is a positive integer.
- **`checkout.purchase`**: `lifetime` is measured in **minutes** with a local minimum of 3 (below that the gateway answers error 69); optional `retryPolicy: 'transient' | 'none'` controls re-sending on transient failures (default `'transient'`).
- **`qr`**: `lifetime` (seconds) has a local minimum of 180 (the gateway rejects anything lower with HTTP 400 code `"04"`) and warns once above 120 days.
- **Callback / return URL hosts**: loopback, private-range, and link-local addresses (localhost, 127.x, 10.x, 172.16–31.x, 192.168.x, 169.254.x, CGNAT, `.local`/`.internal`) are rejected with `PayWayConfigError` for QR `callbackUrl` and payment-link / credentials-on-file `returnUrl`/`callbackUrl` — PayWay's servers can never reach them. Opt out for on-prem gateways/tests with `allowPrivateCallbackHosts: true`.
- **Config sanity**: `timeout <= 0` and whitespace-only credentials throw `PayWayConfigError` at construction, before any network call.
- **`payment-link`**: requires non-empty `title` and `merchantRefNo`, `amount` > 0, and `returnUrl` must be a public HTTPS URL when provided.
- **RSA endpoints (`refund`, `pre-auth`, `payout`, `payment-link`)**: `publicKeyPem` must be present **and** structurally valid — the SDK checks for a `-----BEGIN PUBLIC KEY-----` / `-----END PUBLIC KEY-----` pair (SPKI or RSA format; literal `\n` sequences from `.env` files are normalized first) and throws a descriptive `PayWayConfigError` before any encryption or network call. The check is exported as `isValidPublicKeyPem()` for your own pre-flight validation.
- **URL auto-encoding**: string fields that hold URLs are base64-encoded automatically when they start with `http://`, `https://`, `//` (protocol-relative), or `www.`; other strings (tokens, raw JSON) pass through unchanged.
- **`pre-auth`**: validates `transactionId` and positive `amount`; `completeWithPayout` requires a non-empty payout array and (in sandbox) that each `acc` is a seeded beneficiary with a matching currency (USD).
- **`payout`**: validates `transactionId`, `amount`, `currency`, and that `beneficiaries` is a non-empty array summing to the total amount. In sandbox it additionally enforces the beneficiary allowlist **and currency match** — a KHR payout to a USD account (or any non-seeded account) throws `currency mismatch` / `not a known sandbox beneficiary` before the request; in production PayWay returns `PTL147` / `37` / `PTL146` etc. See `docs/12-error-handling-and-debugging.md`.
- **`qr` / `khqr`**: validates `transactionId` (max 20 chars, `[a-zA-Z0-9\-]` charset), `amount`, `currency`, and `callbackUrl` as a public HTTPS URL; offline QR helper validates merchantId and amount.
- **`credentials-on-file`**: requires `requestId`/`ctid` where applicable, validates `paymentToken` presence for Cof payments, and validates any `returnUrl`/`callbackUrl` as public HTTPS URLs.

If validation fails, the SDK throws `PayWayConfigError` with a descriptive message. For integrators, validate inputs client-side before calling SDK methods or catch `PayWayConfigError` to present a clear error to users.

