# Phase 4 — TUI Flows + Tables — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Checkboxes track progress.

**Goal:** Wizard flows for flag-only high-frequency commands + zero-dep TTY tables. Spec: `.scratch/cli-modernization/design.md` §7.

**Branch:** `modern/tui-flows-tables` stacked on `modern/session-repl` (604d1e6).

## Global Constraints

- Mode contract: flows/tables only when `resolvePromptMode() === 'clack'`; piped/classic output byte-identical (existing snapshots must not move).
- Flows are pure orchestration over `PaymentIO` (src/cli/ui/prompts.ts) — probe ONLY undefined flags, never re-ask provided ones; cancellation → `CliCancelled` or `{cancelled:true}` → exit 1 "Cancelled by user."
- Tables: zero-dep `src/cli/ui/tables.ts`, terminal-width aware (`process.stdout.columns` fallback 80), ellipsis overflow; used ONLY under clack mode.
- Pins: no tool/skill count changes; COMMAND_GROUPS/REGISTERED_COMMANDS unchanged (no new commands); docs pins in final commit + corpus resync.

### Task 1: tables.ts + tests
- [ ] `renderTable(columns: {key,header}[], rows: object[], maxWidth?)` → string[] (dims computed from content, header row, 2-space gutters, ellipsis `…` at width).
- [ ] Test `src/__tests__/tables.test.ts`: widths from longest cell; ellipsis at narrow maxWidth; empty rows → header only.
- Commit `feat(cli): zero-dependency TTY table renderer`.

### Task 2: apply tables (clack-only) to profiles list, skills list, transaction-list
- [ ] In each action: if `resolvePromptMode()==='clack'`, print rows via renderTable (console.log), else legacy output unchanged. Data source = the same arrays already fetched.
- [ ] Test: in-process clack-mode is hard to fake for these actions (resolvePromptMode reads streams) — cover via tables unit tests + a narrow exported helper `renderRowsAsTable` where wiring is trivial; assert piped output unchanged by existing suites.
- Commit `feat(cli): TTY tables for profiles/skills/transaction-list (clack mode only)`.

### Task 3: flows + wiring + tests
- [ ] `src/cli/flows/refund-flow.ts` `collectRefundParams(flags, io)`: tran-id, amount, confirm. Wire in refund action (clack only, probe undefined flags).
- [ ] `src/cli/flows/payment-link-flow.ts` `collectPaymentLinkParams(flags, io)`: title, amount, currency select, return-url (https validate), expiry optional, payout row editor (acc+amt loop, sum=amount check at confirm), confirm. Wire in payment-link create (clack only).
- [ ] `src/cli/flows/pre-auth-flow.ts` `confirmPreAuth(action, flags, io)`: tran-id (+amount for complete), confirm. Wire pre-auth complete/cancel.
- [ ] `src/cli/flows/cof-flow.ts` `collectLinkAccountParams(flags, io)` (request-id default `req-<rand>`, ctid, token-flag select, currency select, confirm) + `collectCofChargeParams(flags, io)` (order id, token source select → token/ctid, amount, currency, confirm). Wire cof link-account / cof charge.
- [ ] Tests `src/__tests__/flows-phase4.test.ts` — hand-rolled PaymentIO fakes: scripted happy paths for each flow; cancelled path; probe-respects-provided-flags (provided flags never re-asked); payout sum mismatch → confirm refused → re-edit or cancel.
- [ ] Full gates; commit `feat(cli): guided flows for refund/payment-link/pre-auth/cof (clack only)`.

### Task 4: docs + memory
- [ ] REFERENCE section + AGENTS.md line + HANDOFF bullet + CHANGELOG + sync:knowledge; memory update.
