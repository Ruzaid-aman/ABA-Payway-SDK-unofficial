# TASK-002 — Agentic PayWay Context & Capability Readiness

- **Task ID:** TASK-002
- **Agent:** task(TASK-002)
- **Status:** Completed
- **Commit:** (owned by orchestrator)
- **Files changed:**
  - src/agent/context.ts (new)
  - src/agent/readiness.ts (new)
  - src/__tests__/agent-context.test.ts (new)
- **Tests with results:** `npx vitest run src/__tests__/agent-context.test.ts` → Tests 18 passed (18). `npx tsc --noEmit` → clean (no errors).
- **Issues:** none
- **Handoff notes:**
  - Implemented `resolvePayWayContext` with profile precedence `options.profile ?? PAYWAY_PROFILE ?? store.defaultProfile ?? store.activeProfile`. A selected profile's credentials are authoritative; ambient `PAYWAY_MERCHANT_ID`/`PAYWAY_API_KEY` never override a selected profile. `process.env` is never mutated (the passed `env` map is only read).
  - `displayLabel` is `profile: <name|none> (<environment>)` and never includes secrets.
  - `createAgentPayWay` forces `maxRetries: 0` for `operationKind: 'create'` and uses only the explicit resolved values (no ambient fallback in the constructor call).
  - `evaluateReadiness` returns `provider: 'unverified'` (connectivity checked elsewhere); `onlineQr` is `missing` without a callback URL and `invalid` for a non-public URL (never silently falls back to offline KHQR); `offlineKhqr` is `ready` only when a valid KHQR config is present; `paymentLinkRsa`/`checkout` reflect `publicKeyPem`/credentials presence; `artifactStorage`/`sessionStorage` resolve to `ready` when the local data dir is resolvable (read-only, no filesystem writes).
  - `ResolvedPayWayContext` carries `callbackUrl` (from `PAYWAY_CALLBACK_URL` in the provided env) and `khqr` (from the selected profile, or derived from KHQR env vars when no profile is selected). `CapabilityMatrix` is a flat object of `CapabilityState` per capability.
