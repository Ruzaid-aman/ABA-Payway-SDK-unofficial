import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderConfigV1 } from '../agent/contracts.js';
import { createProviderAdapter, type ProviderConnectivity, ProviderProposalError } from '../agent/provider.js';

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
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
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
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        mockResponse({ choices: [{ message: { role: 'assistant', content: validPlanJson(request) } }] }),
      );
    const adapter = createProviderAdapter(
      strictConfig({ provider: 'openrouter', model: 'openai/gpt-4o-mini' }),
      fetchImpl,
    );

    const plan = await adapter.propose(request);

    expect(plan.actions[0].tool).toBe('generate_online_qr');
    expect(fetchImpl).toHaveBeenCalledWith('https://openrouter.ai/api/v1/chat/completions', expect.any(Object));
  });

  it('parses an NVIDIA-shaped completion', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const request = 'make me a 10 USD QR';
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        mockResponse({ choices: [{ message: { role: 'assistant', content: validPlanJson(request) } }] }),
      );
    const adapter = createProviderAdapter(strictConfig({ provider: 'nvidia', model: 'meta/llama-3.1-8b' }), fetchImpl);

    const plan = await adapter.propose(request);

    expect(plan.actions[0].tool).toBe('generate_online_qr');
    expect(fetchImpl).toHaveBeenCalledWith('https://integrate.api.nvidia.com/v1/chat/completions', expect.any(Object));
  });

  it('parses a custom baseUrl-shaped completion', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const request = 'make me a 10 USD QR';
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        mockResponse({ choices: [{ message: { role: 'assistant', content: validPlanJson(request) } }] }),
      );
    const adapter = createProviderAdapter(
      strictConfig({ provider: 'custom', baseUrl: 'https://llm.example.test/v1', model: 'local' }),
      fetchImpl,
    );

    const plan = await adapter.propose(request);

    expect(plan.actions[0].tool).toBe('generate_online_qr');
    expect(fetchImpl).toHaveBeenCalledWith('https://llm.example.test/v1/chat/completions', expect.any(Object));
  });

  it('throws when custom provider has no baseUrl', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const fetchImpl = vi.fn();
    const adapter = createProviderAdapter(strictConfig({ provider: 'custom', model: 'local' }), fetchImpl);

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
    const fenced = `\`\`\`json\n${validPlanJson('x')}\n\`\`\``;
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(mockResponse({ choices: [{ message: { role: 'assistant', content: fenced } }] }));
    const adapter = createProviderAdapter(strictConfig(), fetchImpl);

    await expect(adapter.propose('x')).rejects.toBeInstanceOf(ProviderProposalError);
  });

  it('rejects output with prose before the JSON object', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({
        choices: [{ message: { role: 'assistant', content: `here: ${validPlanJson('x')}` } }],
      }),
    );
    const adapter = createProviderAdapter(strictConfig(), fetchImpl);

    await expect(adapter.propose('x')).rejects.toBeInstanceOf(ProviderProposalError);
  });

  it('rejects output with trailing content after the JSON object', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({
        choices: [{ message: { role: 'assistant', content: `${validPlanJson('x')} thanks!` } }],
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
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(mockResponse({ choices: [{ message: { role: 'assistant', content: bad } }] }));
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
    const adapter = createProviderAdapter(strictConfig({ capabilityMode: 'native-tools' }), fetchImpl);

    const plan = await adapter.propose('make a 10 USD QR');

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].tool).toBe('generate_online_qr');
    const capturedBody = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(capturedBody.tools).toBeDefined();
    expect(Array.isArray(capturedBody.tools)).toBe(true);
    // 14 since query_knowledge (knowledge wave 2026-09-12) joined the
    // catalog (it was 13 since query_journal, 2026-09-06 — flip consciously).
    expect(capturedBody.tools).toHaveLength(14);
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
    const adapter = createProviderAdapter(strictConfig({ capabilityMode: 'native-tools' }), fetchImpl);

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

  it('passes sampling params through when configured and omits them when unset', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const request = 'make me a 10 USD QR';
    const envelope = { choices: [{ message: { role: 'assistant', content: validPlanJson(request) } }] };
    const withSampling = vi.fn().mockResolvedValue(mockResponse(envelope));
    const adapterA = createProviderAdapter(
      strictConfig({
        maxTokens: 8192,
        temperature: 0.2,
        topP: 0.95,
        extraBody: { chat_template_kwargs: { enable_thinking: true } },
      }),
      withSampling,
    );
    await adapterA.propose(request);
    const bodyA = JSON.parse(withSampling.mock.calls[0][1].body);
    expect(bodyA.max_tokens).toBe(8192);
    expect(bodyA.temperature).toBe(0.2);
    expect(bodyA.top_p).toBe(0.95);
    expect(bodyA.chat_template_kwargs).toEqual({ enable_thinking: true });

    const withoutSampling = vi.fn().mockResolvedValue(mockResponse(envelope));
    const adapterB = createProviderAdapter(strictConfig(), withoutSampling);
    await adapterB.propose(request);
    const bodyB = JSON.parse(withoutSampling.mock.calls[0][1].body);
    expect('max_tokens' in bodyB).toBe(false);
    expect('temperature' in bodyB).toBe(false);
    expect('top_p' in bodyB).toBe(false);
    expect('chat_template_kwargs' in bodyB).toBe(false);
  });
});

describe('provider adapter - strict-JSON repair round', () => {
  afterEach(() => {
    delete process.env[API_KEY_ENV];
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function invalidPlanJson(): string {
    return JSON.stringify({
      version: 'agent-plan/v1',
      request: 'make me a 10 USD QR',
      actions: [{ tool: 'generate_qr_code', amount: '2.00' }],
    });
  }

  it('repairs an off-schema plan using one validation-feedback round', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const request = 'make me a 10 USD QR';
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ choices: [{ message: { role: 'assistant', content: invalidPlanJson() } }] }))
      .mockResolvedValueOnce(mockResponse({ choices: [{ message: { role: 'assistant', content: validPlanJson(request) } }] }));
    const adapter = createProviderAdapter(strictConfig(), fetchImpl);

    const plan = await adapter.propose(request);

    expect(plan.actions?.[0]?.tool).toBe('generate_online_qr');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const repairBody = JSON.parse(fetchImpl.mock.calls[1][1].body);
    const roles = repairBody.messages.map((m: { role: string }) => m.role);
    expect(roles).toContain('assistant');
    const lastMessage = repairBody.messages.at(-1);
    expect(lastMessage.role).toBe('user');
    expect(lastMessage.content).toContain('did not validate');
    expect(lastMessage.content).toContain('generate_online_qr');
  });

  it('throws after a failed repair round', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const request = 'make me a 10 USD QR';
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(mockResponse({ choices: [{ message: { role: 'assistant', content: invalidPlanJson() } }] }));
    const adapter = createProviderAdapter(strictConfig(), fetchImpl);

    await expect(adapter.propose(request)).rejects.toThrow(ProviderProposalError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('provider adapter - transient error retry', () => {
  afterEach(() => {
    delete process.env[API_KEY_ENV];
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('retries a transient 503 and succeeds on a later attempt', async () => {
    vi.useFakeTimers();
    process.env[API_KEY_ENV] = 'sk-test';
    const request = 'make me a 10 USD QR';
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ error: { message: 'ResourceExhausted' } }, 503, false))
      .mockResolvedValueOnce(mockResponse({ choices: [{ message: { role: 'assistant', content: validPlanJson(request) } }] }));
    const adapter = createProviderAdapter(strictConfig(), fetchImpl);

    const pending = adapter.propose(request);
    await vi.advanceTimersByTimeAsync(5000);
    const plan = await pending;

    expect(plan.version).toBe('agent-plan/v1');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-transient client errors', async () => {
    process.env[API_KEY_ENV] = 'sk-test';
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ error: { message: 'bad model' } }, 400, false));
    const adapter = createProviderAdapter(strictConfig(), fetchImpl);

    await expect(adapter.propose('q')).rejects.toThrow(/HTTP 400/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('gives up after three attempts on persistent transient errors', async () => {
    vi.useFakeTimers();
    process.env[API_KEY_ENV] = 'sk-test';
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ error: { message: 'overloaded' } }, 503, false));
    const adapter = createProviderAdapter(strictConfig(), fetchImpl);

    const pending = adapter.propose('q').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10000);
    const error = (await pending) as ProviderProposalError;

    expect(error).toBeInstanceOf(ProviderProposalError);
    expect(error.message).toContain('HTTP 503');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
