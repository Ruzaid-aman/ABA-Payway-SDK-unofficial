import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Environment } from '../client.js';
import type { KhqrMerchantConfiguration } from '../khqr-config.js';

export interface CredentialProfile {
  name: string;
  merchantId?: string;
  apiKey?: string;
  environment?: Environment;
  khqr?: KhqrMerchantConfiguration;
}

export interface CredentialProfileStore {
  profiles: CredentialProfile[];
  activeProfile?: string;
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

export function getProfileDirectory(appData = process.env.APPDATA): string {
  return path.join(appData || process.cwd(), 'aba-payway-sdk');
}

export function getProfilePath(appData = process.env.APPDATA): string {
  return path.join(getProfileDirectory(appData), 'profiles.json');
}

export function loadProfileStore(appData = process.env.APPDATA): CredentialProfileStore {
  const profilePath = getProfilePath(appData);
  if (!existsSync(profilePath)) return { profiles: [] };
  try {
    const parsed: unknown = JSON.parse(readFileSync(profilePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as CredentialProfileStore).profiles)) {
      return { profiles: [] };
    }
    return parsed as CredentialProfileStore;
  } catch {
    return { profiles: [] };
  }
}

export function saveProfileStore(store: CredentialProfileStore, appData = process.env.APPDATA): void {
  const directory = getProfileDirectory(appData);
  mkdirSync(directory, { recursive: true });
  writeFileSync(getProfilePath(appData), `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

/** Activates a profile for this process, clearing stale optional KHQR data first. */
export function activateProfile(profile: CredentialProfile, environment: NodeJS.ProcessEnv = process.env): void {
  setOrClear(environment, 'PAYWAY_MERCHANT_ID', profile.merchantId);
  setOrClear(environment, 'PAYWAY_API_KEY', profile.apiKey);
  setOrClear(environment, 'PAYWAY_ENV', profile.environment);
  for (const field of Object.keys(KHQR_ENVIRONMENT_FIELDS) as KhqrEnvironmentField[]) {
    setOrClear(environment, KHQR_ENVIRONMENT_FIELDS[field], profile.khqr?.[field]);
  }
}

export function activeProfile(store: CredentialProfileStore): CredentialProfile | undefined {
  return store.profiles.find((profile) => profile.name === store.activeProfile);
}

export function maskProfileValue(value: string | undefined, visibleCharacters = 4): string {
  if (!value) return '(not set)';
  return `${value.slice(0, visibleCharacters)}…`;
}

function setOrClear(environment: NodeJS.ProcessEnv, key: string, value: string | undefined): void {
  if (typeof value === 'string' && value.trim().length > 0) environment[key] = value;
  else delete environment[key];
}
