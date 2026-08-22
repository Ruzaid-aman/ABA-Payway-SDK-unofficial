import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedPayWayContext } from '../agent/context.js';
import { createAgentPayWay, resolvePayWayContext } from '../agent/context.js';
import type { ProviderConfigV1 } from '../agent/contracts.js';
import { evaluateReadiness } from '../agent/readiness.js';

const { khqrFields, storeRef } = vi.hoisted(() => ({
  khqrFields: {
    bakongId: 'PAYWAY_KHQR_BAKONG_ID',
    abaMerchantId: 'PAYWAY_KHQR_ABA_MERCHANT_ID',
    acquirerName: 'PAYWAY_KHQR_ACQUIRER_NAME',
    merchantCategoryCode: 'PAYWAY_KHQR_MERCHANT_CATEGORY_CODE',
    merchantName: 'PAYWAY_KHQR_MERCHANT_NAME',
    merchantCity: 'PAYWAY_KHQR_MERCHANT_CITY',
    paywayData: 'PAYWAY_KHQR_PAYWAY_DATA',
  } as const,
  storeRef: {
    current: { version: 1, profiles: [] as any[], defaultProfile: undefined, activeProfile: undefined } as Record<
      string,
      any
    >,
  },
}));

vi.mock('../config/profiles.js', () => ({
  loadProfileStore: () => storeRef.current,
  KHQR_ENVIRONMENT_FIELDS: khqrFields,
}));

function makeProfile(name: string, environment: 'sandbox' | 'production' = 'production') {
  return {
    name,
    environment,
    merchantId: `merchant-${name}`,
    apiKey: `key-${name}`,
    publicKeyPem: `pem-${name}`,
    baseUrl: `https://${name}.example.test`,
    khqr: {
      bakongId: 'bakong',
      abaMerchantId: '123456789012345',
      acquirerName: 'Acquirer',
      merchantCategoryCode: '1234',
      merchantName: 'Merchant',
      merchantCity: 'Phnom Penh',
      paywayData: 'data',
    },
  };
}

function baseProvider(): ProviderConfigV1 {
  return { version: 'agent-config/v1', provider: 'openai', model: 'gpt-4o', capabilityMode: 'strict-json-plan' };
}

function emptyEnv(): NodeJS.ProcessEnv {
  return {};
}

afterEach(() => {
  storeRef.current = { version: 1, profiles: [] };
});

describe('resolvePayWayContext — profile precedence', () => {
  it('uses an explicit --profile option', () => {
    storeRef.current = { version: 1, profiles: [makeProfile('prod')] };
    const ctx = resolvePayWayContext({ profile: 'prod', env: emptyEnv() });
    expect(ctx.source).toBe('option');
    expect(ctx.profileName).toBe('prod');
    expect(ctx.merchantId).toBe('merchant-prod');
    expect(ctx.environment).toBe('production');
  });

  it('prefers --profile option over PAYWAY_PROFILE env and default profile', () => {
    storeRef.current = {
      version: 1,
      defaultProfile: 'def',
      profiles: [makeProfile('option'), makeProfile('def', 'sandbox')],
    };
    const ctx = resolvePayWayContext({ profile: 'option', env: { PAYWAY_PROFILE: 'def' } as NodeJS.ProcessEnv });
    expect(ctx.source).toBe('option');
    expect(ctx.profileName).toBe('option');
  });

  it('falls back to PAYWAY_PROFILE env when no option is given', () => {
    storeRef.current = { version: 1, profiles: [makeProfile('envprof', 'sandbox')] };
    const ctx = resolvePayWayContext({ env: { PAYWAY_PROFILE: 'envprof' } as NodeJS.ProcessEnv });
    expect(ctx.source).toBe('env');
    expect(ctx.profileName).toBe('envprof');
    expect(ctx.environment).toBe('sandbox');
  });

  it('falls back to the saved default profile', () => {
    storeRef.current = { version: 1, defaultProfile: 'dflt', profiles: [makeProfile('dflt')] };
    const ctx = resolvePayWayContext({ env: emptyEnv() });
    expect(ctx.source).toBe('default');
    expect(ctx.profileName).toBe('dflt');
  });

  it('falls back to the legacy activeProfile', () => {
    storeRef.current = { version: 1, activeProfile: 'leg', profiles: [makeProfile('leg', 'sandbox')] };
    const ctx = resolvePayWayContext({ env: emptyEnv() });
    expect(ctx.source).toBe('legacy');
    expect(ctx.profileName).toBe('leg');
  });

  it('resolves from .env (no profile) using ambient credentials', () => {
    const ctx = resolvePayWayContext({
      env: {
        PAYWAY_MERCHANT_ID: 'env-merchant',
        PAYWAY_API_KEY: 'env-key',
        PAYWAY_ENV: 'sandbox',
      } as NodeJS.ProcessEnv,
    });
    expect(ctx.source).toBe('none');
    expect(ctx.merchantId).toBe('env-merchant');
    expect(ctx.apiKey).toBe('env-key');
    expect(ctx.environment).toBe('sandbox');
  });
});

describe('resolvePayWayContext — authority and safety', () => {
  it('does NOT let a stale ambient PAYWAY_MERCHANT_ID override a selected profile', () => {
    storeRef.current = { version: 1, profiles: [makeProfile('prod')] };
    const ctx = resolvePayWayContext({
      profile: 'prod',
      env: { PAYWAY_MERCHANT_ID: 'stale-merchant', PAYWAY_API_KEY: 'stale-key' } as NodeJS.ProcessEnv,
    });
    expect(ctx.merchantId).toBe('merchant-prod');
    expect(ctx.apiKey).toBe('key-prod');
  });

  it('does NOT mutate process.env', () => {
    storeRef.current = { version: 1, profiles: [makeProfile('prod')] };
    const snapshot = { ...process.env };
    resolvePayWayContext({
      profile: 'prod',
      env: {
        PAYWAY_PROFILE: 'other',
        PAYWAY_MERCHANT_ID: 'stale',
        PAYWAY_API_KEY: 'stale',
        PAYWAY_CALLBACK_URL: 'https://cb.example.com',
      } as NodeJS.ProcessEnv,
    });
    expect(process.env).toEqual(snapshot);
  });

  it('displayLabel contains no secret material', () => {
    const ctx = resolvePayWayContext({
      env: {
        PAYWAY_MERCHANT_ID: 'SECRET-MERCHANT-123',
        PAYWAY_API_KEY: 'SUPERSECRETKEY',
        PAYWAY_ENV: 'production',
      } as NodeJS.ProcessEnv,
    });
    expect(ctx.displayLabel).not.toContain('SECRET-MERCHANT-123');
    expect(ctx.displayLabel).not.toContain('SUPERSECRETKEY');
    expect(ctx.displayLabel).toContain('production');
  });
});

function context(overrides: Partial<ResolvedPayWayContext>): ResolvedPayWayContext {
  return {
    source: 'option',
    profileName: 'prod',
    environment: 'production',
    merchantId: 'm',
    apiKey: 'k',
    displayLabel: 'profile: prod (production)',
    ...overrides,
  };
}

describe('evaluateReadiness', () => {
  it('reports onlineQr missing when callbackUrl is absent', () => {
    const matrix = evaluateReadiness(context({}), baseProvider());
    expect(matrix.onlineQr).toBe('missing');
    expect(matrix.provider).toBe('unverified');
    expect(matrix.context).toBe('ready');
  });

  it('reports onlineQr invalid for a non-public callback URL', () => {
    const matrix = evaluateReadiness(context({ callbackUrl: 'http://localhost/cb' }), baseProvider());
    expect(matrix.onlineQr).toBe('invalid');
  });

  it('reports onlineQr ready for a public https callback URL', () => {
    const matrix = evaluateReadiness(context({ callbackUrl: 'https://cb.example.com/hook' }), baseProvider());
    expect(matrix.onlineQr).toBe('ready');
  });

  it('reports offlineKhqr missing without khqr config and ready with it', () => {
    expect(evaluateReadiness(context({ khqr: undefined }), baseProvider()).offlineKhqr).toBe('missing');
    const ready = evaluateReadiness(context({ khqr: makeProfile('p').khqr }), baseProvider());
    expect(ready.offlineKhqr).toBe('ready');
  });

  it('reports paymentLinkRsa ready only when publicKeyPem is present', () => {
    expect(evaluateReadiness(context({ publicKeyPem: undefined }), baseProvider()).paymentLinkRsa).toBe('missing');
    expect(evaluateReadiness(context({ publicKeyPem: 'pem' }), baseProvider()).paymentLinkRsa).toBe('ready');
  });

  it('reports checkout ready when credentials are present', () => {
    expect(evaluateReadiness(context({ merchantId: '', apiKey: '' }), baseProvider()).checkout).toBe('missing');
    expect(evaluateReadiness(context({}), baseProvider()).checkout).toBe('ready');
  });

  it('reports artifact/session storage ready', () => {
    const matrix = evaluateReadiness(context({}), baseProvider());
    expect(matrix.artifactStorage).toBe('ready');
    expect(matrix.sessionStorage).toBe('ready');
  });
});

describe('createAgentPayWay', () => {
  it("sets maxRetries: 0 for operationKind 'create'", () => {
    const client = createAgentPayWay(context({ merchantId: 'm', apiKey: 'k', environment: 'sandbox' }), 'create');
    const config = (client as unknown as { config: { maxRetries?: number } }).config;
    expect(config.maxRetries).toBe(0);
  });

  it("does not force maxRetries for operationKind 'read'", () => {
    const client = createAgentPayWay(context({ merchantId: 'm', apiKey: 'k', environment: 'sandbox' }), 'read');
    const config = (client as unknown as { config: { maxRetries?: number } }).config;
    expect(config.maxRetries).toBeUndefined();
  });
});
