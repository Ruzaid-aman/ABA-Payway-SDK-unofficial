# Pillar B — Error Handling & Resilience (25%)

## B.1 Error Taxonomy
| Plan category | Shipped surface | Verdict |
|---|---|---|
| Authentication failure (invalid hash / unauthorized merchant) | `PayWaySignatureError`, `PayWayBusinessError` w/ gateway hints (`constants.ts:138-156`: code 1 “Wrong Hash”, 8 “merchant_id not found”, 26 invalid profile) | ✅ Granular |
| Rate limiting | `PayWayRateLimitError`; sandbox’s undocumented **HTTP 403 + numeric body code 429** shape is decoded into the typed class (CHANGELOG v1.4 entry, `client.ts:295-300`) | ✅ Surpasses plan assumption |
| Network timeout | `createNetworkError` distinguishes AbortError (`client.ts:268-272`) from generic failures | ✅ |
| Invalid input | Local `PayWayConfigError` fail-fast validators (`credentials-on-file.ts:37-46,164-172`, `utils.ts`) + server field-map surfaced in `rawBody.status.errors` (`docs/09:190`) | ✅ Field-specific |
| Server error 5xx | Retryable classification incl. `statusCode >= 500` (`client.ts:715-719`) | ✅ |
| Token state error (HTTP 200 ≠ "00") | `checkResponseError` → `PayWayBusinessError` non-retryable (`client.ts:216-265`) — covers `status.code` object, string-status and bare-code shapes | ✅ |

Dedicated terminal poller error `PollingAbortedError` carries machine-readable abort reasons
(`errors.ts:83-118`). Full hierarchy: Config / API / Business / Network / RateLimit / Signature /
Webhook / PollingAborted — taxonomy breadth exceeds plan minimums.

## B.2 Recovery Logic
| Behavior | Finding | Verdict |
|---|---|---|
| Exponential backoff | `retryDelayMs * 2 ** attempt` (`client.ts:735,737`); defaults maxRetries 3 / base 3000 ms doc-consistent with QR-REQ-11 spec | ✅ |
| Jitter | **Absent** — deterministic delays can synchronize fleets (thundering herd) | ❌ GAP (plan-required) |
| Circuit breaker | **Absent** — consecutive-failure open/half-open logic exists only *inside* the poller (`maxConsecutiveErrors`), not in transport | ⚠️ PARTIAL |
| Rate-limit-aware pacing | Honors `Retry-After` when present; else paces off own observed request window clamped 1–10 s for documented-limit endpoints, exponential fallback otherwise (`client.ts:722-739`, `_recordRecentCall :600-609`) | ✅ Distinctive strength |
| Tiered timeouts | Single `AbortController` deadline only (default 30 s, env/config-overridable `PAYWAY_TIMEOUT` `client.ts:534,664-673`). No connect/read/write split, no global-deadline | ⚠️ PARTIAL |
| Max attempts cap | Hard `maxRetries` bound + terminal `'Retry limit exceeded'` (`client.ts:671,749`) | ✅ |

## B.3 Logging & Observability
| Test | Result | Evidence |
|---|---|---|
| B.3.1 Level configurability | ⚠️ | Binary debug switch only (`DEBUG_PAYWAY=true/1` read once at construction `client.ts:535`); no INFO/WARN/ERROR levels, not hot-reloadable without restart. |
| B.3.2 Structured JSON logging | ⚠️ | Payload objects emitted through `sanitizeForLog` to `console.debug` with plain-text prefix (`client.ts:562-568`) — parseable after prefix-strip, not line-level JSON schema. |
| B.3.3 Trace propagation | ❌ | No `trace_id`/correlation injection beyond endpoint name; PayWay responses carry `trace` per OpenAPI types (`types.ts:181`) but nothing logs it systematically. |
| B.3.4 Sensitive-data masking | ✅/⚠️ | Key-based redaction of 13 secrets incl. `pwt`, `hash`, `api_key`, `x-payway-hmac-sha512` (`utils.ts:197-228`), unit-covered. Residual risk: blocklist approach misses key-shaped values under novel keys (e.g. `secretField`). |
| B.3.5 Failed-signature visibility | ✅ | Webhook listener logs valid/invalid signature outcome + source IP + record id (`server.ts:120-137`); KHQR route logs parse metadata separately (`:88-115`). |

**Sub-scores:** Taxonomy 9/10 · Retry/backoff 5/8 · Logging quality 4/7 → **18/25**

Top remediations: add jittered backoff (+ full-jitter option), transport-level circuit breaker,
tiered deadlines, structured logger w/ levels + trace correlation.
