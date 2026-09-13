/**
 * Linked-token store — durable persistence of CoF payment tokens (`pwt`)
 * delivered via link callbacks, for future `cof charge` purchases.
 *
 * docs/09 has always told integrators to hand-roll this ("INSERT INTO
 * saved_payments …"); the SDK's webhook workbench captured the raw callback
 * but never extracted the token. This store closes that gap for the SDK's
 * own tooling: `setup-webhook`/`webhook` receivers persist a verified token
 * on capture, `cof token list` inspects it, and `cof charge --ctid` resolves
 * the latest token without copy-pasting a `pwt`.
 *
 * Storage is a small JSON file (`linked-tokens.json`) in the PayWay data root
 * (PAYWAY_DATA_DIR / app-data, see src/config/data-root.ts) — same
 * zero-dependency posture as the JSON webhook storage and
 * the transaction journal. The pwt is a live payment credential: the file
 * holds it in plaintext (like `.env` holds the API key) but every display
 * surface masks it unless explicitly asked.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolvePaywayDataRoot } from '../config/data-root.js';

/** One persisted linked-account/card token. */
export interface LinkedTokenRecord {
  /** Customer token identifier the link was created with. */
  readonly ctid: string;
  /** The delivered payment token (pwt). */
  readonly pwt: string;
  /** Link channel, when known ('account' = link-account QR, 'card' = hosted form). */
  readonly linkType?: 'account' | 'card';
  /** Token flag echoed by the delivery, when present. */
  readonly tokenFlag?: string;
  /** Frequency echoed by the delivery (card links), when present. */
  readonly frequency?: string;
  /** Currency of the link request, when known. */
  readonly currency?: string;
  /** Link request id echoed by the delivery, when present. */
  readonly requestId?: string;
  /** Every other string field on the delivery (minus hash) — Q18 capture. */
  readonly extraFields?: Record<string, string>;
  /** ISO-8601 capture timestamp. */
  readonly capturedAt: string;
  /** Webhook record id of the capture (joins into webhook_data). */
  readonly sourceRecordId?: string;
}

interface LinkedTokenFile {
  version: 1;
  tokens: LinkedTokenRecord[];
}

/** Env override for the store directory (mirrors PAYWAY_JOURNAL_DIR). */
export const TOKEN_STORE_DIR_ENV = 'PAYWAY_TOKEN_STORE_DIR';

export const LINKED_TOKENS_FILE_NAME = 'linked-tokens.json';

/**
 * Resolve the token-store directory: explicit arg → PAYWAY_TOKEN_STORE_DIR →
 * the PAYWAY_DATA_DIR data root (the shared app-data location).
 */
export function resolveTokenStoreDir(explicit?: string, env: NodeJS.ProcessEnv = process.env): string {
  if (explicit) return explicit;
  if (env[TOKEN_STORE_DIR_ENV]) return env[TOKEN_STORE_DIR_ENV] as string;
  return resolvePaywayDataRoot(undefined, env);
}

function tokensFilePath(dir: string): string {
  return path.join(dir, LINKED_TOKENS_FILE_NAME);
}

/** Load all stored tokens (oldest first). Missing file → empty array. */
export function loadLinkedTokens(dir?: string, env: NodeJS.ProcessEnv = process.env): LinkedTokenRecord[] {
  const file = tokensFilePath(resolveTokenStoreDir(dir, env));
  if (!existsSync(file)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Array.isArray((parsed as LinkedTokenFile).tokens)
    ) {
      return (parsed as LinkedTokenFile).tokens;
    }
    return [];
  } catch {
    // A corrupt store must not take down capture or charge paths — callers
    // fall back to manual --token entry; the webhook record keeps the raw body.
    return [];
  }
}

/**
 * Persist a token, upserting on (ctid, pwt). Re-captures of the same token
 * refresh the record in place; a re-link produces a new pwt and therefore a
 * new record. Atomic write (tmp + rename) so a crash mid-capture cannot
 * truncate the store.
 */
export function saveLinkedToken(
  record: Omit<LinkedTokenRecord, 'capturedAt'> & { capturedAt?: string },
  dir?: string,
  env: NodeJS.ProcessEnv = process.env,
): LinkedTokenRecord {
  const storeDir = resolveTokenStoreDir(dir, env);
  mkdirSync(storeDir, { recursive: true });
  const full: LinkedTokenRecord = { capturedAt: new Date().toISOString(), ...record };
  const existing = loadLinkedTokens(storeDir, env);
  const idx = existing.findIndex((t) => t.ctid === full.ctid && t.pwt === full.pwt);
  if (idx >= 0) existing[idx] = full;
  else existing.push(full);
  const file = tokensFilePath(storeDir);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ version: 1 as const, tokens: existing }, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
  return full;
}

/** Latest captured token for a ctid (the one a future charge should use). */
export function latestTokenForCtid(
  ctid: string,
  dir?: string,
  env: NodeJS.ProcessEnv = process.env,
): LinkedTokenRecord | undefined {
  const tokens = loadLinkedTokens(dir, env).filter((t) => t.ctid === ctid);
  return tokens.length > 0 ? tokens[tokens.length - 1] : undefined;
}

/** Mask a pwt for display: keep the first 4 and last 4 characters. */
export function maskPwt(pwt: string): string {
  if (pwt.length <= 8) return '*'.repeat(pwt.length);
  return `${pwt.slice(0, 4)}…${pwt.slice(-4)}`;
}
