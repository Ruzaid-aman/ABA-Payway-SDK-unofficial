# SDK Audit & AI-Friendliness Improvement Plan

**Date:** 2026-07-18
**Auditor:** Kilo
**Scope:** Developer Experience (DX) & AI Coding Assistant Friendliness
**Constraint:** Read-only audit. Implementation plan for a follow-up agent.

---

## 1. Executive Summary

`aba-payway-sdk` (v0.2.35) is simpler but has invested heavily in **AI agent skill distribution** and **developer onboarding ergonomics**. Our SDK (`aba-payway-ts`, v1.0.0) has superior architecture (strict TypeScript, decoupled tri-module design, offline KHQR, shared contract) but lags in **AI-first tooling**, **environment-variable ergonomics**, and **skill-based knowledge packaging**.

The single biggest differentiator: `aba-payway-sdk` ships **~569 KB of AI agent skills** (20 SKILL.md files) with a CLI installer. This makes it immediately "AI-friendly" out of the box.

---

## 2. High-Level Comparison

| Dimension | `aba-payway-sdk` (v0.2.35) | `aba-payway-ts` (v1.0.0) |
|-----------|---------------------------|-------------------------|
| **Language** | TypeScript → JS runtime | TypeScript strict, native ESM+CJS |
| **Architecture** | Single `PayWayClient` facade | Tri-module decoupled (server / client-handler / test) |
| **API Surface** | ~20 methods, simplified names | 7 domains, ~50+ methods, lower-level |
| **Dependencies** | `axios`, `form-data` | `qrcode` only (zero deps for core) |
| **AI Skills** | 20 SKILL.md files + CLI installer | `.agents/AGENTS.md` (33 lines, project rules only) |
| **Debug Mode** | Built-in sanitized request/response logging | None (consumer must use external tools) |
| **Env Auto-Discovery** | `PAYWAY_*` env vars with fallbacks | Constructor-only config |
| **Error Taxonomy** | 4 typed classes with `instanceof` | 5 typed classes, single `PayWayAPIError` for HTTP |
| **Documentation** | README + per-skill deep dives | 15-chapter `docs/` + STRIPE-STANDARD-DX-AUDIT |
| **Tests** | `test-simple.js` only | 136 Vitest tests |
| **Runtime Targets** | Node ≥14 | Node ≥18, Next.js, Cloudflare Workers |

---

## 3. What `aba-payway-sdk` Does Better

### 3.1 AI Agent Skill System (⭐ Critical)
- 20 granular `SKILL.md` files with YAML frontmatter for AI discovery.
- Progressive disclosure: lightweight frontmatter → heavy body loaded on demand.
- CLI installer: `npx aba-payway-sdk skills add claude` copies into `~/.claude/skills/`.
- Supports: Claude, Copilot, Cursor, Codex, OpenCode.
- Each skill: ~8–57 KB with React, Express, Next.js examples.

### 3.2 Environment Variable Auto-Discovery
```typescript
// Works with zero config if env vars are set
const client = new PayWayClient();
```
Reads: `PAYWAY_MERCHANT_ID`, `PAYWAY_API_KEY`, `PAYWAY_RSA_PUBLIC_KEY`, `PAYWAY_BASE_URL`, `PAYWAY_SANDBOX`, `DEBUG_PAYWAY`.

### 3.3 Built-In Debug / Sanitized Logging
`debug: true` (or `DEBUG_PAYWAY=true`) logs all HTTP requests/responses with secrets masked as `***HIDDEN***`.

### 3.4 Per-Method Rich JSDoc
Every public method has `@example`, `@throws`, use-case descriptions, and **embedded rate limits**.

### 3.5 Simpler Mental Model
One class, ~20 methods, camelCase, sensible defaults.

---

## 4. What `aba-payway-ts` Does Better

| Strength | Detail |
|----------|--------|
| **Type Safety** | `strict: true`, OpenAPI-generated `types.ts` |
| **Architecture** | Decoupled tri-module design |
| **Offline KHQR** | Native TLV/CRC-16 generator |
| **Test Coverage** | 136 Vitest tests |
| **Documentation Depth** | 15-chapter guide, glossary, versioning |
| **RSA + HMAC** | Correct chunked RSA encryption |
| **Retry & Rate-Limit** | Exponential backoff, rate-limit parsing |
| **Multi-Runtime** | Node, Bun, Deno, Cloudflare Workers |

---

## 5. Recommended Actions (Prioritized)

### P0 — AI / Skill System (Highest Impact)

| # | Action | Details |
|---|--------|---------|
| 1 | **Create `skills/` directory with 20 SKILL.md files** | One per major use case. YAML frontmatter (`name`, `description`) + examples. See §7 for file list. |
| 2 | **Add `skills` CLI command to `cli.ts`** | Implement `payway-sdk skills add <agent...>`, `remove`, `list`, `help`. Mirrors their CLI pattern. |
| 3 | **Ship skills in npm package** | Add `skills/` to `files` array in `package.json` or copy to `dist/` during build. |
| 4 | **Enrich `.agents/AGENTS.md`** | Add SDK usage examples (not just rules). |

**Decision: Skills directory location**
- **Chosen:** `skills/` at repo root.
- **Rationale:** Matches their package layout. Easy to maintain. CLI reads from `path.join(packageRoot, 'skills')`. Must be added to `files` in `package.json` so it ships in npm tarball.

**Decision: How to make skills available to built CLI**
- **Chosen:** Add `skills/` to `files` array in `package.json`. The CLI resolves skills relative to `__dirname` of `dist/cli.js`, which after npm install will be `node_modules/aba-payway-ts/dist/cli.js`. Package root is two levels up: `path.join(__dirname, '..', 'skills')`.
- **Rationale:** No build step needed. Skills ship as-is.

**Decision: Skill naming prefix**
- **Chosen:** `aba-payway-<feature>` (e.g., `aba-payway-purchase`).
- **Rationale:** Matches their convention. Avoids collision with other SDK skills.

### P1 — Developer Ergonomics

| # | Action | Details |
|---|--------|---------|
| 5 | **Environment variable auto-discovery** | Make `merchantId` and `apiKey` optional in `PayWayConfig`. Resolve from `process.env.PAYWAY_MERCHANT_ID` / `process.env.PAYWAY_API_KEY` at runtime if missing. Also support `PAYWAY_SANDBOX`, `PAYWAY_BASE_URL`, `PAYWAY_RSA_PUBLIC_KEY`. |
| 6 | **Built-in debug/sanitized logging** | Leverage existing `onRequest` / `onResponse` hooks in `PayWayConfig`. Add `debug?: boolean` config option. When enabled, automatically attach a hook that logs method, URL, and sanitized body. |
| 7 | **Embed rate limits in JSDoc** | Add `@rateLimit` tags to domain methods that hit PayWay's throttling. |

**Decision: Env var names**
- **Chosen:** `PAYWAY_MERCHANT_ID`, `PAYWAY_API_KEY`, `PAYWAY_RSA_PUBLIC_KEY`, `PAYWAY_BASE_URL`, `PAYWAY_SANDBOX` (`true`/`false`), `PAYWAY_TIMEOUT` (ms).
- **Rationale:** Matches their naming convention exactly.

**Decision: Debug implementation approach**
- **Chosen:** Add a `debug?: boolean` field to `PayWayConfig`. When true, attach `onRequest` and `onResponse` hooks that log to `console.debug` with sanitization. Do NOT add new logger dependency.
- **Rationale:** Uses existing hooks. Zero new dependencies.

### P2 — Documentation & Packaging

| # | Action | Details |
|---|--------|---------|
| 8 | **Fill `docs/QUICK-START-1-PAGER.md`** | Single-page onboarding: install, init, first transaction, webhook. |
| 9 | **Add `skills/` to `files` in `package.json`** | Ensure skills ship in npm tarball. |
| 10 | **Consolidate error taxonomy docs** | Document each `PayWay*Error` subclass with when it's thrown. |

### P3 — API Surface Simplification

| # | Action | Details |
|---|--------|---------|
| 11 | **Promote `sdk` facade as primary docs entry point** | Already exists. Update README to lead with `sdk.initiate()` / `sdk.handle()` pattern instead of raw `PayWay` class. |
| 12 | **Support `new PayWay()` with env vars only** | After P0 #5, this works automatically. Document it. |

---

## 6. Concrete Skill File Plan (20 Files)

| Skill Name | Source | Priority |
|------------|--------|----------|
| `aba-payway-purchase` | `checkout` domain | P0 |
| `aba-payway-qr` | `qr` + `khqr-offline` | P0 |
| `aba-payway-transaction-detail` | `checkout` | P0 |
| `aba-payway-check-transaction` | `checkout` | P0 |
| `aba-payway-transaction-list` | `checkout` | P0 |
| `aba-payway-transaction-close` | `checkout` | P0 |
| `aba-payway-refund` | `checkout` | P0 |
| `aba-payway-pre-auth` | `preAuth` | P0 |
| `aba-payway-payment-link` | `paymentLink` | P0 |
| `aba-payway-payout` | `payout` | P0 |
| `aba-payway-token-purchase` | `credentialsOnFile` | P1 |
| `aba-payway-link-account` | `credentialsOnFile` | P1 |
| `aba-payway-link-card` | `credentialsOnFile` | P1 |
| `aba-payway-remove-account` | `credentialsOnFile` | P1 |
| `aba-payway-remove-card` | `credentialsOnFile` | P1 |
| `aba-payway-hash` | `auth` | P1 |
| `aba-payway-exchange-rate` | `checkout` | P1 |
| `aba-payway-offline-qr` | `khqr-offline` | P1 |
| `aba-payway-sdk-configuration` | `client` | P2 |
| `aba-payway-test-harness` | `test` | P2 |

---

## 7. Skill File Template

```markdown
---
name: aba-payway-<feature>
description: <one-line description for AI discovery>
---

# <Feature Name>

## Quick Start
<2-3 line copy-paste example>

## Complete Example
<full working code with error handling>

## Parameters
| Param | Type | Required | Description |

## Common Use Cases
- <Scenario 1>
- <Scenario 2>

## Error Handling
```typescript
try { ... } catch (error) {
  if (error instanceof PayWay<Specific>Error) { ... }
}
```

## Related Skills
- [aba-payway-<related>](../aba-payway-<related>/SKILL.md)
```

---

## 8. CLI Command Design

```
payway-sdk skills add <agent...>     # Install skills for agents
payway-sdk skills remove <agent...>  # Remove skills for agents
payway-sdk skills list               # List installed skills
payway-sdk skills help               # Show help
```

**Supported agents:** `claude`, `codex`, `opencode`, `cursor`, `copilot`

**Install target directories:**
| Agent | Target Directory |
|-------|-----------------|
| claude | `~/.claude/skills/` |
| codex | `~/.codex/skills/` |
| opencode | `~/.opencode/skills/` |
| cursor | `~/.cursor/skills/` |
| copilot | `~/.copilot/skills/` |

---

## 9. Risk Assessment

| Risk | Mitigation |
|------|-----------|
| **Skill maintenance burden** | Skills are Markdown only. Low maintenance. |
| **Package size** | Skills add ~100-200 KB estimated. Acceptable for DX gain. |
| **Skill accuracy drift** | Add `@since` tags in YAML frontmatter. |
| **Env var security** | Document that env vars should not be committed. Env vars are standard practice. |
| **Breaking change risk** | Making config fields optional is backward-compatible. |

---

## 10. Validation Plan

1. **Skills install test:** Run `payway-sdk skills add claude` and verify files land in `~/.claude/skills/`.
2. **AI smoke test:** Ask Claude/Copilot "How do I create a PayWay QR code?" and verify skill activation.
3. **Discovery test:** Verify YAML frontmatter `description` is sufficient for AI to select the right skill.
4. **Package size check:** Verify npm tarball increase is acceptable.
5. **Regression test:** Ensure all 136 Vitest tests pass.
6. **Env var test:** Verify `new PayWay({})` works with only env vars set.
7. **Debug mode test:** Verify `debug: true` logs sanitized request/response data.

---

## 11. Out of Scope

- Changing the tri-module architecture
- Adding new API endpoints not already covered
- Modifying the OpenAPI spec or `types.ts` generation
- Changing the npm package name or binary name

---

*No source code was modified during this audit.*

---

## 12. Implementation Playbook and Status

**Implementation status:** Core P0-P2 work and the full release gate are complete as of 2026-07-18. The package is ready for final artifact review and approved publication.

### Completed implementation

1. **Skill distribution**
  - Created 20 skill folders at `skills/aba-payway-*/SKILL.md` plus `skills/README.md`.
  - Each guide includes YAML discovery metadata (`name`, `description`, `version`), a TypeScript quick start, error handling, and related skills.
  - The account/card removal guides correctly use the existing unified `credentialsOnFile.removeToken()` API.
  - The offline QR guide explicitly distinguishes its TLV/CRC-16 payload from online HMAC API calls and warns that it has no webhook/reconciliation support.
  - The webhook guide correctly documents `X-PAYWAY-HMAC-SHA512` as the signature header.

2. **Skills CLI**
  - Extended `src/cli.ts` with `payway-sdk skills add <agent...>`, `remove`, `list`, and `help`.
  - Supported targets: `claude`, `codex`, `opencode`, `cursor`, and `copilot`.
  - Uses Node standard library APIs only; recursive installation overwrites SDK-owned skill folders.
  - Removal is deliberately scoped to directories named `aba-payway-*`, preserving unrelated agent content.
  - Source location resolves from the executing CLI path, so both `tsx src/cli.ts` and published `dist/cli.js` locate the package-root `skills/` folder without an ESM/CJS `import.meta` warning.

3. **Environment configuration and diagnostics**
  - `PayWayConfig.merchantId` and `apiKey` are optional at the public boundary; `PayWay` resolves and validates final values before creating domain clients.
  - Resolution precedence is explicit options, then `PAYWAY_*` variables, then existing defaults.
  - Implemented `PAYWAY_MERCHANT_ID`, `PAYWAY_API_KEY`, `PAYWAY_RSA_PUBLIC_KEY`, `PAYWAY_BASE_URL`, `PAYWAY_SANDBOX`, `PAYWAY_TIMEOUT`, and `DEBUG_PAYWAY`.
  - `PAYWAY_SANDBOX=true` chooses sandbox; `false` chooses production. Invalid timeout values are ignored.
  - Added `debug?: boolean`; `debug: true` or `DEBUG_PAYWAY=true|1` attaches sanitized request/response diagnostics while preserving user-supplied hooks.
  - Added `sanitizeForLog()` in `src/utils.ts`, redacting API keys, hashes, merchant authorization, payment tokens, authorization values, card data, and CVVs as `***HIDDEN***`.

4. **Packaging and documentation**
  - `package.json` now ships `skills/`, adds the `ai-skills` keyword, and is versioned `1.1.0` for the additive release.
  - README, `.agents/AGENTS.md`, and `docs/QUICK-START-1-PAGER.md` cover skill installation, environment configuration, and debug mode.
  - Added JSDoc `@rateLimit` documentation for check transaction, transaction detail, transaction list, and refund.

5. **Automated coverage**
  - Added configuration/debug behavior assertions to `src/__tests__/client.test.ts`.
  - Added sanitizer coverage to `src/__tests__/utils.test.ts`.
  - Added `src/__tests__/skills.test.ts` to require exactly 20 skill directories and valid frontmatter/quick-start/error-handling sections.

### Validation completed

| Check | Result |
|---|---|
| Focused utilities test | Pass: 41 tests |
| Focused client test | Pass: 71 tests |
| Combined client + utilities tests | Pass: 112 tests |
| Skills structure test | Pass: 1 test |
| Changed-file Biome lint | Pass |
| `npm run build` | Pass, including declaration generation |
| Built `dist/cli.js` install/remove in temporary home | Pass: 20 skills copied and removed |
| `npm pack --dry-run` | Pass: all 20 skills included; tarball size 193.0 KB |
| Full Vitest suite | Pass: 204 tests across 11 files |
| Full Biome lint | Pass |
| Full TypeScript typecheck | Pass |

### Resolved release-gate defects

1. `src/__tests__/merchant-scenario-coverage.test.ts` TC-026 now reads the request body from the standard `fetch(url, options)` shape at `fetchSpy.mock.calls[0][1].body`; its duplicate `status` fixture key and duplicate assertion were also removed.
2. `src/__tests__/docs-examples.test.ts` now imports Vitest globals explicitly, and `src/__tests__/validation.test.ts` now gives Vitest spies strict callable signatures and removes obsolete `@ts-expect-error` directives.
3. The full release gate now passes: `npm run test` (204 tests), `npm run lint`, and `npm run typecheck`.

### Handoff sequence

1. Review the generated tarball contents and package metadata one final time.
2. Publish the additive `1.1.0` release only after approval.
