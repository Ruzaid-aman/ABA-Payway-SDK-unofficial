/**
 * StorageService — one facade over the three PayWay local stores (storage
 * wave 3, .scratch/storage-service/plan-3.md):
 *
 *   journal   → transaction journal events (transport-level truth)
 *   tokens    → captured CoF link tokens (`pwt`, keyed by ctid)
 *   webhooks  → raw callback captures (the audit source)
 *
 * Backends:
 *   'json'   (default) — the exact files the CLI uses: `<dataRoot>/journal.jsonl`,
 *             `<dataRoot>/linked-tokens.json`, `<dataRoot>/webhook_data/callbacks.jsonl`.
 *   'sqlite' — ONE shared better-sqlite3 handle on `<dataRoot>/payway.db`
 *             (tables: journal_events, linked_tokens, callbacks). The facade
 *             owns the handle and closes it exactly once.
 *   'auto'   — sqlite when `better-sqlite3` is importable, else json.
 *
 * Everything resolves through the wave-1 data root (`PAYWAY_DATA_DIR` /
 * app-data — see src/config/data-root.ts). Join keys are unchanged: journal
 * events carry the SDK correlationId; token records carry the webhook record
 * id; webhook records carry matchedTransactionId.
 *
 * What this is NOT (docs/21): not a fulfillment source of truth (merchant
 * order state stays yours), not a gateway mirror (PENDING ≠ alive, missing
 * callbacks ≠ non-payment), and not multi-merchant yet.
 */

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { resolvePaywayDataRoot } from '../config/data-root.js';
import {
  createJournalEmitterForSink,
  JsonlJournalSink,
  pruneJournal,
  readJournalEvents,
  type JournalFileRead,
  type JournalPruneResult,
} from '../journal/writer.js';
import type { JournalContext, JournalEmitterInput, JournalMode } from '../journal/types.js';
import { readSqliteJournalEvents, pruneSqliteJournal, SqliteJournalSink, type SqliteDb } from '../journal/sink-sqlite.js';
import {
  loadLinkedTokens,
  markTokenRenewed,
  removeLinkedTokens,
  saveLinkedToken,
  type LinkedTokenRecord,
} from '../webhook/token-store.js';
import { SqliteLinkedTokenStore } from '../webhook/token-store-sqlite.js';
import { JsonWebhookStorage } from '../webhook/storage-json.js';
import { loadBetterSqlite3, SqliteWebhookStorage } from '../webhook/storage-sqlite.js';
import type { WebhookRecord, WebhookStorage } from '../webhook/storage.js';

export type StorageBackend = 'json' | 'sqlite';

const PAYWAY_DB_FILE_NAME = 'payway.db';
const JOURNAL_FILE_NAME = 'journal.jsonl';
const LINKED_TOKENS_FILE_NAME = 'linked-tokens.json';

export interface StorageServiceOptions {
  /** Data root override (explicit arg beats PAYWAY_DATA_DIR, per data-root precedence). */
  readonly dir?: string;
  /** 'auto' (default) picks sqlite when better-sqlite3 is importable, else json. */
  readonly backend?: StorageBackend | 'auto';
  /** Journal mode for the facade's own emitter (default 'digest'). */
  readonly journalMode?: JournalMode;
  readonly env?: NodeJS.ProcessEnv;
}

export interface StorageServicePaths {
  readonly dataRoot: string;
  readonly journalFile: string;
  readonly tokenStoreFile: string;
  readonly webhookFile: string;
}

export interface StorageService {
  readonly backend: StorageBackend;
  readonly mode: JournalMode;
  readonly paths: StorageServicePaths;
  readonly journal: {
    /** Append one event through the shared envelope-fill/validate/fail-open pipeline. */
    append(event: JournalEmitterInput): void;
    /** Read all events in insertion order (tolerant, never fatal). */
    read(): JournalFileRead;
    /** Drop events older than `before`. */
    prune(before: Date): JournalPruneResult;
  };
  readonly tokens: {
    load(): LinkedTokenRecord[];
    save(record: Omit<LinkedTokenRecord, 'capturedAt'> & { capturedAt?: string }): LinkedTokenRecord;
    latestForCtid(ctid: string): LinkedTokenRecord | undefined;
    /** Delete by ctid (or one specific pwt); returns the removed count. */
    remove(ctid: string, pwt?: string): number;
    /** Record a renewal on the stored (ctid,pwt) record — restarts the ~90-day docs/09 window. Preserves other fields; undefined when the store does not hold that token. */
    markRenewed(ctid: string, pwt: string, renewedAt?: string): LinkedTokenRecord | undefined;
  };
  readonly webhooks: WebhookStorage;
  /** Release backend resources (closes the shared sqlite handle; json = no-op). */
  close(): void;
}

/** Resolve the effective backend for 'auto': sqlite iff better-sqlite3 is importable. */
export async function probeStorageBackend(env: NodeJS.ProcessEnv = process.env): Promise<StorageBackend> {
  if (env.PAYWAY_FORCE_JSON_STORAGE === '1') return 'json';
  // Use the shared loader — a LITERAL `import('better-sqlite3')` is resolved by
  // the bundler at build time (and the emitted chunk fails at runtime), while
  // the loader's variable-indirect form survives as a true runtime import.
  const driver = await loadBetterSqlite3();
  return driver ? 'sqlite' : 'json';
}

async function openSqliteDb(dbPath: string): Promise<SqliteDb> {
  const Driver = await loadBetterSqlite3();
  if (!Driver) throw new Error('better-sqlite3 is not installed');
  const db = new Driver(dbPath) as unknown as SqliteDb;
  db.pragma('journal_mode = WAL');
  return db;
}

export async function createStorageService(options: StorageServiceOptions = {}): Promise<StorageService> {
  const env = options.env ?? process.env;
  const dataRoot = options.dir ?? resolvePaywayDataRoot(undefined, env);
  const requested = options.backend ?? 'auto';
  const backend: StorageBackend = requested === 'auto' ? await probeStorageBackend(env) : requested;
  const mode: JournalMode = options.journalMode ?? 'digest';
  mkdirSync(dataRoot, { recursive: true });

  if (backend === 'sqlite') {
    const dbPath = path.join(dataRoot, PAYWAY_DB_FILE_NAME);
    const db = await openSqliteDb(dbPath);
    const emitter: JournalContext = createJournalEmitterForSink(new SqliteJournalSink(db), mode);
    return {
      backend,
      mode,
      paths: {
        dataRoot,
        journalFile: dbPath,
        tokenStoreFile: dbPath,
        webhookFile: dbPath,
      },
      journal: {
        append: (event) => emitter.emit(event),
        read: () => readSqliteJournalEvents(db),
        prune: (before) => pruneSqliteJournal(db, before),
      },
      tokens: new SqliteLinkedTokenStore(db),  // markRenewed is a native method on the sqlite store
      webhooks: SqliteWebhookStorage.fromDb(db),
      close: () => db.close(),
    };
  }

  const journalFile = path.join(dataRoot, JOURNAL_FILE_NAME);
  const tokenStoreFile = path.join(dataRoot, LINKED_TOKENS_FILE_NAME);
  const webhookDir = path.join(dataRoot, 'webhook_data');
  const webhookFile = path.join(webhookDir, 'callbacks.jsonl');

  // The JSON journal sink constructs from a dir config and writes exactly
  // `<dir>/journal.jsonl` — the facade's layout contract IS that file, so no
  // adapter is needed (append-only JSONL, fail-open, one write pipeline).
  const emitter: JournalContext = createJournalEmitterForSink(
    new JsonlJournalSink({ dir: dataRoot, mode }),
    mode,
  );

  return {
    backend,
    mode,
    paths: { dataRoot, journalFile, tokenStoreFile, webhookFile },
    journal: {
      append: (event) => emitter.emit(event),
      read: () => readJournalEvents(dataRoot),
      prune: (before) => pruneJournal(before, journalFile),
    },
    tokens: {
      load: () => loadLinkedTokens(dataRoot, env),
      save: (record) => saveLinkedToken(record, dataRoot, env),
      latestForCtid: (ctid) => {
        const tokens = loadLinkedTokens(dataRoot, env).filter((t) => t.ctid === ctid);
        return tokens.length > 0 ? tokens[tokens.length - 1] : undefined;
      },
      remove: (ctid, pwt) => removeLinkedTokens(ctid, pwt, dataRoot, env),
      markRenewed: (ctid, pwt, renewedAt) => markTokenRenewed(ctid, pwt, renewedAt, dataRoot, env),
    },
    webhooks: new JsonWebhookStorage(webhookFile),
    close: () => undefined,
  };
}

export type { WebhookRecord, LinkedTokenRecord };
