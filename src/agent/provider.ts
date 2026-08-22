/**
 * OpenAI-compatible provider adapter for the Agentic PayWay CLI.
 *
 * The adapter proposes validated {@link AgentPlanV1} objects by calling an
 * OpenAI-compatible `/chat/completions` endpoint. It supports two capability
 * modes (`native-tools` and `strict-json-plan`) and never derives the API key
 * from configuration - it is read exclusively from the
 * `PAYWAY_AGENT_API_KEY` environment variable.
 */

import type { AgentPlanV1, ProviderConfigV1, ProviderPreset } from './contracts.js';
import { validateAgentPlan } from './schemas.js';
import { buildStrictJsonSystemPrompt, buildToolSchemas } from './provider-prompts.js';

/** Connectivity classification for a provider endpoint. */
export interface ProviderConnectivity {
  status: 'ready' | 'blocked' | 'unverified';
  detail?: string;
  httpStatus?: number;
}

/** Thrown when a provider cannot produce a valid, safe agent plan. */
export class ProviderProposalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderProposalError';
  }
}

/** Adapter that proposes agent plans and reports endpoint connectivity. */
export interface ProviderAdapter {
  propose(request: string): Promise<AgentPlanV1>;
  checkConnectivity(): Promise<ProviderConnectivity>;
}

const PRESET_BASE_URLS: Record<Exclude<ProviderPreset, 'custom'>, string> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  nvidia: 'https://integrate.api.nvidia.com/v1',
};

const API_KEY_ENV = 'PAYWAY_AGENT_API_KEY';

function resolveBaseUrl(config: ProviderConfigV1): string {
  if (config.provider === 'custom') {
    if (!config.baseUrl || config.baseUrl.trim() === '') {
      throw new ProviderProposalError('custom provider requires a non-empty baseUrl');
    }
    return config.baseUrl.replace(/\/+$/, '');
  }
  return PRESET_BASE_URLS[config.provider];
}

function getApiKey(): string {
  const key = process.env[API_KEY_ENV];
  if (!key || key.trim() === '') {
    throw new ProviderProposalError(`missing API key: set ${API_KEY_ENV} environment variable`);
  }
  return key;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: ChatMessage }>;
}

/**
 * Extract a single, complete JSON object from raw model content.
 *
 * Rejects markdown code fences, prose, multiple objects, and trailing
 * content. Returns the parsed object on success.
 */
function extractSingleJsonObject(text: string): unknown {
  if (text.includes('```')) {
    throw new ProviderProposalError('strict-json-plan output contained markdown code fences');
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new ProviderProposalError('strict-json-plan output did not contain a JSON object');
  }

  const before = text.slice(0, start).trim();
  const after = text.slice(end + 1).trim();
  if (before.length > 0 || after.length > 0) {
    throw new ProviderProposalError(
      'strict-json-plan output contained prose or trailing content outside the JSON object',
    );
  }

  const jsonText = text.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (cause) {
    throw new ProviderProposalError(`strict-json-plan output was not valid JSON: ${(cause as Error).message}`);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ProviderProposalError('strict-json-plan output was not a JSON object');
  }

  return parsed;
}

function buildHeaders(config: ProviderConfigV1, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (config.headers) {
    for (const [key, value] of Object.entries(config.headers)) {
      headers[key] = value;
    }
  }
  return headers;
}

function assemblePlanFromToolCalls(
  request: string,
  toolCalls: NonNullable<ChatMessage['tool_calls']>,
): AgentPlanV1 {
  const actions = toolCalls.map((call) => {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
    } catch (cause) {
      throw new ProviderProposalError(`tool call arguments were not valid JSON: ${(cause as Error).message}`);
    }
    return { tool: call.function.name, ...args } as AgentPlanV1['actions'][number];
  });

  return { version: 'agent-plan/v1', request, actions };
}

export function createProviderAdapter(
  config: ProviderConfigV1,
  fetchImpl: typeof fetch = fetch,
): ProviderAdapter {
  const timeoutMs = config.timeoutMs ?? 30000;

  async function postChatCompletions(body: unknown, apiKey: string): Promise<ChatCompletionResponse> {
    const baseUrl = resolveBaseUrl(config);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: buildHeaders(config, apiKey),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (cause) {
      throw new ProviderProposalError(`provider request failed: ${(cause as Error).message}`);
    } finally {
      clearTimeout(timer);
    }

    let data: ChatCompletionResponse;
    try {
      data = (await response.json()) as ChatCompletionResponse;
    } catch (cause) {
      throw new ProviderProposalError(`provider returned non-JSON response: ${(cause as Error).message}`);
    }

    if (!response.ok) {
      throw new ProviderProposalError(
        `provider returned HTTP ${response.status}: ${JSON.stringify(data).slice(0, 200)}`,
      );
    }
    return data;
  }

  return {
    async propose(request: string): Promise<AgentPlanV1> {
      const apiKey = getApiKey();

      let data: ChatCompletionResponse;
      if (config.capabilityMode === 'native-tools') {
        data = await postChatCompletions(
          {
            model: config.model,
            messages: [{ role: 'user', content: request }],
            tools: buildToolSchemas(),
            tool_choice: 'auto',
          },
          apiKey,
        );
      } else {
        data = await postChatCompletions(
          {
            model: config.model,
            messages: [
              { role: 'system', content: buildStrictJsonSystemPrompt() },
              { role: 'user', content: request },
            ],
          },
          apiKey,
        );
      }

      const choice = data.choices?.[0];
      const message = choice?.message;
      if (!message) {
        throw new ProviderProposalError('provider response contained no message');
      }

      let plan: AgentPlanV1;
      if (config.capabilityMode === 'native-tools') {
        const toolCalls = message.tool_calls;
        if (!toolCalls || toolCalls.length === 0) {
          throw new ProviderProposalError('native-tools mode produced no tool calls');
        }
        plan = assemblePlanFromToolCalls(request, toolCalls);
      } else {
        if (typeof message.content !== 'string' || message.content.trim() === '') {
          throw new ProviderProposalError('strict-json-plan mode produced no content');
        }
        const parsed = extractSingleJsonObject(message.content);
        plan = parsed as AgentPlanV1;
      }

      if (!validateAgentPlan(plan)) {
        throw new ProviderProposalError('provider output did not validate as an AgentPlanV1');
      }

      return plan;
    },

    async checkConnectivity(): Promise<ProviderConnectivity> {
      const apiKey = process.env[API_KEY_ENV] ?? '';
      const baseUrl = resolveBaseUrl(config);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`${baseUrl}/models`, {
          method: 'GET',
          headers: buildHeaders(config, apiKey),
          signal: controller.signal,
        });

        const status = response.status;
        if (status >= 200 && status < 300) {
          return { status: 'ready', httpStatus: status };
        }
        if (status === 401 || status === 403) {
          return { status: 'blocked', httpStatus: status, detail: `authorization rejected (${status})` };
        }
        if (status === 404 || status === 405) {
          return { status: 'unverified', httpStatus: status, detail: `models endpoint not available (${status})` };
        }
        return {
          status: 'blocked',
          httpStatus: status,
          detail: `unexpected status ${status}`,
        };
      } catch (cause) {
        return { status: 'blocked', detail: (cause as Error).message };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
