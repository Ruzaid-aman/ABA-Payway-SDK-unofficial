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
import { buildStrictJsonSystemPrompt, buildToolSchemas } from './provider-prompts.js';
import { validateAgentPlan } from './schemas.js';

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
  propose(request: string, sessionContext?: string): Promise<AgentPlanV1>;
  checkConnectivity(): Promise<ProviderConnectivity>;
}

const PRESET_BASE_URLS: Record<Exclude<ProviderPreset, 'custom'>, string> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  nvidia: 'https://integrate.api.nvidia.com/v1',
  opencode: 'https://opencode.ai/zen/v1',
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

function assemblePlanFromToolCalls(request: string, toolCalls: NonNullable<ChatMessage['tool_calls']>): AgentPlanV1 {
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

export function createProviderAdapter(config: ProviderConfigV1, fetchImpl: typeof fetch = fetch): ProviderAdapter {
  const timeoutMs = config.timeoutMs ?? 30000;

  async function postChatCompletions(body: unknown, apiKey: string): Promise<ChatCompletionResponse> {
    const baseUrl = resolveBaseUrl(config);
    const transientStatuses = new Set([429, 500, 502, 503, 504]);
    let lastError: ProviderProposalError | undefined;

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
      }
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
        clearTimeout(timer);
        const err = cause as Error;
        if (err.name === 'AbortError' || /abort/i.test(err.message)) {
          throw new ProviderProposalError(
            `provider request timed out after ${timeoutMs}ms (check PAYWAY_AGENT_API_KEY, network egress, and baseUrl)`,
          );
        }
        throw new ProviderProposalError(`provider request failed: ${err.message}`);
      }
      clearTimeout(timer);

      let data: ChatCompletionResponse;
      try {
        data = (await response.json()) as ChatCompletionResponse;
      } catch (cause) {
        throw new ProviderProposalError(`provider returned non-JSON response: ${(cause as Error).message}`);
      }

      if (!response.ok) {
        lastError = new ProviderProposalError(
          `provider returned HTTP ${response.status}: ${JSON.stringify(data).slice(0, 200)}`,
        );
        if (response.status === 401 || response.status === 403 || !transientStatuses.has(response.status)) {
          throw lastError;
        }
        continue;
      }
      return data;
    }

    throw (
      lastError ?? new ProviderProposalError('provider request failed after retries')
    );
  }

  return {
    async propose(request: string, sessionContext?: string): Promise<AgentPlanV1> {
      const apiKey = getApiKey();
      const contextMessage = sessionContext
        ? { role: 'system' as const, content: `Bounded deterministic session context:\n${sessionContext}` }
        : undefined;

      let data: ChatCompletionResponse;
      const sampling = {
        ...(config.maxTokens !== undefined ? { max_tokens: config.maxTokens } : {}),
        ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
        ...(config.topP !== undefined ? { top_p: config.topP } : {}),
        ...(config.extraBody ?? {}),
      };
      const baseMessages: Array<{ role: 'system' | 'user'; content: string }> = [];
      if (contextMessage) baseMessages.push(contextMessage);
      if (config.capabilityMode === 'native-tools') {
        baseMessages.push({ role: 'user', content: request });
        data = await postChatCompletions(
          {
            model: config.model,
            messages: baseMessages,
            tools: buildToolSchemas(),
            tool_choice: 'auto',
            ...sampling,
          },
          apiKey,
        );
      } else {
        baseMessages.unshift({ role: 'system', content: buildStrictJsonSystemPrompt() });
        baseMessages.push({ role: 'user', content: request });
        data = await postChatCompletions(
          { model: config.model, messages: [...baseMessages], ...sampling },
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
        if (!validateAgentPlan(plan)) {
          throw new ProviderProposalError('provider output did not validate as an AgentPlanV1');
        }
        return plan;
      }

      // strict-json-plan: parse the assistant output and, when it deviates from
      // the AgentPlanV1 schema, give the model ONE feedback round with the exact
      // validation errors before failing. Weak models frequently rename tools or
      // mistype field types on the first attempt.
      type ParseOutcome = { ok: true; plan: AgentPlanV1 } | { ok: false; error: string };
      const parseStrictJson = (content: unknown): ParseOutcome => {
        if (typeof content !== 'string' || content.trim() === '') {
          return { ok: false, error: 'strict-json-plan mode produced no content' };
        }
        let parsed: unknown;
        try {
          parsed = extractSingleJsonObject(content);
        } catch (error) {
          return { ok: false, error: (error as Error).message };
        }
        if (!validateAgentPlan(parsed)) {
          const details = (validateAgentPlan.errors ?? [])
            .slice(0, 5)
            .map((e) => `${e.instancePath || '/'} ${e.message}`)
            .join('; ');
          return { ok: false, error: `provider output did not validate as an AgentPlanV1 (${details})` };
        }
        return { ok: true, plan: parsed as AgentPlanV1 };
      };

      let outcome = parseStrictJson(message.content);
      if (!outcome.ok && typeof message.content === 'string') {
        const toolNames = (buildToolSchemas() as Array<{ function?: { name?: string } }>)
          .map((schema) => schema.function?.name ?? '')
          .filter((name) => name.length > 0)
          .join(', ');
        const repairMessages: Array<{ role: string; content: string }> = [
          ...baseMessages,
          { role: 'assistant', content: message.content },
          {
            role: 'user',
            content:
              `Your previous response was invalid: ${outcome.error}. ` +
              `Valid tool names are exactly: ${toolNames}. ` +
              'Respond again with ONLY the corrected single JSON object matching the AgentPlanV1 schema exactly — ' +
              'no markdown fences, no prose.',
          },
        ];
        data = await postChatCompletions(
          { model: config.model, messages: repairMessages, ...sampling },
          apiKey,
        );
        const repairChoice = data.choices?.[0];
        outcome = parseStrictJson(repairChoice?.message?.content);
      }

      if (!outcome.ok) {
        throw new ProviderProposalError(outcome.error);
      }
      return outcome.plan;
    },

    async checkConnectivity(): Promise<ProviderConnectivity> {
      const apiKey = process.env[API_KEY_ENV] ?? '';
      if (!apiKey.trim()) {
        return { status: 'blocked', detail: `${API_KEY_ENV} is not set` };
      }
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
