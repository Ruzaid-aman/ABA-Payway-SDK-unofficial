# Dimension 2.6 — Logging & Observability

## Summary

The PayWay SDK CLI implementation provides basic request/response debug logging with sensitive‑data redaction, but lacks several observability features expected in a production SDK:

- **Log levels**: Only a `debug` boolean flag controls `console.debug` output; no structured INFO/WARN/ERROR levels.
- **Request/response logging with redaction**: Implemented via `sanitizeForLog()` and `console.debug` when `debug` is on.
- **Performance metrics (API call duration)**: Partially present in CLI polling code; absent from the core SDK request flow.
- **Correlation IDs**: Not generated or logged; only transaction IDs are created per request.
- **Structured (JSON) logging**: Not implemented; logs are plain text via `console.debug`.

---

## 1. Log Levels (DEBUG, INFO, WARN, ERROR)

| Aspect | Status | Details |
|--------|--------|---------|
| **Debug flag** | ✅ Implemented | `debug` config option (or `DEBUG_PAYWAY` env var) enables `console.debug` output in `src/client.ts:563,567,650`. |
| **INFO level** | ❌ Missing | No explicit INFO‑level logging beyond what `console.log` emits in CLI commands. |
| **WARN level** | ❌ Missing | No WARN‑level logs in the SDK; warnings are emitted via `console.log` with `⚠` in CLI only. |
| **ERROR level** | ❌ Missing | Errors are thrown as `PayWayError`/`PayWayAPIError` subclasses; the CLI prints them via `printApiError()` using `console.log` with red ANSI styling, but no structured ERROR level. |
| **Formal log-level configuration** | ❌ Missing | No winston/pino or other logging framework; logging is ad‑hoc `console.*` calls. |

---

## 2. Request/Response Logging with Redaction

| Aspect | Status | Details |
|--------|--------|---------|
| **onRequest / onResponse hooks** | ✅ Implemented | `src/client.ts:562‑567` registers `onRequest` and `onResponse` callbacks that log via `console.debug(\`[payway] -> POST ${endpoint}\`, …)` and `console.debug(\`[payway] <- ${statusCode} ${endpoint}\`, …)`. |
| **Sensitive‑data redaction** | ✅ Implemented | `src/utils.ts:218‑232` provides `sanitizeForLog()` which removes keys in `SENSITIVE_LOG_KEYS` (`api_key`, `merchant_auth`, `password`, `authorization`, `x‑payway‑hmac‑sha512`, etc.) by replacing their values with `'***HIDDEN***'`. |
| **Test coverage** | ✅ Present | `src/__tests__/client.test.ts:161‑186` verifies that debug output is sanitized and hooks are preserved. |
| **Production‑ready by default** | ⚠️ Conditional | Debug logging is only emitted when `debug` is `true` (config or env); in normal operation no request/response data is printed. |

---

## 3. Performance Metrics (API Call Duration)

| Aspect | Status | Details |
|--------|--------|---------|
| **API call duration logging** | ❌ Missing | The core SDK (`src/client.ts:_executeFetch`) does not emit any duration metric. |
| **CLI polling duration** | ✅ Partial | `src/cli.ts:runPolling` (line 185) tracks `startTime = Date.now()` and outputs `elapsed` / `remaining` seconds in poll output. |
| **Polling attempt duration** | ✅ Partial | `src/domains/checkout.ts:349` computes `durationMs = Date.now() - start` for each polling attempt; results are displayed in CLI output (e.g., `(${result.durationMs}ms)`). |
| **SDK‑level timing** | ❌ Missing | No `requestDuration` or similar field is added to responses or logged internally. |
| **Rate‑limit timing** | ✅ Present | `src/client.ts:650` logs `[payway] local rate-limit: waiting ${waitMs}ms for ${endpoint}` when `debug` is on. |

---

## 4. Correlation IDs

| Aspect | Status | Details |
|--------|--------|---------|
| **Correlation ID generation** | ❌ Missing | No `correlationId` or `traceId` is generated per request. |
| **Transaction ID** | ✅ Present | Auto‑generated `transactionId` (e.g., `qr{Date.now().toString(36)}{randomBytes(3).toString('hex')}`) in `src/cli.ts:1195`. |
| **Propagation in logs** | ❌ Missing | The `onRequest`/`onResponse` callbacks do not include a correlation identifier. |
| **Agent/orchestrator correlation** | ✅ Partial | `src/agent/ledger.ts:49` and `src/agent/contracts.ts:276` expose an optional `correlation` field on `ExecutionRecordV1` and `AgentActionDraft`, but the SDK’s own request logging does not use it. |
| **Webhook/session correlation** | ✅ Present | `src/agent/sessions.ts` stores events per session with a `sessionId` UUID, enabling end‑to‑end tracing within the agent framework. |

---

## 5. Structured (JSON) Logging

| Aspect | Status | Details |
|--------|--------|---------|
| **JSON‑structured logs** | ❌ Missing | All SDK internal logging uses `console.debug` with template literals; no `JSON.stringify`‑based log entries. |
| **CLI JSON output** | ✅ Partial | Several CLI commands (`--json` flag on `poll-transaction`, `check-transaction`, `get-transactions-by-ref`, etc.) emit `JSON.stringify(result, null, 2)` for the public API, but these are response‑format outputs, not internal structured logs. |
| **Sanitized object serialization** | ⚠️ Limited | `sanitizeForLog()` returns a sanitized object, but the result is not serialized to JSON in the logging calls (`console.debug` spreads the object as separate args). |
| **Observability pipeline readiness** | ❌ Missing | No structured log format (e.g., `{"level":"debug","message":"…","correlationId":"…"}`) for integration with external log aggregation tools. |

---

## Recommendations

1. **Add a proper logging framework** (e.g., Winston or Pino) or at minimum emit consistent structured JSON logs with fields: `level`, `message`, `correlationId`, `durationMs`, `apiEndpoint`, `statusCode`.
2. **Emit API call duration** from the SDK's `_executeFetch` method, either via a hook or by logging `Date.now() - start` after each request.
3. **Generate and propagate a correlation ID** (UUID) per request, passing it through `onRequest`/`onResponse` callbacks and including it in debug/log output.
4. **Extend log levels**: introduce `console.info`, `console.warn`, `console.error` calls alongside the existing `console.debug`, controlled by a log‑level config (e.g., `logLevel: 'debug' \| 'info' \| 'warn' \| 'error'`).
5. **Serialize `sanitizeForLog` output to JSON** when debug mode is on, e.g., `console.debug(JSON.stringify({ ... }, null, 2))`, to enable downstream log‑processing pipelines.

---

## References

- `src/client.ts:562‑567` – onRequest/onResponse debug logging
- `src/utils.ts:201‑232` – `sanitizeForLog` and `SENSITIVE_LOG_KEYS`
- `src/__tests__/client.test.ts:161‑186` – debug logging test
- `src/cli.ts:runPolling` – CLI polling duration tracking
- `src/domains/checkout.ts:349` – polling attempt duration
- `src/agent/ledger.ts:49` – correlation field on execution records
- `src/agent/sessions.ts` – session‑level event logging with UUID