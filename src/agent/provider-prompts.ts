/**
 * OpenAI-compatible provider prompts for the Agentic PayWay CLI.
 *
 * Two capability modes are supported:
 *   - `native-tools`: the model emits OpenAI-style `tool_calls`; the adapter
 *     assembles an {@link AgentPlanV1} from them.
 *   - `strict-json-plan`: the model emits a single, complete JSON plan object.
 *
 * These helpers only build prompt/tool definitions. All secret handling
 * (API key) lives in `provider.ts`.
 */

import type { AgentToolName } from './contracts.js';

/** One OpenAI-style function/tool definition. */
interface ToolDefinition {
  type: 'function';
  function: {
    name: AgentToolName;
    description: string;
    parameters: {
      type: 'object';
      additionalProperties: false;
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

const CURRENCY_ENUM = ['USD', 'KHR'];
const ARTIFACT_KIND_ENUM = ['qr', 'receipt', 'text'];

function str(desc: string): Record<string, unknown> {
  return { type: 'string', description: desc };
}

function num(desc: string): Record<string, unknown> {
  return { type: 'number', description: desc };
}

function opt(props: Record<string, unknown>): Record<string, unknown> {
  // Optional properties are simply present in `properties` but not in `required`.
  return props;
}

/**
 * Build OpenAI-style tool schemas for ALL 11 agent tools, matching the
 * required params and types declared in `contracts.ts`. The `tool` field is
 * intentionally omitted here (it is implied by the function name and added by
 * the adapter when assembling the plan).
 */
function buildToolDefinitions(): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    {
      type: 'function',
      function: {
        name: 'generate_online_qr',
        description: 'Generate an online (dynamic) PayWay QR code for a payment.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            amount: num('Payment amount. Must be greater than 0.'),
            currency: { type: 'string', enum: CURRENCY_ENUM, description: 'Currency of the amount.' },
            transactionId: {
              type: ['string', 'null'],
              description: 'Client transaction id. Use null in a draft; required after materialization.',
            },
            callbackUrl: { type: 'string', pattern: '^https://', description: 'HTTPS callback URL.' },
            lifetime: opt({ type: 'integer', minimum: 1, description: 'QR lifetime in seconds.' }),
            paymentOption: opt(str('Payment option / method filter.')),
            template: opt(str('QR template identifier.')),
            rationale: opt(str('Why this action is being proposed.')),
          },
          required: ['amount', 'currency', 'transactionId', 'callbackUrl'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_offline_khqr',
        description: 'Generate an offline KHQR (Bakong) QR code string.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            amount: opt(num('Payment amount. Omit for a static QR.')),
            currency: { type: 'string', enum: CURRENCY_ENUM, description: 'Currency of the amount.' },
            merchantRef: str('Merchant reference for the QR.'),
            rationale: opt(str('Why this action is being proposed.')),
          },
          required: ['currency', 'merchantRef'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_checkout_payload',
        description: 'Create a checkout payload (signed form data) for a transaction.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            amount: num('Payment amount. Must be greater than 0.'),
            currency: { type: 'string', enum: CURRENCY_ENUM, description: 'Currency of the amount.' },
            transactionId: {
              type: ['string', 'null'],
              description: 'Client transaction id. Use null in a draft; required after materialization.',
            },
            paymentOption: opt(str('Payment option / method filter.')),
            returnUrl: opt({ type: 'string', pattern: '^https://', description: 'HTTPS return URL.' }),
            cancelUrl: opt({ type: 'string', pattern: '^https://', description: 'HTTPS cancel URL.' }),
            rationale: opt(str('Why this action is being proposed.')),
          },
          required: ['amount', 'currency', 'transactionId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_checkout_purchase',
        description: 'Create a direct checkout purchase session.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            amount: num('Payment amount. Must be greater than 0.'),
            currency: { type: 'string', enum: CURRENCY_ENUM, description: 'Currency of the amount.' },
            transactionId: {
              type: ['string', 'null'],
              description: 'Client transaction id. Use null in a draft; required after materialization.',
            },
            paymentOption: opt(str('Payment option / method filter.')),
            returnUrl: opt({ type: 'string', pattern: '^https://', description: 'HTTPS return URL.' }),
            cancelUrl: opt({ type: 'string', pattern: '^https://', description: 'HTTPS cancel URL.' }),
            rationale: opt(str('Why this action is being proposed.')),
          },
          required: ['amount', 'currency', 'transactionId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_payment_link',
        description: 'Create a hosted PayWay payment link.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: str('Human-readable title of the payment link.'),
            amount: num('Payment amount. Must be greater than 0.'),
            currency: { type: 'string', enum: CURRENCY_ENUM, description: 'Currency of the amount.' },
            merchantRefNo: str('Merchant reference number.'),
            returnUrl: { type: 'string', pattern: '^https://', description: 'HTTPS return URL.' },
            description: opt({ type: 'string', maxLength: 250, description: 'Optional description.' }),
            paymentLimit: opt({ type: 'integer', minimum: 0, description: 'Max number of payments.' }),
            expiredDate: opt({ type: 'integer', exclusiveMinimum: 0, description: 'Expiry as unix seconds.' }),
            payout: opt({
              type: 'array',
              minItems: 1,
              description: 'Optional split-payout beneficiaries; total amt must equal amount.',
              items: {
                type: 'object',
                required: ['acc', 'amt'],
                properties: {
                  acc: str('Beneficiary account number or MID.'),
                  amt: num('Payout amount for this beneficiary.'),
                },
              },
            }),
            rationale: opt(str('Why this action is being proposed.')),
          },
          required: ['title', 'amount', 'currency', 'merchantRefNo', 'returnUrl'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'check_transaction',
        description: 'Check the status of a transaction by its transaction id.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            transactionId: str('Transaction id to look up.'),
            rationale: opt(str('Why this action is being proposed.')),
          },
          required: ['transactionId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'check_transaction_by_merchant_ref',
        description: 'Check a transaction using the merchant reference.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            merchantRef: str('Merchant reference to look up.'),
            requestTime: opt(str('Optional request time filter.')),
            rationale: opt(str('Why this action is being proposed.')),
          },
          required: ['merchantRef'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'query_journal',
        description: 'Query the local transaction journal (no network): the chronological timeline of one transaction, aggregate stats (latency/retries/errors/funnel), reconcile creations vs webhook callbacks, or detect anomalies. Only knows what was journaled while recording was on.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            query: str('One of: timeline | stats | reconcile | anomalies.'),
            transactionId: opt(str('Required for timeline: the transaction id to reconstruct.')),
            kind: opt(str('Optional event-kind filter, e.g. execution.error.')),
            last: opt({ type: 'integer', minimum: 1, description: 'Optional cap on returned timeline events (default 100).' }),
            rationale: opt(str('Why this action is being proposed.')),
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_payment_link_details',
        description: 'Get the status and details of a payment link by its opaque Link ID (data.id from create — not the merchant ref, not the URL slug).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            paymentLinkId: str('Payment link id (data.id returned by create).'),
            rationale: opt(str('Why this action is being proposed.')),
          },
          required: ['paymentLinkId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'poll_transaction',
        description: 'Poll a transaction until it reaches a terminal state or times out.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            transactionId: str('Transaction id to poll.'),
            interval: opt(num('Polling interval in seconds.')),
            timeout: opt(num('Polling timeout in seconds.')),
            rationale: opt(str('Why this action is being proposed.')),
          },
          required: ['transactionId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'save_artifact',
        description: 'Persist a generated artifact (QR string, content, etc.) to disk/session.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            qrString: opt(str('QR / KHQR string to persist.')),
            content: opt(str('Arbitrary text content to persist.')),
            root: opt(str('Storage root hint.')),
            name: opt(str('Artifact file name hint.')),
            kind: opt({ type: 'string', enum: ARTIFACT_KIND_ENUM, description: 'Artifact kind.' }),
            rationale: opt(str('Why this action is being proposed.')),
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'open_artifact',
        description: 'Open a previously saved artifact or an explicit HTTPS URL.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            reference: str('Path to a session artifact or an HTTPS URL.'),
            rationale: opt(str('Why this action is being proposed.')),
          },
          required: ['reference'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'copy_to_clipboard',
        description: 'Copy text to the system clipboard.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            text: str('Text to copy.'),
            rationale: opt(str('Why this action is being proposed.')),
          },
          required: ['text'],
        },
      },
    },
  ];
  return tools;
}

export function buildToolSchemas(): unknown {
  return buildToolDefinitions();
}

interface PropertySchema {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
}

/** Render one tool as a compact, exact catalog entry for the strict-JSON prompt. */
function describeTool(tool: ToolDefinition): string {
  const { name, description, parameters } = tool.function;
  const required = new Set(parameters.required);
  const paramLines = Object.entries(parameters.properties).map(([paramName, rawSchema]) => {
    const schema = rawSchema as PropertySchema;
    const parts: string[] = [];
    if (Array.isArray(schema.type)) parts.push(schema.type.join('|'));
    else if (schema.type) parts.push(schema.type);
    if (schema.enum) parts.push(`one of ${schema.enum.map((v) => JSON.stringify(v)).join('|')}`);
    if (!required.has(paramName)) parts.push('optional');
    return `        ${paramName}: ${parts.join(', ')}${schema.description ? ` // ${schema.description}` : ''}`;
  });
  return [
    `     "${name}" — ${description}`,
    `       required: ${parameters.required.join(', ') || '(none)'}`,
    ...paramLines,
  ].join('\n');
}

function buildToolCatalog(): string {
  return buildToolDefinitions()
    .map(describeTool)
    .join('\n');
}

/**
 * System prompt instructing the model to emit exactly ONE complete JSON plan
 * object with no markdown, no prose, and no trailing content.
 */
export function buildStrictJsonSystemPrompt(): string {
  return [
    'You are the planning component of the Agentic PayWay CLI.',
    "You propose a validated, executable plan for the user's request using the available agent tools.",
    '',
    'Respond with EXACTLY ONE JSON object and nothing else. Do not wrap it in markdown code fences.',
    'Do not include any explanatory prose, comments, or trailing characters before or after the JSON.',
    '',
    'The JSON object MUST match this shape:',
    '{',
    '  "version": "agent-plan/v1",',
    '  "request": "<the original user request, verbatim or lightly normalized>",',
    '  "actions": [',
    '    { "tool": "<exact tool name from the catalog below>", ...tool_specific_parameters },',
    '    ...',
    '  ],',
    '  "assumptions": [ "<optional free-text assumption>" ],',
    '  "context": { "<optional key>: <optional value>" }',
    '}',
    '',
    'TOOL CATALOG — use these EXACT tool names and ONLY the listed parameters:',
    buildToolCatalog(),
    '',
    'Rules:',
    '- `version` must be the literal string "agent-plan/v1".',
    '- `request` must be a non-empty string.',
    '- `actions` must be an array of one or more action objects.',
    "- Each action's `tool` value must be copied VERBATIM from the TOOL CATALOG above.",
    '- Each action must include every parameter listed under that tool\'s `required:` line.',
    '- Do not invent parameters that are not part of the chosen tool.',
    '- Use `null` for any `transactionId` that is not yet known (a draft plan).',
    '- `callbackUrl`, `returnUrl`, and `cancelUrl` must be https:// URLs.',
    '- Local artifact tools (`save_artifact`, `open_artifact`, `copy_to_clipboard`) operate on artifacts that ALREADY exist in this session. NEVER chain them after a create action in the same plan to persist that action\'s future output.',
    '- Output must be parseable by a strict JSON parser: a single object, no fences, no prose, no trailing content.',
  ].join('\n');
}
