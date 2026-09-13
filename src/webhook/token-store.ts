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
import { computeTokenExpiry, daysUntilTokenExpiry } from '../utils.js';

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
  /** ISO-8601 of the last successful `cof token renew` — restarts the ~90-day window (docs/09 §4a). */
  readonly renewedAt?: string;
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

export type TokenExpiryStatus = 'valid' | 'expiring-soon' | 'expired' | 'unknown';

/** Days left that docs/09 treats as the renewal trigger (never assume the boundary day charges). */
export const TOKEN_EXPIRING_SOON_DAYS = 7;

/**
 * Bucket a stored token against the ~90-day docs/09 §4a validity window
 * (grant/renewal based — the gateway returns no per-token expiresAt). The
 * anchor is `renewedAt ?? capturedAt` so a renewal restarts the window.
 * The gateway stays authoritative: callers may warn or refuse locally, but
 * docs say expired tokens cannot be charged.
 */
export function tokenExpiryStatus(
  record: Pick<LinkedTokenRecord, 'capturedAt'> & { renewedAt?: string },
  now: Date = new Date(),
): { status: TokenExpiryStatus; daysLeft: number | null; expiresAt: Date | null } {
  const anchor = record.renewedAt ?? record.capturedAt;
  if (!anchor) return { status: 'unknown', daysLeft: null, expiresAt: null };
  const expiresAt = computeTokenExpiry(anchor);
  const daysLeft = daysUntilTokenExpiry(expiresAt, now);
  if (daysLeft <= 0) return { status: 'expired', daysLeft, expiresAt };
  if (daysLeft <= TOKEN_EXPIRING_SOON_DAYS) return { status: 'expiring-soon', daysLeft, expiresAt };
  return { status: 'valid', daysLeft, expiresAt };
}

/**
 * Record a successful renewal on the stored (ctid, pwt) record — restarts the
 * ~90-day expiry window (docs/09 §4a: validity counts from grant/RENEWAL).
 * Preserves every other field; unknown (ctid, pwt) pairs return undefined and
 * write nothing (never fabricate partial records). Atomic rewrite.
 */
export function markTokenRenewed(
  ctid: string,
  pwt: string,
  renewedAt?: string,
  dir?: string,
  env: NodeJS.ProcessEnv = process.env,
): LinkedTokenRecord | undefined {
  const storeDir = resolveTokenStoreDir(dir, env);
  const file = tokensFilePath(storeDir);
  if (!existsSync(file)) return undefined;
  const existing = loadLinkedTokens(storeDir, env);
  const idx = existing.findIndex((t) => t.ctid === ctid && t.pwt === pwt);
  if (idx < 0) return undefined;
  const kept = existing.slice();
  kept[idx] = { ...existing[idx], renewedAt: renewedAt ?? new Date().toISOString() };
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ version: 1 as const, tokens: kept }, null, 2)}
`, 'utf8');
  renameSync(tmp, file);
  return kept[idx];
}

/**
 * Delete stored tokens for a ctid — optionally only one specific pwt — and
 * rewrite the store atomically (same tmp+rename durability as save). Returns
 * the number of records removed; a missing store removes nothing. This is
 * the local half of token lifecycle (the gateway-side `cof token remove`
 * does NOT prune this store by itself — see docs/09).
 */
export function removeLinkedTokens(
  ctid: string,
  pwt?: string,
  dir?: string,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const storeDir = resolveTokenStoreDir(dir, env);
  if (!existsSync(tokensFilePath(storeDir))) return 0;
  const existing = loadLinkedTokens(storeDir, env);
  const kept = existing.filter((t) => t.ctid !== ctid || (pwt !== undefined && t.pwt !== pwt));
  const removed = existing.length - kept.length;
  if (removed === 0) return 0;
  const file = tokensFilePath(storeDir);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ version: 1 as const, tokens: kept }, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
  return removed;
}

/** Mask a pwt for display: keep the first 4 and last 4 characters. */
export function maskPwt(pwt: string): string {
  if (pwt.length <= 8) return '*'.repeat(pwt.length);
  return `${pwt.slice(0, 4)}…${pwt.slice(-4)}`;
}
