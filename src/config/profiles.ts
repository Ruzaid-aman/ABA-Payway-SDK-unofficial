import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { KhqrMerchantConfiguration } from '../khqr-config.js';

export const MAX_CREDENTIAL_PROFILES = 8;
export const MAX_PROFILE_NOTE_LENGTH = 300;

export type ProfileEnvironment = 'sandbox' | 'production';

export interface CredentialProfile {
  name: string;
  environment: ProfileEnvironment;
  merchantId: string;
  apiKey: string;
  publicKeyPem?: string;
  baseUrl?: string;
  note?: string;
  /** ABA-issued data for local official KHQR generation. */
  khqr?: KhqrMerchantConfiguration;
}

export interface CredentialProfileStore {
  version: 1;
  defaultProfile?: string;
  /** Legacy alias accepted when reading profiles created by prerelease KHQR tooling. */
  activeProfile?: string;
  profiles: CredentialProfile[];
}

export const KHQR_ENVIRONMENT_FIELDS = {
  bakongId: 'PAYWAY_KHQR_BAKONG_ID',
  abaMerchantId: 'PAYWAY_KHQR_ABA_MERCHANT_ID',
  acquirerName: 'PAYWAY_KHQR_ACQUIRER_NAME',
  merchantCategoryCode: 'PAYWAY_KHQR_MERCHANT_CATEGORY_CODE',
  merchantName: 'PAYWAY_KHQR_MERCHANT_NAME',
  merchantCity: 'PAYWAY_KHQR_MERCHANT_CITY',
  paywayData: 'PAYWAY_KHQR_PAYWAY_DATA',
} as const;

type KhqrEnvironmentField = keyof typeof KHQR_ENVIRONMENT_FIELDS;

export function getProfileStorePath(appDataDirectory = process.env.APPDATA ?? path.join(homedir(), '.config')): string {
  return path.join(appDataDirectory, 'aba-payway-sdk', 'profiles.json');
}

export function createEmptyProfileStore(): CredentialProfileStore {
  return { version: 1, profiles: [] };
}

export function loadProfileStore(filePath = getProfileStorePath()): CredentialProfileStore {
  if (!existsSync(filePath)) return createEmptyProfileStore();
  const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as CredentialProfileStore).profiles)) {
    throw new Error(`Invalid credential profile store: ${filePath}`);
  }
  return parsed as CredentialProfileStore;
}

export function saveProfileStore(store: CredentialProfileStore, filePath = getProfileStorePath()): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(temporaryPath, filePath);
}

export function getProfileByName(store: CredentialProfileStore, name: string): CredentialProfile | undefined {
  return store.profiles.find((profile) => profile.name === name);
}

export function addProfile(store: CredentialProfileStore, profile: CredentialProfile): void {
  if (!profile.name.trim()) throw new Error('Profile name is required');
  if (!['sandbox', 'production'].includes(profile.environment))
    throw new Error('Profile environment must be sandbox or production');
  if (!profile.merchantId.trim() || !profile.apiKey.trim()) throw new Error('Merchant ID and API key are required');
  if (profile.note && profile.note.length > MAX_PROFILE_NOTE_LENGTH)
    throw new Error('Profile note must be at most 300 characters');
  if (getProfileByName(store, profile.name)) throw new Error(`Profile "${profile.name}" already exists`);
  if (store.profiles.length >= MAX_CREDENTIAL_PROFILES) throw new Error('A maximum of 8 profiles is allowed');
  store.profiles.push({ ...profile, name: profile.name.trim(), note: profile.note?.trim() || undefined });
}

export function setDefaultProfile(store: CredentialProfileStore, name: string): void {
  if (!getProfileByName(store, name)) throw new Error(`Profile "${name}" does not exist`);
  store.defaultProfile = name;
}

export function removeProfile(store: CredentialProfileStore, name: string): void {
  const index = store.profiles.findIndex((profile) => profile.name === name);
  if (index === -1) throw new Error(`Profile "${name}" does not exist`);
  store.profiles.splice(index, 1);
  if (store.defaultProfile === name) store.defaultProfile = undefined;
}

/**
 * Applies a profile as a fallback only. Explicit environment values retain
 * precedence over values stored in a local profile.
 */
export function activateProfile(profile: CredentialProfile, environment: NodeJS.ProcessEnv = process.env): void {
  setIfMissing(environment, 'PAYWAY_MERCHANT_ID', profile.merchantId);
  setIfMissing(environment, 'PAYWAY_API_KEY', profile.apiKey);
  setIfMissing(environment, 'PAYWAY_RSA_PUBLIC_KEY', profile.publicKeyPem);
  setIfMissing(environment, 'PAYWAY_BASE_URL', profile.baseUrl);
  setIfMissing(environment, 'PAYWAY_ENV', profile.environment);
  setIfMissing(environment, 'PAYWAY_SANDBOX', profile.environment === 'sandbox' ? 'true' : 'false');
  for (const field of Object.keys(KHQR_ENVIRONMENT_FIELDS) as KhqrEnvironmentField[]) {
    setIfMissing(environment, KHQR_ENVIRONMENT_FIELDS[field], profile.khqr?.[field]);
  }
}

export function activeProfile(store: CredentialProfileStore): CredentialProfile | undefined {
  return getProfileByName(store, store.defaultProfile ?? store.activeProfile ?? '');
}

function setIfMissing(environment: NodeJS.ProcessEnv, key: string, value: string | undefined): void {
  if (environment[key] === undefined && typeof value === 'string' && value.trim().length > 0) {
    environment[key] = value;
  }
}
