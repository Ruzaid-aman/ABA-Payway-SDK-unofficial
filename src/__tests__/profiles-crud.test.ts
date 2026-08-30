/**
 * Direct unit coverage for the credential-profile store CRUD
 * (`src/config/profiles.ts`): validation branches, atomic persistence,
 * activation precedence, and default/active profile resolution.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  activateProfile,
  addProfile,
  createEmptyProfileStore,
  getProfileByName,
  getProfileStorePath,
  loadProfileStore,
  activeProfile,
  removeProfile,
  saveProfileStore,
  setDefaultProfile,
} from '../config/profiles.js';

const tempDirs: string[] = [];

function makeStorePath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'payway-profiles-'));
  tempDirs.push(dir);
  return path.join(dir, 'aba-payway-sdk', 'profiles.json');
}

const baseProfile = {
  name: 'sandbox-main',
  environment: 'sandbox' as const,
  merchantId: 'mc-1',
  apiKey: 'key-1',
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('profile store persistence', () => {
  it('getProfileStorePath joins the app-data directory', () => {
    expect(getProfileStorePath('C:/appdata')).toBe(path.join('C:/appdata', 'aba-payway-sdk', 'profiles.json'));
  });

  it('loadProfileStore returns an empty store when the file does not exist', () => {
    expect(loadProfileStore(path.join(tmpdir(), 'missing', 'profiles.json'))).toEqual(createEmptyProfileStore());
  });

  it('saveProfileStore writes atomically and loadProfileStore reads it back', () => {
    const filePath = makeStorePath();
    const store = createEmptyProfileStore();
    addProfile(store, baseProfile);
    setDefaultProfile(store, 'sandbox-main');
    saveProfileStore(store, filePath);
    expect(existsSync(filePath)).toBe(true);
    const loaded = loadProfileStore(filePath);
    expect(loaded.profiles).toHaveLength(1);
    expect(loaded.defaultProfile).toBe('sandbox-main');
  });

  it('loadProfileStore throws a descriptive error for a corrupt store', () => {
    const filePath = makeStorePath();
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, '{"profiles": "not-an-array"}', 'utf8');
    expect(() => loadProfileStore(filePath)).toThrow(/Invalid credential profile store/);
  });
});

describe('addProfile validation', () => {
  it('rejects blank names, invalid environments, missing credentials, oversized notes, duplicates, and a ninth profile', () => {
    const store = createEmptyProfileStore();
    expect(() => addProfile(store, { ...baseProfile, name: '   ' })).toThrow(/name is required/);
    expect(() =>
      addProfile(store, { ...baseProfile, name: 'x', environment: 'staging' as never }),
    ).toThrow(/sandbox or production/);
    expect(() => addProfile(store, { ...baseProfile, name: 'x', merchantId: '' })).toThrow(/Merchant ID and API key/);
    expect(() =>
      addProfile(store, { ...baseProfile, name: 'x', note: 'n'.repeat(301) }),
    ).toThrow(/at most 300 characters/);
    addProfile(store, baseProfile);
    expect(() => addProfile(store, { ...baseProfile })).toThrow(/already exists/);
    for (let i = store.profiles.length; i < 8; i += 1) {
      addProfile(store, { ...baseProfile, name: `p${i}` });
    }
    expect(() => addProfile(store, { ...baseProfile, name: 'p9' })).toThrow(/maximum of 8/i);
  });

  it('trims names and notes on save', () => {
    const store = createEmptyProfileStore();
    addProfile(store, { ...baseProfile, name: '  padded  ', note: '  note  ' });
    expect(store.profiles[0].name).toBe('padded');
    expect(store.profiles[0].note).toBe('note');
  });
});

describe('default/active profile helpers', () => {
  it('setDefaultProfile and removeProfile validate the name', () => {
    const store = createEmptyProfileStore();
    expect(() => setDefaultProfile(store, 'ghost')).toThrow(/does not exist/);
    expect(() => removeProfile(store, 'ghost')).toThrow(/does not exist/);
    addProfile(store, baseProfile);
    setDefaultProfile(store, 'sandbox-main');
    expect(activeProfile(store)?.name).toBe('sandbox-main');
    removeProfile(store, 'sandbox-main');
    expect(store.defaultProfile).toBeUndefined();
    expect(activeProfile(store)).toBeUndefined();
  });

  it('activateProfile fills only missing env vars (explicit values win)', () => {
    const store = createEmptyProfileStore();
    addProfile(store, {
      ...baseProfile,
      publicKeyPem: '-----BEGIN PUBLIC KEY-----',
      baseUrl: 'https://custom.example.com',
      khqr: { bakongId: 'bakong@aba', merchantName: 'Test' } as never,
    });
    const profile = getProfileByName(store, 'sandbox-main')!;
    const env: NodeJS.ProcessEnv = { PAYWAY_MERCHANT_ID: 'explicit-merchant' };
    activateProfile(profile, env);
    expect(env.PAYWAY_MERCHANT_ID).toBe('explicit-merchant'); // explicit wins
    expect(env.PAYWAY_API_KEY).toBe('key-1');
    expect(env.PAYWAY_ENV).toBe('sandbox');
    expect(env.PAYWAY_SANDBOX).toBe('true');
    expect(env.PAYWAY_BASE_URL).toBe('https://custom.example.com');
    expect(env.PAYWAY_KHQR_BAKONG_ID).toBe('bakong@aba');
  });
});
