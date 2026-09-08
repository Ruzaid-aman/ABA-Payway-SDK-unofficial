# Changelog

## Unreleased

### Audit acceptance closure (2026-09-08)

- Skill installation preserves unowned conflicts and edited managed files across
  repeated upgrades, retirement and removal. Unchanged retired resources are
  pruned per file; nested links and invalid manifest paths cannot authorize
  writes outside an installation. `skills remove --force-skills` explicitly
  removes modified managed files while preserving unowned files.
- The v2 manifest now records full/partial selection intent. Doctor uses a YAML
  parser, validates selected resources against the current package, and reports
  missing linked dependencies. Legacy manifests infer selection from owned files.
- Refund `--json` emits the shared error envelope for invalid credentials,
  currency, amount, transaction ID and gateway rejection, with diagnostics on stderr.
- Customer-QR acceptance commits its dedupe record and outbox job together.
  The guide includes a storage-adapter reference and an idempotent worker;
  SQLite-backed tests execute rollback, restart, duplicate delivery and worker recovery.
- KHQR inspection rejects malformed nested tag 99; offline PNG support is
  reflected in CLI help. Recursive skill-mirror checks cover scripts and references,
  including the previously missed reconciliation migration.

### Second-pass audit remediation (2026-09-08, R1–R7 + S1–S4)

Second-pass review (`audit-results/second-pass-2026-09-08/REPORT.md`) found the
seven first-pass defects still reproducible plus four new ones. This batch
corrected those narrow reproductions. The later merged-work review found
additional acceptance gaps, addressed by the audit acceptance closure above.

- **R1 — refund preflight currency validation**:
  `computeRefundableBalance` validates the refund request currency against the
  order's `original_currency` (both mismatch directions and the missing-field
  case) and returns `ambiguous` with a `currencyMismatch` marker instead of
  comparing numbers in different units. The CLI refund preflight hard-stops on
  mismatch (hint: re-run with `-c <order currency>`). The refund skill and
  docs no longer claim `ambiguous` for payer-currency differences (payer money
  stays informational with a reason string).
- **R2 — customer-qr callback handler**: the guide handler read
  `status/amount/currency` — fields the route never sends — so a signed
  APPROVED fixture acknowledged at 200 with zero fulfillment jobs. It now
  normalizes the route's real fields (`payment_status`, `original_*` order
  money; `payment_amount`/`payment_currency` stay informational W5-6 money)
  and is executed for real by a behavior harness
  (`skill-handler-behavior.test.ts`) that transpiles the guide's code block
  and drives it with the packaged `mock-callback.cjs` fixtures.
- **R3/R4/R7/S1 — skills installer versioned ownership**: the manifest is now
  a `{ schemaVersion, packageVersion, files }` envelope. User-edited files
  keep their packaged baseline recorded (edits survive two or more upgrades —
  previously upgrade two silently overwrote them); partial `--only` installs
  merge into the existing manifest instead of dropping other skills'
  ownership; `skills doctor` compares installed bytes against the CURRENT
  package (outdated detection), parses frontmatter for `name`/`description`,
  and classifies modified/deleted/outdated separately; `skills remove` deletes
  only manifest-owned files — user files inside managed skill directories
  survive and empty-only directories are removed. Legacy flat v1 manifests
  load with baselines intact.
- **R5 — refund machine output (refund slice)**: under `--json`, preflight
  progress goes to stderr and local rejections emit the shared
  `{ error: { kind, exitCode, … } }` envelope — stdout parses as exactly one
  JSON document end-to-end.
- **R6 — reconcile.cjs legacy checkpoint migration**: `loadCheckpoint` merges
  the legacy split state (timestamp file + sibling `.seen.json`) before
  processing, so an upgraded install cannot re-emit every previously seen
  transaction under the inclusive-watermark policy.
- **S2 — KHQR byte-based inspection**: `inspectKhqrPayload` parses the same
  UTF-8 bytes the generator encodes lengths against (multibyte merchant names
  round-trip), treats nested-template parse failures as structural
  malformation (`undefined`, never `valid: true`), and requires exactly two
  decimal length digits. `valid` remains structure+CRC; CRC stays integrity,
  not authenticity.
- **S3 — offline QR artifacts in machine mode**: `generate-qr --offline` now
  performs the self-check and the requested PNG artifact BEFORE choosing the
  renderer — `--save-image` works identically under human/JSON/NDJSON, the
  path lands in `artifacts.qrPngPath`, artifact failures surface as
  `artifacts.qrPngError` without failing the locally-created QR, and
  `creation.selfCheck` carries the CRC verdict into machine output.
- **S4 — token-expiry example**: the token-lifecycle guide now derives the
  expiry (`computeTokenExpiry(linkedAt)`) and passes THAT to
  `daysUntilTokenExpiry` (the old shape answered 0 days for a fresh token);
  pinned by a frozen-clock test (fresh 90 / near-expiry 7 / expired −1).
- **F07 follow-up**: removed the offline-qr guide's contradictory "unlike a
  locally built offline QR" routing claim.

### Salvaged from preserved stashes (2026-09-07 "merge all to main" sweep)

- **KHQR payload self-check (from the 2026-08-26 stash):** new exported
  `inspectKhqrPayload()` / `validateKhqrCrc()` / `khqrCrc16()` — offline TLV
  decode + CRC-16 verification returning a typed
  `KhqrPayloadInspection` (static/dynamic, currency, amount, merchant
  identity, Bakong ID, reference; `undefined` for malformed payloads).
  `generate-qr --offline` now runs the self-check automatically, prints the
  decoded summary, renders the QR in the terminal (interactive TTYs), and
  saves a locally rendered PNG (`payway-output/<ref>.png`) under the same
  `--save-image/--no-save-image/--open-image` contract as online mode —
  offline QRs previously shipped the raw string only.
- `examples/first-payment/package-lock.json` restored (vendored-tarball
  install reproducibility; from the DX-overhaul stash).
- `.gitleaks.toml` committed — the CI secret-scan workflow
  (gitleaks/gitleaks-action) reads its reviewed allowlist from the repo root.
- Superseded-stash remainder dropped deliberately: the old CLI merge-repair
  stash was fully integrated earlier via the DX campaign; the old
  payment-link/pre-auth payout-entry validation and skill-text hunks
  conflicted with the F02–F13 audit fixes now on main (see
  `validatePayoutEntryShape` / the audit remediation commit 9d36e26).

### Correctness (skills/SDK/CLI audit 2026-09-07, F01/F02)

- **F01 — mutation single-submit policy**: side-effecting endpoints (QR/purchase
  creates, refund, close, COF link/charge/renew/remove, payment-link create,
  pre-auth complete/cancel, payout, beneficiary whitelist) now default to a
  SINGLE transport attempt: a lost response is an UNKNOWN outcome (duplicate
  tran_ids are silently accepted by the gateway, W5-7, so an automatic re-send
  could double-charge). Reads keep the bounded retry default. Opt back in per
  call (`retryPolicy: 'transient'` on purchase) or globally
  (`mutationRetryPolicy: 'transient'` config). Facade (`retryPolicy ?? 'none'`)
  and agent (`maxRetries: 0` for creates) already pinned the same behavior —
  the direct SDK and CLI now match them.
- **F02 — currency-aware refund preflight**: new exported
  `computeRefundableBalance(detail, requestCurrency)` reconciles
  `original_amount − refund_amount` in ONE currency and returns a typed
  ok/unavailable/ambiguous result (never mixes payer `payment_amount` — W5-6
  cross-currency evidence — and never throws for data problems). CLI `refund`
  preflight uses it; `-y/--force` now skips ONLY the confirmation prompt while
  `--no-preflight` skips ONLY balance validation (previously `-y` silently
  bypassed validation).

### Skills correctness and portability (audit 2026-09-07, F03–F13)

- **F03**: `reconcile.cjs` rewritten around durable transaction-ID dedupe with
  an atomic checkpoint and a 50-row saturation `GAP:` warning (the endpoint
  has no pagination parameter; a saturated response is never reported as
  complete reconciliation).
- **F04**: the customer-QR example now guards payment state, obligation
  matching, and atomic transaction-ID dedupe before fulfillment, and stops
  promising unsupported pagination.
- **F05/F06/F07/F13**: hosted-checkout skill rewritten to the live two-route
  contract (hosted URL vs hosted HTML) with the `as any` cast removed and the
  CLI `--payment-gate` flag documented truthfully; token-lifecycle example IDs
  fixed; offline-qr guide now distinguishes local generation from downstream
  ABA notifications (validateCallbackSetup/parseKhqrPaymentNotification);
  beneficiary examples use seeded sandbox accounts; link-card frequency and
  hash prose corrected; transaction-close presents the conflicting not-found
  evidence as dated observations; bulk `--pace 0` removed from quick starts;
  journal prune moved to an opt-in maintenance section; subscription hash
  count (27) and skills count (32) corrected; `Asia/Phnom_Penh` timezone.
- **F08**: all 32 skills migrated to `metadata.version` (no top-level `version`
  field — the skill-creator validator rejects it); the skills test parses the
  schema instead of pinning a fixed frontmatter layout.
- **F09**: the skills installer is target-aware (OpenCode installs to
  `~/.config/opencode/skills`), keeps a per-file sha256 manifest, preserves
  user-modified files on upgrade (`--force-skills` to overwrite), removes only
  manifest-owned directories, and adds `--only` bundle install, `--dest`
  overrides, and `skills doctor --agent <name>` scoped health checks with
  stale/modified/missing detection.
- **F10**: distributed guides use the installed CLI (`payway-sdk …`) with
  source-checkout commands labeled as such; dead `blob/v1.5.0` tag URLs
  removed (payment-link guide, agent playbook reference).
- **F11**: the `Using profile:` diagnostic goes to stderr under `--json` and
  `--output json|ndjson` — machine-mode stdout is exactly one JSON document;
  the "parse from the first `{`" workaround is retired from all guidance.
- **F12**: per-skill drift guards in the test suite check every guide
  individually for the known drift classes (request-ID validity, sandbox
  fixtures, pacing, dead URLs, timezone names) plus focused contract pins for
  the F02–F07 fixes.

### Developer experience

- Make QUICKSTART.md the canonical create, verify, and fulfill-once journey across SDK, CLI, and skills.
- Promote sdk.initiate with additive paymentArtifact, paymentLifecycle, and paymentNextStep exports. Preserve gateway and legacy session status contracts.
- Add first-payment command help and human verification/recovery guidance without changing JSON envelopes or exit codes.
- Add the webhook-production skill (32 packaged guides) and simplify the first-payment skill and documentation navigation.

### Breaking

- Raise the minimum Node.js runtime to 22.12.0 to match Commander 15. Node 20 is no longer supported by this checkout. The next release requires a new major version; metadata remains at the unpublished 1.5.0 baseline until release preparation.

### Release preparation

- Keep default contributor tests offline; live sandbox checks require the explicit sandbox command. Add a runnable first-payment walkthrough and reject overlapping pending attempts in the reference app, including after restart.
- Replace broad secret-scan exclusions with detector/file/value-specific fixtures and negative-control checks. Record historical findings and the pending owner/history decisions without publishing secret values.
- Align contributor setup, support documentation, and Linux/Windows CI with the current SDK. Remove captured merchant/test data from the tracked tree while preserving local evidence. Historical data remains subject to the release audit gate.

> Subscription "Wrong Hash" root cause (sandbox-verified 2026-09-05): the
> gateway signs `ctid` on the purchase path (between `items`
> and `shipping`) even though the live docs' subscription operation omits it —
> the documented 26-field order is rejected with Wrong Hash. Also: the sandbox
> merchant profile is not subscription-enabled (`104`), which remains an
> external blocker for end-to-end subscription testing.

### Added

- **Transaction-journal improvement batch (I-1..I-13)**: poll outcomes map to
  exit codes on generate-qr/generate-checkout (W5-11 fixed — timeout exits 3,
  machine-visible); every `--json` success envelope carries
  `correlationId`/`traceId` join keys; duplicate-tran_id advisory (W5-7) on
  the three create commands via the journal, `--allow-duplicate-id` to
  suppress; `doctor` journal row + 50 MB retention warning; journal retention
  `maxAgeDays` / `PAYWAY_JOURNAL_MAX_AGE_DAYS` (prune on write, best-effort);
  `journal timeline --with-webhooks` (verdict/matched-status/replay from raw
  captures); `setup-webhook --journal` (.env upsert, never clobbers); REPL
  unfinished-creates banner (`PAYWAY_AGENT_NO_RECOVER_HINT` opt-out);
  `agent ledger prune --before` (finished-only, unfinished never removed);
  docs/12 Pattern 3b (hook meta + onError + journal join).
- **Transaction Journal — Phase 4 Analytics** (roadmap §17): `computeJournalStats`
  (exported) + **`journal stats`** CLI — latency percentiles (p50/p90/p99/max) per
  endpoint over successful responses, retry rates per correlation-id-grouped
  exchange, top provider/HTTP/transport errors with per-day counts, and the
  creation → status → callback funnel (read-endpoint heuristic documented;
  reports the local record only, never gateway truth).
- **Transaction Journal — Phase 5 AI Layer**: new read-only **`query_journal`**
  agent tool (13-tool catalog; planner/risk READONLY sets, provider listing, plan
  + ledger schemas updated) with `timeline` (RCA steps + verdict), `stats`,
  `reconcile`, and `anomalies` queries — no network, no approval gate. Packaged
  skill **`aba-payway-journal`** v1.0.0 (skills README + discovery pin 30→31).
  `PAYWAY_WEBHOOK_DIR` env var (registered) relocates the webhook capture store
  for reconciliation.
- **Transaction Journal — Phase 6 Intelligence**: `explainTransaction` +
  **`journal explain -t <id>`** root-cause narrative (verdict, chronological step
  reconstruction, sandbox-verified hints incl. gateway code hints and the
  PENDING-forever/no-retry caveats) and `detectJournalAnomalies` +
  **`journal anomalies`** — error spikes, retry bursts (leave-one-out baseline:
  a day at ≥ 3× the mean of the OTHER active days), and latency outliers (p99 ≥ 3×
  p50 over ≥ 5 samples). This completes the 6-phase transaction-data roadmap.
- **Transaction Journal — Phase 3 Callback/Event Capture** (roadmap §17; closes gaps
  G7/G8, mitigates G9): the webhook sink now **persists the signature verdict** it
  previously computed-then-dropped — `signatureVerdict` (`verified`/`invalid`/
  `unsigned`) + `verificationReason` on every online-route record, extracted
  **`matchedTransactionId`/`matchedStatus`** (online body or KHQR parsed
  notification) as the correlation join key, and a **`replay`** marker when a prior
  record carries the same (transactionId, status) pair for idempotent processing.
  Every delivery emits a `callback.received` journal event (correlationId = webhook
  record id). SQLite stores migrate in place via `ensureCallbackMetadataColumns`
  (5 additive columns, duplicate-tolerant); JSONL needs no migration. New
  **`journal reconcile`** command joins the journal with the webhook store per
  transaction: with-callback / **without-callback** / webhook-only buckets plus
  duplicate-delivery flags — with the standing caveat that a missing callback is
  not proof of non-payment (PayWay never retries missed deliveries).
- **Transaction Journal — Phase 2 Transaction History** (roadmap §17; closes gaps
  G5/G6/G10/G12/G16/G17): new **`journal show|timeline|prune`** CLI query surface
  over the JSONL file (show filters by kind/transaction with `--last`, timeline
  reconstructs one transaction's chronological history, prune deletes by cutoff —
  parse-safe, atomic). **`agent ledger recover --session-id <id>`** finally exposes
  the orphaned `findUnfinishedExecutions` (lookup only, never auto-replays) with a
  per-record `check-transaction` recovery hint. New event kinds:
  `execution.started` (every CLI command via a new global `--journal` flag that arms
  the whole invocation), `poll.attempt` (every poll — previously stdout-only),
  `status.observed` (check-transaction/transaction-detail/terminal poll),
  `artifact.written` (agent artifacts). Ledger records gain **`resultSummary`** — a
  scrubbed allow-listed digest of what successful creates returned (checkout URLs,
  ids); session `tool_result` events carry the same digest in `data`; the dormant
  `'ledger'` session event is now emitted with final status + correlation. Hooks are
  additively enriched: `onRequest`/`onResponse` receive trailing
  `meta {correlationId, attempt, durationMs?, traceId?}` (old handlers unaffected)
  and a new **`onError`** hook fires on every failed attempt. Option-name note: the
  recover flag is `--session-id` because the `agent` group's own `--session` (REPL
  resume) swallows the value on subcommands.
- **Transaction Journal — Phase 1 Observability** (closes observability gaps): opt-in append-only JSONL record of every API exchange under
  `<cwd>/payway-data/journal.jsonl` — per-attempt `execution.request`,
  `execution.response` (incl. 200-wrapped business failures), and
  `execution.error` (the thrown paths where no hook fires), each carrying the
  SDK correlation id, attempt number, endpoint, durationMs, gateway
  `status.trace`, `tran_id`/merchantRef extraction, httpStatus/paywayCode,
  and a redacted body digest. Enable with config `journal: true |
  { dir, mode }` or `PAYWAY_JOURNAL=1` (+ `PAYWAY_JOURNAL_DIR`,
  `PAYWAY_JOURNAL_MODE` — all registered in the env validator). `digest`
  mode (default) allow-lists non-secret transactional fields; `full` mode
  runs bodies through `sanitizeForLog` with a 16 KB cap. Writes are
  fail-open, schema-validated (strict Ajv, `additionalProperties: false`),
  and the barrel exports `pruneJournal` (atomic, parse-safe rewrite).
  Default OFF — a library must never write files silently. Correlation is
  propagated end-to-end: new `PayWay.lastCorrelationId` getter, the agent
  executor attaches the cid to the ledger record (`attachCorrelation`,
  first-write-wins — the unused `correlation` field is now populated), and
  artifact sidecars carry `correlationId` (contracts + strict Ajv schema
  updated). Docs: `docs/18-transaction-journal.md`.
- **Payment-link codification C1–C3 (2026-09-06, third session)** — the
  live-learned gateway contracts are now encoded in the SDK:
  **(C1)** exported `parsePaymentLinkPushback()` + `PaymentLinkPushback` /
  `PaymentLinkPushbackStatus` types — coerces the captured pushback body
  (`status` numeric `0`/`"0"`/`"00"` → `'APPROVED'`, unknown → `'UNKNOWN'`
  with the raw value preserved; `tran_id` → string; throws on structurally
  invalid bodies). **(C2)** webhook server route **`/aba-payway-pushback`**
  (configurable via `pushback.path`): stores the raw delivery first, attaches
  `parsePaymentLinkPushback` metadata (JSON + SQLite backends), ACKs 200 —
  no HMAC is attempted because pushbacks carry no hash; `setup-webhook`
  prints the route. **(C3)** `paymentLink.create` warns locally when
  `expiredDate` is past or under ~5 minutes out (gateway PTL04,
  sandbox-verified; boundary bracketed (150s, 300s]) — new exported constant
  `PAYMENT_LINK_EXPIRY_MIN_SECONDS = 300`; advisory by default,
  `strictValidation` escalates. Barrel +2 runtime exports (57 → 59; +2 type-only;
  release-checklist smoke updated).
- **Payment-link codification C4–C9 (2026-09-06, third session)** —
  **(C4)** the mock harness (`startMockPaywayServer`, `payway-sdk demo`)
  now serves the payment-link create/detail endpoints with the live-learned
  shapes (numeric `tran_id`, `expired_date: "0"` string echo, `status: OPEN`,
  empty-image shape; detail echoes a created link per server lifetime and
  answers the sandbox-observed code 96 for a bogus id). **(C5)**
  `payment-link detail` human output prints a "PAST expiry" warning when
  `expired_date` is past — the gateway keeps reporting OPEN (no EXPIRED
  status exists), so the CLI surfaces the computed state; `--json` stays
  raw. **(C6)** new `payway-sdk explain` family for the payment-link PTL
  codes not claimed by other families (PTL05/PTL99/PTL132, with the
  sandbox-vs-official caveats in the hints) + `apiErrorHint` rows for
  PTL132/PTL05/PTL99. **(C7)** copy-runnable pushback receivers
  (`docs/examples/backend/payment-link-pushback-receiver.{js,php}`) on the
  live no-hash contract, wired into the docs-examples suite. **(C8)** agent
  `create_payment_link` result now surfaces `shareUrl` directly. **(C9)**
  reusable callback-capture recipe (`docs/agents/callback-capture-recipe.md`)
  extracted from the V-1 rig.
- **Payment-link follow-up batch (2026-09-06, second session)** — Batch-A
  probes executed (sandbox-verified 2026-09-06): `tran_id` observed as a NUMBER on
  both endpoints; **no EXPIRED status** (expired links read OPEN + hosted
  page 200 — enforce expiry merchant-side); create rejects past/under-5-min
  `expired_date` with PTL04; bogus detail id answers **96** (PTL132 not
  reproduced); PTL04 is the catch-all create rejection (EUR/omitted
  currency/non-numeric amount). V-1 (real pushback body) and V-2 (payout
  placement) — **V-1 CLOSED live**: the pushback carries NO hash field
  (live-captured through a real simulator payment; body
  `{"tran_id":"…","status":0,"merchant_ref_no":"…"}`, `User-Agent:
  PayWayApp/3.0`, `status` numeric 0, `tran_id` string — verification is
  check-transaction, not verifyCallback; docs/17 §17.6 + docs/16 + skill
  updated). V-2 remains externally blocked: the sandbox profile has no
  payout-whitelist service (code 32). Doc deliverables completed:
  docs/14 snippets, docs/16 pushback section, docs/13 checklist row,
  README CLI detail example, agent user-guide 12-tool table,
  `docs/examples/backend/payment-link-create.ts` (+ docs-examples wiring),
  TypeDoc regen; probe findings folded into docs/17, docs/12, the OpenAPI
  spec (`src/types.ts` regenerated), and the packaged skill.
- **Payment-link documentation & consistency batch (2026-09-06)** — new full
  lifecycle chapter `docs/17-payment-link.md` (parameter tables with datatype
  reality notes — the official docs declare several numeric fields as strings
  and disagree with their own samples; permutations & recipes; pushback
  receiver; error-code table incl. the undocumented sandbox-discovered
  `PTL04`; troubleshooting), a payment-link code table in docs/12, and
  `aba-payway-payment-link` skill v1.4.0 (image limits, pushback, status
  lifecycle, `--json` envelope, agent tools). OpenAPI spec synced:
  detail response gains `pushback_url`, `payout` listed as a create schema
  property, `tran_id` typed `number | string`, totals typed with
  do-not-rely notes — `src/types.ts` regenerated.
- **`payment-link create`/`detail --json` error envelopes (T5.4 parity)** —
  both commands now print the machine-parseable
  `{ error: { kind, exitCode, type, message, paywayCode, … } }` envelope on
  gateway rejections AND local validation failures (payout total mismatch,
  bad amount/currency, image loader errors); banner suppressed in `--json`
  mode. Same contract as check-transaction / transaction-detail /
  generate-checkout.
- **Agent: `create_payment_link` forwards `payout`** (plan schema + executor
  + provider prompt) and a new read-only **`get_payment_link_details`** tool
  (12-tool catalog) resolves a Link ID to normalized
  `{paymentLinkId, status, totalTrxn, totalAmount, paymentLink, raw}` —
  wired through contracts, plan/ledger schemas, planning/risk READONLY sets
  (no approval gate), and the provider tool listing. NOTE: the plan's P2 also
  listed `image` forwarding — deliberately NOT wired into the agent tool
  (the provider plan schema is JSON; shipping raw image bytes through an
  LLM plan adds noise and secret-scrubbing risk for little utility). Create
  image-bearing links via the SDK/CLI; revisit only if a real workflow asks.
- **`payment-link create --no-show-qr`** — suppresses the TTY auto-QR of the
  share URL (parity with generate-qr / generate-checkout).
- **`paymentLink.create` merchantRefNo cap advisory** — >50 chars warns
  (spec-documented max; `strictValidation` → throw); 50 exactly passes.
- **CLI `--image` loader enforces the 3MB cap** — over-limit files exit 1
  locally (parity with the `--payout` total-equals-amount rule; the SDK domain
  stays advisory — the gateway is the final arbiter).

- **First-payment onboarding path** — `payway-sdk demo` now serves a clearly
  labelled, credential-free payment UI backed by the local mock gateway;
  `demo --check` verifies the installed flow for CI. `init` adds explicit
  demo/sandbox modes and a non-destructive first-payment starter, while
  route-aware `doctor` reports credential source, profile, environment, and
  endpoint without exposing secret fragments. The packaged quickstart now
  leads from install to demo, sandbox QR, and server-side integration with
  POSIX and PowerShell examples.
- **Portable first-payment reference app** (`examples/first-payment/`, DX
  overhaul Task 7) — a dependency-light teaching app that runs the FULL
  payment lifecycle in two modes with identical verification/reconciliation
  code: `demo` (default, zero credentials — a local simulator speaks the
  sandbox wire shapes and delivers real HMAC-signed pushbacks to the app's
  own callback endpoint) and `sandbox` (the real `PayWay` client; loopback
  callbacks require the explicit `ALLOW_PRIVATE_CALLBACK_HOSTS=1` opt-in).
  Teaches and tests: server-side pricing (no client-supplied amounts),
  per-attempt unique transaction IDs, verified-callback + poll
  reconciliation, fulfill-once idempotency across callback replay,
  amount/currency-mismatch refusal, unverified-notification rejection,
  paid-order 409 on new attempts, late-payment-after-close routed to an
  explicit merchant `needs_resolution` decision (never auto-refunded),
  missed-callback discovery via status reads, and quantitative partial
  refunds. Consumes the SDK as a packed tarball (`npm run setup` — no
  junctions, no repo-relative imports); lifecycle acceptance tests live in
  the repository suite (`src/__tests__/first-payment-examples.test.ts`,
  10/10 green through the real HTTP surface). `check-package-contents.mjs`
  now also forbids `examples/` and `payway-boilerplate/` paths in the npm
  tarball as defense in depth.

- **Versioned payment-command output** — `generate-qr` and `generate-checkout`
  accept `--output json` for one final result or `--output ndjson` for creation,
  polling, and final records. Results include non-secret context, explicit
  creation/payment/wait states, artifact paths, and a safe reconciliation step.
- **Checkout QR artifact parity** — `generate-checkout` normalizes camelCase and
  snake_case QR fields and can render the payload to a PNG with the same
  non-interactive image controls as `generate-qr`.
- **Hosted form controls** — `checkout-form` now forwards `--payment-gate`,
  `--skip-success-page`, and `--continue-success-url` into the signed form.
- **Curated distribution boundary** — the package now includes `LICENSE`,
  `QUICKSTART.md`, and this changelog; automated checks validate packaged files,
  embedded text, Markdown links, generated docs, and a clean tarball install.
- **`checkout.purchaseHosted()` — typed hosted-checkout purchase** — sets
  `paymentGate: 0` for you and returns a structured `PurchaseHostedHtmlResult`
  (`{ hosted_checkout: true, content_type, html }`): the gateway answers a
  gate-0 purchase with the full hosted "PayWay - Checkout" HTML page as the
  response body; there is NO `checkout_qr_url` JSON field on today's gateway
  (sandbox-verified 2026-09-05 for `cards` AND `abapay_khqr`, with/without
  `viewType`). The transaction is created and PENDING the moment the call
  resolves — confirm via `checkTransaction()`/`pollTransactionStatus()`; the
  browser outcome arrives through `returnUrl`/`returnParams`. Throws
  `PayWayAPIError` (with `rawBody`) if the gateway unexpectedly answers JSON.
- **`generate-checkout --json` error envelopes (T5.4)** — gateway rejections
  (04/35/104) and local validation failures (amount/currency pre-flight,
  SDK `PayWayConfigError`s like lifetime < 3 or the subscription trio) now
  emit the same `{ error: { kind, exitCode, type, message, paywayCode, … } }`
  envelope as `check-transaction`/`transaction-detail` (campaign H6/T5.4).
- **CLI `tx-batch` command** — run one transaction operation (`close` | `check` | `detail`)
  over a set of IDs (`-t` repeatable and/or `--ids-file`). Per-item result envelopes
  (`{id, ok, code, status, error}`) with no fail-fast; endpoint-appropriate rate-limit
  pacing (detail 6100 ms under the 10/min gateway cap, close 250 ms, check 0);
  `--dry-run` target preview; batch `close` requires `-y/--force` when non-interactive;
  `--report <path>` markdown evidence output; exit codes 0 all-ok / 1 partial / 2 all-failed.
  Packaged skill `aba-payway-bulk-operations` (skills now 30) documents the workflow.

### Fixed

- **Combined DX/journal integration** — structured payment output stays parseable with journal warnings and never prompts for QR lifetime; a failed PNG write preserves an accepted creation and directs callers to reconcile the existing transaction. Doctor retention warnings remain advisory. The standalone example and clean-checkout lifecycle tests now use consistent TypeScript resolution.

- **Ambiguous facade creates are not replayed by default** —
  `server.initiateTransaction()` uses a no-retry purchase policy unless the
  caller explicitly selects `retryPolicy: 'transient'`. Its `expiresAt` field is
  documented as a merchant-side scheduling deadline, not proof that a QR is
  still payable.
- **Portable release tooling** — `npm run clean` is repository-scoped and works
  on Windows and POSIX systems. Public builds omit source maps that embedded
  source and internal evidence comments; TypeDoc no longer copies Markdown into
  `docs/api/media`.

- **Gate-0 hosted-page success no longer misclassified as an error (W2-2)** —
  `checkout.purchase()` with `paymentGate: 0` used to throw
  `PayWayAPIError: Invalid JSON response` even though the transaction WAS
  created (verified PENDING). An HTTP-200 HTML body on the purchase endpoint
  now resolves to `PurchaseHostedHtmlResult` (the link-card HTML guard and
  every other endpoint are unchanged).
- **Payout entry shape validated on the purchase path (W1-5)** —
  `payout: [{account, amount}]` (the QR-domain keys) used to sail through
  local validation and fail only at the gateway with HTTP 403 code 35
  "Payout Info is invalid." `checkout` purchase and `credentialsOnFile.payment()`
  now run the shared `validatePayoutEntryShape` (`{acc, amt}`) locally —
  malformed/wrong-key entries throw `PayWayConfigError` before any network
  call. Pre-encoded strings pass through (payment-link parity).
- **CLI `transaction-list` default window uses the gateway clock (UTC+7)** —
  the previous default computed "today" on the merchant's LOCAL clock; on
  non-UTC+7 hosts that window silently misses rows (§18). New shared
  `gatewayDayWindow()` helper. Retest note: a date-less
  `getTransactionList({})` DOES return the current gateway day (campaign
  W2-12's "SDK no-dates → 0 rows" did not reproduce — it was list-indexing
  lag), so the SDK keeps its no-dates behavior (documented on the method).
- **Purchase lifetime maximum (43200 min) warning reworded as advisory-only
  (W1-1)** — the sandbox gateway accepted `lifetime: 43201` with code 00; only
  the 3-minute minimum is a hard local throw (gateway error 69 below it). The
  warning now says exactly that instead of implying enforcement.
- **Subscription purchases rejected with `Wrong Hash` (code 1)** — `ctid` now
  hashes after `items` in `PURCHASE_HASH_FIELDS` (live 27-field order,
  sandbox-verified with controlled subscription probes). One shared order: for plain
  purchases `ctid` is absent from the body, hashes as `''`, and the HMAC is
  byte-identical to the previous 26-field order (pinned). The gateway's
  wrong-hash hint prints the DOC list, not the enforcement list — do not trust
  it as authoritative.
- **`104` hint extended** — on the purchase path `104` "Merchant not enabled
  token flag" means the merchant profile is not subscription-enabled (the
  sandbox profile `ec476910` is not, live 2026-09-05); not an integration bug.
- **OpenAPI** — `purchase`/`purchase#subscription` `x-hmac-fields` now carry
  `ctid` after `items`, with the gateway-vs-docs divergence documented
  (annotation-only change; `src/types.ts` unaffected).
- **Skills** — `aba-payway-subscription` v1.1.0: 27-field hash order, profile
  gate section, CLI example gains `--payment-option` (the default
  `abapay_khqr_deeplink` is outside the documented subscription set);
  `aba-payway-hash` v1.3.0 + `aba-payway-first-payment` v1.3.0 bundled scripts
  realigned to the 27-field order. New re-runnable probe script
  `scripts/sandbox-probe-subscription.ts`.
- **Skills (paid-lifecycle learnings, §18)** — `aba-payway-transaction-list`
  v1.3.0: gateway `transaction_date` is UTC+7 (UTC-derived windows silently
  return 0 rows; default = full gateway day), unpaid checkout-path txns ARE
  visible (§14 gap is unpaid-QR-only), list shows coarse REFUNDED after a
  partial refund. `aba-payway-refund` v1.3.0: coarse-status rule marked
  live-confirmed with the $0.50/$0.10 example. `aba-payway-qr` v1.5.0: always
  pass `-y` as an agent (interactive lifetime prompt can block without it) +
  one-shot flag recipe + simulator latency notes.
- **Skills (close-enforcement nuance, §19)** — `aba-payway-transaction-close`
  v1.4.0: closure enforcement is PATH-DEPENDENT — on the QR/KHQR path a closed
  QR is refused by the simulator ("transaction expired", live 2026-09-05)
  while the API keeps reporting PENDING; the 2026-08-25 "closed-unpaid still
  pays" evidence is scoped to the checkout/card path. The public skill was
  rescoped accordingly.
- **`--json` error envelopes** (skills-audit T3.5) — `check-transaction --json`
  and `transaction-detail --json` now print a machine-parseable
  `{ "error": { kind, exitCode, type, message, paywayCode, httpStatus,
  retryable, hint? } }` envelope on failure instead of the human ✗ block (exit
  codes unchanged). Shared `printApiErrorJson()` helper — other `--json`
  commands adopt it incrementally. Bundled scripts also got a written
  exit-code contract (0 ok · 1 runtime/API · 2 usage/env) in
  `skills/README.md`.

> Skills-corpus batch (S2) of the five-layer sync audit
> (`audit-results/sync-audit-2026-09-01.md` §3/§6 S2). Skills-layer only — no
> SDK/CLI code paths change; the only test-visible changes are the skill-script
> hash-order pins and the 25→29 skills discovery flip.

### Fixed (skills — stale/broken content)

- **`aba-payway-agent` broken imports** — both documented imports (`aba-payway-ts/agent`, `aba-payway-ts/cli/explain-code.js`) point at package subpaths that do not exist in `exports` (only `"."`). Replaced with the supported surfaces: `payway-sdk agent setup` CLI for the provider config and `payway-sdk explain` for code lookups. → v1.2.0
- **`aba-payway-purchase` lifetime unit bug** — `lifetime: 600, // seconds` on the checkout path would silently buy a 10-hour window (purchase lifetime is MINUTES, min 3); now documented with a warning callout contrasting the QR domain's seconds. Tools section rewritten: the three referenced repo-root `scripts/*.ts` probes are not shipped in the npm package — replaced with the CLI equivalents. → v1.4.0
- **`aba-payway-hash` bundled `sign-request.cjs` signed the legacy 24-field order** — subscription payloads (`token_flag` + `frequency`) signed by the tool produced gateway "Wrong Hash". The `checkout` preset now carries the live 26-field order (appended positions; plain purchases byte-identical — pinned by test), with new `--ctid --token-flag --frequency` flags and `ctid` emitted in the body without a hash position. → v1.2.0
- **`aba-payway-first-payment`** — same 24-field bug in bundled `checkout-payload.cjs` (fixed identically, plus a `--lifetime <minutes>` min-3 guard and subscription trio validation mirroring the SDK) + `--lifetime <sec>` doc bug; route matrix gained the missing Subscription row; per-route inputs now list the 9 QR optional params (with the `{account, amount}` key warning), the full B6 checkout flag set, and payment-link `payout`/`image`. → v1.2.0
- **`aba-payway-qr`** — zero mention of the 9 `generate-qr` optional params; added a Quick-Start section (SDK + CLI flags + advisory caps) and replaced the non-shipped `online-qr-poll.ts` tool reference with the CLI flow. → v1.4.0
- **`aba-payway-sdk-configuration`** — inverted TD-03 claim ("required to call token operations… unconfirmed") corrected: the trio is UN-GATED since 2026-08-31 (`allowUnverifiedTokenOperations` is a deprecated escape hatch, default allowed); added `strictValidation`/`PAYWAY_STRICT_VALIDATION`, `allowPrivateCallbackHosts`, and the six `PAYWAY_KHQR_*` env vars. → v1.2.0
- **`aba-payway-transaction-list`** — added the ≤3-day-window and pagination ≤1000 local pre-validation facts (CLI exits 1 before any network call) and the unpaid-QR-invisibility gap. → v1.2.0
- **`aba-payway-check-transaction` / `aba-payway-transaction-close`** — non-shipped repo-script references (`online-qr-poll.ts`, `checkout-link-poll.ts`, `close-transaction-verify.ts`) replaced with the equivalent CLI commands. → v1.3.0 each

### Added (skills — capability gaps)

- **Four new skills** (audit §3 "Missing skills"): `aba-payway-cof` (link/charge + both card-linking routes + §16 hash orders + error families), `aba-payway-token-lifecycle` (trio param-shape table, 90-day expiry helpers), `aba-payway-beneficiary` (whitelist + per-endpoint payout key-shape table + seeded sandbox fixtures), `aba-payway-subscription` (purchase-path trio rules, 26-field hash, MIT follow-up charges). All cross-linked with the five previously-fixed COF skills. → v1.0.0 each
- **`skills/README.md` rewritten** — all 29 skills listed in six sections; install line fixed (`npx payway-sdk` resolves to an unrelated third-party package — use the repo-relative `npx tsx src/cli.ts skills add <agent>`); documents the opencode `~/.opencode/skills` vs `~/.config/opencode/skills` loader mismatch and which five skills bundle `.cjs` tools.

### Tests

- `skills.test.ts`: discovery pin 25 → 29 (+ the four new skill names). `skill-scripts.test.ts`: the two bundled signing tools are now pinned to the live 26-field order (plain-purchase append-compatibility + subscription concatenation + `ctid`-unhashed + trio validation + lifetime-minutes guard). Full suite: 1280 passed / 13 skipped.

## 1.5.0 — 2026-09-02

> SDK/CLI param-completion batch (S1) of the five-layer sync audit
> (`audit-results/sync-audit-2026-09-01.md` §2 D2/D7/D8 + §6 S1) — closes the
> last parameter gaps in the 24-operation coverage matrix
> (`audit-results/live-api-coverage-2026-08-31.md`). Additive; no breaking changes.

### Added

- **`paymentLink.create({ payout })` — split-payout beneficiaries on payment links (audit D2).** The spec's optional `payout` field travels INSIDE the RSA-encrypted `merchant_auth` with `[{acc, amt}]` keys (the purchase-path shape — NOT the standalone payout domain's `{account, amount}`). Arrays are JSON-encoded once into the auth plaintext (a raw pre-encoded string passes through unchanged); the documented total-payout-equals-link-amount rule is enforced as an advisory warning that throws under `strictValidation`. New CLI flag `payment-link create --payout <json>` (JSON-or-string via `parseJsonOrString`) with local validation: wrong entry shape or a total ≠ `--amount` exits 1 before any network call. Pins: `payment-link-payout` (new suite), `cli-inprocess`.
- **`generate-checkout` completes the purchase flag surface (audit D7).** New flags: `--payout` (JSON `[{acc, amt}]` or string), `--additional-params` (JSON object or string), `--google-pay-token`, `--return-deeplink` (JSON `{ios_scheme, android_scheme}` or string) — all four were already `CreateTransactionParams` members and hash positions in the live 26-field order; the CLI now forwards them. The deliberate `--payment-gate` omission is documented in the command description (browser-form POST with `payment_gate=0` answers HTML, not JSON — the SDK-only `purchase({ paymentGate: 0 })` JSON path remains the supported route).
- **`cof link-account --return-deeplink` (audit D7).** `LinkAccountParams.returnDeeplink` existed and holds a §16 hash position; the CLI flag now forwards it (JSON-or-string, base64-encoded by the SDK before hashing).
- **`listSandboxBeneficiaries()` / `validateSandboxBeneficiary()` exported from the package barrel** (audit S2.1 fold-in). Both helpers existed internally (used by pre-auth/payout validation and the `sandbox-beneficiaries` CLI) but were not exported, so the `aba-payway-sandbox-beneficiaries` skill's documented import failed at runtime. Also exports their types (`SandboxBeneficiary`, `SandboxCurrency`, `BeneficiaryKind`, `ValidateSandboxBeneficiaryOptions`). Runtime export count 54 → 57 (release-checklist smoke updated).

### Fixed

- **OpenAPI ground truth re-synced to the §16 verdicts (audit D8).** `payway-openapi/paths/credentials-on-file.yaml` still carried §9a-era `x-hmac-fields` for link-account/link-card/CoF-payment (superseded orders the gateway now rejects with `01 Wrong Hash`) and marked the token trio "not yet sandbox-verified" (it IS verified — §16, 2026-08-31). All six operations now document the sandbox-verified live orders. `components/schemas/credentials-on-file.yaml`: `CofPaymentRequest` no longer lists `request_id` as required (the wire body doesn't send it); `LinkCardRequest` drops `return_deeplink`/`return_url` (not part of the live-documented request) and documents `amount` as the hash-position-only quirk. `src/types.ts` regenerated from the corrected spec via `npm run bundle && npm run generate-types` (`CofPaymentRequest.request_id` removed; link-card `return_deeplink`/`return_url` removed).

### Docs & skills (same-change surface sync)

- README: CLI table rows for the new `generate-checkout`/`payment-link create`/`cof link-account` flags, a payment-link payout snippet (with the `{acc, amt}` key-shape warning), and `returnDeeplink` in the `linkAccount` example.
- AGENTS.md: payment-link `--payout` canonical example, per-endpoint payout key-split rule, `--payment-gate` omission note, expanded JSON-or-string flag list.
- docs/09: `--return-deeplink` in the `cof link-account` CLI quick reference. docs/QUICK-START: `generate-checkout` row names the new flags.
- Skills: `aba-payway-payment-link` → v1.2.0 (payout section + CLI example), `aba-payway-link-account` → v1.3.0 (`returnDeeplink` in Quick Start + CLI), `aba-payway-purchase` → v1.3.0 (full `generate-checkout` flag set + `--payment-gate` omission), `aba-payway-sandbox-beneficiaries` → v1.2.0 (imports now resolve).

## 1.4.0 — 2026-09-02

> Link-card hosted-page feature release (from Unreleased) + the code-correctness
> batch (D1, D3, D4, D5, D6) of the five-layer sync audit
> (`audit-results/sync-audit-2026-09-01.md` §2/§6 S0).

### Added

- **`credentialsOnFile.getLinkCardFormHtml()` — browser-form card linking (no server roundtrip).** `link-card` requires `application/x-www-form-urlencoded` and always answers with the gateway's hosted card-entry page (sandbox-verified 2026-08-31). The new method builds the full signed HTML document locally — hidden fields plus the verified 10-position HMAC, byte-identical to the wire body `linkCard()` sends — so a plain `<form method="POST">` submit navigates the customer straight to the hosted Visa/Mastercard/JCB/UPI form, mirroring `checkout.getCheckoutFormHtml()`. Options: `{ formId?, autoSubmit?, submitLabel?, omitSubmitButton? }` (deliberately no `popupMode` — the AbaPayway popup plugin is documented for the purchase endpoint only). Validation rules and advisory warnings are shared with `linkCard()`. The `pwt` token still arrives only via `callbackUrl`. Exported type: `LinkCardFormOptions`.
- **CLI `cof link-card-form`** — local-only render of that signed form (no API call, no RSA key needed): HTML to stdout or `--out <path>` (diagnostics to stderr so redirects stay clean), `--auto-submit`, auto-generated `--request-id` when omitted, `--open-page`/`--no-open-page` TTY auto-open like the QR image, and a warning when `--callback-url` is omitted (the token can only arrive via the callback).
- **CLI `cof link-card` hosted-page capture.** The command now treats the endpoint's guaranteed HTML answer as the success artifact it is: the page is saved to `payway-output/link-card-<request-id>.html` (auto-opened on interactive terminals via the platform-allowlisted viewer handoff; `--open-page` forces, `--no-open-page` suppresses) and the run exits 0. `--json` prints a `{ hostedHtmlPath, requestId, ctid, note }` envelope. Previously the structured B5 `PayWayBusinessError` surfaced as a plain CLI failure and the page was truncated to a 120-char prefix in the message.

### Changed

- The HTML-attribute escaper used by the form builders moved from a private helper in `domains/checkout.ts` to shared `escapeHtmlAttribute()` in `utils.ts` (one implementation for a security-sensitive transform; checkout output is byte-identical).
- `createCredentialsOnFileDomain()` accepts an optional trailing `resolvedBaseUrl` (wired by the client with its resolved base URL) used only by `getLinkCardFormHtml()` for the form action; domain-level callers that omit it get the sandbox default.

### Fixed

- **Subscription purchases sent a hash that omitted `token_flag` + `frequency` (audit D1, HIGH).** `buildPurchasePayload()` computed the live 26-field HMAC, but `purchase()` passed a legacy 24-field list to the client, whose `request()` unconditionally overwrites the hash — so every subscription checkout (`tokenFlag`/`frequency` set, including CLI `generate-checkout --ctid --token-flag CITR_FIX --frequency …`) was gateway-rejected with "Wrong Hash". Both paths now share one exported `PURCHASE_HASH_FIELDS` constant, so the locally-built and sent hashes can never diverge. Plain purchases are byte-identical under the old and new list (omitted fields hash as `''` — append-compatibility pinned by test, including over the network path via the mock gateway).
- **`HASH_ORDER_HINTS` (the wrong-hash debugging hints inside `PayWaySignatureError`) were wrong themselves (audit D3).** `purchase` was a garbled legacy order with spaces, `linkAccount` carried link-card's order, `getTransactionList` carried the check/detail trio, `refund` omitted `merchant_id`, and `payment` was placeholder prose. All 22 hash-bearing endpoints now carry pure dot-joined orders derived from §16-verified/live-documented compositions — purchase, linkCard, and generateQr derive from the exported domain constants; refund/payment-link/beneficiary hints derive from the hoisted `MERCHANT_AUTH_DEFAULT_HASH_FIELDS` default. A new drift-guard suite (`hash-order-hints.test.ts`) pins every hint against the field list its domain actually signs (exported constants directly, inline lists via request spies) and snapshots the key set, so hints cannot drift from the signed orders again.
- **`cof charge --payout` help text documented `{account, amount}` keys (audit D4)** but the request sends `{acc, amt}` per the live docs — help now shows `{acc, amt}`. Per-endpoint split preserved: `generate-qr --payout` genuinely uses `{account, amount}` (its help stays), and `pre-auth complete-payout` already documented `{acc, amt}`.
- **link-card `frequency` validated as an advisory (audit D5).** The live docs mark `frequency` "Required for Link Card" (1W|1M|2M); omitting it now warns once via `warnAdvisory` (both `linkCard()` and `getLinkCardFormHtml()` share the builder) and throws `PayWayConfigError` under `strictValidation`.
- **payment-link image limits enforced client-side (audit D6).** The spec caps the image part at 3MB, JPG/JPEG/PNG only: the domain warns (strict → throw) on larger uploads and on content types outside `image/jpeg|image/jpg|image/png`; the CLI loader now rejects non-JPG/JPEG/PNG files outright (`--image` help updated; webp/gif no longer accepted).

## 1.3.6 — 2026-08-31

> Live API parity release (B1–B6): the SDK's request shapes, hash orders, error
> families, and CLI surface were realigned to the live PayWay developer docs
> (developer.payway.com.kh) and controlled sandbox probes dated 2026-08-31.
> **This release contains breaking changes** — see below.

### Breaking changes

- **`linkAccount()` / `linkCard()` required fields** — `ctid` and `tokenFlag` are now **required** (plus `currency` on `linkAccount`) per the live docs; the SDK enforces them for JS callers, not just at the gateway. Live-documented linking flags: `CITI_FLEX | CITO_FLEX` (other previously accepted values now warn).
- **Token-trio param split** — the shared `TokenParams` shape was wrong. `getTokenDetails()` now takes `{ requestId }` **only** (no `ctid`/`pwt`); `removeToken()` now takes `{ ctid, paymentToken }` (no `requestId`); `renewToken()` keeps `{ requestId, ctid, paymentToken }`. `TokenParams` is deprecated (alias of `RenewTokenParams`).
- **CoF hash orders realigned (sandbox-verified 2026-08-31)** — the gateway tightened CoF hash validation: every earlier SDK order now returns `01 Wrong Hash`, while the live-documented orders pass the hash layer. `link-account`, `link-card`, `cofPayment`, and the token trio all sign with the live orders now.
- **`cofPayment()` no longer sends `request_id`** — the param is deprecated and dropped from the request (verified live: the binding layer no longer requires it).
- **`linkCard()` no longer sends `returnUrl` / `returnDeeplink`** — both are absent from the live-documented request; the hosted form's done-target is `continueSuccessUrl` (newly supported, hashed last). The params remain accepted-but-ignored (`@deprecated`).
- **Token trio UN-GATED** — `allowUnverifiedTokenOperations` now defaults to **allowed** (TD-03/Q6 resolved by probe evidence: every live-documented composition is hash-accepted). Explicit `false` re-blocks as an escape hatch (deprecated).
- **`khqr.getTransactionsByMerchantRef()` merchantRef errors are `PayWayConfigError`** (previously plain `Error`); empty/whitespace refs throw, >20 chars warn (gateway cap).
- **`checkout.purchase()` throws when `paymentOption: 'google_pay'` without `googlePayToken`** — the token is required when the merchant manages selection for google_pay (live docs).
- **Minimum Node.js version raised to 20** — `engines.node` is now `>=20.0.0` (was `>=18.0.0`). Node 18 reached end-of-life on 2025-04-30 and the test toolchain (vitest 4) no longer supports it; the CI matrix validates Node 20 and 22.

### Added

- **Full `generateQr()` parameter parity** — 9 new live-documented optional params: `items`, `firstName`, `lastName`, `email`, `phone`, `returnDeeplink`, `customFields`, `returnParams`, `payout`; `purchaseType` widened to accept `'pre-auth'`. The hash list extends to the live 19-field order — omitted optionals hash as `''`, which is concat-identical to the old 10-field subset (pinned by test).
- **CoF payment parity** — `cofPayment()` accepts `firstName`, `lastName`, `email`, `phone`, `purchaseType`, `items`, `returnParams`, `payout`, `customFields`, `shippingFee` (body + appended hash positions; append-compat pinned).
- **Subscription initiation on the purchase path** — `checkout.purchase()` accepts `ctid` + `tokenFlag: 'CITR_FIX'` + `frequency` per the live subscription operation: `frequency` required iff `CITR_FIX`, `ctid` required with `tokenFlag`, other flags rejected (use the CoF link endpoints); hash positions appended after `skip_success_page` matching the live order.
- **Advisory validation framework (`strictValidation`)** — advisory limits (length caps, enums, min amounts, list windows) warn once per distinct message via `warnAdvisory()` and escalate to `PayWayConfigError` under `strictValidation: true` (config flag or `PAYWAY_STRICT_VALIDATION=1`). Gateway-REQUIRED rules always throw regardless of the flag. QR advisory rules: name/email/phone caps, `items ≤ 10`, wechat/alipay USD-only.
- **COF/QR error families** — `status.code "04"` + `errors{}` maps (200- or 400-wrapped) now parse into `PayWayBusinessError.fieldErrors` (also in `toJSON()`); codes `1`/`01`/`PTL02` throw the new **`PayWaySignatureError`** with an endpoint hash-order hint; observed codes `98` (merchant profile), `104`/`105`/`09` (token states) append targeted hints. `payway-sdk explain` gains `cof` and `qr` code families (04, 98, 104, 105, 09, PTL02, 01; QR string codes 6, 16–19, 21, 23, 32, 35, 44, 47, 48, 96, 102, 403, 429).
- **`link-card` HTML-response guard** — the endpoint always answers HTML (success and error); the SDK now surfaces a structured `PayWayBusinessError` ("link-card responded with an HTML page… check callback_url") instead of a JSON-parse failure.
- **Throttle rule for `get-transactions-by-mc-ref`** — 10 req/60s added to the client's token-bucket defaults.
- **CLI `cof` command group** — `cof link-account`, `cof link-card`, `cof charge`, `cof token renew|details|remove` mirroring the new param shapes (details takes only `--request-id`; remove takes `--ctid --token`).
- **CLI `beneficiary` command group** — `beneficiary add <payee>` / `beneficiary update-status <payee> --status 0|1` (RSA-encrypted; asserts the RSA key is present).
- **CLI `generate-qr` / `generate-checkout` B6 flags** — `generate-qr` gains `--first-name --last-name --email --phone --items --return-deeplink --custom-fields --return-params --payout`; `generate-checkout` gains `--ctid --token-flag --frequency --type --firstname/--lastname/--email/--phone --items --shipping --lifetime --custom-fields --return-params --skip-success-page --view-type --continue-success-url`. JSON-or-string flags (`--items`, `--custom-fields`, `--payout`, `--return-deeplink`) accept inline JSON or raw strings via `parseJsonOrString`.
- **CLI `transaction-list` local pre-validation** — windows wider than 3 days and `--pagination` above 1000 are rejected client-side with a hint (exit 1, no network call), mirroring the gateway's HTTP 403 behavior.
- **Per-call request options (`RequestCallOptions`)** — every API domain method now accepts an optional trailing `callOptions` argument: `{ timeoutMs?, signal? }`. `timeoutMs` overrides the client-wide request timeout for that single call; `signal` (an `AbortSignal`) cancels the in-flight fetch and is never retried. Threading covers checkout (purchase, checkTransaction, closeTransaction, getTransactionDetail, getTransactionList, refund, getExchangeRate), qr.generateQr, pre-auth (complete, completeWithPayout, cancel), payout (payout, updateBeneficiaryStatus, addBeneficiary), payment-link (create, getDetails), credentials-on-file (all six), and khqr.getTransactionsByMerchantRef. Additive and backward compatible.
- **`verifyCallbackDetailed(body, signature, options?)`** — diagnostic webhook-verification variant returning `{ valid, reason }` with reasons `malformed_signature` / `empty_body` / `signature_mismatch` so integrators can self-diagnose failed callbacks. Canonicalization and timing-safe comparison are unchanged (`verifyCallbackSignature` now delegates to it; boolean behavior identical). Available as a standalone export and as `payway.verifyCallbackDetailed()` on the client.
- **`paymentLink.create({ image })` — multipart image upload** — the optional image part of `payment-link/create` is now supported: `image: { data, filename?, contentType? }` (defaults `image.jpg` / `image/jpeg`; bytes must be non-empty `Uint8Array`/`Buffer`). `requestWithMerchantAuth` gained a `multipartFile` option that sends the four signed string fields plus the binary part as `FormData` **without a manual `Content-Type`** (the runtime generates the boundary); the HMAC composition is unchanged — image bytes are never hashed. Sandbox-verified live (2026-08-31): HTTP 200 `code=00`; the gateway hosts the stored file on its CDN under a renamed `payment_link_image_<epoch-ms>.<ext>` and reports `size: 0` regardless. `onRequest`/debug logging keep their string signatures via a multipart summary (part names only, never bytes). New CLI flag `payment-link create --image <path>` (extension-based content-type inference; clean exit 1 on missing/empty files). The probe now uses the CLI's shared dotenv parser so multi-line quoted PEM values are preserved. Pins: `payment-link-image`, `cli-inprocess`.
- **`checkout.getCheckoutFormHtml()` — hosted-checkout form builder** — renders the complete signed checkout form as a standalone HTML document (local, synchronous, no network call). Hidden fields and the 24-field HMAC are byte-identical to `createTransaction()`; the action URL follows the configured environment/`baseUrl`. Options: `autoSubmit` (same-tab submit on page load; mutually exclusive with `popupMode`, enforced as `PayWayConfigError`) and `popupMode` (official AbaPayway popup plugin: `target="aba_webservice"` + `checkout2-0.js` + `AbaPayway.checkout()` wiring), plus `formId`, `submitLabel`, `omitSubmitButton`. All merchant-provided values are HTML-escaped. New CLI command `payway-sdk checkout-form` writes the same document to stdout (redirect-safe; diagnostics on stderr) or `--out <path>` — local signing only, no RSA key needed. Pins: `checkout-form-html`, `cli-inprocess`, `public-api`, `cli-help`.
- **CI pipeline hardening** — the existing GitHub Actions workflow now builds `dist/` before the unit suite (the child-process suites `cli.test.ts` / `agent-cli.test.ts` spawn `dist/cli.js`, which does not exist on a fresh checkout), runs a coverage job on Node 22 that enforces floor thresholds from `vitest.config.ts` (74% stmts / 69% branch / 80% funcs / 74% lines — ratchet upward as testability work lands), uploads the coverage artifact, and deduplicates concurrent runs per ref. CI badge added to the README.
- **`runCli(argv)` exported from the CLI entry** — `src/cli.ts` now guards its self-parse behind a main-module check and exposes `runCli`, so tests and embedders can drive commands in-process (verified against the documented `npx tsx src/cli.ts` workflow, `dist/cli.js`, and the child-process `cli.test.ts` suite).
- **Interactive TUI layer for the CLI** — activates only on a real TTY (stdin+stdout): bare `payway-sdk` prints a compact banner with grouped command help (Setup / Payments / Transactions / Money-out / Reference / Agent & skills); `generate-qr` with missing inputs runs a guided wizard (currency → amount → QR template → payment option → lifetime → callback URL → summary → confirm; explicit flags are never re-asked; offline mode probes `--ref` and an optional static amount); `generate-checkout` gains a pre-submit confirm; QR/checkout polling shows a live `Poll #N · PENDING · m:ss elapsed / m:ss left` spinner with a terminal ✓/✗ line; an APPROVED payment offers a next-step picker (fetch transaction detail / keep watching / show refund command / done); one-shot submits (refund, close-transaction, pre-auth complete/complete-payout/cancel) show spinners; and unknown commands/flags get Levenshtein "Did you mean …?" hints (unknown `--template` warns, unknown `--payment-option` errors with a suggestion). Piped stdin, `--json`, `-y`/`--force`/`--non-interactive`, CI, and `PAYWAY_UI=classic` keep byte-identical legacy behavior; a global `--no-color` flag (accepted before the subcommand, like `--profile`) and `NO_COLOR` disable ANSI; Ctrl-C during a prompt exits 130 (exit codes 0/1/2/3 unchanged).

### Changed

- **Agent CLI/REPL testability refactor** — the pure logic behind the `ask` / `agent` command tree moved out of `src/cli/commands/agent.ts` and `src/agent/repl.ts` into dedicated modules: `agent-helpers.ts` (setup-option validation, setup/doctor/ack/session rendering, interactive confirmation helpers), `repl-helpers.ts` (REPL directive classification and `:run` dispatch validation — the shell-escape/agent-management security boundary — as pure, unit-tested functions), `progress.ts` (shared ask/REPL progress labels and banners), and `ansi.ts`. The REPL loop is now exposed as `runRepl(io)` with injected input/output streams (in-process testable); `startRepl` keeps the real terminal wiring and its public signature. Statement coverage: `agent.ts` 28% → 77%, `repl.ts` 4% → 85%, repo overall 70% → 75.8%. New suites: `agent-command-helpers`, `agent-repl-helpers`, `agent-cli-inprocess` (988 tests total). No behavior change; the `agent-cli` subprocess suite was re-verified against a fresh `dist` build.
- **Statement coverage raised 55% → 70%** (lines 70.9%, functions 79.8%) via a coverage campaign on previously untested modules: public API barrel surface, structured logger, webhook storage factory + JSON storage lifecycle, agent result rendering, credential-profile CRUD, the SDK facade (`sdk.test` / `initiate` / `runTestSuiteAndPrint`), the Cloudflare tunnel manager (fake-binary URL parsing + ENOENT path), and in-process CLI command bodies (status / explain / validate / config / doctor / profiles / skills / demo, plus every API command against a local mock gateway). New suites: `public-api`, `logger`, `webhook-storage-factory`, `webhook-server-stop`, `agent-output`, `first-payment`, `profiles-crud`, `sdk-facade-and-tunnel`, `cli-inprocess`, `cli-mock-commands`.
- **Minimum Node.js version raised to 20** — `engines.node` is now `>=20.0.0` (was `>=18.0.0`); the CI matrix validates Node 20 and 22. **Breaking for Node 18 consumers** — see the breaking-changes list above.

### Fixed

- **`doctor` framework row is advisory when no framework exists** — an SDK/CLI repo has no web framework by design, so "Framework detected: unknown" no longer renders as a red failure; the row reports an advisory with the optional install hint (DX review first-15-minutes noise).
- **`skills doctor` crashed with a raw ENOENT stack** when the executable's sibling `skills/` directory was missing (e.g. source checkouts); a missing directory now reports as "no packaged skills" instead.
- **Agent human output spacing** — failed actions rendered as `tool(E1: msg)`; now `tool (E1: msg)`.
- **Interactive lifetime override now enforces the 180s gateway minimum before submit** — a lifetime below 180s entered in the wizard re-asks with an explanation of gateway code `"04"` (179s → HTTP 400), matching the `--lifetime` flag validation from the edge-case audit instead of failing after submit.

## Unreleased

_Nothing yet — the 1.3.6 entry above absorbed everything that shipped with the version bump._

## 1.3.0 — 2026-08-30

> Edge-case audit campaign release: all 23 findings (EC-01–EC-23) from
> `audit-results/edge-case-report.md` remediated. Sandbox verification:
> QR lifetime boundary pinned live (179s → 400 `"04"`, 180s → OK; `scripts`-backed evidence in
> controlled edge-case probes, plus `npm run probe` re-run at release time.

### Added

- **CLI startup guidance & probe generalization** — `evidence/startup-probe.ts` now accepts an arbitrary command; measured compiled artifact startup: `node dist/cli.js --help` P50 **413 ms** / P95 415 ms (under the 500 ms plan threshold; the previously reported 2041 ms was the `npx tsx` dev path only). Global-install pattern (`npm i -g .` → `payway-sdk`) documented in the CLI user guide §2.
- **`retryPolicy: 'none'` for `checkout.purchase()` (EC-10, edge-case audit)** — per-call opt-out from the SDK's automatic re-send of transient failures (network errors, 5xx, 429) for strict once-only submission; production duplicate-`tran_id` semantics are unconfirmed while sandbox overwrites. Default `'transient'` preserves existing behavior.
- **Private/loopback callback guard + `allowPrivateCallbackHosts` (EC-19)** — callback/return URLs pointing at `localhost`, loopback, or private-range addresses (127.0.0.1, 10.x, 172.16–31.x, 192.168.x, 169.254.x, CGNAT, `.local`/`.internal`) are now rejected client-side with `PayWayConfigError` — PayWay's servers can never reach them, so callbacks would silently never arrive. Opt out for on-prem gateways/tests with the new `allowPrivateCallbackHosts: true` config. Applies to QR `callbackUrl`, payment-link `returnUrl`, and credentials-on-file `returnUrl`/`callbackUrl` (the CLI `doctor` check stays strict).
- **`verifyCallback(body, signature, { stripHash: true })` (EC-22)** — the sorted-key signature verifier can now strip a `hash` field before verifying, so raw callback payloads passed through as received validate. Default `false` keeps the historical strictness (the webhook server already strips `hash` itself).
- **QR lifetime oversize warning** — QR lifetimes above the documented 120-day maximum (new exported `QR_LIFETIME_MAX_SECONDS`) emit a one-time `console.warn` instead of failing silently at the gateway; the maximum is deliberately not hard-enforced until ABA confirms production parity.

### Fixed

- **KHQR notification module restored to compilable state** — pass-2 edits left an orphan `}` in `src/webhook/khqr-notification.ts` and omitted the `extractJsonPayload` import in `src/webhook/server.ts`, breaking typecheck and 2 test suites. All gates re-run with unmasked exit codes: typecheck ✅, lint ✅, **787/787 tests ✅**, `npm audit --omit=dev` ✅.
- **Beneficiary sum validation in minor units (EC-16, edge-case audit)** — `validateBeneficiaries()` compared float sums against `Number.EPSILON`, which false-rejected legitimate payouts: `[1.1, 2.2]` vs total `3.3` drifts by 4.4e-16 > 2.2e-16. The sum is now compared in integer minor units (cents for USD, whole riels for KHR); genuinely unbalanced splits still throw. Regression-pinned in `utils.test.ts` and `edge-case-audit.test.ts`.
- **`Retry-After` parsed as seconds (EC-03)** — RFC 7231 delta-seconds were previously treated as milliseconds, so a proxy-specified `Retry-After: 60` paced retries at 60 ms instead of 60 s. New `parseRetryAfterMs()` converts seconds → ms (HTTP-date form still supported); `x-rate-limit-*` limit/remaining/reset headers keep their raw numeric parsing.
- **QR lifetime minimum enforced locally (EC-17/EC-18)** — the generate-qr API takes whole minutes and rejects sub-3-minute lifetimes with an opaque HTTP 400 code `"04"` (sandbox-pinned boundary 2026-08-30: 179s → 400, 180s → OK). `generateQr()` now throws `PayWayConfigError` for 1–179s via new `validateQrLifetimeSeconds()` (exported `QR_LIFETIME_MIN_SECONDS = 180`), so the seconds→minutes floor can never send `0`; the CLI `--lifetime` flag validates with a clear message (exit 1, no network call). The shared `validateLifetime()` stays unit-agnostic because `checkout.purchase` forwards its `lifetime` in minutes (unit + spec minimum now documented on the param; below-minimum gateway code `69` added to `GATEWAY_CODE_HINTS` and the docs/12 table).
- **5xx with non-JSON bodies now retried (EC-02, edge-case audit)** — the body-shape check ran before the HTTP-status check, so a CDN/load-balancer 503 HTML page surfaced as a non-retryable "Invalid JSON response" with the HTTP status lost. `_executeFetch` now evaluates `!response.ok` first: non-OK non-JSON bodies go through `createHttpError` (keeping `statusCode` and 5xx retryability); the JSON-parse error path (with its HTML hint) only applies to 2xx bodies.
- **Flat top-level `code` extracted on non-OK responses (EC-04)** — legacy error envelopes like the old `transaction-list` 403 shape `{"code": "49", "message": "Invalid Start Date"}` previously threw with `paywayCode: undefined`. `createHttpError` now falls back to the flat `code` field when no nested `status.code` exists, so code-based matching, `explain`, and `getGatewayErrorDetails` all see the gateway code.
- **Legacy numeric `status` bodies no longer pass silently (EC-01)** — `{"status": 6, "description": "tran_id not found"}` (legacy non-`-2` endpoint shape) resolved as success. `checkResponseError` now treats a numeric non-zero `status` as a business error carrying the code and the `description` as the message; `status: 0` still resolves as success.
- **200-wrapped flat code `"429"` thrown as `PayWayRateLimitError` (EC-05)** — the retry engine already paced these by `paywayCode`, but the thrown type was `PayWayBusinessError`, so callers matching on `instanceof PayWayRateLimitError` missed them. The flat-code branch now throws the typed rate-limit error.
- **`PAYWAY_ENV` URL form now honored as the base URL (EC-12)** — `validatePayWayEnv()` has long accepted `PAYWAY_ENV=https://…` but the client silently ignored it and used the sandbox host. `resolveConfig` now uses a URL-valued `PAYWAY_ENV` as the base URL (config `baseUrl` and `PAYWAY_BASE_URL` still take precedence), so the validator's promise and the client agree.
- **`timeout` ≤ 0 rejected at construction (EC-13)** — `timeout: 0` (config or `PAYWAY_TIMEOUT`) previously fired the AbortController instantly, timing out every request and burning retries. Construction now throws `PayWayConfigError: timeout must be a positive number of milliseconds`.
- **Whitespace-only credentials rejected (EC-15)** — `merchantId`/`apiKey` are now trimmed before the required check, so `'   '` throws `PayWayConfigError` instead of being hashed and sent verbatim (which produced an opaque gateway code); surrounding whitespace on valid credentials is trimmed.
- **`onResponse` fires for 200-wrapped business errors (EC-06)** — the observability hook (and debug log) previously ran only after business-error validation, so 200-wrapped failures were invisible to `onResponse` consumers. Hooks now fire before `checkResponseError`.
- **Empty 2xx bodies rejected (EC-07)** — an HTTP 200 with an empty body resolved to a silent `null` success. It now throws `PayWayAPIError "Empty response body from PayWay API (HTTP …)"`; HTTP 204 (and a literal JSON `null` body) still resolve as `null`.
- **Content-type surfaced in invalid-JSON errors (EC-08)** — `createJsonParseError` supported a `contentType` parameter that was never passed; the "Invalid JSON response…" message now includes the response's content type.
- **Gateway codes trimmed before comparison (EC-09)** — a padded success code (`"0 "`) was misreported as a business error; codes in `checkResponseError` and `createHttpError` are trimmed first.
- **`checkout.purchase` sub-minimum lifetime rejected locally** — purchase `lifetime` is in MINUTES with a spec minimum of 3 (below that the gateway answers error 69). New `validatePurchaseLifetimeMinutes()` + exported `PURCHASE_LIFETIME_MIN_MINUTES = 3` enforce it client-side, mirroring the QR-domain fix; the shared `validateLifetime()` stays unit-agnostic.
- **Short `tran_id` warns once (EC-20)** — 1–4-character transaction IDs pass validation but emit a one-time `console.warn` about the gateway's `[a-zA-Z0-9]{5,24}` identifier rule until that rule is confirmed for `tran_id`.
- **Log masking threshold raised to SHA-1 length (EC-23)** — `sanitizeForLog` masked every 32+-hex-char string, hiding benign MD5-length order refs; the heuristic now masks 40+-char hex (and key-name-based masking is unchanged).
- **Skill example conformance (TD-06 sweep)** — `aba-payway-link-account` quick-start used `requestId: 'link-123'`, which now fails fast against the `[a-zA-Z0-9]{5,24}` gateway-parity validator; example updated, remaining skills/docs examples verified conforming.

### Changed

- **Slimmer runtime dependency footprint (Pillar A A.3)** — `canvas`, `qrcode-reader`, and `@types/qrcode` moved from `dependencies` to `devDependencies`; they were only imported by an untracked dev scratch script. SDK consumers no longer install the native canvas build toolchain; runtime deps are now 4 pure-JS packages (`@clack/prompts`, `ajv`, `commander`, `qrcode`).

- **Resilience pack (TD-07)** — opt-in transport hardening: `backoffJitter: 'full'` (AWS-style full-jitter exponential backoff, thundering-herd protection) and `circuitBreaker: { failureThreshold, resetTimeoutMs }` (per-endpoint closed→open→half-open breaker that fails fast with `CircuitOpenError` while the gateway is down; business errors never trip it). Defaults unchanged for deterministic test runs.
- **Structured logging (TD-08)** — new level-aware logger (`logLevel` config or `PAYWAY_LOG_LEVEL` env) with single-line JSON output via `logFormat: 'json'`; gateway correlation ids (`status.trace`) surfaced as `[payway] trace_id=… endpoint=…`; exported `createPayWayLogger` / `resolveLogLevel`. Legacy `[payway]` text output stays byte-compatible when only `DEBUG_PAYWAY`/`debug: true` is used.
- **Token expiry helpers (TD-10)** — `computeTokenExpiry()` / `daysUntilTokenExpiry()` (+ `TOKEN_VALIDITY_DAYS = 90`) for merchant-side renewal scheduling of the credentials-on-file lifecycle.
- **Webhook verdict mode (TD-09)** — `createWebhookServer(..., { rejectInvalidSignature: true })` responds 401 to deliveries whose HMAC fails verification (still stores them for audit); unsigned deliveries remain accepted-200. Default behavior unchanged (always-200 capture sink).
- **SDK capability guard for the token trio (TD-03 partial)** — `renewToken()`/`getTokenDetails()`/`removeToken()` throw a descriptive `PayWayConfigError` unless `allowUnverifiedTokenOperations: true` is set explicitly, preventing merchants from shipping blind against the ABA-unconfirmed v3 token-management HMAC composition.
- **Gateway-parity validation & constants exported** — `REQUEST_ID_PATTERN`, `TOKEN_FLAG_LINKING`, `TOKEN_FLAG_CHARGING`, `TOKEN_VALIDITY_DAYS`, plus the new resilience/logger exports (`CircuitBreaker`, `CircuitOpenError`, `DEFAULT_CIRCUIT_BREAKER_OPTIONS`, logger types).
- **Consolidated ABA clarification list** (`audit-results/four-pillars/ABA-OPEN-QUESTIONS.md`) — nine prioritized question groups (token-trio HMAC, subscription initiation, token-lifecycle semantics, close-transaction contract incl. the five standing close findings, rate limits, callback retry policy, sandbox TLS hygiene, exposed-key rotation procedure, production `tran_id` uniqueness/visibility semantics) plus a partial-answer log.

### Changed

- **`sanitizeForLog` value-pattern hardening (TD-12)** — redacts novel sensitive keys by fuzzy name matching (contains `secret/apikey/password/credential/hash/token`, or ends with `key`; exact-match blocklist retained; `token_flag` deliberately exempt since it carries public enum values) and masks raw 32+-char hex values under unrecognized keys.
- **Unknown-env-var detection (TD-12)** — `validatePayWayEnv()` warns (`W-PAYWAY-UNKNOWN-VAR`) on any unrecognized `PAYWAY_*` variable, catching typos like `PAYWAY_APIKEY`.
- **Hermetic vitest environment** — registered setup file scrubs ambient `PAYWAY_*` variables once per test file so host machines exporting real credentials can no longer flip suite outcomes (post-audit follow-up to TD-02).

- **QR image auto-open** — `generate-qr` now opens the saved QR PNG (`payway-output/<txId>.png`) with the OS default image viewer so it is immediately scannable. Default is TTY-aware (interactive terminals only; scripts/CI/agents unaffected); force with `--open-image`, suppress with `--no-open-image`. Backed by the new exported helper `openImageInDefaultViewer()` / `defaultViewerCommandForPlatform()` (`src/open-image.ts`): per-platform allowlisted command (Windows `rundll32 url.dll,FileProtocolHandler` / macOS `open` / Linux `xdg-open`), spawned shell-less and detached, never throws — failures degrade to an "Open it manually" hint.
- **Close-transaction behavior documented** — sandbox card payments were observed completing after a code-00 close; closure was not visible in check/detail, and repeated close calls returned success. Public guidance now treats local closure and gateway payment prevention as separate states and requires late-payment reconciliation.
- **Cards-checkout lifecycle tools** — `scripts/checkout-cards-close.ts` (official checkout2-0.js modal OR hosted page; `--no-close` supported) and reusable `scripts/close-transaction-verify.ts` (`closeOrReport`/`statusOf`/`closeAndVerify`, flags `--raw/--json/--status-only/--delay`) with the post-close interpretation table.
- **End-to-end live-flow scripts** — `scripts/online-qr-poll.ts` (one online KHQR → save/open PNG → poll 10 min) and `scripts/checkout-link-poll.ts` (Create Transaction API with `paymentGate: 0` → open hosted `checkout_qr_url` → poll 10 min). Registered as tools in the QR, purchase, and check-transaction skills; sandbox-paid and verified 2026-08-25 ($31.11 APPROVED ~37s, $12.12 APPROVED ~32s).
- **Transaction-lifecycle CLI commands** — `check-transaction`, `poll-transaction` (NDJSON event stream; exit 0 terminal / 2 API error / 3 timeout), `transaction-detail`, `transaction-list` (defaults to today, aligned table), `close-transaction -y/--force`, `refund` with pre-flight refundable-balance check via transaction-detail, and `exchange-rate`. All accept `--json`.
- **Standardized CLI exit codes** — `0` success · `1` validation/input · `2` PayWay API failure · `3` network/timeout/rate-limit (`classifyError()`), applied across every command.
- **Terminal QR rendering** — `generate-qr`, `generate-checkout`, and `payment-link create` render scannable half-block QRs in interactive terminals (`--no-show-qr` to opt out).
- **`payway-sdk explain [code]`** — offline decoder for gateway/refund/pre-auth codes with fix hints; backed by new exports `PRE_AUTH_ERROR_CODES` (`PTL59/62/170`) and `GATEWAY_CODE_HINTS`, plus programmatic `explainPayWayCode()` / `explainAll()`.
- **`doctor --live`** — real sandbox round-trip (exchange-rate) after static checks; verdict gates on credential rows only so advisory failures (e.g. framework detection in non-framework repos) never block it.
- **Doctor RSA PEM shape check** — flags truncated multi-line `.env` keys with a targeted fix hint.
- **Shared multi-line `.env` parser** (`src/cli/dotenv.ts`) — quoted values spanning lines fold correctly; used by the CLI entrypoint and doctor.
- **Visual guide** (`docs/VISUAL-GUIDE.md`) — one-page ASCII tour: architecture, setup paths, onboarding journey, payment lifecycle, cheat sheet.
- **Guided onboarding** (`payway-sdk onboard`) - interactive TUI wizard (@clack/prompts) that scans the current setup and walks provider → profile → callback → privacy → verify with live connectivity checks, skip-if-already-done stages, non-TTY JSON output, and opt-in first-run automation (`PAYWAY_ONBOARD_AUTO=1`).
- **OpenCode Zen provider preset** (`opencode`, `https://opencode.ai/zen/v1`) - first-class preset with `x-preview-f-free` as the onboarding default model.
- **Sampling passthrough** on `agent setup`: `--max-tokens`, `--temperature`, `--top-p`, and `--extra-body <json>` (e.g. NVIDIA `chat_template_kwargs`) merged into every chat-completions request.
- **Strict-JSON plan repair round** - when a model's plan fails AgentPlanV1 validation, the provider re-asks once with the exact AJV errors and valid tool names before failing.
- **Transient retry in the provider adapter** - 429/5xx chat-completion responses are retried up to 3 times with backoff; auth errors fail immediately.
- **Tool catalog in the strict-JSON system prompt** - the prompt now enumerates every tool's exact name, parameters, and required fields, derived from the same definitions as native-tools mode.
- **Unified readiness matrix** (`evaluateReadinessDetailed`) - single source powering both `agent doctor` fix-hints (`→` remedy per row) and `onboard` stage routing.
- **Runtime progress visibility** - `ask`/`agent` print per-stage progress (`propose → validate → authorize → execute`) via a new orchestrator `onProgress` hook.
- **`ask --provider-timeout <ms>`** - override the inference provider request timeout so hung providers surface fast.
- **`isValidPublicKeyPem()` export** - structural PEM public-key check for pre-flight validation.
- **`aba-payway-customer-qr` skill (24th skill)** — Merchant Portal Customer Module static QRs ("Printed QR channel"): decoded payload anatomy (PayWay routing tags `62·68`, `99`), callback handling via `merchant_ref`, reconciliation guidance, plus bundled tools `decode-khqr.cjs` (TLV decode + CRC-16 validation) and `qr-manifest.cjs` (batch QR-folder audit to CSV).
- **`aba-payway-sandbox-beneficiaries` skill (25th skill)** — seeded sandbox-only beneficiary accounts (6 USD 9-digit) and test MIDs (3 KHR 15-digit) for payout / split-payout testing, with the currency-match rule and error-code cross-references. Backed by a new `src/sandbox-beneficiaries.ts` module exporting `listSandboxBeneficiaries`, `isKnownSandboxBeneficiary`, `lookupSandboxBeneficiary`, and `validateSandboxBeneficiary`.
- **`payway-sdk sandbox-beneficiaries` CLI command** — lists the seeded test accounts/MIDs (`--currency USD|KHR`, `--json`).
- **`payway-sdk payout` CLI command** — sends a payout / split-payout (`-t/-a/-c/-b "acc:amt,..."`); validates locally in sandbox and prints payout-specific error hints.
- **Payout hardening (SDK + CLI + docs)** — the payout `currency` must match the beneficiary account currency (and merchant credential currency). In sandbox, `payout.payout()` and `preAuth.completeWithPayout()` now call `validateSandboxBeneficiary(acc, currency, { sandbox })` so a KHR payout to a USD account (or any non-seeded account) throws `currency mismatch` / `not a known sandbox beneficiary` *before* the network call. New `PAYOUT_ERROR_CODES` (`PTL147`/`12` currency, `PTL146`/`PTL-PAYOUT-37`/`PTL46` whitelist, `PTL-PAYOUT-36` amount) are queryable via `payway-sdk explain` and surfaced by `printApiError` (plus HTTP 415 for the direct payout API's JSON-only requirement).
- **Skill helper scripts** — six dependency-free `.cjs` tools shipped inside their skills and covered by `src/__tests__/skill-scripts.test.ts`: `verify-callback.cjs`, `sign-request.cjs`, `mock-callback.cjs` (hash/webhooks), `checkout-payload.cjs` (first payment), `decode-status.cjs` (check-transaction), and `reconcile.cjs` (transaction-by-merchant-ref watermark/dedupe fallback job).

### Changed

- **`scripts/online-qr-poll.ts` accepts `[amount] [currency] [lifetimeSeconds] [template]`** — the poll window now equals the QR lifetime instead of a fixed 10 minutes, and the visual template is configurable (default `template2_color`).
- **Rate-limit responses are typed and retryable** - the strict caps (e.g. transaction-detail 10/min) are enforced by the sandbox as HTTP 403 with a NUMERIC body `status.code` 429 ("Rate limit exceeded...") and no rate-limit headers; numeric codes now pass error extraction so this maps to `PayWayRateLimitError` instead of an opaque non-retryable `api_error`. Rate-limited retries pace from the SDK's own observed request window (1-10s) rather than blind exponential backoff; verified live end-to-end.
- **Local throttle transparency** - new optional `onThrottle({ endpoint, waitMs })` hook (plus debug logging) fires when a request is queued by a documented-limit token bucket.
- **`transaction-detail --wait <seconds>`** - retries every 2s while the gateway reports code 6; sandbox-measured detail lag after creation is ~5s vs <1s for check-transaction. The command (and `printApiError`) now print targeted hints for both the lag and the 403+429 cap shape, pointing to check-transaction (600 req/s) as the fast status read.
- **`pollTransactionStatus` tolerates the creation grace period** — a check right after creation can answer HTTP 200 / `status.code 6` ("tran_id not found") for a few seconds; the poller now yields `paymentStatus: 'NOT_FOUND'` without counting it toward `maxConsecutiveErrors`, so legitimate purchase flows are never aborted by propagation delay (sandbox-verified 2026-08-25).
- **`payment_gate=0` contract documented** — on the JSON Create Transaction path, gate 0 (+ `hosted_view`) is what makes the response include the hosted `checkout_qr_url`; JSDoc on `CreateTransactionParams.paymentGate`, `GenerateQrParams.lifetime` (seconds, min 3 min), and the OpenAPI types now state this.
- **`generate-checkout` no longer sends `payment_gate: 0`** — sandbox answers that value with an HTTP 200 HTML page instead of JSON.
- **Non-JSON responses are diagnosable** — "Invalid JSON response" errors now include content-type, an HTML-detection hint ("parameter rejected server-side"), and a body snippet.
- **`LinkCardParams.currency`** added (sandbox binding layer requires it; defaults `USD`) and included in the HMAC field list.
- **v3 token-management trio sends the required `request` field** (defaults to `requestId`), satisfying the server binding model.
- **Refund skill/docs** document the pre-flight balance pattern and PTL36.
- **Deterministic callback override** - `normalizePlan` replaces model-supplied `generate_online_qr` callback URLs with the merchant profile's configured URL; models can no longer inject placeholder webhooks into executed plans.
- **`payment_option` defaults to `abapay_khqr`** in `qr.generateQr` - PayWay's QR API now rejects requests without it (`400 The given data was invalid`).
- **Package entry exports** — `PAYOUT_ERROR_CODES`, `PRE_AUTH_ERROR_CODES`, and `GATEWAY_CODE_HINTS` are now exported from `aba-payway-ts` (in addition to `REFUND_ERROR_CODES`), so consumers and skills can switch on payout/pre-auth error codes directly.
- **PEM validation on RSA endpoints** - Refund, Pre-Auth, Payout, and Payment Link now throw a descriptive `PayWayConfigError` ("does not look like a public key PEM") before any encryption/network call when `publicKeyPem` is malformed.
- **URL auto-encoding** - `encodeBase64IfNeeded` now also base64-encodes protocol-relative (`//host/path`) and `www.`-prefixed URLs alongside `http(s)://`.
- **Provider error clarity** - inference timeouts now report "provider request timed out after <ms>" instead of the opaque "This operation was aborted"; TTY runs print a remediation hint on `PROVIDER_PROPOSAL_FAILED`.
- **`agent doctor` accuracy** - provider row reports `blocked` when `PAYWAY_AGENT_API_KEY` is unset instead of a false-positive `ok` from the unauthenticated `/models` ping.

### Fixed

- Multi-line quoted RSA PEMs in `.env` were truncated to their first line by the CLI's loader, silently breaking every RSA-encrypted endpoint (refund, payment links, pre-auth, payout).
- Explicit buffer encoding in `verifyCallbackSignature` timing-safe comparison.
- Removed four stale Biome lint warnings (unused suppressions + unused variable).

### Documentation

- Corrected the packaged-skill count in `.agents/AGENTS.md` (20 → 24) and documented the bundled `scripts/` tooling there; added the missing `PAYWAY_ENV` row to its environment-variable table.
- Replaced a dangling "Customer Module guide §10" reference in the transaction-by-merchant-ref skill with a direct link to the [aba-payway-customer-qr](skills/aba-payway-customer-qr/SKILL.md) skill.
- Added discovery pointers for the new skill and its offline helper scripts to `docs/README.md` Quick Links and the `docs/VISUAL-GUIDE.md` cheat sheet.
- Cross-linked online / offline / customer-module QR skills so the static-but-routable distinction is discoverable from each.
- **Environment-variable alignment (code is source of truth — the SDK reads `PAYWAY_RSA_PUBLIC_KEY` and `PAYWAY_ENV`, per `src/client.ts`)**: replaced incorrect `PAYWAY_PUBLIC_KEY_PEM` / `PAYWAY_PUBLIC_KEY` / `PAYWAY_ENVIRONMENT` references across `README.md`, `CONTRIBUTING.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `docs/RELEASE_CHECKLIST.md`, and Chapters 02, 12, and 14; corrected a false claim that both public-key variable names are accepted.
- Added missing CLI commands to the README command table (`generate-checkout`, `payment-link create/detail`, `setup-webhook`, `config`) and fixed table cells that contained double-backslash pipe escapes.
- Updated "15-chapter guide" references to **16 chapters** (`README.md`, `docs/PROJECT_STATUS.md`).
- Synced `docs/PROJECT_STATUS.md` with repository reality: milestone C/E/F "uncommitted" markers corrected to their landing commits (`df04deb`, `bc4efb7`), commit history extended through `808dc80`, and a documentation-audit session entry added.
- Added `PAYWAY_ENV` to the configuration skill's environment-variable list (`skills/aba-payway-sdk-configuration/SKILL.md`).
- Added the **payout/sandbox-beneficiary knowledge base** (`docs/SANDBOX-BENEFICIARIES.md`) with the seeded fixtures, the currency-match rule, and where enforcement lives; added a Payout-Specific error table to `docs/12-error-handling-and-debugging.md` (codes `PTL147`/`12`, `37`/`PTL146`/`PTL-PAYOUT-37`/`PTL46`, `PTL-PAYOUT-36`, `1`, `24`, `415`) plus a `12`/`PTL147` row in the common-code table.
- Updated payout, pre-auth, and sandbox-beneficiaries skills (v1.2.0 / v1.2.0 / v1.1.0) with the currency-match rule, full error matrix, and `completeWithPayout` validation; corrected the packaged-skill count to **25** in `AGENTS.md` and `.agents/AGENTS.md`.

### Known open item

- v3 token-management endpoints (`renew-expired-account-token`, `get-token-details`, `remove-token`) rejected the tested HMAC compositions during the earlier sandbox investigation. Requests passed the binding layer but failed at the hash layer; later release entries document the verified correction.

## 1.3.0

### Added

- **Webhook CLI command** (`payway-sdk setup-webhook`) — starts a local HTTP server that receives, logs, and persists ABA PayWay payment callbacks. Supports JSONL file storage (zero deps), optional SQLite storage (via `better-sqlite3`), and optional Cloudflare Tunnel integration for public URL exposure.
- **Webhook HTTP server** (`src/webhook/server.ts`) — `POST /aba-payway-webhook` endpoint that acknowledges callbacks with `200 {"acknowledged": true}` and logs HMAC-SHA512 signature verification without rejecting.
- **Cloudflare Tunnel manager** (`src/webhook/tunnel.ts`) — spawns `cloudflared tunnel --url` as a subprocess, parses the generated `trycloudflare.com` URL, and manages the tunnel lifecycle.
- **Storage adapters** — `WebhookStorage` interface with JSONL (`src/webhook/storage-json.ts`) and SQLite (`src/webhook/storage-sqlite.ts`) implementations, plus auto-detection factory.
- **`PayWayWebhookError`** error class for webhook-specific failures.
- **24 new Vitest tests** across 4 test files covering storage, server, tunnel, and CLI integration.
- **Webhook Setup Guide** (`docs/16-webhook-setup-guide.md`) — comprehensive guide covering command options, storage backends, Cloudflare Tunnel setup, programmatic usage, and security checklist.

## 1.1.1

### Added

- QR template generation test script (`scripts/test-all-qr-templates.ts`) — generates QR codes for all 10 PayWay sandbox templates at a configurable amount and saves PNG images + QR strings to disk.
- Transaction status check script (`scripts/check-qr-transactions.ts`) — fetches recent transactions via `getTransactionList`, queries detail for each via `getTransactionDetail`, and saves structured JSON results.
- End-to-end QR template verification: all 10 templates generate valid QR codes, all 10 paid transactions verified as APPROVED.
- Sandbox findings documented: QR API template constraints, transaction list/detail response shapes, rate limits, and status filter parameter format.

### Fixed

- `validateTransactionId()` now enforces PayWay's 20-character limit and `[a-zA-Z0-9\-]` character set, matching the actual API constraint discovered during sandbox testing.
- `status` filter in `getTransactionList` — documented that it requires string enum values (e.g. `"APPROVED"`), not numeric codes.
- Rebuilt the packaged CLI with `generate-checkout`; it now invokes the Checkout API through a static `PayWay` import instead of shipping an outdated command list.

### Documentation

- Added `generate-checkout` CLI setup and usage guidance, including its `payment_gate: 0` response fields and the distinction between Checkout return URLs and configured callbacks.

### Changed

- Updated compatibility guidance with QR template generation and transaction status verification findings.
- Updated `docs/PROJECT_STATUS.md` with QR template verification milestone.

## 1.0.0

### Added

- Added SDK retry support with `maxRetries`, `retryDelayMs`, `onRequest`, and `onResponse` hooks.
- Added centralized request execution with `_executeFetch()` and exponential backoff.
- Added offline KHQR generation via `payway.khqr.generateOfflineQR()`.
- Added full OpenAPI response typing for checkout, credential-on-file, QR, refund, payout, payment link, and pre-auth methods.
- Added RSA roundtrip validation and exact HMAC hashing tests.

### Fixed

- Hardened `PayWayAPIError` with safe `toJSON()` serialization, endpoint context, and retryability metadata.
- Improved retry handling for transient HTTP 5xx responses while preserving 4xx/200-business errors.

### Changed

- Bumped package version to `1.0.0`.
