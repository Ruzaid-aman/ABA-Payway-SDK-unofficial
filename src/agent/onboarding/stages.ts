/**
 * Onboarding stage machine.
 *
 * Pure-ish orchestration: every side effect (prompts, file writes, provider
 * connectivity) is injected through `StageContext.io` / `StageContext` callbacks,
 * so the flow is fully unit-testable. The `payway-sdk onboard` command supplies a
 * concrete implementation that wraps @clack/prompts.
 */

import { addProfile, loadProfileStore, saveProfileStore, setDefaultProfile } from '../../config/profiles.js';
import type { CredentialProfile } from '../../config/profiles.js';
import type { KhqrMerchantConfiguration, KhqrCallbackEnrollment, KhqrCallbackVerification } from '../../khqr-config.js';
import { updateAgentConfig } from '../config.js';
import { createProviderAdapter, type ProviderConnectivity } from '../provider.js';
import { scanOnboardingState, type ScanSnapshot } from './scan.js';
import type { ProviderConfigV1, ProviderPreset } from '../contracts.js';

export type { ProviderPreset };

export type StageName = 'provider' | 'profile' | 'callback' | 'privacy' | 'verify';

export interface OnboardingIO {
  selectProvider(): Promise<ProviderPreset>;
  inputModel(provider: ProviderPreset): Promise<string>;
  chooseKeyPlacement(): Promise<'session' | 'dotenv' | 'user'>;
  secret(prompt: string): Promise<string>;
  input(prompt: string, fallback?: string): Promise<string>;
  confirm(prompt: string, def?: boolean): Promise<boolean>;
  multiselectKhqr(): Promise<boolean>;
  writeEnvVar(key: string, value: string): Promise<void>;
  spinner<T>(label: string, fn: () => Promise<T>): Promise<T>;
  note(message: string): void;
}

export interface StageContext {
  env: NodeJS.ProcessEnv;
  io: OnboardingIO;
  /** Injected for tests; defaults to the real provider adapter. */
  checkProviderConnectivity?: (config: ProviderConfigV1) => Promise<ProviderConnectivity>;
}

export interface StageResult {
  name: StageName;
  status: 'done' | 'skipped';
  notes?: string[];
}

const MODEL_DEFAULTS: Record<ProviderPreset, string> = {
  openai: 'gpt-4o',
  openrouter: 'openai/gpt-4o',
  nvidia: 'meta/llama-3.3-70b-instruct',
  custom: '',
};

/** Ordered stages to run for a given snapshot (verify always runs last). */
export function pendingStages(snapshot: ScanSnapshot): StageName[] {
  const stages: StageName[] = [];
  if (!(snapshot.agentConfig && snapshot.hasAgentApiKey)) stages.push('provider');
  if (!snapshot.profile) stages.push('profile');
  if (!snapshot.callbackValid) stages.push('callback');
  if (!snapshot.privacyAcknowledged) stages.push('privacy');
  stages.push('verify');
  return stages;
}

export async function runStage(name: StageName, ctx: StageContext): Promise<StageResult> {
  switch (name) {
    case 'provider':
      return runProviderStage(ctx);
    case 'profile':
      return runProfileStage(ctx);
    case 'callback':
      return runCallbackStage(ctx);
    case 'privacy':
      return runPrivacyStage(ctx);
    case 'verify':
      return { name: 'verify', status: 'done', notes: ['Re-scanned onboarding state.'] };
  }
}

async function runProviderStage(ctx: StageContext): Promise<StageResult> {
  const provider = await ctx.io.selectProvider();
  const model = (await ctx.io.inputModel(provider)).trim() || MODEL_DEFAULTS[provider];
  const placement = await ctx.io.chooseKeyPlacement();
  const key = (await ctx.io.secret('Provider API key (PAYWAY_AGENT_API_KEY): ')).trim();

  ctx.env.PAYWAY_AGENT_API_KEY = key; // enable in-process connectivity check
  if (placement === 'dotenv') {
    await ctx.io.writeEnvVar('PAYWAY_AGENT_API_KEY', key);
  } else if (placement === 'user') {
    ctx.io.note('Persist for future sessions:\n  [Environment]::SetEnvironmentVariable("PAYWAY_AGENT_API_KEY", "<key>", "User")');
  } else {
    ctx.io.note('Key set for this session only — re-export it in new shells.');
  }

  const config = updateAgentConfig({ provider, model, capabilityMode: 'strict-json-plan' });

  const check: (config: ProviderConfigV1) => Promise<ProviderConnectivity> =
    ctx.checkProviderConnectivity ?? ((c) => createProviderAdapter(c).checkConnectivity());
  let connectivity: ProviderConnectivity = await ctx.io.spinner('Verifying provider connectivity', () => check(config));
  let attempts = 0;
  while (connectivity.status !== 'ready' && attempts < 3) {
    ctx.io.note(`Connectivity: ${connectivity.detail ?? connectivity.status}`);
    const retry = await ctx.io.confirm('Provider unreachable. Retry?', true);
    if (!retry) break;
    connectivity = await ctx.io.spinner('Verifying provider connectivity', () => check(config));
    attempts++;
  }
  if (connectivity.status !== 'ready') {
    ctx.io.note('Continuing without confirmed connectivity — verify with "agent doctor" later.');
  }
  return { name: 'provider', status: 'done', notes: [`Provider ${provider} / ${model}`] };
}

async function runProfileStage(ctx: StageContext): Promise<StageResult> {
  const name = (await ctx.io.input('Profile name', 'sandbox')).trim();
  const environment = (await ctx.io.input('Environment (sandbox/production)', 'sandbox')).trim().toLowerCase() as
    | 'sandbox'
    | 'production';
  const merchantId = (await ctx.io.input('Merchant ID')).trim();
  const apiKey = (await ctx.io.secret('API key: ')).trim();
  const publicKeyPem = (await ctx.io.input('RSA public key PEM (optional)', '')).trim() || undefined;
  const baseUrl = (await ctx.io.input('Base URL override (optional)', '')).trim() || undefined;

  const profile: CredentialProfile = { name, environment, merchantId, apiKey };
  if (publicKeyPem) profile.publicKeyPem = publicKeyPem;
  if (baseUrl) profile.baseUrl = baseUrl;

  if (await ctx.io.multiselectKhqr()) {
    const khqr: KhqrMerchantConfiguration = {
      bakongId: (await ctx.io.input('Bakong ID')).trim(),
      abaMerchantId: (await ctx.io.input('ABA merchant ID')).trim(),
      acquirerName: (await ctx.io.input('Acquirer name')).trim(),
      merchantCategoryCode: (await ctx.io.input('Merchant category code')).trim(),
      merchantName: (await ctx.io.input('Merchant name')).trim(),
      merchantCity: (await ctx.io.input('Merchant city')).trim(),
      paywayData: (await ctx.io.secret('ABA PayWay data: ')).trim(),
    };
    const callbackUrl = (await ctx.io.input('KHQR callback URL (optional)', '')).trim();
    if (callbackUrl) {
      khqr.callback = {
        url: callbackUrl,
        enrollment: 'not-requested' as KhqrCallbackEnrollment,
        verification: 'unknown' as KhqrCallbackVerification,
      };
    }
    profile.khqr = khqr;
  }

  const store = loadProfileStore();
  if (store.profiles.length >= 8) {
    throw new Error('Maximum of 8 credential profiles reached. Remove one with "payway-sdk profiles remove".');
  }
  if (store.profiles.some((p) => p.name === profile.name)) {
    throw new Error(`Profile "${profile.name}" already exists. Remove it or use a different name.`);
  }
  addProfile(store, profile);
  if (!store.defaultProfile) setDefaultProfile(store, profile.name);
  saveProfileStore(store);
  return { name: 'profile', status: 'done', notes: [`Profile ${profile.name} (${profile.environment})`].concat(profile.khqr ? ['KHQR configured'] : []) };
}

async function runCallbackStage(ctx: StageContext): Promise<StageResult> {
  let url = (await ctx.io.input('Online QR callback URL (public HTTPS)', '')).trim();
  let attempts = 0;
  // Lazy import to avoid a cycle with url-policy if it ever moves.
  const { isPublicHttpsUrl } = await import('../url-policy.js');
  while (url && !isPublicHttpsUrl(url) && attempts < 3) {
    ctx.io.note('Callback must be a public https:// URL (not .local, not http://, not localhost).');
    url = (await ctx.io.input('Online QR callback URL (public HTTPS)', '')).trim();
    attempts++;
  }
  if (!url) {
    ctx.io.note('Skipped callback — run "payway-sdk setup-webhook --tunnel" later to enable online QR.');
    return { name: 'callback', status: 'done', notes: ['Callback skipped'] };
  }
  ctx.env.PAYWAY_CALLBACK_URL = url;
  await ctx.io.writeEnvVar('PAYWAY_CALLBACK_URL', url);
  return { name: 'callback', status: 'done', notes: [`Callback ${url}`] };
}

async function runPrivacyStage(ctx: StageContext): Promise<StageResult> {
  const ok = await ctx.io.confirm('Acknowledge the provider privacy notice?', true);
  if (!ok) return { name: 'privacy', status: 'skipped', notes: ['Privacy not acknowledged'] };
  updateAgentConfig({ privacyAcknowledgedAt: new Date().toISOString() });
  return { name: 'privacy', status: 'done', notes: ['Privacy acknowledged'] };
}

export { scanOnboardingState };
