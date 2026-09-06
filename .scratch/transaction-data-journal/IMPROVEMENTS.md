# Improvements — Transaction Journal campaign follow-ups

Backlog codifying the learnings from the transaction-data audit + 6-phase
implementation (2026-09-06). Evidence: `audit-results/transaction-data-audit/`
(REPORT.md, LEARNINGS.md). Priorities: P1 small/high-value, P2 medium, P3
larger/deferred. Each item names its DoD.

## P1 — small, high value

### I-1 · Fix W5-11: `generate-checkout --json` poll-timeout is machine-invisible
The journal now records poll events, but the stdout contract still lies:
poll timeout exits 0 with no outcome marker.
**DoD:** under `--json`, a poll timeout emits `{ "event": "aborted", reason,
... }` AND sets exit code 3 (parity with the human path's mapPollOutcomeToExitCode);
docs/09 + CHANGELOG row; test pins the exit code. (Pre-existing campaign
follow-up, REPORT.md §6; journal makes the regression detectable.)

### I-2 · Carry `correlationId` in `--json` success envelopes
The cid joins journal events, ledger records, and artifact sidecars — but
stdout consumers can't see it. Add `correlationId` (and `traceId` when the
gateway returned one) to the machine envelope printed by API commands.
**DoD:** `printApiErrorJson`-adjacent success path (or a shared envelope
helper) includes both; docs/12 documents the join (`grep correlationId
payway-data/journal.jsonl`); tests pin it.

### I-3 · Duplicate `tran_id` advisory via the journal (codifies W5-7)
`generate-qr`/`generate-checkout`/`cof charge` can consult the journal before
submitting: if the transactionId already appears in a prior create event,
emit the W5-7 advisory ("duplicates are accepted but unpayable — never reuse
tran_ids") unless `--force`. Nearly free now that the journal exists.
**DoD:** advisory in the three create commands when journaling is on and a
prior create event for the id exists; skip silently when journaling is off;
test with a seeded journal.

### I-4 · `doctor` journal row
`doctor` reports transport/credentials but not whether the local record
exists. Add a journal row: enabled (env/config)?, directory, file size,
event count, last event age; advisory when never enabled ("you have no local
transaction record — enable with --journal or PAYWAY_JOURNAL=1").
**DoD:** doctor row + advisory; test with a seeded and an empty dir.

## P2 — medium

### I-5 · Journal retention guard (G13 partial)
Sessions, ledger, and journal grow unbounded. Add a `doctor` warning when
`journal.jsonl` exceeds a size threshold (e.g. 50 MB), and an optional
auto-prune-on-write policy (`journal: { maxAgeDays }` in SDK config /
`PAYWAY_JOURNAL_MAX_AGE_DAYS`) implemented via the existing `pruneJournal`.
**DoD:** config + env knob, prune on write when set, doctor warning, tests.

### I-6 · `journal timeline --with-webhooks`
Merge raw webhook captures (via `PAYWAY_WEBHOOK_DIR`) into the human timeline
output — currently the raw bodies are only reachable through the webhook
store or reconcile. Reuse the correlation already in `callback.received`
events (record id).
**DoD:** flag on timeline/explain; each callback step prints the record's
signatureVerdict + matchedStatus from the store; tests.

### I-7 · `setup-webhook` onboarding offers journaling
The callback sink emits `callback.received` journal events only when
`PAYWAY_JOURNAL=1`. `setup-webhook` should offer (TTY prompt / `--journal`
flag) to append the env vars to `.env` so reconcile works out of the box.
**DoD:** prompt + flag + .env upsert via the existing onboard-helpers;
non-TTY requires explicit flag.

### I-8 · Integrator-facing hooks guide (docs/12 cross-link)
Phase 2's hook enrichment (`meta` argument + `onError`) is documented in
docs/18 but docs/12 (error handling & debugging) — where integrators look —
still shows the old two-arg hooks.
**DoD:** docs/12 Pattern-5 section updated with `meta`, `onError`, and a
pointer to docs/18 + the journal join (`lastCorrelationId`).

## P3 — larger / deferred

### I-9 · Encrypt-at-rest for `profiles.json` (G14)
apiKey sits plaintext in `%APPDATA%` (0600 only). Evaluate OS keychain
(keytar-equivalent) or an env-master-key file cipher; document the threat
model either way. **DoD:** decision record (ADR) + implementation or explicit
deferral with rationale.

### I-10 · `--json-safe` redacted machine output (G15 partial)
`--json` is a raw passthrough and unsanitized by contract. Offer a redacted
variant (reuse `sanitizeForLog`) for teams that paste machine output into
tickets/AI prompts. **DoD:** flag on API commands + docs + tests.

### I-11 · Optional SQLite journal backend (scale)
The webhook store already has a JSONL/SQLite twin behind an optional peer
dep. When journals grow past JSONL comfort, mirror the storage-factory
pattern for the journal (`--storage json|sqlite`). **DoD:** factory +
adapter + migration story; keep JSONL default.

### I-12 · Auto-surface recovery in the agent REPL
`agent ledger recover` is CLI-only; the REPL bootstrap could run
`findUnfinishedExecutions` at session start and print "you have N unfinished
creates — run agent ledger recover" (lookup-only, never replay).
**DoD:** REPL banner + `--no-recover-hint` opt-out; test.

### I-13 · Sessions/ledger retention commands (G13)
`agent sessions clear` exists; add `agent ledger prune --before` (mirroring
`journal prune`) so all three stores share one retention story.
**DoD:** command + tests + docs/AGENTIC-PAYWAY-CLI-USER-GUIDE.md row.

## Done in this campaign (reference)

- Journal v1 + correlation propagation (Phases 1), query CLI + recovery +
  digests + hook enrichment (Phase 2), webhook verdict/correlation/replay +
  reconcile (Phase 3), stats (Phase 4), `query_journal` tool + skill
  (Phase 5), explain/anomalies (Phase 6). Gap register: G1/G3–G8/G10–G12/G16/G17
  closed, G9 mitigated; G18 is provider-side and permanent.
