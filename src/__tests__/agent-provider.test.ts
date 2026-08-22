import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderConfigV1 } from '../agent/contracts.js';
import {
  createProviderAdapter,
  ProviderProposalError,
  type ProviderConnectivity,
} from '../agent/provider.js';

const API_KEY_ENV = 'PAYWAY_AGENT_API_KEY';

/** Build a Response-like object for the mocked fetch. */
function mockResponse(body: unknown, status = 200, ok = status >= 200 && status < 300): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'ERR',
    headers: new Headers(),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    clone: () => mockResponse(body, status, ok),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
  } as unknown as Response;
}

/** A fully valid strict-JSON plan returned by the model. */
function validPlanJson(request: string): string {
  return JSON.stringify({
    version: 'agent-plan/v1',
    request,
    actions: [
      {
        tool: 'generate_online_qr',
        amount: 10,
        currency: 'USD',
        transactionId: null,
        callbackUrl: 'https://example.com/cb',
      },
    ],
  });
}

function strictConfig(overrides: Partial<ProviderConfigV1> = {}): ProviderConfigV1 {
  return {
    version: 'agent-config/v1',
    provider: 'openai',
    model: 'gpt-4o-mini',
    capabilityMode: 'strict-json-plan',
    ...overrides,
  } as ProviderConfigV1;
}

describe('provider adapter - propose (strict-json-plan)', () => {
  afterEach(() => {
    delete process.env[API_KEY_ENV];
    vi.restoreAllMocks();
  });

  it('parses an OpenAI-shaped completion (choices[0].message.content)', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const request = 'make me a 10 USD QR';
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({ choices: [{ message: { role: 'assistant', content: validPlanJson(request) } }] }),
    );
    const adapter = createProviderAdapter(strictConfig(), fetchImpl);

    const plan = await adapter.propose(request);

    expect(plan.version).toBe('agent-plan/v1');
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].tool).toBe('generate_online_qr');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('parses an OpenRouter-shaped completion (same envelope, different base url)', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const request = 'make me a 10 USD QR';
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({ choices: [{ message: { role: 'assistant', content: validPlanJson(request) } }] }),
    );
    const adapter = createProviderAdapter(
      strictConfig({ provider: 'openrouter', model: 'openai/gpt-4o-mini' }),
      fetchImpl,
    );

    const plan = await adapter.propose(request);

    expect(plan.actions[0].tool).toBe('generate_online_qr');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.any(Object),
    );
  });

  it('parses an NVIDIA-shaped completion', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const request = 'make me a 10 USD QR';
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({ choices: [{ message: { role: 'assistant', content: validPlanJson(request) } }] }),
    );
    const adapter = createProviderAdapter(
      strictConfig({ provider: 'nvidia', model: 'meta/llama-3.1-8b' }),
      fetchImpl,
    );

    const plan = await adapter.propose(request);

    expect(plan.actions[0].tool).toBe('generate_online_qr');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      expect.any(Object),
    );
  });

  it('parses a custom baseUrl-shaped completion', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const request = 'make me a 10 USD QR';
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({ choices: [{ message: { role: 'assistant', content: validPlanJson(request) } }] }),
    );
    const adapter = createProviderAdapter(
      strictConfig({ provider: 'custom', baseUrl: 'https://llm.example.test/v1', model: 'local' }),
      fetchImpl,
    );

    const plan = await adapter.propose(request);

    expect(plan.actions[0].tool).toBe('generate_online_qr');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://llm.example.test/v1/chat/completions',
      expect.any(Object),
    );
  });

  it('throws when custom provider has no baseUrl', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const fetchImpl = vi.fn();
    const adapter = createProviderAdapter(
      strictConfig({ provider: 'custom', model: 'local' }),
      fetchImpl,
    );

    await expect(adapter.propose('x')).rejects.toBeInstanceOf(ProviderProposalError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects malformed (prose) output', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({
        choices: [{ message: { role: 'assistant', content: 'Sure! Here is your plan: not json' } }],
      }),
    );
    const adapter = createProviderAdapter(strictConfig(), fetchImpl);

    await expect(adapter.propose('x')).rejects.toBeInstanceOf(ProviderProposalError);
  });

  it('rejects markdown-fenced output', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const fenced = '```json\n' + validPlanJson('x') + '\n```';
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({ choices: [{ message: { role: 'assistant', content: fenced } }] }),
    );
    const adapter = createProviderAdapter(strictConfig(), fetchImpl);

    await expect(adapter.propose('x')).rejects.toBeInstanceOf(ProviderProposalError);
  });

  it('rejects output with prose before the JSON object', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({
        choices: [{ message: { role: 'assistant', content: 'here: ' + validPlanJson('x') } }],
      }),
    );
    const adapter = createProviderAdapter(strictConfig(), fetchImpl);

    await expect(adapter.propose('x')).rejects.toBeInstanceOf(ProviderProposalError);
  });

  it('rejects output with trailing content after the JSON object', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({
        choices: [{ message: { role: 'assistant', content: validPlanJson('x') + ' thanks!' } }],
      }),
    );
    const adapter = createProviderAdapter(strictConfig(), fetchImpl);

    await expect(adapter.propose('x')).rejects.toBeInstanceOf(ProviderProposalError);
  });

  it('rejects a plan with an unknown tool (fails validation)', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const bad = JSON.stringify({
      version: 'agent-plan/v1',
      request: 'x',
      actions: [{ tool: 'not_a_real_tool', amount: 1 }],
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({ choices: [{ message: { role: 'assistant', content: bad } }] }),
    );
    const adapter = createProviderAdapter(strictConfig(), fetchImpl);

    await expect(adapter.propose('x')).rejects.toBeInstanceOf(ProviderProposalError);
  });

  it('throws when the API key is missing', async () => {
    const fetchImpl = vi.fn();
    const adapter = createProviderAdapter(strictConfig(), fetchImpl);

    await expect(adapter.propose('x')).rejects.toBeInstanceOf(ProviderProposalError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('provider adapter - propose (native-tools)', () => {
  afterEach(() => {
    delete process.env[API_KEY_ENV];
    vi.restoreAllMocks();
  });

  it('assembles a plan from message.tool_calls', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({
        choices: [
          {
            message: {
              role: 'assistant',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'generate_online_qr',
                    arguments: JSON.stringify({
                      amount: 10,
                      currency: 'USD',
                      transactionId: null,
                      callbackUrl: 'https://example.com/cb',
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
    );
    const adapter = createProviderAdapter(
      strictConfig({ capabilityMode: 'native-tools' }),
      fetchImpl,
    );

    const plan = await adapter.propose('make a 10 USD QR');

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].tool).toBe('generate_online_qr');
    const capturedBody = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(capturedBody.tools).toBeDefined();
    expect(Array.isArray(capturedBody.tools)).toBe(true);
    expect(capturedBody.tools).toHaveLength(11);
  });

  it('rejects invalid tool-call arguments (fails validation)', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({
        choices: [
          {
            message: {
              role: 'assistant',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'generate_online_qr', arguments: JSON.stringify({ amount: -5 }) },
                },
              ],
            },
          },
        ],
      }),
    );
    const adapter = createProviderAdapter(
      strictConfig({ capabilityMode: 'native-tools' }),
      fetchImpl,
    );

    await expect(adapter.propose('x')).rejects.toBeInstanceOf(ProviderProposalError);
  });
});

describe('provider adapter - checkConnectivity', () => {
  afterEach(() => {
    delete process.env[API_KEY_ENV];
    vi.restoreAllMocks();
  });

  function expectStatus(result: ProviderConnectivity, status: ProviderConnectivity['status']) {
    expect(result.status).toBe(status);
  }

  it('classifies 2xx as ready', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ data: [] }, 200));
    const adapter = createProviderAdapter(strictConfig(), fetchImpl);

    expectStatus(await adapter.checkConnectivity(), 'ready');
  });

  it('classifies 401 as blocked', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ error: 'unauthorized' }, 401, false));
    const adapter = createProviderAdapter(strictConfig(), fetchImpl);

    const result = await adapter.checkConnectivity();
    expectStatus(result, 'blocked');
    expect(result.httpStatus).toBe(401);
  });

  it('classifies 403 as blocked', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({}, 403, false));
    const adapter = createProviderAdapter(strictConfig(), fetchImpl);

    expectStatus(await adapter.checkConnectivity(), 'blocked');
  });

  it('classifies 404 as unverified', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({}, 404, false));
    const adapter = createProviderAdapter(strictConfig(), fetchImpl);

    const result = await adapter.checkConnectivity();
    expectStatus(result, 'unverified');
    expect(result.httpStatus).toBe(404);
  });

  it('classifies 405 as unverified', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({}, 405, false));
    const adapter = createProviderAdapter(strictConfig(), fetchImpl);

    expectStatus(await adapter.checkConnectivity(), 'unverified');
  });

  it('classifies a network error as blocked', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const fetchImpl = vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    const adapter = createProviderAdapter(strictConfig(), fetchImpl);

    const result = await adapter.checkConnectivity();
    expectStatus(result, 'blocked');
    expect(result.detail).toContain('ENOTFOUND');
  });
});
