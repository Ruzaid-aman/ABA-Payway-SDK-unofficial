ABA PayWay Pre-Authorization SDK CLI Audit
Phase 2: Dynamic Testing — Sandbox Probe Log
Date: 2026-08-26
Base URL: https://checkout-sandbox.payway.com.kh
Merchant ID: ec476910 (from .env)
TLS: NODE_TLS_REJECT_UNAUTHORIZED=0 scoped to this command only (self-signed sandbox chain)
Tool: scripts/sandbox-probe-pre-auth.ts (dummy transaction IDs — cannot complete/cancel a live hold)

[Complete pre-auth]                         HTTP 403  PTL62 Merchant information is invalid   (REQUEST_ACCEPTED)
[Complete pre-auth (invalid hash)]          HTTP 403  PTL02 Invalid hash                       (REQUEST_ACCEPTED)
[Complete pre-auth with payout]             HTTP 403  PTL62 Merchant information is invalid     (REQUEST_ACCEPTED)
[Complete pre-auth with payout (bad hash)]  HTTP 403  PTL02 Invalid hash                       (REQUEST_ACCEPTED)
[Cancel pre-auth]                           HTTP 403  PTL62 Merchant information is invalid     (REQUEST_ACCEPTED)
[Cancel pre-auth (invalid hash)]            HTTP 403  PTL02 Invalid hash                       (REQUEST_ACCEPTED)

Interpretation:
- All three pre-auth endpoints (pre-auth-completion, pre-auth-completion w/ payout, pre-auth-cancellation) are reachable and return structured JSON (no 404 PATH_MISSING). => Endpoint paths/HTTP methods correct (dim 2.1.2/2.1.3/2.1.4).
- Invalid HMAC is rejected server-side with PTL02 => request signing (HMAC-SHA512) verified end-to-end (dim 2.2.5, 2.4).
- Valid-HMAC requests reach merchant-profile validation (PTL62) => the sandbox merchant profile is not provisioned for pre-auth, so a full create->complete->cancel E2E could not be exercised. This is a sandbox limitation, not an SDK defect.
- Each response carries a server-side trace_id, which the SDK does NOT surface in client logs (reinforces dim 2.6 correlation-ID gap).
