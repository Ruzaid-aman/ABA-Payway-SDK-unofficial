# Pillar A — Architectural Fidelity (30%)

## A.1 State Management
| Test | Result | Evidence |
|---|---|---|
| A.1.1 Unique request ids for concurrent links | ⚠️ PARTIAL | `LinkAccountParams.requestId` is caller-supplied and only null-checked (`credentials-on-file.ts:37-39`); uniqueness/auto-generation is **caller responsibility**. Server enforces `[a-zA-Z0-9]{5,24}` (`campaign-scopes-evidence.json:46`). |
| A.1.2 Idempotent retry with same `tran_id` | ✅ PASS (design) | Transport retries only transient statuses; business layer is non-retryable (`client.ts:714-719`), so identical-id resubmission cannot double-fire silently. Gateway-side idempotency unverifiable without live charge. |
| A.1.3 Token state transitions (active→frozen→removed) | 🛑 BLOCKED | Cannot exercise frozen-state payments until R-04/05/06 hash issue resolves. Lifecycle docs map states correctly (`docs/09:66-74`). |
| A.1.4 Local cache TTL vs 90-day expiry | ⚠️ PARTIAL | SDK holds **no** token cache/expiry model by design; expiry tracking is merchant-side (`docs/09:121-124`). Renewal path exists but blocked (see above). |
| A.1.5 State persistence across CLI restarts | ✅ PASS | CLI config/profile layer (`src/config/profiles.ts`) + untracked `.env`; `git ls-files` confirms no `.env` tracked. QR lifecycles persisted as JSON artifacts under `test-output/`. |

Poller correctness (bonus evidence for lifecycle state machine): terminal-status set, graceful
`NOT_FOUND` grace-period yield without consuming error budget, duration + consecutive-error caps
(`checkout.ts:373-451`). Matches the "callback ordering async" implicit constraint.

## A.2 Interface Compliance
| Test | Result | Evidence |
|---|---|---|
| A.2.1 Malformed JSON handling (inbound) | ✅ PASS | Non-JSON gateway bodies raise diagnosable parse errors incl. content-type + HTML hint + snippet (`client.ts:693-695`, CHANGELOG 2026-08 entry). |
| A.2.2 Unexpected fields | ✅ PASS | `filterParams` strips undefined/null (`utils.ts:187-195`); payload is closed-set per typed interface, no key-passthrough. |
| A.2.3 Empty `callback_url` fallback | ✅ PASS | Optional & omitted, never empty-string sent; portal-default fallback documented (`docs/SANDBOX-FINDINGS.md:269`). |
| A.2.4 Invalid `token_flag` | ⚠️ PARTIAL | `tokenFlag?: string` accepts arbitrary strings client-side (`client.ts:115,125,143`); only the OpenAPI schema documents enums; SDK does not pre-validate → server roundtrip required. |
| A.2.5 Max-length boundary inputs | ⚠️ PARTIAL | `transactionId` strictly ≤20 + charset-guarded (`utils.ts:39-53`); `requestId`/`ctid` lack the equivalent 5–24/[a-zA-Z0-9] guards the sandbox enforces → late server errors instead of fail-fast. |
| Content-Type fidelity (implicit) | ✅ PASS | JSON vs form-urlencoded switched per-endpoint (`client.ts:757`, `:772-779`, `:821`); linkCard uses urlencoded matching real gateway, superseding the plan's multipart assumption. |

## A.3 Dependency Isolation
| Check | Result | Evidence |
|---|---|---|
| Runtime dependency audit | ❌ FINDING | `npm audit --omit=dev`: **fast-uri 3.0.0–3.1.4 HIGH** (host-confusion ×2 advisories, GHSA-v2hh-gcrm-f6hx / GHSA-7p8r-x3mc-p8w7) pulled via ajv/openapi chain; **ajv moderate** (ReDoS `$data`). Both have `npm audit fix` resolutions available. |
| Lockfile & reproducibility | ✅ PASS | `package-lock.json` present; direct deps pinned with carets; engines `>=18`. |
| Unnecessary dependencies | ⚠️ REVIEW | Runtime set is small (7), but `canvas@3` (native build toolchain) ships as a runtime dep solely for offline-QR decode; suggest optional peer/moved-to-dev to shrink install surface & attack surface. |
| Vendoring / resolution | ✅ PASS | All packages resolve from registry with integrity hashes; no vendored blobs; `.kilo/package-lock.json` is tool-local and irrelevant to consumers. |

**Sub-scores:** Schema compliance 7/10 · State mgmt 7/10 · Dependency isolation 3/5 · Interface patterns 5/5 → **22/30**
