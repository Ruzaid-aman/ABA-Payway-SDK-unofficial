/**
 * Tests for webhook storage adapters (JSON and SQLite).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { JsonWebhookStorage } from '../webhook/storage-json.js';

// ─── JSON Storage Tests ──────────────────────────────────────────────────

describe('JsonWebhookStorage', () => {
  let tempDir: string;
  let storage: JsonWebhookStorage;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'webhook-json-test-'));
    storage = new JsonWebhookStorage(join(tempDir, 'callbacks.jsonl'));
  });

  afterEach(() => {
    storage.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('saves and retrieves a single record', () => {
    const input = {
      headers: { 'content-type': 'application/json' },
      body: '{"status":"COMPLETED","id":"123"}',
      sourceIp: '127.0.0.1',
    };

    const saved = storage.save(input);

    expect(saved.id).toMatch(/^wh_/);
    expect(saved.receivedAt).toBeTruthy();
    expect(saved.body).toBe(input.body);
    expect(saved.headers).toEqual(input.headers);
    expect(saved.sourceIp).toBe('127.0.0.1');

    const all = storage.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(saved.id);
  });

  it('saves multiple records in order', () => {
    storage.save({ headers: {}, body: 'first', sourceIp: undefined });
    storage.save({ headers: {}, body: 'second', sourceIp: undefined });
    storage.save({ headers: {}, body: 'third', sourceIp: undefined });

    const all = storage.getAll();
    expect(all).toHaveLength(3);
    expect(all[0].body).toBe('first');
    expect(all[1].body).toBe('second');
    expect(all[2].body).toBe('third');
  });

  it('returns correct count', () => {
    expect(storage.count()).toBe(0);

    storage.save({ headers: {}, body: 'a', sourceIp: undefined });
    expect(storage.count()).toBe(1);

    storage.save({ headers: {}, body: 'b', sourceIp: undefined });
    expect(storage.count()).toBe(2);
  });

  it('creates directory if it does not exist', () => {
    const deepPath = join(tempDir, 'nested', 'dir', 'callbacks.jsonl');
    const deepStorage = new JsonWebhookStorage(deepPath);

    deepStorage.save({ headers: {}, body: 'test', sourceIp: undefined });

    expect(existsSync(deepPath)).toBe(true);
    deepStorage.close();
  });

  it('stores raw malformed JSON as-is (WH-TC-05)', () => {
    const malformedBody = '{invalid json content';
    storage.save({ headers: {}, body: malformedBody, sourceIp: undefined });

    const all = storage.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].body).toBe(malformedBody);
  });

  it('preserves all headers including arrays', () => {
    const headers = {
      'content-type': 'application/json',
      'x-custom-header': ['value1', 'value2'],
      'x-single': 'single-value',
      'x-undefined': undefined,
    };

    storage.save({ headers, body: '{}', sourceIp: undefined });

    const all = storage.getAll();
    expect(all[0].headers['content-type']).toBe('application/json');
    expect(all[0].headers['x-custom-header']).toEqual(['value1', 'value2']);
    expect(all[0].headers['x-single']).toBe('single-value');
  });

  it('returns empty array from empty file', () => {
    expect(storage.getAll()).toEqual([]);
  });

  it('generates unique IDs for each record', () => {
    const r1 = storage.save({ headers: {}, body: 'a', sourceIp: undefined });
    // Small delay to ensure different timestamp
    const r2 = storage.save({ headers: {}, body: 'b', sourceIp: undefined });

    expect(r1.id).not.toBe(r2.id);
  });

  it('includes ISO-8601 timestamp', () => {
    const saved = storage.save({ headers: {}, body: 'test', sourceIp: undefined });
    const date = new Date(saved.receivedAt);
    expect(date.toISOString()).toBe(saved.receivedAt);
  });
});
