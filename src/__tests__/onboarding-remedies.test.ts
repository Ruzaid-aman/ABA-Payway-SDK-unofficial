import { describe, expect, it } from 'vitest';
import { REMEDIES, type RemedyId } from '../../src/agent/onboarding/remedies.js';
import { evaluateReadinessDetailed } from '../../src/agent/readiness.js';
import type { ProviderConfigV1 } from '../../src/agent/contracts.js';
import type { ResolvedPayWayContext } from '../../src/agent/context.js';

function fakeContext(overrides: Partial<ResolvedPayWayContext> = {}): ResolvedPayWayContext {
  return {
    source: 'none',
    environment: 'sandbox',
    merchantId: '',
    apiKey: '',
    displayLabel: 'profile: none (sandbox)',
    ...overrides,
  } as ResolvedPayWayContext;
}

const defaultConfig: ProviderConfigV1 = {
  version: 'agent-config/v1',
  provider: 'nvidia',
  model: 'm',
  capabilityMode: 'strict-json-plan',
};

describe('remedies catalog', () => {
  it('every remedy has non-empty fix text', () => {
    for (const id of Object.keys(REMEDIES) as RemedyId[]) {
      expect(REMEDIES[id].fix.trim().length).toBeGreaterThan(0);
    }
  });

  it('maps each non-ok capability to a defined remedy', () => {
    const rows = evaluateReadinessDetailed(
      fakeContext({ source: 'none', callbackUrl: 'http://localhost/cb' }),
      defaultConfig,
      { privacyAcknowledged: false },
    );
    for (const row of rows) {
      if (row.state !== 'ready' && row.remedyId) {
        expect(REMEDIES[row.remedyId], `row ${row.id} -> ${row.remedyId}`).toBeDefined();
      }
    }
  });
});

describe('evaluateReadinessDetailed mapping', () => {
  it('context missing -> PROFILE_CREATE, onlineQr invalid (.local) -> CALLBACK_URL', () => {
    const rows = evaluateReadinessDetailed(
      fakeContext({ source: 'none', callbackUrl: 'https://x.payway.local/cb' }),
      defaultConfig,
      { privacyAcknowledged: false },
    );
    const ctx = rows.find((r) => r.id === 'context')!;
    const qr = rows.find((r) => r.id === 'onlineQr')!;
    const privacy = rows.find((r) => r.id === 'privacy')!;
    expect(ctx.state).toBe('missing');
    expect(ctx.remedyId).toBe('PROFILE_CREATE');
    expect(qr.state).toBe('invalid');
    expect(qr.remedyId).toBe('CALLBACK_URL');
    expect(privacy.state).toBe('missing');
    expect(privacy.remedyId).toBe('PRIVACY_ACK');
  });

  it('all ready when profile selected, public callback, privacy ack', () => {
    const rows = evaluateReadinessDetailed(
      fakeContext({
        source: 'default',
        merchantId: 'm',
        apiKey: 'k',
        callbackUrl: 'https://cb.example.com/hook',
        publicKeyPem: 'pem',
      }),
      defaultConfig,
      { privacyAcknowledged: true },
    );
    const withRemedies = rows.filter((r) => r.state !== 'ready' && r.remedyId);
    // offline KHQR is optional; only it may surface a remedy when otherwise ready.
    expect(withRemedies.map((r) => r.id)).toEqual(['offlineKhqr']);
  });
});
