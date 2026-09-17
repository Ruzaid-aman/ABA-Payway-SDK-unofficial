# Telegram Mini-App (Packaged Notes)

Guidance for integrating a Telegram mini-app payment flow in a packaged-friendly summary.

- Use hosted checkout or deep-linking for mobile payments.
- Ensure return/deeplink handlers validate transactions with `check-transaction`.
- Keep PII out of logs and follow merchant privacy guidelines.

This file omits the internal test harness and sandbox-only integration scripts.
