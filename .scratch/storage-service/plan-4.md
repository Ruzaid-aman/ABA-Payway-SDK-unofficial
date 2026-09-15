# Storage Wave 4 — Token Hardening (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline execution —
> subagent dispatch unavailable on the free-model quota). Steps use checkbox (`- [ ]`) syntax.

**Goal:** The local linked-token store becomes lifecycle-aware: `cof token remove` prunes the local
copy on gateway success, every surface shows the ~90-day expiry state, `cof charge --ctid` refuses
locally-expired tokens, and `cof token renew` restarts the expiry window on the stored record.

**Architecture:** Reuse the existing TD-10 helpers (`computeTokenExpiry`, `daysUntilTokenExpiry`,
`TOKEN_VALIDITY_DAYS` in src/utils.ts — docs/09 §4a) — no new expiry math. One new record field
(`renewedAt?`), one new pure helper (`tokenExpiryStatus`), one new store helper
(`markTokenRenewed`), and four CLI wirings. SQLite store gains a duplicate-tolerant `renewed_at`
column (mirrors the callbacks migration pattern). The pwt stays plaintext-by-design (decision made:
encryption deferred; data root is now outside the repo). The gateway remains authoritative —
expiry is a client-side guard with an existing escape hatch (`cof charge --token` bypasses local
resolution entirely).

**Tech Stack:** TypeScript, vitest, commander; loopback HTTP receivers for CLI wiring tests
(cli-cof-token-store.test.ts pattern).

**Spec:** `.scratch/storage-service/plan-4.md` (this file); decisions in the 2026-09-13 conversation.

## Global Constraints

- Work in worktree `D:/Antigravity_google/SDK-prepration-storage-wt`; branch `storage/token-hardening`
  off merged main (bc82b07). Worktree tree must be clean before branching.
- Docs facts: token validity is ~90 days from grant/renewal (docs/09 §4a; ABA has not confirmed
  89/90/91 — never assume charges work on the boundary day; renewal trigger at daysLeft ≤ 7).
  "Expired tokens cannot be charged" is docs-backed — the `cof charge --ctid` guard may hard-fail.
- `--json` stdout stays exactly one JSON document: local-store side notes go to STDERR (F11 rule).
- Gateway failures NEVER prune/update the local store (local writes only after confirmed success).
- Fail-open: local-store write failures never turn a successful gateway call into a CLI error.
- `npm run build` before vitest; commit only own files; conventional commits.

---

### Task 0: Branch

- [ ] `git status --porcelain` clean (tracked) → `git checkout -b storage/token-hardening`

### Task 1: `renewedAt` field + `tokenExpiryStatus` helper (JSON store)

**Files:**
- Modify: `src/webhook/token-store.ts` (record field + helper after `removeLinkedTokens`)
- Test: `src/__tests__/cof-token-capture.test.ts`

**Interfaces (produced):**
```ts
// LinkedTokenRecord gains: readonly renewedAt?: string;
export type TokenExpiryStatus = 'valid' | 'expiring-soon' | 'expired' | 'unknown';
export function tokenExpiryStatus(
  record: Pick<LinkedTokenRecord, 'capturedAt'> & { renewedAt?: string },
  now?: Date,
): { status: TokenExpiryStatus; daysLeft: number | null; expiresAt: Date | null };
```
Anchor = `renewedAt ?? capturedAt`; missing both → `{status:'unknown', daysLeft:null, expiresAt:null}`.
`expiresAt = computeTokenExpiry(anchor)`; `daysLeft = daysUntilTokenExpiry(expiresAt, now)`;
`daysLeft <= 0` → 'expired'; `daysLeft <= 7` (docs renewal trigger) → 'expiring-soon'; else 'valid'.

- [ ] TDD: expired (capturedAt = now-91d), boundary day (now-90d → daysLeft 0 → expired),
  expiring-soon (now-85d → 5 left), valid (fresh), renewedAt overrides old capturedAt (captured 100d
  ago + renewed 1d ago → valid), unknown (no timestamps — construct record cast).
- [ ] commit `feat(cof): tokenExpiryStatus helper + renewedAt on linked-token records`

### Task 2: SQLite `renewed_at` column

**Files:**
- Modify: `src/webhook/token-store-sqlite.ts`
- Test: `src/__tests__/token-store-sqlite.test.ts`

- [ ] `prepareLinkedTokensSchema` includes `renewed_at TEXT` in CREATE TABLE for NEW dbs AND calls a new
  `export function ensureRenewedAtColumn(db: SqliteDb): void` (ALTER TABLE ADD COLUMN renewed_at TEXT;
  swallow only 'duplicate column name' + 'renewed_at', mirroring ensureKhqrMetadataColumn) for dbs
  created by wave-3 builds.
- [ ] `rowToRecord` maps `renewed_at → renewedAt`; `save` writes it.
- [ ] TDD: round-trip renewedAt; latestForCtid returns it; migration path (hand-create old-schema db via
  raw `CREATE TABLE linked_tokens (...)` without the column, run prepare, save/load works).
- [ ] commit `feat(cof): renewed_at column on the sqlite linked-token store (with migration)`

### Task 3: `cof token renew` restarts the local expiry window

**Files:**
- Modify: `src/webhook/token-store.ts` (helper)
- Modify: `src/cli.ts` renew action (after gateway success, ~line 4379 block)
- Test: `src/__tests__/cof-token-capture.test.ts` (helper) + `src/__tests__/cli-cof-token-store.test.ts` (CLI wiring)

**Interfaces (produced):** `markTokenRenewed(ctid: string, pwt: string, renewedAt?: string, dir?: string, env?): LinkedTokenRecord | undefined`
— find the (ctid,pwt) record; NOT found → undefined (never fabricate partial records); found → atomic
rewrite with `renewedAt` set (default now) and ALL other fields preserved.

- [ ] Helper TDD: preserves tokenFlag/requestId/extraFields; returns undefined for unknown (ctid,pwt).
- [ ] CLI: after gateway success (both human and --json paths, BEFORE printing result so --json stdout
  stays pure — write the local note to stderr): `markTokenRenewed(...)`; human line
  `✓ Local store: expiry window restarted` or dim `local store: token not tracked locally — nothing to update`;
  stderr under --json. Local write failures: warn once, never fail the command (try/catch).
- [ ] CLI wiring test: loopback receiver answers the renew endpoint; run `cof token renew ...`; assert the
  stored record gained renewedAt and other fields survived.
- [ ] commit `feat(cof): token renew restarts the local expiry window (markTokenRenewed)`

### Task 4: `cof token remove` prunes the local store

**Files:**
- Modify: `src/cli.ts` remove action (~line 4436 block)
- Test: `src/__tests__/cli-cof-token-store.test.ts`

- [ ] After gateway success: `const pruned = removeLinkedTokens(ctid, pwt)` (import exists from wave 3).
  Human: `✓ Local store: removed 1 captured token` / dim `local store: no captured copy`.
  --json: stderr note (`local-store-pruned: <n>`). Wrap in try/catch (fail-open).
- [ ] Wiring test: seed store with the pwt, loopback answers remove, run CLI, assert `loadLinkedTokens()` no
  longer contains it; also assert a gateway-failure path (receiver 403) leaves the store INTACT.
- [ ] commit `feat(cof): token remove prunes the local store after gateway success`

### Task 5: `cof token list` shows expiry state

**Files:**
- Modify: `src/cli.ts` list action (~line 4465 block)
- Test: `src/__tests__/cli-cof-token-store.test.ts`

- [ ] Human: per record add `expiry:` bit — `✓ valid (89d left)` / `⚠ expiring soon (5d left)` /
  `✗ EXPIRED (12d ago)` / `– unknown` — via tokenExpiryStatus + formatDate of expiresAt (short ISO date).
- [ ] `--json`: each token gains `expiry: { status, daysLeft, expiresAt }` (expiresAt ISO string or null).
- [ ] TDD: seed three tokens (fresh, capturedAt = now-85d, now-91d) via saveLinkedToken capturedAt override;
  assert badge strings and --json expiry fields.
- [ ] commit `feat(cof): token list surfaces expiry state (human + json)`

### Task 6: `cof charge --ctid` refuses locally-expired tokens

**Files:**
- Modify: `src/cli.ts` charge --ctid resolution (~line 4470 `latestTokenForCtid` block)
- Test: `src/__tests__/cli-cof-token-store.test.ts`

- [ ] After resolving the stored token: `tokenExpiryStatus(stored)` —
  'expired' → red `✗ Captured token for <ctid> expired (<Nd> ago, docs/09 ~90-day validity)` +
  hint `renew it (cof token renew) or re-link, or charge with an explicit --token` → exit 1 (validation),
  NO gateway call; 'expiring-soon' → yellow warning line, proceed; 'valid' → existing line + `(Nd left)`;
  'unknown' → proceed silently.
- [ ] TDD: seed expired token → run charge with receiver NOT started → expect exit 1 + message, and no
  fetch attempt; expiring-soon token → warning text present, charge proceeds to the loopback receiver;
  fresh token → no warning.
- [ ] commit `feat(cof): charge --ctid refuses locally-expired tokens (docs/09 guard)`

### Task 7: Docs + handoff + corpus

- [ ] `docs/09-link-unlink-renew-lifecycle.md` §4a: add "The CLI tracks this for you" paragraph (list/charge/renew/remove behaviors).
- [ ] `docs/21-storage-service.md`: token lifecycle note (renewedAt field, expiry guard, remove sync).
- [ ] `AGENTS.md` canonical `cof token` lines + HANDOFF wave-4 bullet (same worktree; skills deliberately
  NOT updated this wave — defer to the next skills-alignment pass).
- [ ] `npm run sync:knowledge`.
- [ ] commit `docs(cof): token lifecycle now enforced locally (docs 09/21, agents, handoff); corpus resync`

### Task 8: Full verification

- [ ] `npm run build`; `npx vitest run` (full, separate from the build command); `npm run lint`.
- [ ] Memory update (wave 4 shipped) + final report.
