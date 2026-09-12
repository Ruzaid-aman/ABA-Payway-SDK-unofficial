/**
 * Compact, high-signal PayWay gateway facts injected into the agent's system
 * prompt (knowledge wave 2026-09-12). The full guides stay reachable via the
 * `query_knowledge` tool / `payway-sdk docs`; this digest carries only the
 * constraints that most often change a plan's shape. Every fact is
 * sandbox-verified and codified in the packaged knowledge corpus
 * (errors-and-debugging, callbacks-webhooks, qr-handling, payment-link).
 */

export function buildKnowledgeDigest(): string {
  return [
    '- Units: QR-domain lifetime is SECONDS (min 180); purchase/checkout lifetime is MINUTES (min 3).',
    '- Callbacks/webhooks are SINGLE best-effort delivery — no guaranteed retry. Always verify via check_transaction; never treat a missing callback as non-payment.',
    '- Payment-link pushbacks carry NO hash (notification only) and arrive as numeric status 0 — verify, don\u2019t parse-and-trust.',
    '- There is NO EXPIRED or CLOSED status remotely: expired transactions read PENDING forever. Enforce expiry/closing merchant-side.',
    '- Payout keys: purchase path (generate-checkout, cof charge, payment-link, pre-auth complete-payout) uses {acc, amt}; the standalone payout domain and generate-qr use {account, amount}. Split totals must equal the amount.',
    '- Beneficiaries must be whitelisted before payouts. There is NO standard refund after a payout/split completes.',
    '- Currency is USD or KHR only; KHR amounts are integers.',
    '- tran_id uniqueness is the merchant\u2019s job: duplicate tran_ids are silently accepted but their QRs are unpayable.',
    '- Pre-auth: capture window defaults to 30 days; complete/cancel are the only remote finals.',
    '- RSA public key is required for payment-link, COF, beneficiary, and payout endpoints (merchant_auth is RSA-encrypted).',
    '- return_url/callback_url must be public HTTPS; private hosts are rejected by the SDK unless explicitly allowed.',
  ].join('\n');
}
