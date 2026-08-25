# ABA PayWay SDK Skills

Install all skills for a supported coding agent with:

```sh
npx payway-sdk skills add claude
```

Each `aba-payway-*` directory is a self-contained AI guidance package for a supported ABA PayWay SDK workflow. Several skills bundle dependency-free `.cjs` tools under `scripts/` (KHQR decode/CRC validation, request signing, callback verification, mock callbacks, reconciliation cron, checkout payload builder, status decoder) — each SKILL.md documents its own tools.

## Agentic CLI skills

These skills cover the agentic, risk-gated PayWay CLI (driven by a supported provider):

- [aba-payway-agent](./aba-payway-agent/SKILL.md) — provider modes, the 11 tools, risk gates, execution ledger, sessions, and redaction.
- [aba-payway-first-payment](./aba-payway-first-payment/SKILL.md) — QR / checkout / payment-link route decision matrix and result handling.
- [aba-payway-customer-qr](./aba-payway-customer-qr/SKILL.md) — Merchant Portal Customer Module static QRs (Printed QR channel): decoded payload anatomy, callback, reconciliation, and a KHQR decode/CRC validator script (`scripts/decode-khqr.cjs`).