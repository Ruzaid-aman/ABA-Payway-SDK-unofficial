# Webhook Receiver Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make repeated and background `setup-webhook` runs fail fast, roll back safely, verify readiness, and provide scoped cleanup guidance.

**Architecture:** Keep callback capture and fulfillment contracts unchanged. Add lifecycle checks and transactional orchestration around the existing webhook server and tunnel managers, with pure helpers for testability and no broad process killing.

**Tech Stack:** TypeScript, Node HTTP, Commander, Vitest, Markdown skill/docs.

**Spec:** Approved second-pass review design in the conversation.

## Global Constraints

- Preserve raw callback capture, route-specific verification, forwarding, journal, and JSON output contracts.
- Never delete or overwrite unrelated user changes.
- Do not treat a tunnel URL as readiness until the receiver acknowledges a probe.
- Keep production fulfillment outside the development capture server.

### Task 1: Lifecycle regression tests

**Files:** Modify `src/__tests__/setup-webhook-helpers.test.ts`, `src/__tests__/setup-webhook-seams.test.ts`, `src/__tests__/webhook-tunnel.test.ts`.

- [ ] Add failing tests for port preflight, non-TTY fail-fast, startup rollback, and tunnel timeout cleanup.
- [ ] Run focused tests and confirm the failures represent missing behavior.

### Task 2: Transactional receiver startup

**Files:** Modify `src/cli/commands/setup-webhook.ts`, `src/cli/commands/setup-webhook-helpers.ts`, `src/webhook/server.ts`, `src/webhook/tunnel.ts`.

- [ ] Add injectable port probing and use it before tunnel/env work.
- [ ] Start the listener before tunnel creation and persist `.env` only after readiness.
- [ ] Roll back tunnel, server, storage, and environment on every startup failure.
- [ ] Make tunnel timeout use the same complete stop path.

### Task 3: CLI background ergonomics

**Files:** Modify `src/cli.ts`, setup-webhook tests, and webhook command tests.

- [ ] Add explicit `--non-interactive`/`--fail-fast` handling and reject implicit prompts when not on a TTY.
- [ ] Add a scoped `webhook stop` command only if lifecycle ownership can be safely identified.
- [ ] Keep human output separate from machine-readable output.

### Task 4: Documentation propagation

**Files:** Modify `docs/16-webhook-setup-guide.md`, `skills/aba-payway-webhook-production/SKILL.md`, relevant README/CLI references, and synchronized skill copies if present.

- [ ] Document the implemented startup order, failure modes, readiness probe, and safe cleanup.
- [ ] Remove instructions that recommend broad process sweeps.
- [ ] Run docs/public-boundary and skill parity checks.

### Task 5: Verification

- [ ] Run focused tests, build, typecheck, lint, full tests, public-docs, package checks, and `git diff --check`.
- [ ] Review the final diff for unrelated changes and report any pre-existing failures separately.
