# Customer Module (portal static QR) — incorporation spec

**STATUS (2026-09-11, end of session):** Waves 1–3 shipped on branch
`feat/customer-module-qr` (commits `2cc1913`, `5cea6da`, + docs commit): parser/
classifier, server verdicts + correlation + replay, storage slot, mc-ref
normalization, `customer-qr.payment` fixture (e2e 12/12 legs pass), docs/19
chapter, skill v1.4.0, ABA Q34–Q36. **Deferred (blocked on foreign uncommitted
work on main):** CHANGELOG entry, HANDOFF/PROJECT_STATUS session notes,
docs/11 §customer-callback, docs/13 checklist rows, docs/15 scenario, docs/README
index row, docs/16 workbench event list, skills/aba-payway-transaction-by-merchant-ref
envelope note + .zcode mirrors, TypeDoc regen. Do those when main's tree is clean.

Date: 2026-09-11. Sources: `docs/archive/customermoudle-guide.md` (full KB),
`docs/archive/customer module.md` (integration guide), both untracked strays holding
REAL merchant-captured data (merchant_ref `dt-one-8989`, transaction_id `178702944869996`,
customer profile "dhitraj" / Donation outlet). The two archive files are the source
material to be folded into a real chapter — not left as archive strays.

Related untracked file: `docs/archive/Default module.openapi.json` (334 KB) is a
"Default module" (TokenManagement/purchase) OpenAPI export — NOT the Customer Module.
No action for this effort; keep it in archive.

## What the Customer Module is (contract summary)

- Portal-only feature (Invoicing Tool **or** Payment Links must be enabled). No API to
  create customers or generate these QRs — batch Excel upload is the only programmatic path.
- One static, reusable, non-expiring KHQR per entity (student, machine, distributor),
  open amount (payer enters; optional fixed amount), settled instantly; override
  settlement routing possible (ABA Pay/KHQR only; disabling BLOCKS existing QRs).
- Customer ID is NOT in the QR payload (server-side attribution via PayWay routing
  tags 62·68 + 99); it returns as `merchant_ref` in callback and mc-ref query.
- Callback: HTTP POST to the merchant profile's **single configured callback URL**
  (configured by the ABA integration team; changes via support ticket), signed with
  `X-PAYWAY-HMAC-SHA512` (HMAC-SHA512, Base64 — same header as online checkout; the
  older archive doc's "HMAC-SHA256" mention is corrected by the full KB), 5-second
  response window, **no retries**. Body carries the KHQR notification fields PLUS a
  nested `customer` object (`type, customer_id, customer_name, vat_tin, email, phone,
  address, remark`) and `payer_name`.
- Reconciliation: `get-transactions-by-mc-ref` with Customer ID as `merchant_ref`
  (≤50 rows, no pagination, 10 req/min, 20-char gateway cap).
- ABA-side provisioning steps: enable Invoicing Tool/Payment Links, make Customer ID a
  mandatory unique field, request QR-scoped API keys for the "Fetch Transaction Details
  by QR" endpoint.

## What already exists (verified in code — do NOT rebuild)

| Capability | Where |
|---|---|
| `payway.khqr.getTransactionsByMerchantRef(ref, reqTime?)` + 20-char advisory + 10/60s throttle rule | `src/domains/khqr.ts:52`, client defaults |
| CLI `get-transactions-by-ref --merchant-ref` | `src/cli.ts:1330` |
| Webhook capture server, 3 routes (online `/aba-payway-webhook` w/ HMAC verdict + tran correlation; khqr `/aba-payway-khqr-webhook` raw-store; pushback `/aba-payway-pushback`) | `src/webhook/server.ts` |
| `setup-webhook` w/ Cloudflare tunnel, `--url`, `--forward-to`, provisioning guidance ("ask ABA to whitelist the exact route") | `src/cli/commands/setup-webhook.ts`, `docs/16` §Webhook URLs and ABA Provisioning |
| Workbench `webhook trigger|verify-callback|resend|list` (7 fixture events incl. `khqr.notification`) | `src/cli/commands/webhook.ts`, `src/webhook/fixtures.ts` |
| KHQR notification parser (forward-compatible, `unknownFields`, HTML-wrapped tolerance) | `src/webhook/khqr-notification.ts` |
| Cron-ready `reconcile.cjs` fallback job (durable checkpoint, dedupe, 50-row GAP warning) | `skills/aba-payway-transaction-by-merchant-ref/scripts/` |
| Skill `aba-payway-customer-qr` v1.3.1 (payload anatomy, callback handler + outbox pattern) | `skills/aba-payway-customer-qr/` |
| Online-route correlation already reads `transaction_id` AND `payment_status` — a customer-module callback landing on `/aba-payway-webhook` is captured, verified, and correlated TODAY | `src/journal/digest.ts:240`, `server.ts:309-317` |

## User's initial thoughts — verdict

1. **Spin up the webhook server and hand the URL to the integration team** — works today
   (`setup-webhook --tunnel` → trycloudflare URL). Caveats to codify: (a) trycloudflare
   subdomains are EPHEMERAL — a merchant-profile callback URL must be stable; use
   `--url` with a durable public host (or a named Cloudflare tunnel route) for real
   provisioning, tunnel for testing only; (b) ONE callback URL per merchant profile
   receives ALL channels (online checkout + customer module + payment-link events) —
   route discrimination must happen by body shape, not by URL; (c) ABA configures the
   URL server-side — the SDK can't do or prove it (docs/16 already says this).
2. **Query by merchant ref** — shipped (SDK + CLI + reconcile.cjs). One unresolved
   contract question below (W1-4).
3. **Customer ID mandatory at PayWay** — portal configuration, not code. Codify as a
   hard prerequisite in docs/13 + chapter 19 + skill; the SDK cannot enforce it (no
   customer API exists).

## Gap register

- **G1 (P1, parser):** No first-class parser/classifier for the customer-module callback.
  The nested `customer` object + `payer_name` currently land in `unknownFields`
  (khqr parser) or nowhere (online route stores raw only). Need
  `parseCustomerQrCallback()` + `classifyCallback(body)` returning
  `'online-checkout' | 'customer-module' | 'khqr-offline' | 'payment-link-pushback' | 'unknown'`.
  Pin tests to the two REAL sample bodies from the archive KBs.
- **G2 (P1, server):** `/aba-payway-khqr-webhook` never computes a signature verdict.
  Customer-module callbacks ARE signed (unlike offline notifications). Add verdict
  computation when `x-payway-hmac-sha512` + apiKey are present (offline deliveries stay
  verdict `'unsigned'`). Also: khqr-route records don't populate
  `matchedTransactionId/matchedStatus` (same class as the open P3-A pushback follow-up).
  Online route: attach the G1 classification + parsed customer metadata to the record.
- **G3 (P1, response shape):** `GetTransactionsByMcRefResponse` in `src/types.ts:1312`
  says `{status?: number, transactions?: KhqrTransaction[]}` but BOTH real captured
  samples show `{data: [...], status: {code: "00", message, merchant_ref}}`. Sandbox
  404s this endpoint (profile lacks the KHQR domain — never live-verified). Normalize
  both envelopes in the domain; keep raw passthrough for CLI. Check `reconcile.cjs`
  reads whichever field the real API returns.
- **G4 (P2, fixture):** No `webhook trigger` fixture for a customer-module payment
  (signed body + nested customer object + payer_name + merchant_ref as customer id).
  Add event `customer-qr.payment` (or extend overrides) signed via the SHARED
  `signCallbackBody` — never duplicate canonicalization (D1/D3).
- **G5 (P2, docs):** No numbered chapter; the two KBs sit untracked in `docs/archive/`.
  Fold into `docs/19-customer-module-qr.md` (next free number; 17=payment-link, 18=journal).
- **G6 (P2, docs):** docs/16 needs the stable-URL-vs-tunnel provisioning guidance and
  one-URL-all-channels note; docs/13 needs checklist rows (Invoicing Tool enablement,
  mandatory unique Customer ID, QR-scoped API keys, callback URL ticket); docs/11 needs
  the customer-callback contract section; docs/README + docs/15 need entries.
- **G7 (P2, skills):** `aba-payway-customer-qr` → next minor: one-callback-URL constraint,
  workbench trigger example, response-shape caveat, `.zcode` mirror sync (byte-identical
  rule). `aba-payway-transaction-by-merchant-ref`: envelope caveat. `aba-payway-webhook-production`:
  customer callback verification path.
- **G8 (P3, optional):** Agent tool `query_transactions_by_merchant_ref` (catalog 13→14).
  Catalog changes ripple into pins (`agent-provider.test.ts` count, skills, user guide) —
  only on explicit request.
- **G9 (docs):** Operational warnings worth carrying into ch. 19: override-settlement
  disable blocks existing QRs; customers undeletable after first payment; vouchers don't
  apply; regenerated QRs change the `99.00` profile id (re-print); 50-row saturation ≠
  complete history.

## Wave plan (gated commits, per repo workflow)

### Wave 1 — SDK contract (G1, G2, G3)
- `src/webhook/customer-callback.ts` (or extend `khqr-notification.ts`):
  `parseCustomerQrCallback` + `classifyCallback`; exported from barrel.
- `server.ts`: classification + customer metadata on capture; signature verdict on the
  khqr route; `matchedTransactionId/matchedStatus` on khqr + pushback records (closes
  the open P3-A follow-up in the same stroke if cheap).
- `domains/khqr.ts`: normalize mc-ref envelope (`data`/`transactions`, status
  object/number) behind a stable returned shape; keep `raw` on the result. Tests pinned
  to the two real sample bodies. No new hash-bearing endpoint → no HASH_ORDER_HINTS drift.
- Gate: build → vitest → tsc → biome; storage tests for new metadata on both backends.

### Wave 2 — workbench (G4)
- `fixtures.ts`: `customer-qr.payment` event (+ overrides: customerId, customerName,
  payerName); signed via `signCallbackBody`. `webhook trigger --event` accepts it;
  `webhook list` shows classification.
- Gate: suite + a local e2e leg mirroring `.scratch/audit-webhook-e2e/` (trigger →
  capture → verify-callback on the captured record).

### Wave 3 — docs, skills, status (G5, G6, G7, G9)
- `docs/19-customer-module-qr.md`; docs/16/13/11/15 + README index rows; skills bumps +
  `.zcode` mirrors; CHANGELOG Unreleased; PROJECT_STATUS session entry; HANDOFF bullet;
  ABA-OPEN-QUESTIONS Q22–Q24 (below).
- Gate: docs-examples tests, skills greps, `.zcode` byte-identical.

### User-gated live verify
- One real-merchant `get-transactions-by-mc-ref` call (sandbox 404s it) to settle the
  G3 envelope question — needs the user's merchant credentials.
- Optionally capture one real customer-module callback against `setup-webhook`.

## Open questions for ABA (append to ABA-OPEN-QUESTIONS.md)

- **Q22:** `get-transactions-by-mc-ref` response envelope — official doc example shows
  `{data: [], status: {code: "00", …}}` but the published OpenAPI models
  `{status: number, transactions: []}`. Which is canonical in production?
- **Q23:** Do customer-module callbacks arrive at the merchant profile's single
  configured callback URL mixed with online checkout callbacks (one URL per profile),
  or is a distinct URL/path possible per channel?
- **Q24:** Can a sandbox profile with the Customer Module / KHQR query domain be
  provisioned? (Current sandbox 404s the by-ref endpoint — the reconciliation leg is
  untestable in sandbox.)
- Minor: confirm HMAC-SHA512 (KB) over the archive doc's HMAC-SHA256 mention.
