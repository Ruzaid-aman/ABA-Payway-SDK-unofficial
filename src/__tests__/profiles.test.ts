import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  activateProfile,
  loadProfileStore,
  saveProfileStore,
  type CredentialProfile,
} from '../config/profiles.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const khqr = {
  bakongId: 'merchant@bakong',
  abaMerchantId: '123456789012345',
  acquirerName: 'ABA Bank',
  merchantCategoryCode: '5999',
  merchantName: 'Example Merchant',
  merchantCity: 'Phnom Penh',
  paywayData: 'aba-provided-template',
};

describe('credential profiles', () => {
  it('round-trips an optional KHQR configuration without exposing it through persistence helpers', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'payway-profiles-'));
    directories.push(directory);
    const profile: CredentialProfile = { name: 'offline', merchantId: 'merchant-1', apiKey: 'api-key', khqr };

    saveProfileStore({ profiles: [profile], activeProfile: 'offline' }, directory);

    expect(loadProfileStore(directory)).toEqual({ profiles: [profile], activeProfile: 'offline' });
  });

  it('clears every KHQR environment variable when the next activated profile omits KHQR configuration', () => {
    const withKhqr: CredentialProfile = { name: 'configured', merchantId: 'merchant-1', apiKey: 'api-key', khqr };
    const apiOnly: CredentialProfile = { name: 'api-only', merchantId: 'merchant-2', apiKey: 'api-key-2' };
    const env: NodeJS.ProcessEnv = {};

    activateProfile(withKhqr, env);
    expect(env.PAYWAY_KHQR_PAYWAY_DATA).toBe(khqr.paywayData);
    activateProfile(apiOnly, env);

    expect(Object.keys(env).filter((key) => key.startsWith('PAYWAY_KHQR_'))).toEqual([]);
  });
});
