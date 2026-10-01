/**
 * JSON file storage adapter for webhook payloads.
 *
 * Uses JSONL (JSON Lines) format for append-only writes — each record is
 * written as a single line, avoiding full-file re-serialization on every callback.
 * On read, all lines are parsed and returned in insertion order.
 */

import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { resolveWebhookDir } from '../config/data-root.js';
import type { CustomerQrWebhookMetadata, KhqrWebhookMetadata, PaymentLinkPushbackMetadata, WebhookRecord, WebhookStorage } from './storage.js';

const DEFAULT_PATH = (): string => join(resolveWebhookDir(), 'callbacks.jsonl');

export interface JsonWebhookStorageOptions {
  /** Internal filesystem seam used to verify failed atomic replacements. */
  renameFile?: (oldPath: string, newPath: string) => void;
  /**
   * Retention bound (audit WP07): the capture file must not grow without
   * limit. When a save pushes the store past `maxRecords`, the OLDEST
   * records are compacted away (newest `maxRecords` kept). Default 1000 —
   * plenty for a dev loop; every dropped record was already delivered/
   * loggable, and `resend` works from retained ones. `Infinity` disables
   * compaction.
   */
  maxRecords?: number;
}

export class JsonWebhookStorage implements WebhookStorage {
  private readonly filePath: string;
  private readonly renameFile: (oldPath: string, newPath: string) => void;
  private readonly maxRecords: number;

  constructor(filePath?: string, options: JsonWebhookStorageOptions = {}) {
    this.filePath = filePath ? resolve(filePath) : resolve(DEFAULT_PATH());
    this.renameFile = options.renameFile ?? renameSync;
    this.maxRecords = options.maxRecords ?? 1_000;
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
    this.compactIfOverBound();
    return entry;
  }

  /** Enforce the retention bound by dropping the oldest records. */
  private compactIfOverBound(): void {
    if (!Number.isFinite(this.maxRecords)) return;
    let count = this.count();
    if (count <= this.maxRecords) return;
    const records = this.getAll();
    const retained = records.slice(records.length - this.maxRecords);
    const temporaryPath = `${this.filePath}.${randomBytes(8).toString('hex')}.tmp`;
    try {
      writeFileSync(temporaryPath, `${retained.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf-8');
      this.renameFile(temporaryPath, this.filePath);
      count = retained.length;
    } finally {
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    }
  }

  updateKhqrMetadata(id: string, khqr: KhqrWebhookMetadata): WebhookRecord {
    return this.updateMetadata(id, 'khqr', khqr);
  }

  updatePaymentLinkPushbackMetadata(id: string, pushback: PaymentLinkPushbackMetadata): WebhookRecord {
    return this.updateMetadata(id, 'paymentLinkPushback', pushback);
  }

  updateCustomerQrMetadata(id: string, customerQr: CustomerQrWebhookMetadata): WebhookRecord {
    return this.updateMetadata(id, 'customerQr', customerQr);
  }

  private updateMetadata<K extends 'khqr' | 'paymentLinkPushback' | 'customerQr'>(
    id: string,
    slot: K,
    metadata: WebhookRecord[K],
  ): WebhookRecord {
    const records = this.getAll();
    const index = records.findIndex((record) => record.id === id);
    if (index === -1) throw new Error(`Webhook record ${id} was not found`);

    const updated: WebhookRecord = { ...records[index], [slot]: metadata };
    records[index] = updated;
    const temporaryPath = `${this.filePath}.${randomBytes(8).toString('hex')}.tmp`;
    try {
      writeFileSync(temporaryPath, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf-8');
      this.renameFile(temporaryPath, this.filePath);
    } finally {
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    }
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
