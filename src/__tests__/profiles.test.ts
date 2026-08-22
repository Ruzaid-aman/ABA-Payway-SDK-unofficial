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

  it('uses a selected profile only as fallback without overwriting or clearing environment values', () => {
    const profile: CredentialProfile = {
      name: 'selected',
      merchantId: 'profile-merchant',
      apiKey: 'profile-api-key',
      khqr: { ...khqr, merchantCity: undefined },
    };
    const env: NodeJS.ProcessEnv = {
      PAYWAY_MERCHANT_ID: 'environment-merchant',
      PAYWAY_KHQR_BAKONG_ID: 'environment@bakong',
      PAYWAY_KHQR_MERCHANT_CITY: 'Environment City',
    };

    activateProfile(profile, env);

    expect(env.PAYWAY_MERCHANT_ID).toBe('environment-merchant');
    expect(env.PAYWAY_API_KEY).toBe('profile-api-key');
    expect(env.PAYWAY_KHQR_BAKONG_ID).toBe('environment@bakong');
    expect(env.PAYWAY_KHQR_ACQUIRER_NAME).toBe(khqr.acquirerName);
    expect(env.PAYWAY_KHQR_MERCHANT_CITY).toBe('Environment City');
  });
});
