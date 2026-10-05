import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pendingStages, runStage, type OnboardingIO, type StageContext } from '../../src/agent/onboarding/stages.js';
import { scanOnboardingState, type ScanSnapshot } from '../../src/agent/onboarding/scan.js';
import { readAgentConfig } from '../../src/agent/config.js';
import { writeAgentConfig } from '../../src/agent/config.js';
import { loadProfileStore, saveProfileStore } from '../../src/config/profiles.js';
import type { ProviderConfigV1, ProviderPreset } from '../../src/agent/contracts.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'payway-onboard-'));
  process.env.APPDATA = tmp;
  for (const k of ['PAYWAY_AGENT_API_KEY', 'PAYWAY_CALLBACK_URL', 'PAYWAY_MERCHANT_ID', 'PAYWAY_API_KEY']) {
    delete process.env[k];
  }
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function makeIo(overrides: Partial<OnboardingIO> = {}): { io: OnboardingIO; written: Record<string, string> } {
  const written: Record<string, string> = {};
  const base: OnboardingIO = {
    selectProvider: async () => 'nvidia' as ProviderPreset,
    inputModel: async () => 'm',
    chooseKeyPlacement: async () => 'session',
    secret: async () => 'secret-key',
    input: async (p, fallback = '') => {
      if (p.toLowerCase().includes('merchant')) return 'MERCH123';
      if (p.toLowerCase().includes('api')) return 'KEY456';
      return fallback;
    },
    confirm: async () => true,
    multiselectKhqr: async () => false,
    writeEnvVar: async (k, v) => {
      written[k] = v;
    },
    spinner: async <T>(_label: string, fn: () => Promise<T>) => fn(),
    note: () => {},
    ...overrides,
  };
  return { io: base, written };
}

function ctxWith(env: NodeJS.ProcessEnv, io: OnboardingIO, connectivity: 'ready' | 'blocked' = 'ready'): StageContext {
  return {
    env,
    io,
    checkProviderConnectivity: async (c: ProviderConfigV1) =>
      connectivity === 'ready'
        ? { status: 'ready', detail: `ok:${c.provider}` }
        : { status: 'blocked', detail: 'unreachable' },
  };
}

describe('scanOnboardingState', () => {
  it('reports empty state when nothing configured', () => {
    const snap = scanOnboardingState(process.env);
    expect(snap.agentConfig).toBeNull();
    expect(snap.hasAgentApiKey).toBe(false);
    expect(snap.profile).toBeNull();
    expect(snap.callbackValid).toBe(false);
    expect(snap.privacyAcknowledged).toBe(false);
  });

  it('detects key + profile + valid callback', () => {
    process.env.PAYWAY_AGENT_API_KEY = 'k';
    process.env.PAYWAY_CALLBACK_URL = 'https://cb.example.com/h';
    const store = loadProfileStore();
    store.profiles.push({ name: 'p', environment: 'sandbox' as const, merchantId: 'm', apiKey: 'a' });
    store.defaultProfile = 'p';
    saveProfileStore(store);
    const snap = scanOnboardingState(process.env) as ScanSnapshot;
    expect(snap.hasAgentApiKey).toBe(true);
    expect(snap.profile?.name).toBe('p');
    expect(snap.callbackValid).toBe(true);
  });
});

describe('pendingStages', () => {
  it('lists every stage for empty state', () => {
    const snap = scanOnboardingState(process.env);
    expect(pendingStages(snap)).toEqual(['provider', 'profile', 'callback', 'privacy', 'verify']);
  });

  it('skips provider when configured + key present', () => {
    process.env.PAYWAY_AGENT_API_KEY = 'k';
    // simulate existing agent config by writing minimal
    writeAgentConfig({
      version: 'agent-config/v1',
      provider: 'nvidia',
      model: 'm',
      capabilityMode: 'strict-json-plan',
    });
    const snap = scanOnboardingState(process.env);
    expect(pendingStages(snap)).not.toContain('provider');
  });
});

describe('runStage', () => {
  it('provider stage writes key into env + persists config', async () => {
    const env: NodeJS.ProcessEnv = {};
    const { io } = makeIo();
    const result = await runStage('provider', ctxWith(env, io));
    expect(result.status).toBe('done');
    expect(env.PAYWAY_AGENT_API_KEY).toBe('secret-key');
    expect(readAgentConfig()?.provider).toBe('nvidia');
  });

  it('provider stage retries then continues on blocked connectivity', async () => {
    const env: NodeJS.ProcessEnv = {};
    const { io } = makeIo();
    const result = await runStage('provider', ctxWith(env, io, 'blocked'));
    expect(result.status).toBe('done');
    expect(env.PAYWAY_AGENT_API_KEY).toBe('secret-key');
  });

  it('callback stage stores a public URL', async () => {
    const env: NodeJS.ProcessEnv = {};
    const { io, written } = makeIo({ input: async () => 'https://cb.example.com/hook' });
    await runStage('callback', ctxWith(env, io));
    expect(env.PAYWAY_CALLBACK_URL).toBe('https://cb.example.com/hook');
    expect(written.PAYWAY_CALLBACK_URL).toBe('https://cb.example.com/hook');
  });

  it('callback stage rejects non-public URL and falls through after empty input', async () => {
    const env: NodeJS.ProcessEnv = {};
    const calls: string[] = [];
    const { io } = makeIo({
      input: async (p) => {
        calls.push(p);
        // first invalid, then empty (skip)
        return calls.length === 1 ? 'http://localhost/cb' : '';
      },
    });
    const result = await runStage('callback', ctxWith(env, io));
    expect(result.notes).toContain('Callback skipped');
    expect(env.PAYWAY_CALLBACK_URL).toBeUndefined();
  });

  it('profile stage creates a default profile', async () => {
    const env: NodeJS.ProcessEnv = {};
    const { io } = makeIo();
    await runStage('profile', ctxWith(env, io));
    const store = loadProfileStore();
    expect(store.profiles).toHaveLength(1);
    expect(store.defaultProfile).toBe(store.profiles[0].name);
  });

  it('privacy stage sets acknowledgement', async () => {
    const env: NodeJS.ProcessEnv = {};
    const { io } = makeIo();
    await runStage('privacy', ctxWith(env, io));
    expect(readAgentConfig()?.privacyAcknowledgedAt).toBeTruthy();
  });
});
