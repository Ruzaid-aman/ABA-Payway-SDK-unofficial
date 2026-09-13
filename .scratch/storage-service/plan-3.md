# Storage Wave 3 — StorageService Facade + Optional SQLite Backend (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline execution —
> subagent dispatch unavailable on free-model quota). Steps use checkbox (`- [ ]`) syntax.

**Goal:** One `createStorageService()` facade over the journal, linked-token, and webhook-capture
stores — JSON files by default, or a single shared SQLite database (`<data root>/payway.db`) when the
optional `better-sqlite3` peer dep is present — without changing any existing store contract.

**Architecture:** The facade composes the EXISTING store implementations for the JSON backend (same
functions the CLI uses — zero behavior change). For SQLite it opens ONE better-sqlite3 handle on
`<dataRoot>/payway.db` shared by three store impls: a new `SqliteJournalSink` (+ read/prune), a new
`SqliteLinkedTokenStore`, and the existing `SqliteWebhookStorage` adapted via a new `fromDb(db)`
static (schema-init extracted so `create(path)` and `fromDb(db)` share one prepare path). The journal
emitter's envelope-fill/validate/fail-open wrapper is extracted from `writer.ts` into
`createJournalEmitterForSink(sink, mode)` so both sinks share one write pipeline (D1/D3 rule: one
canonicalization, never duplicated). `better-sqlite3` is installed `--no-save` in the worktree
(approved via `npm install-scripts approve better-sqlite3` + `npx prebuild-install` inside the package
dir) so SQLite paths are tested HERE, not just skip-gated.

**Tech Stack:** TypeScript (NodeNext ESM), vitest (`maybeDescribe` driver-gating pattern), better-sqlite3@12 (optional peer, runtime `await import`).

**Spec:** `.scratch/storage-service/plan-3.md` (this file); roadmap + wave-1 state in
`memory/storage-service-gap-analysis-2026-09-13` and `.scratch/storage-service/plan.md`.

## Global Constraints

- Work in worktree `D:/Antigravity_google/SDK-prepration-storage-wt` on branch `storage/data-root-journal`.
- Never break existing contracts: `JournalSink` shape, `WebhookStorage` interface, `readJournalEvents`,
  token-store free functions, all join keys (correlationId / webhook record id).
- `better-sqlite3` stays OUT of package.json (optional peer, `--no-save` install only); all SQLite
  tests gated behind driver detection (`maybeDescribe`), JSON paths must work with the driver absent.
- Fail-open journal contract: a failing sink emit never breaks the caller (emitter wrapper try/catch).
- Commit only own files; conventional commits; verify `git branch --show-current` before staging.
- `npm run build` before vitest after src changes (staleness gate).

---

### Task 1: Extract `createJournalEmitterForSink` in writer.ts

**Files:**
- Modify: `src/journal/writer.ts:120-150` (extract the emit-wrapper from `createJournalEmitter`)
- Test: `src/__tests__/journal.test.ts` (add one test: a custom sink receives envelope-filled, validated events)

**Interfaces (produced):** `createJournalEmitterForSink(sink: JournalSink, mode: JournalMode): JournalContext`

- [ ] **Step 1:** failing test — custom in-memory sink gets `{version, ts, eventId, ...event}` and
  invalid events dropped:
```ts
it('createJournalEmitterForSink fills the envelope for any sink', () => {
  const seen: JournalEventV1[] = [];
  const emitter = createJournalEmitterForSink({ emit: (e) => seen.push(e) }, 'digest');
  emitter.emit({ kind: 'execution.request', correlationId: 'c-x', attempt: 0 });
  expect(seen).toHaveLength(1);
  expect(seen[0].version).toBe(JOURNAL_VERSION);
  expect(seen[0].eventId).toBeTruthy();
  expect(seen[0].correlationId).toBe('c-x');
});
```
- [ ] **Step 2:** run → FAIL (export missing)
- [ ] **Step 3:** refactor `createJournalEmitter` body into the exported function; delegate.
- [ ] **Step 4:** `npx vitest run src/__tests__/journal.test.ts` → PASS
- [ ] **Step 5:** commit `refactor(journal): sink-agnostic emitter factory createJournalEmitterForSink`

### Task 2: `SqliteJournalSink` + read + prune

**Files:**
- Create: `src/journal/sink-sqlite.ts`
- Test: `src/__tests__/journal-sink-sqlite.test.ts` (driver-gated `maybeDescribe`)

**Interfaces (produced):**
```ts
export interface SqliteDb { exec(sql: string): void; prepare(sql: string): { run(...params: unknown[]): { changes: number | bigint }; all(...params: unknown[]): unknown[]; get(...params: unknown[]): unknown }; close(): void; pragma(sql: string): void; }
export function prepareJournalSchema(db: SqliteDb): void;               // journal_events table + ts index
export class SqliteJournalSink implements JournalSink { constructor(db: SqliteDb); emit(event: JournalEventV1): void; }
export function readSqliteJournalEvents(db: SqliteDb): JournalFileRead; // {file: 'sqlite:<db>', events, malformed:0}
export function pruneSqliteJournal(db: SqliteDb, before: Date): JournalPruneResult;
```
Schema: `journal_events(seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE, ts TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL)` + index on ts. `emit` = `INSERT OR REPLACE` (idempotent per eventId, crash-safe). Read = `SELECT payload … ORDER BY seq`, JSON.parse each (defensive malformed count). Prune = `DELETE WHERE ts < cutoff` → changes.

- [ ] TDD: gated tests — emit→read round-trip preserves full payload; prune drops old keeps new; unknown-kind payloads tolerated on read (insert raw row with kind='future.kind').
- [ ] commit `feat(journal): SQLite journal sink with read + prune (optional peer dep)`

### Task 3: JSON token-store `removeLinkedTokens`

**Files:**
- Modify: `src/webhook/token-store.ts` (add free function after `latestTokenForCtid`)
- Test: `src/__tests__/cof-token-capture.test.ts`

**Interfaces (produced):** `removeLinkedTokens(ctid: string, pwt?: string, dir?: string, env?): number` —
deletes matching records (ctid only, or ctid+pwt), atomic rewrite, returns removed count.

- [ ] TDD: removes by ctid; removes only the matching pwt when given; missing store → 0.
- [ ] commit `feat(cof): removeLinkedTokens primitive (atomic, filtered)`

### Task 4: `SqliteLinkedTokenStore`

**Files:**
- Create: `src/webhook/token-store-sqlite.ts`
- Test: `src/__tests__/token-store-sqlite.test.ts` (driver-gated)

**Interfaces (produced):**
```ts
export function prepareLinkedTokensSchema(db: SqliteDb): void;
export class SqliteLinkedTokenStore {
  constructor(db: SqliteDb);
  load(): LinkedTokenRecord[];                       // ORDER BY rowid
  save(record: LinkedTokenRecord): LinkedTokenRecord; // INSERT OR REPLACE on (ctid,pwt)
  latestForCtid(ctid: string): LinkedTokenRecord | undefined;
  remove(ctid: string, pwt?: string): number;
}
```
Schema: `linked_tokens(ctid TEXT NOT NULL, pwt TEXT NOT NULL, link_type TEXT, token_flag TEXT, frequency TEXT, currency TEXT, request_id TEXT, extra_fields TEXT, captured_at TEXT NOT NULL, source_record_id TEXT, PRIMARY KEY(ctid,pwt))`.

- [ ] TDD: save/load round-trip incl. extraFields JSON; re-capture same (ctid,pwt) replaces in place (rowid order stable); latestForCtid; remove by ctid / ctid+pwt.
- [ ] commit `feat(cof): SQLite linked-token store`

### Task 5: `SqliteWebhookStorage.fromDb(db)`

**Files:**
- Modify: `src/webhook/storage-sqlite.ts` — extract the `CREATE TABLE callbacks … + ensure*Column` block
  (currently inline in `create`, lines ~136-152) into `export function prepareCallbacksSchema(db: SqliteDb): void`;
  `create()` calls it; add `static fromDb(db): SqliteWebhookStorage` (no close-ownership change — facade owns the handle).
- Test: existing `src/__tests__/webhook-storage-sqlite.test.ts` (now RUNS here — driver installed) + one new
  `fromDb` round-trip test in the gated file.

- [ ] Refactor + test; whole existing sqlite suite must stay green.
- [ ] commit `refactor(webhook): share callbacks schema prep; SqliteWebhookStorage.fromDb for shared handles`

### Task 6: `createStorageService` facade

**Files:**
- Create: `src/storage/storage-service.ts`
- Test: `src/__tests__/storage-service.test.ts` (JSON paths, unconditional) +
  `src/__tests__/storage-service-sqlite.test.ts` (driver-gated)

**Interfaces (produced):**
```ts
export type StorageBackend = 'json' | 'sqlite';
export interface StorageServiceOptions { dir?: string; backend?: StorageBackend | 'auto'; journalMode?: JournalMode; env?: NodeJS.ProcessEnv; }
export interface StorageService {
  readonly backend: StorageBackend;
  readonly mode: JournalMode;
  readonly paths: { dataRoot: string; journalFile: string; tokenStoreFile: string; webhookFile: string };
  readonly journal: { append(event: JournalEmitterInput): void; read(): JournalFileRead; prune(before: Date): JournalPruneResult };
  readonly tokens: { load(): LinkedTokenRecord[]; save(record: LinkedTokenRecord): LinkedTokenRecord; latestForCtid(ctid: string): LinkedTokenRecord | undefined; remove(ctid: string, pwt?: string): number };
  readonly webhooks: WebhookStorage;   // existing interface, whole
  close(): void;
}
export async function createStorageService(options?: StorageServiceOptions): Promise<StorageService>;
export async function probeStorageBackend(): Promise<StorageBackend>; // 'sqlite' iff better-sqlite3 importable
```
JSON assembly: `JsonlJournalSink({dir: root})` + emitter wrapper (Task 1), token free functions bound
to root/env (incl. Task 3 remove), `new JsonWebhookStorage(<root>/webhook_data/callbacks.jsonl)`.
SQLite assembly: open ONE db `<root>/payway.db` (mkdir root, WAL pragma), prepare all three schemas,
`SqliteJournalSink` + `SqliteLinkedTokenStore` + `SqliteWebhookStorage.fromDb(db)`; `close()` closes the
handle (Windows: file deletable afterwards — assert in test). `backend: 'auto'` = probe → sqlite else json.
Webhook records on JSON backend use the webhook factory's save shape (`Omit<WebhookRecord,'id'|'receivedAt'>`).

- [ ] TDD JSON: paths layout; journal append→read; tokens save/latest/remove; webhooks save/getAll/count; close() no-op.
- [ ] TDD SQLite: same round-trips through ONE payway.db; close() releases (rmSync succeeds on Windows);
  `backend:'auto'` resolves 'sqlite' here; cross-store isolation (journal read doesn't return token/webhook data).
- [ ] commit `feat(storage): createStorageService facade — JSON default, shared-handle SQLite backend`

### Task 7: Barrel + docs + corpus

**Files:**
- Modify: `src/index.ts` (export facade, backends, sinks)
- Create: `docs/21-storage-service.md` (contract: paths, backends, join keys, fail-open, what it is NOT)
- Modify: `docs/README.md` index; `AGENTS.md` journal bullet gains the facade line; `HANDOFF.md` new current-state bullet (amend wave-1 entry, same branch); `.agents/AGENTS.md` journal facts line.
- Regen: `npm run sync:knowledge`.

- [ ] commit `docs(storage): StorageService contract (docs/21) + barrel exports + corpus resync`

### Task 8: Full verification

- [ ] `npm run build`; `npx vitest run` — full suite green WITH driver (sqlite suites now run here; expect ~1920+ previously-skipped tests executing)
- [ ] `npm run lint`
- [ ] Smoke: `node -e` snippet calling `createStorageService({backend:'auto'})` → prints backend/paths, appends + reads one event, closes.
- [ ] Memory update (`storage-service-gap-analysis` item 3 shipped) + final report.
