import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addProfile,
  createEmptyProfileStore,
  getProfileByName,
  saveProfileStore,
  loadProfileStore,
  setDefaultProfile,
} from '../config/profiles.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('credential profiles', () => {
  it('persists separate sandbox and production profiles with notes', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'payway-profiles-'));
    temporaryDirectories.push(directory);
    const profilePath = path.join(directory, 'profiles.json');
    const store = createEmptyProfileStore();

    addProfile(store, {
      name: 'sandbox-main', environment: 'sandbox', merchantId: 'sandbox-merchant', apiKey: 'sandbox-key', note: 'Test merchant',
    });
    addProfile(store, {
      name: 'production-main', environment: 'production', merchantId: 'production-merchant', apiKey: 'production-key',
    });
    setDefaultProfile(store, 'sandbox-main');
    saveProfileStore(store, profilePath);

    const loaded = loadProfileStore(profilePath);
    expect(loaded.defaultProfile).toBe('sandbox-main');
    expect(getProfileByName(loaded, 'production-main')).toMatchObject({ environment: 'production' });
    expect(getProfileByName(loaded, 'production-main')).not.toHaveProperty('note');
    expect(getProfileByName(loaded, 'sandbox-main')).toMatchObject({ note: 'Test merchant' });
  });

  it('rejects a ninth profile and notes longer than 300 characters', () => {
    const store = createEmptyProfileStore();
    for (let index = 1; index <= 8; index++) {
      addProfile(store, { name: `profile-${index}`, environment: 'sandbox', merchantId: `merchant-${index}`, apiKey: `key-${index}` });
    }

    expect(() => addProfile(store, { name: 'profile-9', environment: 'production', merchantId: 'merchant-9', apiKey: 'key-9' }))
      .toThrow('maximum of 8 profiles');
    expect(() => addProfile(createEmptyProfileStore(), { name: 'long-note', environment: 'sandbox', merchantId: 'merchant', apiKey: 'key', note: 'a'.repeat(301) }))
      .toThrow('300 characters');
  });
});
