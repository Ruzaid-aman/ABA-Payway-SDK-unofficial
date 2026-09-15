# Fast Webhook Receiver Startup and Repeated-Run Plan

**Goal:** Make `setup-webhook --tunnel` reach a verified customer-payment callback URL quickly and safely on the next run, including background Windows runs.

**Evidence:** The 2026-09-15 run spent time recovering from tunnel-first startup, a transient Cloudflare exit-1, stale/orphan process risk, and malformed secondary route display when `--url` already contained a path. The listener was only proven after manually starting `cloudflared`, then starting the CLI with the tunnel URL.

## Desired next-run experience

```text
payway-sdk webhook start --tunnel --customer-qr --non-interactive
  -> port checked and listener bound locally
  -> tunnel starts with bounded retry/backoff
  -> public URL discovered
  -> public customer-KHQR probe acknowledged
  -> URL + route table + capture directory printed once
  -> lifecycle state recorded for one-command stop
```

The command must not write `PAYWAY_CALLBACK_URL` or claim readiness until the listener is reachable through the public URL. A tunnel URL remains development-only and must be visibly marked ephemeral.

## Scope and ownership

### SDK/server layer

- Add a pure, injectable listener-port probe and an atomic `start()` readiness contract.
- Add a public route resolver that joins the tunnel base URL with `/aba-payway-webhook`, `/aba-payway-khqr-webhook`, and `/aba-payway-pushback` without double-appending paths.
- Add a readiness probe helper that sends a harmless JSON POST and validates HTTP 200 plus `{acknowledged:true,id}`.
- Preserve raw bodies, headers, signature verdicts, route-specific parsing, storage, journaling, and forwarding.
- Harden tunnel lifecycle: clear state on timeout, stop on startup failure, bound retries, and avoid orphan children.

### CLI layer

- Keep `setup-webhook` backward-compatible, but add a clear `webhook start` alias or a documented fast path if the command registry supports it cleanly.
- Add `--customer-qr` to make the intended route explicit and print that route first.
- Add `--non-interactive`/`--json` lifecycle output with stable fields: `localUrl`, `publicBaseUrl`, `callbackUrls`, `probe`, `captureRoot`, `pid`, and `tunnelPid` where available.
- Add `webhook stop` that acts only on recorded lifecycle state, kills the verified process tree, and restores the prior environment value.
- Add `webhook status` to report running/stale/absent state without killing anything.
- Retry transient quick-tunnel startup failures with a short capped policy; do not retry port conflicts or invalid configuration.

### Skill and knowledgebase

- Update `aba-payway-webhook-production` with one copy-runnable fast-start command, customer-KHQR route selection, readiness output, status/stop commands, and recovery instructions.
- Update `docs/16-webhook-setup-guide.md`, `docs/11-callbacks-and-webhooks.md`, `QUICKSTART.md`, CLI reference, and relevant customer-QR guidance.
- Regenerate `knowledge/` and `llms.txt` using `npm run sync:knowledge`.
- Synchronize `.zcode/skills/.../SKILL.md`; verify the skill mirror test.
- Remove manual broad process sweeps from the recommended path; retain exact-PID emergency cleanup only as a last-resort warning.

## Implementation phases

### Phase 1 — Contract and tests

- Add tests for base URL/path normalization, port conflict before tunnel/env mutation, startup rollback, non-TTY behavior, readiness success/failure, tunnel timeout cleanup, and repeated start/stop.
- Add an integration seam proving the customer-KHQR route is the route reported and probed.
- Run each new test red before implementation, then green after the minimal change.

### Phase 2 — Server-first transactional startup

- Validate configuration and probe the port before any tunnel process or `.env` write.
- Bind the listener and storage first.
- Start the tunnel only after the local listener is alive.
- Probe the public customer route.
- Persist `PAYWAY_CALLBACK_URL` only after probe success.
- On any failure, stop tunnel/server, close storage, restore `.env`, and return a deterministic non-zero result.

### Phase 3 — Lifecycle state and cleanup

- Record lifecycle state in the existing PayWay data root with a schema version and ownership marker.
- Store only process metadata and callback URL state; never store credentials or raw callback bodies in lifecycle metadata.
- Implement `webhook status` and `webhook stop` with stale-state detection and platform-specific process-tree handling.
- Make stop idempotent when no owned receiver exists.

### Phase 4 — Fast tunnel recovery and output

- Add bounded retry only for known transient tunnel startup failures.
- Keep tunnel logs available under the scratch/log location and summarize the final actionable error.
- Print customer-KHQR URL before secondary routes and avoid the current malformed `/aba-payway-webhook/aba-payway-khqr-webhook` display.
- Keep `--json` stdout to one JSON document; diagnostics remain on stderr.

### Phase 5 — Documentation and generated corpus

- Update source docs and both skill copies.
- Run `npm run sync:knowledge`.
- Check all references for route correctness, ephemeral-tunnel warnings, and no fulfillment claims from synthetic probes.
- Run public-docs and skill mirror checks.

## Acceptance criteria

- A clean Windows run reaches a verified customer-KHQR public URL with one command and no manual process inspection.
- A busy port fails before tunnel creation and before `.env` mutation.
- A tunnel failure leaves no listener, tunnel, stale URL, or lifecycle state claiming readiness.
- A failed public probe does not write `PAYWAY_CALLBACK_URL`.
- `webhook stop` cannot kill an unrelated process and restores the previous callback URL.
- Repeated start/stop runs are safe and leave no orphan receiver/tunnel processes.
- The displayed and JSON route URLs are correct for base URLs with or without trailing paths.
- Existing webhook, customer-QR, journal, forwarding, package, and machine-output tests remain green.

## Release gates

Run sequentially after implementation:

1. Focused webhook/server/tunnel/CLI tests.
2. `npm run build`.
3. `npm run typecheck`.
4. `npm run lint`.
5. `npm test`.
6. `npm run sync:knowledge` followed by knowledge freshness tests.
7. `npm run check:public-docs`.
8. Package and skill-boundary checks.
9. `git diff --check` and final review of staged paths.

## Ship / Do Not Ship

**Ship:** server-first startup, transactional rollback, route normalization, readiness probe, scoped lifecycle state, safe stop/status, docs/skill/knowledge propagation, and all gates green.

**Do not ship:** broad process-name killing, readiness claimed from tunnel URL discovery alone, `.env` mutation before verified readiness, silent retry loops, altered fulfillment semantics, or undocumented gateway assumptions.
