/**
 * The curated knowledge corpus — single curation surface for
 * scripts/sync-knowledge.mjs, which copies each source into `knowledge/`,
 * writes knowledge/MANIFEST.json, and generates llms.txt.
 *
 * Policy: user-facing integration docs only. Internal audit dossiers
 * (SANDBOX-FINDINGS, INTEGRATION-GAPS, competitive analyses, PROJECT_STATUS,
 * …) stay out — scripts/check-package-contents.mjs forbids them in the
 * package; their distilled facts reach agents via explain/the knowledge digest.
 */
export const SOURCES = [
  { topic: 'integration-onboarding', source: 'docs/guides/integration-onboarding.md', title: 'Integration profile and merchant gates', description: 'Structured intake, onboarding, simulator evidence, G0–G7 and controlled production/rollback.' },
  { topic: 'integration-contracts', source: 'docs/guides/integration-contracts.md', title: 'Integration contracts and callbacks', description: 'Source/version authority, callback variants and ACK, vectors, URL roles and inquiry policy.' },
  { topic: 'integration-finance', source: 'docs/guides/integration-finance.md', title: 'Integration finance evidence', description: 'Receipts, report grain, authoritative joins, batch-to-bank matching and settlement signoff.' },
  { topic: 'integration-operations', source: 'docs/guides/integration-operations.md', title: 'Advanced integration operations', description: 'Consent, billing, hold/refund/payout locks, monitoring, plugins and adjacent product boundaries.' },
  { topic: 'integration-ui', source: 'docs/guides/integration-ui.md', title: 'Customer UI and mobile acceptance', description: 'Verified UI states, QR/app handoff, accessibility, physical-device evidence and operator roles.' },
  { topic: 'agent-integration', source: 'docs/guides/24-agent-integration.md', title: 'Merchant agent integration', description: 'Project inspection, workflow capability/verification matrix, portable skill installation, recovery and production boundaries.' },
  { topic: 'integration-recipes', source: 'docs/guides/integration-recipes.md', title: 'Express and Next.js integration recipes', description: 'Authenticated QR, hosted checkout and payment links; saved attempts, durable inbox, inquiry and fulfillment outbox.' },
  { topic: 'support', source: 'SUPPORT.md', title: 'Support and compatibility', description: 'Runtime, verification limits, support scope, and sanitized bug reports.' },
  { topic: 'contributing', source: 'CONTRIBUTING.md', title: 'Contributing', description: 'Contributor setup, offline checks, gateway verification, and release review.' },
  { topic: 'security', source: 'SECURITY.md', title: 'Security policy', description: 'Private vulnerability reporting and disclosure policy; mailbox launch check remains required.' },
  { topic: 'storage-service', source: 'docs/guides/21-storage-service.md', title: 'Storage service', description: 'Unified data root, JSON defaults, optional SQLite backend, and store ownership.' },
  { topic: 'quickstart', source: 'QUICKSTART.md', title: 'Quickstart', description: 'First sandbox payment end to end: credentials, .env, generate-qr, check-transaction, polling.' },
  { topic: 'quickstart-1-page', source: 'docs/guides/QUICK-START-1-PAGER.md', title: 'One-page quickstart', description: 'Condensed create→verify→fulfill reference for the impatient.' },
  { topic: 'docs-index', source: 'docs/README.md', title: 'Docs index', description: 'The full documentation map: start-here routes, per-domain guides, troubleshooting.' },
  { topic: 'overview', source: 'docs/guides/01-overview-and-concepts.md', title: 'Overview & concepts', description: 'PayWay model: merchant credentials, hash signing, sandbox vs production, payment options.' },
  { topic: 'setup', source: 'docs/guides/02-prerequisites-and-setup.md', title: 'Prerequisites & setup', description: 'Merchant portal, sandbox credentials, ABA Mobile simulator, environment variables.' },
  { topic: 'web-implementation', source: 'docs/guides/03-web-implementation.md', title: 'Web implementation', description: 'Hosted checkout + server-side purchase flow for web apps, with callback verification.' },
  { topic: 'native-apps', source: 'docs/guides/04-native-app-implementation.md', title: 'Native app implementation', description: 'Android/iOS integration: deeplinks, webviews, return handling.' },
  { topic: 'webviews', source: 'docs/guides/05-webview-implementation.md', title: 'Webview implementation', description: 'Mobile webview checkout patterns and deeplink return legs.' },
  { topic: 'telegram-mini-app', source: 'docs/guides/06-telegram-mini-app.md', title: 'Telegram mini-app', description: 'PayWay checkout inside a Telegram mini-app.' },
  { topic: 'qr-handling', source: 'docs/guides/07-qr-code-handling.md', title: 'QR code handling', description: 'Online vs offline KHQR, scan-time validity windows, rendering and expiry semantics.' },
  { topic: 'deep-linking', source: 'docs/guides/08-deep-linking.md', title: 'Deep linking', description: 'abamobilebank:// deeplink scheme and return-leg handling.' },
  { topic: 'link-lifecycle', source: 'docs/guides/09-link-unlink-renew-lifecycle.md', title: 'COF link/unlink/renew lifecycle', description: 'Credentials-on-file account/card lifecycle and token renewal.' },
  { topic: 'ui-customization', source: 'docs/guides/10-ui-customization.md', title: 'UI customization', description: 'Hosted checkout branding and view customization options.' },
  { topic: 'callbacks-webhooks', source: 'docs/guides/11-callbacks-and-webhooks.md', title: 'Callbacks & webhooks', description: 'Single best-effort callback delivery, HMAC verification, webhook workbench.' },
  { topic: 'errors-and-debugging', source: 'docs/guides/12-error-handling-and-debugging.md', title: 'Errors & debugging', description: 'Every PayWay error code with sandbox-verified hints; the debugging playbook.' },
  { topic: 'deployment-checklist', source: 'docs/guides/13-deployment-checklist.md', title: 'Deployment checklist', description: 'Production go-live gates: credentials, RSA, callback URLs, base URL.' },
  { topic: 'code-snippets', source: 'docs/guides/14-appendix-code-snippets.md', title: 'Appendix: code snippets', description: 'Copy-paste hash signing, callback verification, and polling snippets.' },
  { topic: 'merchant-scenarios', source: 'docs/guides/15-merchant-scenario-requirements.md', title: 'Merchant scenario requirements', description: 'POS/billing/scenario requirements observed in real integrations.' },
  { topic: 'webhook-setup', source: 'docs/guides/16-webhook-setup-guide.md', title: 'Webhook setup guide', description: 'Local listener, tunnels, forwarding, and production webhook configuration.' },
  { topic: 'payment-link', source: 'docs/guides/17-payment-link.md', title: 'Payment link', description: 'Payment-link create/detail/void contract incl. pushbacks and VOIDED semantics.' },
  { topic: 'transaction-journal', source: 'docs/guides/18-transaction-journal.md', title: 'Transaction journal', description: 'CLI default recording, SDK opt-in, unified data root, timeline/stats/reconcile/anomalies.' },
  { topic: 'customer-module-qr', source: 'docs/guides/19-customer-module-qr.md', title: 'Customer module QR', description: 'Portal Customer-ID keyed QR generation and merchant-reference reconciliation.' },
  { topic: 'settlement-disputes', source: 'docs/guides/20-settlement-and-disputes.md', title: 'Settlement & disputes', description: 'Settlement timing, chargebacks, and refund boundaries per payment method.' },
  { topic: 'api-datetime-timezones', source: 'docs/guides/22-api-datetime-and-timezones.md', title: 'API datetime & timezones', description: 'Endpoint-specific UTC, UTC+7, epoch, naive datetime, callback, and parsing rules.' },
  { topic: 'cloudflare-webhook', source: 'docs/recipes/cloudflare-free-webhook.md', title: 'Cloudflare webhook (free tier)', description: 'Free-tier Cloudflare Worker webhook receiver setup.' },
  { topic: 'agent-setup-playbook', source: 'docs/guides/AGENT-SETUP-PLAYBOOK.md', title: 'Agent setup playbook', description: 'Configuring the agentic CLI: providers, capability modes, privacy ack.' },
  { topic: 'agentic-cli-guide', source: 'docs/guides/AGENTIC-PAYWAY-CLI-USER-GUIDE.md', title: 'Agentic CLI user guide', description: 'ask / agent REPL / sessions / ledger — the full agent surface.' },
  { topic: 'first-payment-walkthrough', source: 'docs/guides/FIRST-PAYMENT-WALKTHROUGH.md', title: 'First payment walkthrough', description: 'Guided first sandbox payment with verification at each step.' },
  { topic: 'close-transaction', source: 'docs/guides/23-close-transaction.md', title: 'Close transaction', description: 'Channel-dependent close semantics: QR kill vs stale hosted-card sessions, the local closed flag, reconciliation.' },
  { topic: 'sdk-cli-reference', source: 'docs/reference/SDK-AND-CLI-REFERENCE.md', title: 'SDK & CLI reference', description: 'Every SDK domain method and CLI command with flags and contracts.' },
  { topic: 'error-codes', source: 'docs/error-codes.json', title: 'Error codes (machine)', description: 'Machine-readable error-code registry (generated by scripts/generate-error-registry.ts).' },
];
