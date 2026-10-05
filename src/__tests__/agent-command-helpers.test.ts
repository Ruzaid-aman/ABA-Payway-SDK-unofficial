import { describe, expect, it } from 'vitest';
import type { ProviderConfigV1 } from '../agent/contracts.js';
import type { CapabilityRow } from '../agent/readiness.js';
import { PRODUCTION_CONFIRMATION_PHRASE } from '../agent/terminal.js';
import {
  applyProviderConnectivity,
  blockedAgentResult,
  buildSetupPatch,
  createInteractivePlanConfirmation,
  defaultConfig,
  marker,
  promptConfirm,
  promptInput,
  renderAckOutput,
  renderDoctorOutput,
  renderSessionList,
  renderSetupSummary,
  validateAckPrerequisites,
  withProviderTimeout,
} from '../cli/commands/agent-helpers.js';

/**
 * Pure helper coverage for the `ask` / `agent` command surface: setup-option
 * validation (the exact error contract), doctor/ack/session rendering, and the
 * interactive confirmation mapping (y/N and the production phrase).
 */

const esc = String.fromCharCode(27);
const stripAnsi = (s: string): string => s.replace(new RegExp(`${esc}\\[[0-9;]*m`, 'g'), '');

type FakeReadlineFactory = Parameters<typeof promptInput>[1];

function deterministicReadline(answer: string | undefined): FakeReadlineFactory {
  return (() => ({
    question: (_message: string, callback: (value: string) => void) => callback(answer as string),
    close: () => undefined,
  })) as unknown as FakeReadlineFactory;
}

describe('buildSetupPatch', () => {
  it('builds a full patch from every supported option', () => {
    const before = Date.now();
    const { patch, error } = buildSetupPatch({
      provider: 'openai',
      model: 'gpt-4o',
      baseUrl: 'https://api.example.com/v1',
      capabilityMode: 'native-tools',
      timeout: '1500.9',
      maxTokens: '8192',
      temperature: '0.7',
      topP: '0.9',
      extraBody: '{"chat_template_kwargs":{"enable_thinking":true}}',
      acknowledgePrivacy: true,
    });
    expect(error).toBeUndefined();
    expect(patch).toMatchObject({
      provider: 'openai',
      model: 'gpt-4o',
      baseUrl: 'https://api.example.com/v1',
      capabilityMode: 'native-tools',
      timeoutMs: 1500, // floored
      maxTokens: 8192,
      temperature: 0.7,
      topP: 0.9,
      extraBody: { chat_template_kwargs: { enable_thinking: true } },
    });
    expect(typeof patch.privacyAcknowledgedAt).toBe('string');
    expect(Date.parse(patch.privacyAcknowledgedAt as string)).toBeGreaterThanOrEqual(before);
  });

  it('returns an error for an unknown provider without touching the patch', () => {
    const { patch, error } = buildSetupPatch({ provider: 'nope' });
    expect(error).toBe("Invalid --provider 'nope'.");
    expect(patch).toEqual({});
  });

  it('returns an error for an unknown capability mode', () => {
    expect(buildSetupPatch({ capabilityMode: 'yolo' }).error).toBe("Invalid --capability-mode 'yolo'.");
    expect(buildSetupPatch({ capabilityMode: 'native-tools' }).patch.capabilityMode).toBe('native-tools');
  });

  it('validates timeout, max-tokens, temperature, and top-p ranges', () => {
    expect(buildSetupPatch({ timeout: '0' }).error).toBe('--timeout must be a positive number of milliseconds.');
    expect(buildSetupPatch({ timeout: '-5' }).error).toBeDefined();
    expect(buildSetupPatch({ timeout: 'abc' }).error).toBeDefined();
    expect(buildSetupPatch({ timeout: '100' }).patch.timeoutMs).toBe(100);

    expect(buildSetupPatch({ maxTokens: '0' }).error).toBe('--max-tokens must be a positive integer.');
    expect(buildSetupPatch({ maxTokens: '1.5' }).error).toBe('--max-tokens must be a positive integer.');
    expect(buildSetupPatch({ maxTokens: '64' }).patch.maxTokens).toBe(64);

    expect(buildSetupPatch({ temperature: '-0.1' }).error).toBe('--temperature must be a number between 0 and 2.');
    expect(buildSetupPatch({ temperature: '2.1' }).error).toBe('--temperature must be a number between 0 and 2.');
    expect(buildSetupPatch({ temperature: '2' }).patch.temperature).toBe(2);

    expect(buildSetupPatch({ topP: '1.1' }).error).toBe('--top-p must be a number between 0 and 1.');
    expect(buildSetupPatch({ topP: '0' }).patch.topP).toBe(0);
  });

  it('rejects extra-body payloads that are not JSON objects', () => {
    const invalid = buildSetupPatch({ extraBody: 'not json' }).error ?? '';
    expect(invalid.startsWith('--extra-body must be a valid JSON object (')).toBe(true);
    expect(invalid.endsWith(').')).toBe(true);
    expect(buildSetupPatch({ extraBody: '[1,2]' }).error).toBe(
      '--extra-body must be a valid JSON object (must be a JSON object).',
    );
    expect(buildSetupPatch({ extraBody: 'null' }).error).toBe(
      '--extra-body must be a valid JSON object (must be a JSON object).',
    );
    expect(buildSetupPatch({ extraBody: '{"k":1}' }).patch.extraBody).toEqual({ k: 1 });
  });

  it('requires --base-url when acknowledging privacy for a custom provider', () => {
    expect(buildSetupPatch({ acknowledgePrivacy: true, provider: 'custom' }).error).toBe(
      'Custom provider requires --base-url.',
    );
    expect(buildSetupPatch({ acknowledgePrivacy: true, provider: 'custom', baseUrl: '   ' }).error).toBe(
      'Custom provider requires --base-url.',
    );
    const ok = buildSetupPatch({ acknowledgePrivacy: true, provider: 'custom', baseUrl: 'https://x.example' });
    expect(ok.error).toBeUndefined();
    expect(typeof ok.patch.privacyAcknowledgedAt).toBe('string');
  });

  it('records privacy timestamp when acknowledging with a preset provider', () => {
    const { patch, error } = buildSetupPatch({ acknowledgePrivacy: true, provider: 'openai' });
    expect(error).toBeUndefined();
    expect(typeof patch.privacyAcknowledgedAt).toBe('string');
  });
});

describe('renderSetupSummary', () => {
  it('renders provider, model, mode, timeout, and the key note', () => {
    const lines = renderSetupSummary({
      ...defaultConfig(),
      provider: 'openai',
      model: 'gpt-4o',
    });
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('Agent provider configured');
    expect(text).toContain('Provider:        openai');
    expect(text).toContain('Model:           gpt-4o');
    expect(text).toContain('Capability mode: strict-json-plan');
    expect(text).toContain('Timeout:         30000ms'); // default
    expect(text).toContain('PAYWAY_AGENT_API_KEY');
    expect(text).not.toContain('Base URL');
    expect(text).not.toContain('Sampling');
  });

  it('renders base URL and sampling passthroughs when present', () => {
    const lines = renderSetupSummary({
      ...defaultConfig(),
      provider: 'custom',
      model: '',
      baseUrl: 'https://x.example/v1',
      timeoutMs: 5000,
      temperature: 0.5,
      topP: 0.9,
      maxTokens: 8192,
      extraBody: { a: 1 },
    });
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('Base URL:        https://x.example/v1');
    expect(text).toContain('Timeout:         5000ms');
    expect(text).toContain('Model:           (empty)');
    expect(text).toContain('Sampling:        temperature=0.5, top_p=0.9, max_tokens=8192, extra_body={"a":1}');
  });
});

describe('doctor rendering', () => {
  function row(overrides: Partial<CapabilityRow>): CapabilityRow {
    return { id: 'x', label: 'X', state: 'missing', ...overrides };
  }

  it('merges connectivity into the provider row (remedy cleared once, then preserved)', () => {
    const fresh = () => [
      row({
        id: 'provider',
        label: 'Provider connectivity',
        state: 'unverified' as const,
        remedyId: 'AGENT_SETUP' as const,
      }),
    ];

    const ready = fresh();
    applyProviderConnectivity(ready, { status: 'ready', detail: 'reachable' });
    expect(ready[0].state).toBe('ready');
    expect(ready[0].detail).toBe('reachable');
    expect(ready[0].remedyId).toBeUndefined();

    // A non-ready status keeps the row's existing remedy (only `ready` clears it).
    const blocked = fresh();
    applyProviderConnectivity(blocked, { status: 'blocked', detail: 'unreachable' });
    expect(blocked[0].state).toBe('blocked');
    expect(blocked[0].remedyId).toBe('AGENT_SETUP');

    const unverified = fresh();
    applyProviderConnectivity(unverified, { status: 'unverified', detail: 'no key' });
    expect(unverified[0].state).toBe('unverified');
    expect(unverified[0].remedyId).toBe('AGENT_SETUP');
  });

  it('renders rows, remedies, connectivity detail, and the onboarding hint', () => {
    const matrix: CapabilityRow[] = [
      row({
        id: 'provider',
        label: 'Provider connectivity',
        state: 'unverified',
        detail: 'unreachable',
        remedyId: 'AGENT_SETUP',
      }),
      row({ id: 'privacy', label: 'Privacy acknowledgment', state: 'ready' }),
    ];
    const lines = renderDoctorOutput(matrix, {
      privacyAcknowledgedAt: '2026-08-30T00:00:00.000Z',
      hasConfig: true,
      connectivityDetail: 'unreachable',
    });
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('Agent Capability Matrix');
    expect(text).toContain('· unverified  Provider connectivity (unreachable)');
    expect(text).toContain('✓ ok  Privacy acknowledgment (2026-08-30T00:00:00.000Z)');
    expect(text).toContain('Provider: unreachable');
    expect(text).not.toContain('payway-sdk onboard'); // connectivity detail present → no hint
  });

  it('shows the onboarding hint only when configured and connectivity is silent', () => {
    const matrix: CapabilityRow[] = [
      row({ id: 'provider', label: 'Provider connectivity', state: 'unverified', remedyId: 'AGENT_SETUP' }),
    ];
    const withHint = stripAnsi(
      renderDoctorOutput(matrix, { hasConfig: true, connectivityDetail: undefined }).join('\n'),
    );
    expect(withHint).toContain('Run "payway-sdk onboard" to configure missing items interactively.');

    const withoutConfig = stripAnsi(
      renderDoctorOutput(matrix, { hasConfig: false, connectivityDetail: undefined }).join('\n'),
    );
    expect(withoutConfig).not.toContain('payway-sdk onboard');
  });
});

describe('ack helpers', () => {
  it('validates prerequisites in order', () => {
    expect(validateAckPrerequisites(null)).toBe('Privacy acknowledgment requires a configured provider.');
    expect(validateAckPrerequisites({ ...defaultConfig(), model: '' })).toBe(
      'Privacy acknowledgment requires a configured provider.',
    );
    expect(validateAckPrerequisites({ ...defaultConfig(), model: 'm', provider: 'custom', baseUrl: ' ' })).toBe(
      'Custom provider requires a baseUrl in the config.',
    );
    expect(validateAckPrerequisites({ ...defaultConfig(), model: 'm' })).toBeNull();
  });

  it('renders first acknowledgment vs update', () => {
    const existing: ProviderConfigV1 = { ...defaultConfig(), model: 'gpt-4o' };
    const updated = { ...existing, privacyAcknowledgedAt: '2026-08-30T01:00:00.000Z' };
    const first = stripAnsi(renderAckOutput(existing, updated).join('\n'));
    expect(first).toContain('Privacy acknowledged');
    expect(first).toContain('Recorded at: 2026-08-30T01:00:00.000Z');
    expect(first).toContain('Provider:    openai');
    expect(first).toContain('Model:       gpt-4o');

    const update = stripAnsi(
      renderAckOutput({ ...existing, privacyAcknowledgedAt: '2026-08-29T00:00:00.000Z' }, updated).join('\n'),
    );
    expect(update).toContain('Privacy acknowledgment updated.');
    expect(update).toContain('Previous: 2026-08-29T00:00:00.000Z');
    expect(update).toContain('Now:      2026-08-30T01:00:00.000Z');
  });
});

describe('renderSessionList', () => {
  it('renders the empty state and per-session summaries', () => {
    expect(renderSessionList([])).toEqual(['No agent sessions found.']);
    const lines = renderSessionList([
      {
        version: 'agent-session/v1',
        sessionId: 's-1',
        contextLabel: 'profile: demo (sandbox)',
        createdAt: '2026-08-30T00:00:00.000Z',
        updatedAt: '2026-08-30T01:00:00.000Z',
        events: [],
      },
    ]);
    expect(stripAnsi(lines[0])).toBe('s-1  profile: demo (sandbox)  events:0  updated:2026-08-30T01:00:00.000Z');
  });
});

describe('marker / blockedAgentResult / withProviderTimeout', () => {
  it('maps states to markers', () => {
    expect(stripAnsi(marker('ready'))).toBe('✓ ok');
    expect(stripAnsi(marker('missing'))).toBe('• missing');
    expect(stripAnsi(marker('invalid'))).toBe('✗ invalid');
    expect(stripAnsi(marker('blocked'))).toBe('✗ invalid');
    expect(stripAnsi(marker('unverified'))).toBe('· unverified');
  });

  it('builds the AGENT_NOT_CONFIGURED blocked result', () => {
    const result = blockedAgentResult('generate a QR for $3');
    expect(result.version).toBe('agent-command/v1');
    expect(result.status).toBe('blocked');
    expect(result.request).toBe('generate a QR for $3');
    expect(result.error?.code).toBe('AGENT_NOT_CONFIGURED');
  });

  it('applies --provider-timeout only when it parses as a number', () => {
    const config = defaultConfig();
    expect(withProviderTimeout(config, '1234').timeoutMs).toBe(1234);
    expect(withProviderTimeout(config, 'abc').timeoutMs).toBeUndefined();
    expect(withProviderTimeout(config, undefined).timeoutMs).toBeUndefined();
    expect(withProviderTimeout(config, 'NaN').timeoutMs).toBeUndefined();
    // Original config object is not mutated.
    expect(config.timeoutMs).toBeUndefined();
  });
});

describe('interactive confirmation helpers', () => {
  const proposal = {
    request: 'pay $3',
    context: 'profile: demo (sandbox)',
    environment: 'sandbox' as const,
    actions: [],
    assumptions: [],
    planContext: {},
  };

  it('promptInput resolves the answer or undefined on EOF', async () => {
    await expect(promptInput('Q: ', deterministicReadline(' hello '))).resolves.toBe(' hello ');
    await expect(promptInput('Q: ', deterministicReadline(undefined))).resolves.toBeUndefined();
  });

  it('promptConfirm accepts only y (case-insensitive, trimmed)', async () => {
    await expect(promptConfirm('Q', deterministicReadline('y'))).resolves.toBe(true);
    await expect(promptConfirm('Q', deterministicReadline(' Y '))).resolves.toBe(true);
    await expect(promptConfirm('Q', deterministicReadline('n'))).resolves.toBe(false);
    await expect(promptConfirm('Q', deterministicReadline('yes'))).resolves.toBe(false);
    await expect(promptConfirm('Q', deterministicReadline(undefined))).resolves.toBe(false);
  });

  it('sandbox proposals accept y / true / anything else rejects', async () => {
    const accept = createInteractivePlanConfirmation(async () => 'y');
    await expect(accept(proposal)).resolves.toBe(true);
    const boolAccept = createInteractivePlanConfirmation(async () => true);
    await expect(boolAccept(proposal)).resolves.toBe(true);
    const reject = createInteractivePlanConfirmation(async () => 'no');
    await expect(reject(proposal)).resolves.toBe(false);
  });

  it('production proposals require the exact confirmation phrase', async () => {
    const production = { ...proposal, environment: 'production' as const };
    let prompted = '';
    const phrase = createInteractivePlanConfirmation(async (message) => {
      prompted = message;
      return PRODUCTION_CONFIRMATION_PHRASE;
    });
    await expect(phrase(production)).resolves.toBe(true);
    expect(prompted).toContain(`Type ${PRODUCTION_CONFIRMATION_PHRASE} to execute`);

    const wrong = createInteractivePlanConfirmation(async () => 'confirm production');
    await expect(wrong(production)).resolves.toBe(false);
    const boolNeverCounts = createInteractivePlanConfirmation(async () => true);
    await expect(boolNeverCounts(production)).resolves.toBe(false);
  });
});
