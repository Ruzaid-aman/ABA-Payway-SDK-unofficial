# Transaction Data & AI-Readiness — Deep Audit Report

**Audit date:** 2026-09-06
**Audited tree:** branch `audit/transaction-data-ai-readiness` @ `0bf2379` (= `main` @ `a339efc` + 3 payment-link docs commits; SDK version `1.5.0` per `HANDOFF.md` §1)
**Method:** three parallel investigation tracks covering seven roles (transaction flow, SDK execution, logging/observability, persistence, callbacks/webhooks, data architecture, modernization) + two first-person verification passes over every load-bearing claim (`§19` lists the reproducible greps).
**Scope:** `src/` shipped code, `scripts/`, `webhook_data/`, `payway-output/`, `test-output/`, `docs/`, skills. No production code was changed by this audit.

---

## §0 TLDR + coverage map

### The core question

> **Can we reconstruct the complete history of every transaction and execution today, and if not, exactly what information are we losing?**

**NO.** Five findings decide it:

1. **Print-and-forget is the default.** Every transaction-producing or reading SDK/CLI operation prints its result to stdout (`--json` passthrough or human text) and discards it. Of ~15 audited operations, only 2 leave durable artifacts on default paths (QR PNG, link-card hosted HTML). There is **no transaction database, no append-only execution log, no status history** anywhere in the shipped SDK/CLI.
2. **The richest execution metadata in the system lives in `_executeFetch` for a few milliseconds, then dies.** Per-request correlation id (`cid`, client.ts:1224), wall-clock duration (1339), rate-limit headers (1272), retry attempts (1235-1408), and the gateway `trace_id` (extractTraceId, 942-950) are all computed — and surface only in debug-mode console lines and lossy hooks (§3). Nothing persists them.
3. **Agent mode (the best-existing bones) records lifecycle, not outcomes.** The execution ledger's state machine is sound and never replays creates — but it discards API responses twice over (executor.ts:139 never passes the result; ledger.ts:166 `void result;`), session `tool_result` events store only `{tool, ok, error}` (orchestrator.ts:473), and the recovery lookup (`findUnfinishedExecutions`) has **zero production callers**.
4. **Callbacks are captured raw but unverified-by-record and uncorrelated.** The dev-only webhook sink stores `{headers, body, sourceIp}` — but the signature verdict it computes is dropped before the save (server.ts:129-143), no record links a callback to the transaction that produced it, and PayWay never re-delivers missed callbacks (skills/docs).
5. **Provider-side history is incomplete by design.** No `CLOSED` or `EXPIRED` status exists in any read API; unpaid QR-only transactions are invisible to `transaction-list` (SANDBOX-FINDINGS §14b); `payment_status` is coarse after partial refunds (§18). Therefore **a local record is the only possible complete record** — and today there is none.

### Coverage map (prompt artifact → section)

| Required artifact | Section |
| --- | --- |
| How transactions are executed (per-op traces) | §2 |
| Shared execution layer / hidden behavior | §3 |
| How executions are logged | §4 |
| How history is stored (data inventory table) | §5 |
| Agent execution ledger & sessions | §6 |
| Callback/webhook lifecycle & storage | §7 |
| Status model & provider data gaps | §8 |
| Input/Execution/Output preservation matrix | §9 |
| Existing precedent | §10 |
| Missing / lost transaction information | §11 |
| Transaction lifecycle maps | §12 |
| Keep / Improve / Replace / Add | §13 |
| AI-ready target data model + unified timeline | §14 |
| Target architecture diagram | §15 |
| AI-readiness question matrix | §16 |
| Implementation roadmap (6 phases) | §17 |
| Open questions register | §18 |
| Verification appendix (reproducible greps) | §19 |
| Investigation rules (7 roles, tagging discipline, evidence blocks) | §1 |

---

## §1 Method & evidence rules

- **Investigation:** 3 parallel sub-agent tracks (flow/execution; logging/persistence; callbacks/docs) covering the 7 investigation roles of the audit brief, followed by **two first-person verification passes** over the load-bearing files and a final grep-anchor pass over every citation that appears in this report.
- **Tagging legend:** `CONFIRMED` = code evidence cited (file:line verified against the working tree in this audit). `INFERRED` = reasonable conclusion from confirmed evidence, not directly pinned. `NOT FOUND` = searched, absent. `RECOMMENDED` = future design, not current behavior.
- **Code-location block format** used for key evidence:

```
File:        src/agent/ledger.ts
Class/Module: agent execution ledger
Function:    markSucceeded (165-168)
Current behavior: advances submitted -> succeeded, ignoring its result argument
Data produced:   lifecycle status + updatedAt
Data persisted:  status, timestamps, error (on fail paths only)
Data discarded:  the entire API response payload ("void result;")
```

- **Line-number policy:** sub-agent-reported line numbers drifted ~40-60 lines in a few `cli.ts` regions; every citation below was re-derived from the working tree (§19). Generated file `src/types.ts` is line-stable as of the audited commit.

---

## §2 Transaction execution reality

### The universal pipeline (every network operation)

```
CLI action (src/cli.ts)  or  agent tool (src/agent/tools.ts)
   ↓
domain method (src/domains/*.ts)      — validates inputs, builds payload, picks hmacFields
   ↓
PayWay.request()                client.ts:1422   (HMAC path)
PayWay.requestWithMerchantAuth() client.ts:1459  (RSA merchant_auth path: payment-link, refund, pre-auth, payout, beneficiary)
   ↓
PayWay._executeFetch()          client.ts:1208-1420  (cid, timeout, rate limit, retries, error taxonomy)
   ↓
global fetch()                  client.ts:1265  (no axios/got — zero HTTP-client deps)
   ↓
parseResponseBody → checkResponseError / createHttpError / createJsonParseError
   ↓
returned to caller  →  console output  →  [optional file write]  →  END (nothing else persists)
```

CONFIRMED: `package.json` runtime deps are only `@clack/prompts`, `ajv`, `commander`, `qrcode` (+ optional peer `better-sqlite3` for webhook storage). There is no HTTP client library, no ORM, no DB driver for transactions.

### Per-operation inventory

Anchors re-derived from the working tree. "Durable output" = what exists on disk after the command exits on a default run.

| Operation | CLI anchor (src/cli.ts) | SDK path | Durable output | Discarded |
| --- | --- | --- | --- | --- |
| generate-qr (online) | 1798 (auto txid `qr…` 1841) | `qr.generateQr` (domains/qr.ts:58+, hash fields 36) | `payway-output/<tranId>.png` (write 2101-2107) | full response incl. `qr_string`, `qrImage`, `trace_id` |
| generate-qr polling | runPolling 321-468 | `checkout.pollTransactionStatus` (checkout.ts:698+) | — | every poll attempt, durations, terminal response (stdout NDJSON only, 349-385) |
| generate-checkout / purchase | 2148 (auto txid `ck…` 2192) | `checkout.purchase` (hash fields checkout.ts:63, usage 401/424) | — | `qr_string`, `abapay_deeplink`, `checkout_qr_url` printed only (2301-2328) |
| purchaseHosted (gate 0) | SDK-only (documented) | `checkout.purchaseHosted` (client.ts:1325-1331 rewrites HTML 200 into `{hosted_checkout, content_type, html}`) | — | entire hosted HTML page (returned to caller only) |
| checkout-form (local) | 1716 (auto id 1737) | `getCheckoutFormHtml` — no API call | only with caller `--out` (write 1773) | — |
| payment-link create/detail | 2352 / 2564 | `paymentLink.create/getDetails` (payment-link.ts:41+, RSA path) | — | share URL + full response printed only |
| check-transaction | 1017 | `checkout.checkTransaction` | — | full status response |
| poll-transaction | 1059 | same generator as above | — | all attempts |
| close-transaction | 1093 | `checkout.closeTransaction` | — | response (incl. the 00/403 outcome) |
| tx-batch | 1204 (pace table 1146) | loops check/close/detail | only with caller `--report` (write 1314, renderer 1186) | per-call raw responses |
| transaction-detail | 1340 | `checkout.getTransactionDetail` — CLI retry loop for code-6 indexing lag | — | full detail incl. `transaction_operations` history |
| transaction-list | 1407 | `checkout.getTransactionList` (gateway-day window utils.ts:211) | — | entire list |
| refund | 1514 | `checkout.refund` (pre-flight detail check in CLI) | — | response |
| exchange-rate | 1630 | `checkout.getExchangeRate` | — | response |
| payout / beneficiary | 2662 / 3113+ | `payout.*` (payout.ts:32+) | — | responses |
| cof link-account | 2746 | `credentialsOnFile.linkAccount` (cof.ts:141+) | — | deeplink result; the `pwt` token only ever arrives via callback_url |
| cof link-card | 2787 | `credentialsOnFile.linkCard` (HMAC fields cof.ts:61, hash at 234/308) | `payway-output/link-card-<requestId>.html` (write 2830-2833 — the success signal IS the saved page) | everything else; card token arrives via callback only |
| cof link-card-form (local) | 2884 (auto id 2901) | `getLinkCardFormHtml` — no API call | only with caller `--out` (~2926-2928) | — |
| cof charge | 2960 | `credentialsOnFile.payment` | — | `data.tran_id` + response |
| cof token renew/details/remove | 3025+ (3028/3058/3085) | cof.ts trio | — | responses |
| pre-auth complete/complete-payout/cancel | 3289-3485* | `preAuth.*` (pre-auth.ts:66+; `idempotency_key` body field supported) | — | responses |
| agent-mode creates | `payway-sdk ask` / REPL | agent orchestrator → tools | ledger record + artifact PNG+JSON sidecar | API response payload (§6) |

\* pre-auth CLI range from the flow track; anchors verified by grep for the command group (drift-checked against the working tree; treat ±10 lines as exact-code search territory).

**Representative traces** (CONFIRMED):

- **generate-qr:** domain validates (transactionId, positive amount, currency floor, public-HTTPS callback URL, lifetime ≥ 180 s — utils.ts validators at 48/54/75/128/170/243), builds a snake_case payload with `encodeBase64IfNeeded` (utils.ts:452) for callback_url/items/deeplink/custom_fields/payout, floors lifetime seconds to whole minutes, signs with the fixed per-endpoint field list (qr.ts:36), POSTs, and the CLI writes the PNG (2101-2107) then polls by default.
- **generate-checkout:** `checkout.purchase` validates (purchase lifetime is minutes, min 3 — utils.ts:191), builds the payload, hashes locally, and `request()` re-hashes the identical body with the same field list (checkout.ts:401/424 — both hashes equal by construction). The CLI prints `qr_string`/`abapay_deeplink`/`checkout_qr_url` (2301-2328) — **nothing stores the payment URL**. A terminal poll event does include the full final response (cli.ts:384) — on stdout only.
- **cof link-card:** the gateway **always** answers HTML; `_executeFetch` detects it and throws `PayWayBusinessError` carrying the raw HTML (client.ts:1305-1318); the CLI catch block saves that page to `payway-output/link-card-<requestId>.html` (2830-2833) and exits 0 — the file IS the success artifact. The card token never appears in any response; it is delivered to the merchant's `callback_url` only.
- **agent-mode create:** orchestrator creates + confirms a ledger record per create action (orchestrator.ts:425/431) **before** the SDK call; executor enforces `confirmed` status, advances to `submitted` exactly once (executor.ts:88-106), and classifies outcomes (`OUTCOME_UNKNOWN` for network/rate-limit/abort ambiguity, 110-150).

---

## §3 Shared HTTP layer anatomy + hidden behaviors

`PayWay._executeFetch` (client.ts:1208-1420) is the single choke point for every network call. What it computes and where it goes:

| Metadata | Computed at | Goes to | Persisted? |
| --- | --- | --- | --- |
| Correlation id `cid` (8 random bytes hex) | 1224 | debug console lines (1258, 1343) | **No** |
| Wall-clock duration | 1225/1339 | debug console line (1343) | **No** |
| Attempt number | loop 1235 | nowhere (implicit) | **No** |
| Rate-limit headers (`RateLimitInfo`) | 1272 (`parseRateLimitInfo`) | `onResponse` hook arg + error object | **No** |
| Gateway `trace_id` | `extractTraceId` 942-950 | debug-only logger line (1115) | **No** |
| Request body (incl. HMAC `hash`) | 1260 | `onRequest` hook, raw & unsanitized | **No** |
| Response body (parsed) | 1273/1348 | `onResponse` hook, raw & unsanitized | **No** |
| Retry waits/backoff | 1390-1408 | invisible | **No** |
| Throttle waits | 1194 | `onThrottle` hook | **No** |

**Hook contract (client.ts:83-86) — CONFIRMED insufficient for observability:**

```
onRequest?:  (endpoint: string, bodyPayload: string) => void;
onResponse?: (endpoint: string, statusCode: number, body: unknown, rateLimitInfo?: RateLimitInfo) => void;
onThrottle?: (info: { endpoint: string; waitMs: number }) => void;
```

- No `cid`, no `durationMs`, no attempt number, no `traceId` in either hook payload.
- `onResponse` **never fires on error paths** — HTTP errors (1285), empty-body guard (1293), link-card HTML (1306), and JSON-parse errors (1332) all throw *before* the hook at 1348. Only the parsed-2xx path (including 200-wrapped business errors, by design — EC-06) reaches it.
- `onRequest` fires **per retry attempt** (inside the loop at 1260) with no marker, so hook consumers cannot tell attempt 1 from attempt 3.
- Hook payloads are **unsanitized**: the request body string includes the HMAC `hash` field; responses pass through raw. `sanitizeForLog` is applied only to debug console output (1256-1257, 1344), never to hooks and never to CLI `--json`.
- The debug-mode wrapper (1090-1119) computes `trace_id` inside `onResponse` and logs it — but does not forward it to the user hook either.

```
File:           src/client.ts
Class/Module:   PayWay._executeFetch (the single HTTP choke point)
Function/Region: 1208-1420 — correlationId at 1224, durationMs at 1339,
                attempt loop at 1235, error classification at 1363-1380
Current behavior: computes per-exchange metadata, surfaces it only in
                debug console lines and lossy hooks, then discards it
Data produced:  cid, durationMs, attempt no., RateLimitInfo, trace_id,
                classified PayWayAPIError fields
Data persisted: nothing (debug console only)
Data discarded: all of it, on every call, success and failure alike
```

**Hidden data-transforming behaviors** (things that mutate or constrain the data before it is even returned): `encodeBase64IfNeeded` on callback_url/items/deeplink/custom_fields/payout (utils.ts:452); payout domain hashes in **hex** not base64; QR lifetime seconds → floored whole minutes; purchase dual-hash (both hashes identical, checkout.ts:401/424); empty 2xx body → thrown `PayWayAPIError` (1288-1298); sandbox 403-wrapped-429 detection; `HASH_ORDER_HINTS` (client.ts:471) mapping signature failures to per-endpoint field-order hints.

**Retry/idempotency (CONFIRMED):** retries = 3 × exponential backoff (base 3000 ms) on 429/5xx/`retryable`, `Retry-After`-aware; purchase supports `retryPolicy: 'none'` for once-only submission; pre-auth carries an optional `idempotency_key` body field; the agent ledger enforces once-only creates. **No automatic idempotency-key generation; no dedup store.**

**Error taxonomy (errors.ts:9-160):** `PayWayConfigError` (20), `PayWayAPIError{statusCode, paywayCode, rawBody, endpoint, retryable, rateLimitInfo, fieldErrors}` (39-75) with subclasses Business (77), Network (125), RateLimit (134), Signature (143), plus `PollingAbortedError{transactionId, reason, lastStatus, totalAttempts}` (90-123). CLI exit codes: 0/1/2/3 via `classifyError` (cli.ts:130); `--json` failure envelope `{error:{kind, exitCode, type, message, paywayCode, httpStatus, retryable, hint}}` via `printApiErrorJson` (197).

---

## §4 Logging reality

- **No logging framework.** Zero logging deps. `src/logger.ts` is a hand-rolled structured logger: levels debug/info/warn/error (weights 17-19), resolution order config > `PAYWAY_LOG_LEVEL` > `DEBUG_PAYWAY` > default info (100-110), formats text (legacy `[payway]` prefix) or single-line JSON `{ts, level, source:'payway-sdk', msg, data}` with UTC ISO timestamps (85-93).
- **The structured logger is constructed only under `config.debug`** — `resolveConfig` returns early otherwise (client.ts:1090-1092), constructing the logger at 1097-1100 solely to power the debug `onResponse` wrapper.
- **It has exactly ONE call site in the SDK**: the `trace_id` info line (client.ts:1115). The bulk of diagnostics — request line (1253-1258), response line (1341-1347), local rate-limit wait (1199) — are legacy `console.debug` gated by `config.debug`, bypassing the logger entirely.
- **CLI logging is human text everywhere**: 400+ `console.*` sites in cli.ts alone, ANSI-styled via the hand-rolled palette (`src/cli/ui/theme.ts`); machine output is per-command `--json` raw-response passthrough.
- **Redaction — two layers, narrowly scoped (CONFIRMED via grep, §19):**
  - `sanitizeForLog` (utils.ts:501+): blocklist keys (`pwt`, `payment_token`, `authorization`, `x-payway-hmac-sha512`, `publickeypem`, `card_number`, `cvv`, `google_pay_token`, …), fuzzy fragments (`secret|apikey|password|passwd|credential|hash`), any key containing `token` or ending `key`, ≥40-char hex masking. Call sites: client.ts debug lines (1256-1257, 1344) and logger payloads (logger.ts:52). **Not** hooks, **not** `--json` output.
  - `scrubSensitive` (agent/privacy.ts:47): regex key patterns + redaction by exact secret value; used for ledger errors, session events (sessions.ts:72,136), exports, agent context.
- **Where logs go:** stdout/stderr only. **No log files, no rotation, no retention, no metrics** (NOT FOUND after exhaustive grep — §19). The only append-only JSONL writers in the repo are the webhook store (webhook/storage-json.ts:42) and test scripts.
- **Consequence:** default-config runs leave **zero** execution trace; even debug runs leave a console transcript that vanishes with the terminal. Transaction-level debugging after the fact is impossible from logs alone.

---

## §5 Persistence inventory — every data object that survives a process exit

Complete enumeration method: grep every `writeFileSync|appendFileSync|createWriteStream` in shipped `src/` (§19 reproduces the command). The table uses the audit brief's columns.

| Data object | Location | Purpose | Fields (shape) | Created when | Updated when | Retention | Correlation ID | AI-ready? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QR PNG | `payway-output/<tranId>.png` | scannable QR | image bytes; tranId only in filename | generate-qr (cli.ts:2101-2107) | never (write-once) | forever (manual) | filename=tran_id | No (binary, no metadata) |
| link-card hosted page | `payway-output/link-card-<requestId>.html` | hosted card-entry form (success signal) | gateway HTML | cof link-card (cli.ts:2830-2833) | never (write-once) | forever | filename=request_id | No |
| Agent artifact PNG + sidecar | `payway-output/<name>.png` + `.json` | agent-saved QRs | `ArtifactMetadataV1` (contracts.ts:303+): artifactId, sessionId, kind, path, url?, generatedAt, route?, amount?, currency?, transactionId?, executionId?, correlationId? | agent saves (artifacts.ts:103+) | never (write-once) | forever | artifactId + executionId + transactionId + sessionId | Partial (JSON but no query layer) |
| Execution ledger record | `%APPDATA%/aba-payway-sdk/agent/ledger/<executionId>.json` | never-replay create lifecycle | `ExecutionRecordV1` (contracts.ts:283-295): version, executionId, sessionId, tool, transactionId, merchantRef?, status, correlation?, createdAt, updatedAt, error? | every agent create (orchestrator.ts:425/431) | every state transition + attachCorrelation | forever (unbounded) | executionId, sessionId, transactionId | Partial (no payload, no query) |
| Agent session log | `%APPDATA%/aba-payway-sdk/agent/sessions/<sessionId>.json` | append-only event log | `AgentSessionV1` (contracts.ts:268-275): events of type prompt/summary/plan/confirmation/tool_call/tool_result/error/artifact/ledger/cancellation; `tool_result` data = `{tool, ok, error}` only (orchestrator.ts:473) | every ask/REPL turn | every event (full-file atomic rewrite) | forever (unbounded, `clear` is manual) | sessionId | Partial (results stripped) |
| Webhook callback record | `./webhook_data/callbacks.jsonl` (or SQLite via optional peer dep) | raw capture sink | `WebhookRecord` (webhook/storage.ts:10-23): id, receivedAt, headers, raw body string, sourceIp, khqr?{parsed, parseError, duplicateTransactionId} | dev webhook listener (server.ts:99/143) | KHQR route only: `updateKhqrMetadata` attaches parse metadata | forever (append-only) | body contains tran_id (unparsed join) | Partial (raw JSONL, no query) |
| Credential profiles | `%APPDATA%/aba-payway-sdk/profiles.json` | CLI credential store | ≤8 profiles incl. **plaintext apiKey** (profiles.ts:63, mode 0600) | profiles commands | profile add/use/remove | forever | name | n/a (secret) |
| tx-batch report | caller path via `--report` | batch evidence | markdown table (id/ok/code/status/error) | tx-batch (cli.ts:1314) | never (one-shot) | caller-managed | tran_id | Partial |
| Campaign/test artifacts | `test-output/**` (`purchase-test-campaign/` etc.), `test-logs/*.jsonl` | ad-hoc evidence | raw JSON responses, HTML, PNG, LogEntry JSONL (scripts/sandbox-integration-test.ts:92-105) | probe scripts | per run | forever | tran_id in filenames/bodies | No (heterogeneous) |
| In-memory state | `rateLimitState`, `recentCallsByEndpoint` (client.ts:973-974), circuit-breaker map | transport accounting | tokens/timestamps | per-process | continuously | process lifetime | endpoint | No (lost on exit) |

**Entities the brief asks about that are NOT durable objects** (they exist only in transit or on stdout — retained nowhere): payment links and checkout requests (share URL/deeplink printed, §2), API requests/responses (except the two artifact rows above; §9), logs (stdout only, §4), audit records (only the agent ledger/sessions, §6), provider references (`trace_id`, `bank_ref` — inside discarded responses; §3), status history (only `transaction_operations` on detail responses, §8), retry attempts (never surfaced, §3). See §9 for the per-stage retention matrix and §11 for the gap register.

**NOT FOUND (searched, absent):** any transaction database (SQLite used only by the optional webhook store; no lowdb/level/redis/prisma/typeorm); any append-only execution log for plain CLI/SDK paths; any persistence of poll results; any persistence of checkout URLs/deeplinks; any status-history store.

**Verdict:** the pieces that exist are **mutually uncorrelated** — no store joins on `tran_id` across QR artifacts, ledger records, webhook captures, and session logs; and no store records request/response payloads for normal operations.

---

## §6 Agent-mode anatomy — the best-existing bones

### Execution ledger (src/agent/ledger.ts) — CONFIRMED

- One JSON file per execution under `%APPDATA%/aba-payway-sdk/agent/ledger/`, atomic 0600 writes (`atomicWriteJson`, storage.ts:48), Ajv-validated loads.
- State machine `planned → confirmed → submitted → succeeded | failed | outcome_unknown`, recorded **before** the SDK call runs; `submitted` fires exactly once (executor.ts:106); replay of an unconfirmed/finished create is refused with `RECOVERY_REQUIRED` (executor.ts:88-99). **Never auto-replays.**
- **The double result-discard:** executor calls `markSucceeded(executionId)` with no result (executor.ts:139); even if it did, `markSucceeded` ignores it (`void result;` ledger.ts:165-168). The ledger knows *that* a purchase succeeded, never *what* it returned.

```
File:            src/agent/ledger.ts (and src/agent/executor.ts)
Class/Module:    agent execution ledger
Function:        markSucceeded (ledger.ts:165-168); call site executor.ts:139
Current behavior: advances submitted -> succeeded ignoring the result
Data produced:   lifecycle status + updatedAt
Data persisted:  status, timestamps, scrubbed error (fail paths only)
Data discarded:  the entire API response payload ("void result;")
```
- `correlation` field exists (contracts.ts:291) but **no caller supplies a value** — `confirmExecution(id)` is called bare (orchestrator.ts:431) — and the gateway `trace_id` is never carried into it.
- `findUnfinishedExecutions(sessionId)` (ledger.ts:204-222) lists recoverable records — **zero production callers** (grep §19; tests only). Recovery is exported, tested, and unreachable from any CLI surface.
- The `'ledger'` session event type (contracts.ts:259, schemas.ts:297) is **never emitted** by any code.

### Sessions (src/agent/sessions.ts) — CONFIRMED

Append-only event log, full-file atomic rewrite per event (87), `scrubSensitive` on every event (72). `tool_call {tool, index}` / `tool_result {tool, ok, error}` (orchestrator.ts:472-473) — **result `data` is dropped from the durable record** while the same data reaches the ask stdout result (orchestrator.ts:480-482): stdout has it, disk doesn't. Write failure degrades to a console warning (sessions.ts:88-94).

### Artifacts (src/agent/artifacts.ts) — CONFIRMED

PNG + `ArtifactMetadataV1` JSON sidecar (103+), traversal-safe names, carrying sessionId/route/amount/currency/transactionId/executionId — the **richest correlation-bearing record in the repo**, but only for QR saves on the agent path, with no query surface.

---

## §7 Callback / webhook reality

### There IS a receiver — but it is a dev/test capture sink (CONFIRMED)

`createWebhookServer` (webhook/server.ts:50, node:http, no framework) exposes two POST routes: `/aba-payway-webhook` (online checkout callbacks) and a separate KHQR path (offline printed-QR notifications). Behavior:

- **Online route:** collects raw body → reads `X-PAYWAY-HMAC-SHA512` (130) → **computes** `signatureValid` via `verifyCallbackSignature` (129-141) → **logs** the verdict to console (140) → saves `{headers, body, sourceIp}` (143) — **the verdict is NOT part of the saved record** (interface webhook/storage.ts:10-23 has no such field) → responds 200 always (159-161), or 401 in opt-in TD-09 verdict mode *after* saving (152-157).
- **KHQR route:** persists raw delivery **before** parsing (99 — "malformed JSON must never discard the raw audit record"), best-effort parse with `duplicateTransactionId` flag (106-113), marked `verification: 'unverified'` because ABA publishes no auth contract for it (khqr-notification.ts).
- Docs pin the intent: `docs/16-webhook-setup-guide.md` — "for **development and testing only**"; capture-vs-verdict separation exists so ABA's non-retried deliveries are never lost to a 401.

### What the SDK leaves entirely to the integrator (CONFIRMED)

- `callback_url`/`return_url` are request parameters (signed into per-endpoint hashes); the COF `pwt` token is **only ever delivered there** (types.ts link-account/link-card descriptions; client.ts:1305-1318 hint text).
- No callback→transaction matching, no state update, no fulfilment, no idempotency engine in shipped code — docs show commented-out examples (`docs/11-callbacks-and-webhooks.md`) and TODO-stub templates (`src/config/templates/express.ts:47`, `nextApp.ts:41`).
- **PayWay does not retry missed callbacks** (skills/aba-payway-customer-qr: "Missed callbacks (endpoint down > 5s) are never retried… rely on the `get-transactions-by-mc-ref` fallback job") — a captured-once-or-lost-forever delivery model.

### Verification primitives (CONFIRMED — auth.ts)

`verifyCallbackDetailed` (72-118): optional `stripHash`, sorted-key ascending concatenation (objects JSON-encoded), HMAC-SHA512 base64, length check + `timingSafeEqual` (111-117), reasons `signature_mismatch|malformed_signature|empty_body`. Distinct from outbound `generateHmac` (8-25) which uses per-endpoint fixed field lists. Callback body contract: `PaymentCallbackBody {tran_id, apv, status, return_params?}` (types.ts:1317) with an explicit "body shape is NOT fixed" note.

```
File:            src/webhook/server.ts
Class/Module:    createWebhookServer (dev/test capture sink)
Function/Region: 129-143 — verdict computed at 136, logged at 140,
                 record saved at 143 without it
Current behavior: verifies the X-PAYWAY-HMAC-SHA512 signature, prints the
                 verdict to console, then stores {headers, body, sourceIp}
Data produced:   signatureValid (boolean|null) + full raw delivery
Data persisted:  raw body, headers, sourceIp, receivedAt (WebhookRecord)
Data discarded:  the signature verdict itself — a stored record cannot say
                 whether it verified
```

### Gap summary

Raw capture: good. Everything after capture — verdict persistence, transaction correlation, idempotent processing, replay, state transition — **does not exist** in shipped code.

---

## §8 Status model & provider-side data gaps

Status codes (constants.ts:45-67, sandbox-discovered, undocumented in OpenAPI): `0` = APPROVED **and** PRE-AUTH (distinguish via string), `2` = PENDING, `3` = DECLINED, `4` = REFUNDED, `7` = CANCELLED. Terminal set for polling: APPROVED/DECLINED/CANCELLED/REFUNDED (domain-types.ts:14); PENDING/PRE-AUTH are non-terminal (17). The only history concept is `transaction_operations` on transaction-detail (types.ts:651-660: status/amount/transaction_date/bank_ref per operation) — empty for unpaid transactions, absent from list items (types.ts:729-730).

Provider-side gaps that **no local design can query remotely** (each documented in repo findings — cite as doc evidence):

| Gap | Evidence | Consequence for history |
| --- | --- | --- |
| No `CLOSED` status in any read API; closed-unpaid reads PENDING forever | CLOSE-TRANSACTION-FINDINGS §3; §19-recheck | closure must be a local flag; remote reconciliation impossible |
| No `EXPIRED` status; expired reads PENDING forever | W4-1 (HANDOFF §7) | expiry is unobservable remotely |
| Unpaid QR-only transactions invisible to `transaction-list` | SANDBOX-FINDINGS §14b | list-based reconciliation silently misses open QRs |
| Partial refund flips whole `payment_status` to REFUNDED; `refund_amount` stays authoritative | SANDBOX-FINDINGS §18 | `payment_status` is a coarse flag |
| `payment_amount` = payer-side debit, possibly another currency | W5-6 / SANDBOX-FINDINGS §21 | amount semantics differ per viewpoint |
| Duplicate `tran_id` silently accepted; duplicate QRs unpayable | W5-7 | id must be locally unique-by-construction |
| `transaction_date` = creation on detail vs payment completion on list | W5-13 | timestamps mean different things per endpoint |
| Gateway clock is UTC+7 for list windows | SANDBOX-FINDINGS §18; utils.ts:211 | wrong-tz windows return 0 rows |
| `generate-checkout --json` poll-timeout exits 0 (machine-invisible) | W5-11 (campaign REPORT §1) | outcome gaps in the primary machine contract |
| Closed hosted-card sessions can still pay | W5-8/H7 CLOSE-TRANSACTION-FINDINGS §2a | close is channel-dependent, advisory-only |

**Conclusion:** because the gateway itself never records closure/expiry and hides unpaid QRs from lists, **the merchant-side (this SDK's callers) is the only place a complete transaction history can exist.** Today it records almost nothing (§5).

---

## §9 Input / Execution / Output retention matrix

What is retained vs discarded per stage, across all operations (the universal pattern; exceptions noted):

| Stage | Field | Retained where | Lost when |
| --- | --- | --- | --- |
| **Input** | SDK method / CLI command | nowhere (agent sessions store tool name only) | always on plain CLI |
| | Parameters (amount, currency, lifetime, callback_url…) | nowhere (agent: implied by ledger `tool` + session plan text) | always |
| | Signed request payload (incl. `hash`) | debug console only (1256-1258) | terminal close |
| | `req_time` (UTC `YYYYMMDDHHmmss`, utils.ts:12) | inside request only | response received |
| | idempotency key (pre-auth only) | request body only | always |
| | correlation/request id (`cid`) | debug console only | terminal close |
| **Execution** | start/end timestamps | debug console only | terminal close |
| | duration (ms) | debug console only (1343) | terminal close |
| | attempt number / retry count | not even computed for output | immediately |
| | endpoint | `PayWayAPIError.endpoint` on failure only | success path |
| | HTTP status | error objects only | success path |
| | provider response code | error objects (`paywayCode`) only | success path |
| | gateway `trace_id` | debug-only info line (1115) | terminal close |
| | rate-limit info | hook arg / error objects | hook returns |
| | local throttle waits | `onThrottle` hook only | hook returns |
| **Output** | raw response body | stdout (`--json`) only; **never** on disk (plain paths) | process exit |
| | parsed response | same | same |
| | transaction id (`tran_id`) | QR PNG filename; ledger/artifact sidecars (agent); nothing else | — |
| | payment URL / deeplink / `qr_string` | stdout only (agent artifact PNG for QR) | process exit |
| | checkout/hosted HTML | caller's variable only (`purchaseHosted`), or `payway-output/link-card-*.html` (that one op) | GC |
| | error details | CLI `--json` error envelope on stdout; ledger `error` (scrubbed, agent creates only) | process exit |
| | poll attempts & terminal response | stdout NDJSON (cli.ts:349-385; terminal event includes full response, 384) | process exit |
| **Callback** | raw body + headers + sourceIp + receivedAt | `webhook_data/callbacks.jsonl` (dev listener only) | if no listener ran: **forever lost** (no provider retry) |
| | signature verdict | console line only (140) — dropped before save (143) | terminal close |
| | correlation to originating transaction | not computed | immediately |

**Net:** with the dev webhook listener off (the default for SDK consumers), **100% of API responses and 100% of callbacks leave no durable trace**; the only surviving artifacts are 2 files per create-heavy workflow (PNG, link-card HTML) and the agent-mode records that strip payloads.

---

## §10 Existing precedent — the journal pattern is already proven 3× (with limits)

1. **`scripts/sandbox-integration-test.ts:92-115,150-200`** — a working request/response/callback journal: `LogEntry {timestamp, test, phase: sdk-request|sdk-response|callback|info|error|verdict, endpoint?, payload?, status?, responseBody?, rateLimitInfo?, durationMs?, error?, verdict?, metadata?}` appended as JSONL to `test-logs/`, wired via the SDK `onRequest`/`onResponse` hooks. **This is the Transaction Journal in embryo.**
2. **`webhook/storage-json.ts:42`** — append-only JSONL raw-capture store with an interface, a SQLite twin, and a factory (storage-factory.ts) — the exact storage pattern a journal needs.
3. **Campaign wave runners** (`.scratch/purchase-api-test-plan/*.ts`, `scripts/*.ts` — 16 scripts write files) — ad-hoc evidence capture into `test-output/purchase-test-campaign/` (raw JSON per tran, HTML, PNG, markdown capture sheets).

**Limits the prototype proves (and this audit verified in code):** built on hooks, it must **self-measure duration** by pairing its own timestamps (177-182 — attempt-fragile: the last `onRequest` timestamp pairs with the eventual response), gets **no cid**, **no attempt numbers**, **no error-path events** (onResponse never fires on thrown errors — §3), and logs request bodies **unsanitized** (they include `hash`). Conclusion: the *pattern* is proven; the *hook contract* is not a sufficient tap point.

---

## §11 Missing / lost transaction information — the gap register

| # | Gap | Class | Evidence | Why it matters |
| --- | --- | --- | --- | --- |
| G1 | API responses never persisted (plain paths) | never-captured | §2, §5, §9 | no post-hoc debugging, disputes, or analytics |
| G2 | Checkout URLs / deeplinks / `qr_string` stdout-only | stdout-only | cli.ts:2301-2328 | a lost URL = an unpayable transaction nobody can re-share |
| G3 | In-flight metadata (cid, duration, trace_id, attempts, rate-limit) discarded | memory-only | §3 table | latency/provider-performance analysis impossible |
| G4 | Logger debug-only + one call site; bulk is legacy console.debug | never-captured (default config) | §4 | default runs leave zero trace |
| G5 | Ledger discards API results (double) | discarded-by-design | executor.ts:139, ledger.ts:165-168 | ledger can't answer "what did the gateway return" |
| G6 | Session `tool_result` strips `data` | overwritten | orchestrator.ts:473 vs 480-482 | durable log strictly poorer than stdout |
| G7 | Webhook signature verdict dropped before save | discarded-by-design | server.ts:129-143 | can't distinguish verified vs unverified deliveries later |
| G8 | Callbacks uncorrelated to executions/transactions | stored-without-relationships | §7 | "did the callback for X arrive?" is unanswerable |
| G9 | Missed callbacks unrecoverable (provider never retries) | difficult-to-replay | skills/customer-qr, docs/16 | delivery is capture-once-or-lost |
| G10 | `findUnfinishedExecutions` unreachable from CLI | difficult-to-query | §19 grep | crash recovery exists in code but not in product |
| G11 | Ledger `correlation` never populated; trace_id never carried | never-captured | orchestrator.ts:431 | no SDK↔gateway support correlation |
| G12 | `'ledger'` session events never emitted | never-captured | §19 grep | session timeline has no ledger linkage |
| G13 | Sessions/ledger/webhook stores unbounded, plaintext | unbounded | §5-§7 | growth + PII exposure over time |
| G14 | `profiles.json` apiKey plaintext | security | profiles.ts:63 | blast radius if `%APPDATA%` leaks |
| G15 | `--json` machine output unsanitized + W5-11 exit-0 poll-timeout | machine-contract gaps | §4, §8 | downstream automation misreads outcomes |
| G16 | Poll attempts & durations stdout-only | stdout-only | cli.ts:321-468 | retry/latency forensics impossible |
| G17 | No query surface over ANY store | difficult-to-query | §5 verdict column | data that exists still can't be asked questions |
| G18 | No CLOSED/EXPIRED remote state (provider-side, permanent) | unobservable | §8 | only a local record can ever close this gap |

---

## §12 Transaction lifecycle maps (with ✗ = data-death points)

### Online QR channel

```
CLI generate-qr (cli.ts:1798)
  → validation (utils.ts validators)
  → payload build + HMAC sign (qr.ts:36,58+)
  → _executeFetch (client.ts:1208)  ── cid/duration/trace_id computed ──✗ discarded (§3)
  → 200 GenerateQrResponse {qrString, qrImage, trace_id}   ──✗ response stdout-only
  → PNG write payway-output/<tranId>.png                    ✓ ONLY durable artifact
  → poll loop (runPolling 321 / generator checkout.ts:698)  ──✗ attempts/durations stdout-only
  → customer scans & pays (gateway-side, invisible until check)
  → callback → merchant callback_url ──✗ lost forever unless a listener ran (G9)
  → terminal status via check-transaction ──✗ stdout-only
```

### Checkout / purchase channel

```
CLI generate-checkout (2148) or SDK purchase()
  → validate (minutes-lifetime etc.) → sign (checkout.ts:63,401,424)
  → _executeFetch ──✗ metadata dies
  → 200 {qr_string|abapay_deeplink|checkout_qr_url} ──✗ printed only (2301-2328) — NO artifact at all
  → poll ──✗ stdout-only; poll-timeout exit-0 under --json (W5-11)
  → payment → callback ──✗ as above
```

### Hosted purchase (gate 0)

```
checkout.purchaseHosted() → HTML 200 rewritten to {hosted_checkout, content_type, html} (client.ts:1325-1331)
  ──✗ HTML returned to caller only; nothing persisted by SDK/CLI
```

### Payment link

```
payment-link create → RSA merchant_auth path → 200 {…share url…} ──✗ printed only (cli.ts:2484-2495*)
  → customer pays via hosted page → return_url (browser redirect; trust ≠ callback)
```

### COF link (account/card)

```
cof link-account / link-card
  → 200 (deeplink | HTML page ✓ saved for link-card 2830-2833)
  → customer authorizes → pwt token delivered to callback_url ONLY
  ──✗ token lost unless the merchant captured the callback; ledger/session never see it
  → cof charge → 200 {data.tran_id} ──✗ stdout-only
```

### Webhook capture path (dev listener)

```
PayWay POST → /aba-payway-webhook → raw body + headers collected
  → signature computed (129-141) ──✗ verdict logged, not persisted (G7)
  → WebhookRecord saved ✓ (raw, uncorrelated — G8)
  → 200 always (capture semantics) — no matching, no state update, no dedupe engine
```

\* payment-link print range from flow track, drift-checked; exact anchor re-greppable via §19 policy.

---

## §13 Keep / Improve / Replace / Add

**Keep** (already good, deliberately preserved): thin-client philosophy (no hidden server components); single `_executeFetch` choke point; execution-ledger state machine + never-replay rule; webhook raw-capture discipline (store-before-parse); `sanitizeForLog`/`scrubSensitive` redaction; `atomicWriteJson` pattern; generated typed response envelopes; per-endpoint hash-order hints; repo findings culture (fact registers).

**Improve** (enhance what exists): persist what `_executeFetch` already computes (cid/duration/attempts/trace_id) — it is a bug-shaped omission that this data exists and dies; carry `trace_id` into ledger `correlation`; pass a scrubbed result summary into `markSucceeded`; include result digests in session `tool_result`; persist the webhook verdict (extend `WebhookRecord`); wire `findUnfinishedExecutions` into a recovery command; emit the defined `'ledger'` session events; enrich hooks additively (optional trailing `meta` arg `{cid, attempt, durationMs, traceId}` + new `onError` hook — backward compatible, extra args ignored by existing handlers); always-construct the logger and gate by level (replace debug-gated construction).

**Replace** (redesign eventually): ad-hoc script JSONL capture (test-logs, wave runners) → the productized journal; debug-gated logger instantiation → always-on structured emitter with level gating; session `{tool, ok, error}` summaries → structured result digests; `--json` stdout as the *only* machine contract → journal query CLI (stdout stays for humans/one-shots).

**Add** (missing): the Transaction Journal (§14); correlation propagation; query/timeline/reconcile commands; retention/prune policy; AI access layer (§15-§16).

---

## §14 Target model — Transaction Journal v1 (RECOMMENDED)

### Wiring (corrected by this audit's code validation)

The journal is a **first-party emitter inside `_executeFetch`** — at request start, on each attempt, on the parsed-2xx path (before `checkResponseError`, matching the EC-06 hook semantics), and **in the catch path** (errors) — because that is the only place `cid`, `durationMs`, `attempt`, and `trace_id` all exist, and the only place error events can be emitted (§3 proved hooks cannot carry this). Config: `journal: boolean | { dir, mode }` / env `PAYWAY_JOURNAL=1`; **default OFF** for the published library (silent file writes would be a behavior change; the agent CLI may default it ON where auditability is the point). Hook enrichment (§13 Improve) proceeds independently for integrators.

### Event schema (TS + ajv, mirroring the agent-contracts pattern)

```ts
const JOURNAL_VERSION = 'payway-journal/v1';

interface JournalEventV1 {
  version: typeof JOURNAL_VERSION;          // const, additionalProperties: false
  ts: string;                               // ISO-8601 UTC (matches all existing stores)
  eventId: string;                          // randomUUID
  kind:
    | 'execution.started'                   // CLI command / agent tool begins
    | 'execution.request'                   // per attempt (carries attempt no.)
    | 'execution.response'                  // parsed 2xx incl. 200-wrapped business errors
    | 'execution.error'                     // thrown path — the gap hooks cannot see
    | 'poll.attempt'
    | 'callback.received'                   // from the webhook store, correlated post-hoc
    | 'status.observed'                     // any check/detail/list/poll status reading
    | 'artifact.written';
  correlationId: string;                    // SDK cid — per-event join key
  attempt?: number;
  executionId?: string;                     // agent mode
  sessionId?: string;                       // agent mode
  transactionId?: string;                   // tran_id when known (the transaction key)
  merchantRef?: string;
  command?: string;                         // CLI command or agent tool
  endpoint?: string;
  httpStatus?: number;
  paywayCode?: string;
  durationMs?: number;
  traceId?: string;                         // gateway status.trace
  requestDigest?: unknown;                  // sanitizeForLog(body) — digest mode default
  responseDigest?: unknown;                 // sanitizeForLog(body) — digest mode default
  error?: { code?: string; message: string };
}
```

Modes: `digest` (default — sanitized key fields only) vs `full` (sanitized full bodies, opt-in). **Redaction at write is mandatory** — this audit confirmed hook/payload paths carry unsanitized bodies incl. `hash` (§3), and `--json` output is unsanitized (§4). Never journal `apiKey`, `pwt`, or raw `hash`.

### Correlation key hierarchy

| Key | Scope | Exists today in | In target |
| --- | --- | --- | --- |
| `correlationId` (SDK cid) | one HTTP exchange (+retries) | computed, discarded (client.ts:1224) | every event; propagated to ledger.correlation & artifacts |
| `transactionId` (tran_id) | one transaction's lifetime | QR filename, ledger, artifact sidecars, callback body, responses | the transaction join key on every event that knows it |
| `executionId` / `sessionId` | agent creates / sessions | ledger, sessions, artifacts | carried on agent-origin events |
| `traceId` (gateway) | provider-side exchange | response `status.trace`, debug line only | captured on response/error events |

### Concept selection (per the brief's warning against blind adoption)

**Adopt** (already exist in embryo): Event, Execution, Transaction, Callback, Artifact. **Derive** (computed from events, not stored separately): Request/Response (event payloads), StateTransition (sequence of `status.observed`). **Skip** (fields, not entities): standalone Correlation or Provider-Reference records — keys on events suffice at this scale.

### Unified timeline (the reconstruction algorithm)

`timeline(tranId) = journal.filter(e => e.transactionId === tranId || callbackBodyOf(e).tran_id === tranId).sortBy(ts)` — renders every stage the system saw, each event answering: what happened / when / why (error, code) / which transaction & execution / which provider endpoint / input & output digests / what changed / succeeded? / how long / what came next. Correlation joins ledger records, artifact sidecars, and webhook captures via `transactionId`/`executionId` — all of which already carry or can carry those keys.

### Storage & retention

Append-only JSONL (zero deps — webhook-store precedent) at `payway-data/journal.jsonl` (configurable), optional SQLite backend via the existing optional peer dep; readers must tolerate unknown `kind` values (schema evolution); `journal prune --before <date>` + size-based rotation policy; plaintext warning applies (same trust domain as sessions today — documented, not encrypted).

---

## §15 Target architecture (RECOMMENDED)

```
CURRENT                                    TARGET
──────                                     ──────
CLI/SDK ──► stdout (dies)                  CLI/SDK ──► stdout (unchanged contract)
     └──► 2 artifacts (PNG/HTML)                └──► _executeFetch emitter ──► sanitize ──► Journal (JSONL/SQLite)
agent ──► ledger (lifecycle only)          agent ──► ledger (+ result digests, trace_id in correlation)
      ──► sessions ({tool,ok,error})                 sessions (+ digests, 'ledger' events)
webhook dev sink ──► raw captures         webhook sink ──► raw captures + verdict + matched tranId
                                                                            │
                                            ┌───────────────────────────────┤
                                            ▼                               ▼
                                   query CLI (timeline/show/stats)   reconcile (creates ↔ callbacks)
                                            └───────────┬───────────────────┘
                                                        ▼
                                     AI layer: query_journal agent tool + skill + `ask` NL
```

Unchanged: the SDK stays a client library; no server components are added; default library behavior identical (journal opt-in).

---

## §16 AI-readiness question matrix

| Sample question | Answerable today? | With journal? | Needs |
| --- | --- | --- | --- |
| "Show me everything that happened to transaction X" | No (fragments: PNG name, ledger status, stdout scrollback) | **Yes** | `timeline(tranId)` (P1-P2) |
| "Why did this checkout request fail?" | Only if the terminal is still open | **Yes** | error events + digests (P1) |
| "How long did the provider take to respond?" | No | **Yes** | durationMs per event (P1) |
| "Which transactions failed after receiving a callback?" | No | **Yes** | join callback.received → status.observed (P3) |
| "QRs created but never completed / never called back" | No (and §14b makes lists blind to unpaid QRs) | **Yes** | reconcile (P3) |
| "Which provider errors increased this week?" | No | **Yes** | paywayCode aggregation (P4) |
| "What % of payment links eventually got paid?" | No | **Yes** | funnel stats (P4) |
| "API succeeded but callback never received?" | No | **Yes** | reconcile + capture listener (P3) |
| "What changed between successful and failed checkouts?" | No | **Yes** | digests comparison (P4-P5) |
| "Was this transaction closed or expired?" | **Never remotely** (no CLOSED/EXPIRED exists) | Only via local events | local `status.observed` + close flags (P2) — provider gap G18 is permanent |

---

## §17 Implementation roadmap (RECOMMENDED — each phase a self-contained wave in this repo's campaign style)

### Phase 1 — Observability (smallest practical evolution)
- **Code:** new `src/journal/` (types + ajv schema + JSONL writer + `prune`); wire emitter into `_executeFetch` (4 points: start/attempt/response/catch) + config/env opt-in; carry `traceId` into events; propagate cid → ledger `correlation` (orchestrator.ts:431 passes it) and artifact metadata.
- **Data added:** JournalEventV1 for every network exchange (digest mode default).
- **Risks:** hot-path I/O (mitigate: single `appendFileSync`, fail-open try/catch like hooks); sparse coverage while opt-in; redaction false-positives (reuse proven `sanitizeForLog`).
- **Migration/back-compat:** pure addition, default OFF; no public signature changes; hooks untouched.
- **Benefits:** G1/G3/G4/G11 closed for opted-in users; every debugging session becomes reconstructable.
- **Tests:** vitest unit (writer, schema, sanitize) + mock-gateway e2e (event sequence incl. error + retry paths); docs/CHANGELOG row.
- **Status (2026-09-06): SHIPPED** on branch `audit/transaction-data-ai-readiness` — `src/journal/` (types, strict Ajv schema, digest builders, JSONL sink, `pruneJournal`), emitter at the request/response/catch points, config + env registered, digest|full redaction, `PayWay.lastCorrelationId` getter, cid propagated into ledger `correlation` (`attachCorrelation`, first-write-wins) and artifact metadata sidecars; default OFF; 23+ journal tests + ledger/artifact cid tests. Deliberate refinement: no separate `execution.started` transport event (request#0 carries the same data; command-level `started` arrives with Phase 2's CLI emission).

### Phase 2 — Transaction history
- CLI/agent event emission (`execution.started`, `poll.attempt`, `artifact.written`, `status.observed` on check/detail/list); `payway-sdk journal show|timeline|prune`; wire `findUnfinishedExecutions` → `agent ledger recover`; emit `'ledger'` session events; result digests into `markSucceeded` + session `tool_result`; additive hook enrichment (`meta` arg + `onError`).
- Closes G5, G6, G10, G12, G16, G17(partial). Risks: session schema growth (versioned events already tolerate unknown kinds).

### Phase 3 — Callback/event capture
- `WebhookRecord` v2 optional fields `{signatureVerdict, matchedTransactionId, verificationReason}`; server passes the computed verdict into the save; `journal reconcile` (creations vs callbacks, incl. the §14b unpaid-QR blind spot); idempotent dedupe on `(tran_id, status)` replays.
- Closes G7, G8, G9(mitigated). Risks: schema migration on existing JSONL/SQLite stores (additive optional fields only).

### Phase 4 — Analytics
- `journal stats` (latency percentiles per endpoint, retry rates, provider error-code time series, QR→paid / link→paid funnels, callback delivery rate). Closes G17. Risks: none structural (read-only aggregations). Migration: none — pure consumption of the existing event file. Back-compat: additive command only.

### Phase 5 — AI readiness
- `query_journal` agent tool following the existing registry pattern (`ToolExecutionResult {ok, tool, data}`, agent/tools.ts); packaged skill `aba-payway-journal`; JSON query output. Migration: registry + skill addition only. Back-compat: read-only tool; no changes to existing tools or schemas beyond the tool list.

### Phase 6 — Transaction intelligence
- RCA templates ("trace a failed checkout end-to-end"), anomaly detection (error-rate/latency spikes), NL queries through the existing `ask` orchestrator backed by the query tool. Mostly composition over P1-P5. Migration: prompt/provider-context changes only. Back-compat: journal schema untouched; new analysis surfaces degrade gracefully when the journal is empty.

**Recommended sequencing:** P1 → P2 → P3 are the substance; P4-P6 are additive and can follow opportunistically.

---

## §18 Open questions register

1. Does the gateway return `status.trace` on **every** endpoint or only some? (Observed on several; not systematically cataloged — affects trace coverage, not the model.)
2. Should the agent CLI journal by default ON (audit-first) while the library stays opt-in? (Recommended: yes — decision needed.)
3. Journal location: per-project `payway-data/` vs `%APPDATA%` alongside agent stores? (Recommend per-project: belongs to the merchant's integration evidence.)
4. Is there any ABA-side retrieval for missed checkout callbacks (mirroring `get-transactions-by-mc-ref` for KHQR)? (OPEN-QUESTIONS Q15/Q18 adjacency.)
5. Retention defaults: none (current repo culture) vs size-capped rotation? (Recommend explicit policy in P1 docs.)
6. Encrypt-at-rest for sessions/profiles? (Out of audit scope; flagged G13/G14.)

---

## §19 Verification appendix (reproducible evidence)

All commands run from repo root on the audited tree. Every claim marked CONFIRMED in this report traces to one of these or to a direct file read during the two verification passes.

```sh
# 1. Complete disk-write enumeration in shipped src (persistence inventory completeness)
grep -rn "writeFileSync\|appendFileSync\|createWriteStream" src --include="*.ts" | grep -v "__tests__" | grep -v "\.test\."
# → cli.ts 1314/1773/2101-2107/2830-2833/2926-2928; agent artifacts/storage; profiles; webhook storage-json;
#   agent.ts sessions-export; init/onboard/setup-webhook scaffolds. NOTHING ELSE.

# 2. findUnfinishedExecutions production callers (G10)
grep -rn "findUnfinishedExecutions" src scripts | grep -v "\.test\."
# → only the definition: src/agent/ledger.ts:204

# 3. 'ledger' session events never emitted (G12)
grep -rn "'ledger'" src/agent --include="*.ts" | grep -v "\.test\."
# → contracts.ts:259 (type), schemas.ts:297 (ajv enum), storage.ts:36 (ledgerDir — unrelated)

# 4. sanitizeForLog coverage (redaction scope claim)
grep -rn "sanitizeForLog" src --include="*.ts" | grep -v "\.test\." | grep -v "utils.ts"
# → client.ts:1256,1257,1344 (debug lines) + logger.ts:15,52 (logger payloads). NOT hooks, NOT --json.

# 5. Hook signatures + call sites (§3)
grep -n "onRequest\|onResponse\|onThrottle" src/client.ts
# → definitions 83/84/86; wrapper 1101-1118; calls 1194, 1260, 1348

# 6. No logging/DB frameworks (§4/§5 NOT FOUND claims)
grep -n "\"dependencies\"" -A6 package.json        # @clack/prompts, ajv, commander, qrcode only
grep -rn "winston\|pino\|bunyan\|lowdb\|level(\|prisma\|typeorm\|sequelize" src --include="*.ts" | grep -v "\.test\."
# → no hits (sqlite only in webhook/ via optional peer dep)
```

Additional direct reads performed during verification: `client.ts:925-1424` (extractTraceId, resolveConfig debug path, full `_executeFetch`), `agent/ledger.ts` (full), `agent/orchestrator.ts:440-529`, `agent/executor.ts:78-153`, `agent/contracts.ts:240-309`, `webhook/server.ts` (full), `webhook/storage.ts` (full), `logger.ts` (full), `auth.ts:55-135`, `constants.ts:35-74`, `utils.ts` export map, `cli.ts` regions 321-385 / 2085-2145 / 2285-2348, `scripts/sandbox-integration-test.ts:40-200`, `HANDOFF.md` §1.

**Line-number caveat:** sub-agent exploration reports contained line estimates; all citations above were re-derived from the working tree. Post-audit edits to `cli.ts`/`types.ts` (e.g., the concurrent payment-link work) will shift anchors — re-grep before relying on exact numbers in future sessions.

