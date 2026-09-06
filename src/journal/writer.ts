/**
 * Transaction Journal — JSONL sink, config resolution, emitter factory, prune.
 *
 * Storage mirrors the webhook store's philosophy: append-only JSONL, zero
 * dependencies, never fatal. Every emit is fail-open — journaling must not
 * break SDK execution (same contract as the onRequest/onResponse hooks).
 */

import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { validateJournalEvent } from './schema.js';
import {
  DEFAULT_JOURNAL_DIR_NAME,
  DEFAULT_JOURNAL_FILE_NAME,
  JOURNAL_VERSION,
  type JournalContext,
  type JournalEmitterInput,
  type JournalEventV1,
  type JournalMode,
  type JournalOptions,
  type JournalSink,
  type ResolvedJournalConfig,
} from './types.js';

const TRUTHY_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);

function parseMode(value: string | undefined): JournalMode {
  return value?.trim().toLowerCase() === 'full' ? 'full' : 'digest';
}

function parseMaxAgeDays(value: string | undefined): number | undefined {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function defaultJournalDir(): string {
  return path.join(process.cwd(), DEFAULT_JOURNAL_DIR_NAME);
}

function resolveDir(explicit: string | undefined, env: NodeJS.ProcessEnv): string {
  return explicit ?? (env.PAYWAY_JOURNAL_DIR?.trim() || defaultJournalDir());
}

/**
 * Merge the config setting with the environment (config wins; env fills
 * gaps). `false` always disables; `undefined` defers entirely to
 * `PAYWAY_JOURNAL`.
 */
export function resolveJournalConfig(
  setting: boolean | JournalOptions | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedJournalConfig | undefined {
  if (setting === false) return undefined;
  if (setting === true) {
    return {
      dir: resolveDir(undefined, env),
      mode: parseMode(env.PAYWAY_JOURNAL_MODE),
      maxAgeDays: parseMaxAgeDays(env.PAYWAY_JOURNAL_MAX_AGE_DAYS),
    };
  }
  if (setting === undefined) {
    const enabled = TRUTHY_ENV_VALUES.has((env.PAYWAY_JOURNAL ?? '').trim().toLowerCase());
    return enabled
      ? {
          dir: resolveDir(undefined, env),
          mode: parseMode(env.PAYWAY_JOURNAL_MODE),
          maxAgeDays: parseMaxAgeDays(env.PAYWAY_JOURNAL_MAX_AGE_DAYS),
        }
      : undefined;
  }
  return {
    dir: resolveDir(setting.dir, env),
    mode: setting.mode ?? parseMode(env.PAYWAY_JOURNAL_MODE),
    maxAgeDays: setting.maxAgeDays ?? parseMaxAgeDays(env.PAYWAY_JOURNAL_MAX_AGE_DAYS),
  };
}

export class JsonlJournalSink implements JournalSink {
  readonly filePath: string;
  private dirReady = false;
  private warned = false;
  private readonly maxAgeDays: number | undefined;
  private lastPruneDay: string | undefined;

  constructor(config: ResolvedJournalConfig) {
    this.filePath = path.join(config.dir, DEFAULT_JOURNAL_FILE_NAME);
    this.maxAgeDays = config.maxAgeDays;
  }

  emit(event: JournalEventV1): void {
    try {
      if (!this.dirReady) {
        mkdirSync(path.dirname(this.filePath), { recursive: true });
        this.dirReady = true;
      }
      appendFileSync(this.filePath, `${JSON.stringify(event)}\n`, 'utf8');
      // I-5 retention guard: best-effort prune once per process per UTC day;
      // failures are swallowed (the next emit retries).
      if (this.maxAgeDays !== undefined) {
        const today = event.ts.slice(0, 10);
        if (this.lastPruneDay !== today) {
          this.lastPruneDay = today;
          try {
            pruneJournal(new Date(Date.now() - this.maxAgeDays * 86_400_000), this.filePath);
          } catch {
            // Retention must never break journaling.
          }
        }
      }
    } catch (error) {
      if (this.warned) return;
      this.warned = true;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[payway] journal: failed to persist event (${message}) — further journal write failures are silent`);
    }
  }
}

/**
 * Build the journal emitter for a `PayWay` instance. Returns undefined when
 * journaling is disabled (the default) — a library must never write files
 * silently.
 */
export function createJournalEmitter(
  setting: boolean | JournalOptions | undefined,
  env: NodeJS.ProcessEnv = process.env,
): JournalContext | undefined {
  const resolved = resolveJournalConfig(setting, env);
  if (!resolved) return undefined;
  const sink = new JsonlJournalSink(resolved);
  return {
    mode: resolved.mode,
    emit(event: JournalEmitterInput): void {
      // Fill envelope fields first so validation sees the final record.
      const full: JournalEventV1 = {
        version: JOURNAL_VERSION,
        ts: new Date().toISOString(),
        eventId: randomUUID(),
        ...event,
      };
      if (!validateJournalEvent(full)) return;
      try {
        sink.emit(full);
      } catch {
        // Belt and braces: sink.emit is already fail-open.
      }
    },
  };
}

export interface JournalPruneResult {
  removed: number;
  kept: number;
}

export interface JournalFileRead {
  file: string;
  events: JournalEventV1[];
  malformed: number;
}

/** Resolve the effective journal directory: explicit arg > env > <cwd>/payway-data. */
export function resolveJournalDir(explicit?: string): string {
  return explicit ?? resolveJournalConfig(undefined, process.env)?.dir ?? path.join(process.cwd(), DEFAULT_JOURNAL_DIR_NAME);
}

/**
 * Read and parse a journal file tolerantly: malformed lines are counted and
 * skipped, never fatal — a partially-written or evolving journal stays
 * queryable. Shared by the journal CLI and the reconcile engine.
 */
export function readJournalEvents(explicitDir?: string): JournalFileRead {
  const dir = resolveJournalDir(explicitDir);
  const file = path.join(dir, DEFAULT_JOURNAL_FILE_NAME);
  const events: JournalEventV1[] = [];
  let malformed = 0;
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (line.trim().length === 0) continue;
      try {
        const parsed = JSON.parse(line) as JournalEventV1;
        if (parsed && typeof parsed === 'object' && typeof parsed.kind === 'string') {
          events.push(parsed);
        } else {
          malformed += 1;
        }
      } catch {
        malformed += 1;
      }
    }
  }
  return { file, events, malformed };
}

/**
 * Drop events older than `before` by rewriting the JSONL file atomically
 * (temp file + rename, mirroring the agent store's durability pattern).
 * Unknown/malformed lines are preserved — pruning must never destroy data it
 * cannot parse.
 */
export function pruneJournal(before: Date, filePath?: string): JournalPruneResult {
  const file = filePath ?? path.join(defaultJournalDir(), DEFAULT_JOURNAL_FILE_NAME);
  if (!existsSync(file)) return { removed: 0, kept: 0 };

  let lines: string[];
  try {
    lines = readFileSync(file, 'utf8').split('\n');
  } catch {
    return { removed: 0, kept: 0 };
  }

  const cutoff = before.toISOString();
  const keptLines: string[] = [];
  let removed = 0;
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    let ts: string | undefined;
    try {
      const parsed = JSON.parse(line) as { ts?: unknown };
      ts = typeof parsed?.ts === 'string' ? parsed.ts : undefined;
    } catch {
      ts = undefined;
    }
    if (ts !== undefined && ts < cutoff) {
      removed += 1;
      continue;
    }
    keptLines.push(line);
  }

  if (removed === 0) {
    return { removed: 0, kept: keptLines.length };
  }

  const temporaryPath = `${file}.prune-${Date.now()}.tmp`;
  writeFileSync(temporaryPath, keptLines.map((line) => line).join('\n') + (keptLines.length > 0 ? '\n' : ''), 'utf8');
  renameSync(temporaryPath, file);
  return { removed, kept: keptLines.length };
}
