/**
 * Unified local data root — the single place every PayWay store resolves its
 * default directory from (storage wave 1, .scratch/storage-service/plan.md).
 *
 * Precedence for every store: explicit arg > store-specific env
 * (PAYWAY_JOURNAL_DIR / PAYWAY_TOKEN_STORE_DIR / PAYWAY_WEBHOOK_DIR) >
 * PAYWAY_DATA_DIR > the app-data default. The default mirrors the agent-store
 * convention (src/agent/storage.ts): `process.env.APPDATA ?? ~/.config`, then
 * `aba-payway-sdk/data`. User-facing artifacts (payway-output/) are NOT part
 * of this root — they stay cwd-relative by design.
 */

import { homedir } from 'node:os';
import path from 'node:path';

export const PAYWAY_DATA_DIR_ENV = 'PAYWAY_DATA_DIR';

const WEBHOOK_DIR_NAME = 'webhook_data';

export function resolvePaywayDataRoot(
  appDataDirectory?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicit = env[PAYWAY_DATA_DIR_ENV]?.trim();
  if (explicit) return explicit;
  const base = appDataDirectory ?? env.APPDATA ?? path.join(homedir(), '.config');
  return path.join(base, 'aba-payway-sdk', 'data');
}

export function resolveWebhookDir(explicit?: string, env: NodeJS.ProcessEnv = process.env): string {
  if (explicit) return explicit;
  const fromEnv = env.PAYWAY_WEBHOOK_DIR?.trim();
  if (fromEnv) return fromEnv;
  return path.join(resolvePaywayDataRoot(undefined, env), WEBHOOK_DIR_NAME);
}
