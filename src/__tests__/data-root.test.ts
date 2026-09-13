import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PAYWAY_DATA_DIR_ENV, resolvePaywayDataRoot, resolveWebhookDir } from '../config/data-root.js';

describe('resolvePaywayDataRoot', () => {
  it('PAYWAY_DATA_DIR wins over everything', () => {
    expect(resolvePaywayDataRoot('/custom/app', { PAYWAY_DATA_DIR: '/data/here' })).toBe('/data/here');
  });

  it('defaults under the app-data root (aba-payway-sdk/data)', () => {
    expect(resolvePaywayDataRoot('/custom/app', {})).toBe(path.join('/custom/app', 'aba-payway-sdk', 'data'));
  });

  it('falls back to APPDATA then ~/.config', () => {
    expect(resolvePaywayDataRoot(undefined, {})).toBe(
      path.join(homedir(), '.config', 'aba-payway-sdk', 'data'),
    );
    expect(resolvePaywayDataRoot(undefined, { APPDATA: '/roaming' })).toBe(
      path.join('/roaming', 'aba-payway-sdk', 'data'),
    );
  });

  it('trims whitespace around the env value', () => {
    expect(resolvePaywayDataRoot(undefined, { [PAYWAY_DATA_DIR_ENV]: '  /data  ' })).toBe('/data');
  });
});

describe('resolveWebhookDir', () => {
  it('explicit arg wins', () => {
    expect(resolveWebhookDir('/wb', {})).toBe('/wb');
  });

  it('PAYWAY_WEBHOOK_DIR beats the data root', () => {
    expect(resolveWebhookDir(undefined, { PAYWAY_WEBHOOK_DIR: '/wb' })).toBe('/wb');
  });

  it('defaults to <dataRoot>/webhook_data via PAYWAY_DATA_DIR', () => {
    expect(resolveWebhookDir(undefined, { PAYWAY_DATA_DIR: '/data' })).toBe(
      path.join('/data', 'webhook_data'),
    );
  });

  it('JsonWebhookStorage default capture file lands under the data root', async () => {
    const appData = mkdtempSync(path.join(tmpdir(), 'payway-appdata-'));
    vi.stubEnv('APPDATA', appData);
    try {
      const { JsonWebhookStorage } = await import('../webhook/storage-json.js');
      const store = new JsonWebhookStorage();
      store.save({ headers: {}, body: '{}' });
      const expected = path.join(appData, 'aba-payway-sdk', 'data', 'webhook_data', 'callbacks.jsonl');
      expect(existsSync(expected)).toBe(true);
      store.close();
    } finally {
      vi.unstubAllEnvs();
      rmSync(appData, { recursive: true, force: true });
    }
  });
});
