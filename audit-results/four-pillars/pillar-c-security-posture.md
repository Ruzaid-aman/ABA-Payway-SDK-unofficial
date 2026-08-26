# Pillar C — Security Posture (30%)

## C.1 Credential Handling
| Requirement | Status | Evidence |
|---|---|---|
| No hardcoded credentials | 🛑 **FAIL** | **Committed sandbox API key** `[REMOVED-HISTORICAL-fab3d41ca176]` for merchant `ec476910` in `test-output/inspect-qr.mjs` (proven: `git show HEAD:test-output/inspect-qr.mjs`; working-tree grep finds exactly one tracked occurrence). Rubric zero-tolerance trigger #1. Merchant id also appears across ~25 committed docs/log artifacts (low sensitivity, hygiene note). |
| Env-var storage path | ✅ | Canonical config via `PAYWAY_MERCHANT_ID/PAYWAY_API_KEY/PAYWAY_RSA_PUBLIC_KEY` (`client.ts:538-540`); `.env` untracked (`git ls-files` negative). Startup credential gate (`envValidator.ts:127-155`) gives fail-fast CLI messaging. |
| Log leakage | ✅ | `sanitizeForLog` key-redaction verified above; tests cover debug-hook redaction (`audit-results/dimension-2.4.md:24-29`). |
| TLS enforcement | ✅ (core) | Only `https://` base URLs exist (`constants.ts:1-4`); Node fetch verifies certificates by default; **no** `rejectUnauthorized:false` anywhere in `src/`. The pattern exists solely in copied ABA boilerplate samples (`payway-boilerplate/payment_link_api/*`) — external-reference caveat. Sandbox self-signed chain workaround documented scoped-per-command only (`AGENTS.md:26-28`). |
| Cert pinning | ➖ N/A | Not implemented (not documented by ABA; acceptable). |

## C.2 Input Sanitization / Injection (CWE-oriented scan)
| CWE | Class expected | Result |
|---|---|---|
| CWE-798 Hardcoded creds | Critical | 🛑 **CONFIRMED** (above) |
| CWE-78 OS command injection | Critical | ✅ None — SDK transport constructs no shells; audit probes use explicit argv arrays (`startup-probe.ts spawnSync(..., {shell:false-equivalent})` only local tooling) |
| CWE-89 SQL injection | Critical | ✅ None — no SQL engine in runtime deps; webhook SQLite driver uses parameterized layer (`webhook/storage-sqlite.ts`) |
| CWE-79 XSS | High | ✅ None in SDK (no HTML assembly in `src/`); linkCard HTML passthrough returned untouched to caller responsibility (documented) |
| CWE-22 Path traversal | High | ⚠️ Low-risk surface — webhook file storage writes under operator-configured dir; no attacker-controlled filename joining found; recommend allowlist test |
| CWE-20 Improper input validation | High | ⚠️ Partial — strong for amount/currency/tran_id/URL schemes (`utils.ts` incl. `validatePublicHttpsUrl` rejecting localhost & non-HTTPS), weak parity for `request_id`/`ctid` charset-length rules enforced server-side |
| CWE-502 Deserialization | Critical | ✅ All inbound bodies parsed via guarded `JSON.parse` returning data-only (`client.ts:274-285`); no prototype-polluting revival, no class revival |
| CWE-327 Broken crypto | High | ✅ HMAC-SHA512 everywhere; RSA limited to PKCS1 as mandated by gateway; digest default base64 with hex opt-in — no MD5/SHA1/ECB |
| CWE-200 Info exposure | High | ✅ Error `toJSON()` includes rawBody deliberately (diagnosability) but sanitized paths keep secrets out; ensure consumers treat `rawBody.status.errors` echo safely |
| CWE-352 CSRF | Medium | ➖ Server-side SDK — n/a |

## C.3 Callback Signature Verification (deep dive)
Exact algorithm parity with plan's PHP reference: header `x-payway-hmac-sha512` extracted
(`server.ts:120`), body `hash` field deleted pre-canonicalization (`:125`), keys sorted ascending,
nested arrays/objects JSON-encoded, values concatenated, HMAC-SHA512-base64 computed, and —
critically — compared with **`crypto.timingSafeEqual` after constant-length guard** (`auth.ts:80-87`)
fulfilling the plan's timing-safety mandate. ✅

Hardening debt: capture server never rejects on bad signature by design (WH-TC-05, always-200
`server.ts:140-142`). Acceptable as a *capture sink*; production verdicts must come from merchants’
own handlers — document a `rejectInvalidSignature` opt-in mode (TD-09).

## C.4 Environment Variable Matrix vs plan §3.3
| Plan requirement | Status |
|---|---|
| Required vars validated at startup, clear messages | ✅ (`validateRequiredCredentials`) |
| Unknown-variable rejection | ❌ Absent (no unknown-key detection) |
| Secret-strength floor | ⚠️ Length <16 produces **warning**, not error (`envValidator.ts:60-68`) |
| Enum constraints (environment) | ✅ sandbox/production/URL forms (`envValidator.ts:46-58`) |

**Sub-scores:** Credential handling 2/12 · Input validation 7/10 · TLS/network 7/8 → **16/30**
(credential-handling score capped by the single automatic-fail finding).

Immediate actions: rotate the exposed sandbox key at ABA portal, purge blob from history
(filter-repo/BFG), delete artifact from HEAD, add gitleaks/trufflehog + pre-commit + CI gate.
