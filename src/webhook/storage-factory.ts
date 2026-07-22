/**
 * Storage factory — creates the appropriate WebhookStorage implementation.
 *
 * Default behavior: try SQLite first (if `better-sqlite3` is importable),
 * otherwise fall back to JSON file storage. The CLI `--storage` flag
 * overrides auto-detection.
 */

import type { WebhookStorage } from './storage.js';
import { JsonWebhookStorage } from './storage-json.js';
import { SqliteWebhookStorage } from './storage-sqlite.js';

export type StorageType = 'json' | 'sqlite';

/**
 * Create a webhook storage instance.
 *
 * @param type - Explicit storage type. If `'auto'` (default), tries SQLite first.
 * @param filePath - Optional custom path for the storage file.
 */
export async function createStorage(
  type: StorageType | 'auto' = 'auto',
  filePath?: string,
): Promise<WebhookStorage> {
  if (type === 'json') {
    return new JsonWebhookStorage(filePath);
  }

  if (type === 'sqlite') {
    return SqliteWebhookStorage.create(filePath);
  }

  // Auto-detect: try SQLite, fall back to JSON
  try {
    return await SqliteWebhookStorage.create(filePath);
  } catch {
    return new JsonWebhookStorage(filePath);
  }
}
