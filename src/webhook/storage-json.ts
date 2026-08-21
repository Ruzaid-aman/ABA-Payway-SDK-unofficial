/**
 * JSON file storage adapter for webhook payloads.
 *
 * Uses JSONL (JSON Lines) format for append-only writes — each record is
 * written as a single line, avoiding full-file re-serialization on every callback.
 * On read, all lines are parsed and returned in insertion order.
 */

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { KhqrWebhookMetadata, WebhookStorage, WebhookRecord } from './storage.js';

const DEFAULT_PATH = './webhook_data/callbacks.jsonl';

export class JsonWebhookStorage implements WebhookStorage {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ? resolve(filePath) : resolve(DEFAULT_PATH);
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  save(record: Omit<WebhookRecord, 'id' | 'receivedAt'>): WebhookRecord {
    const entry: WebhookRecord = {
      id: `wh_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`,
      receivedAt: new Date().toISOString(),
      ...record,
    };

    const line = `${JSON.stringify(entry)}\n`;
    appendFileSync(this.filePath, line, 'utf-8');
    return entry;
  }

  updateKhqrMetadata(id: string, khqr: KhqrWebhookMetadata): WebhookRecord {
    const records = this.getAll();
    const index = records.findIndex((record) => record.id === id);
    if (index === -1) throw new Error(`Webhook record ${id} was not found`);

    const updated: WebhookRecord = { ...records[index], khqr };
    records[index] = updated;
    writeFileSync(this.filePath, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf-8');
    return updated;
  }

  getAll(): WebhookRecord[] {
    if (!existsSync(this.filePath)) return [];

    const content = readFileSync(this.filePath, 'utf-8').trim();
    if (!content) return [];

    return content
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as WebhookRecord);
  }

  count(): number {
    if (!existsSync(this.filePath)) return 0;

    const content = readFileSync(this.filePath, 'utf-8').trim();
    if (!content) return 0;

    return content.split('\n').filter((line) => line.trim().length > 0).length;
  }

  close(): void {
    // JSON file storage has no open handles to release.
  }
}
