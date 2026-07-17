# QR-only merchant POS reference

This is merchant application code, not part of `aba-payway-ts`. It creates a dynamic ABA KHQR payment, persists the order in SQLite, verifies pushbacks, and makes webhook/status reconciliation idempotent.

Copy `.env.example` to `.env`, provide sandbox-only values, and run `npm start`. The callback URL must be public HTTPS and configured for the current merchant profile. The browser receives only a QR result and transaction ID; it never receives the API key or request hash.

The screen polls every three seconds and stops on an ABA terminal status or the five-minute lifetime. Treat a live sandbox success as evidence only for the supplied profile at that time; it does not prove production enablement or support for another merchant.
