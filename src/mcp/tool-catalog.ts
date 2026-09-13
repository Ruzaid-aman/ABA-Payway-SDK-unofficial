/**
 * MCP tool catalog (spec `.scratch/cli-modernization/design.md` §5.2).
 *
 * Two layers:
 *  - agent-parity: the 14 agent tools, schemas taken verbatim from
 *    `buildToolSchemas()` (OpenAI function shape → MCP `inputSchema` is a
 *    1:1 field move; same JSON Schema, no zod, no duplication) and risk
 *    mirrored from `isReadOnlyTool()`.
 *  - mcp-extra: 3 read-only tools that exist only here (never in
 *    `AgentToolName` — the agent catalog count stays 14).
 *
 * Safety model (§5.3): read-only by default — mutation-class parity tools
 * are OMITTED from the catalog unless `allowMutations` (the server refuses
 * what it never exposed). Extras are always read-only and always present.
 */

import { AGENT_TOOL_NAMES, type AgentToolName } from '../agent/contracts.js';
import { buildToolSchemas } from '../agent/provider-prompts.js';
import { isReadOnlyTool } from '../agent/planning.js';

export interface McpToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint?: boolean;
}

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: McpToolAnnotations;
  source: 'agent-parity' | 'mcp-extra';
}

export const MCP_EXTRAS = ['list_transactions', 'journal_stats', 'journal_timeline'] as const;
export type McpExtraName = (typeof MCP_EXTRAS)[number];

interface OpenAiFunctionTool {
  type: 'function';
  function: { name: AgentToolName; description: string; parameters: Record<string, unknown> };
}

const EXTRA_DEFS: Record<McpExtraName, { description: string; inputSchema: Record<string, unknown> }> = {
  list_transactions: {
    description:
      'List transactions in a time window via the PayWay gateway. Dates are GATEWAY time UTC+7 — a UTC/local-derived window silently returns 0 rows. Max window 3 days, page size ≤1000; defaults to the current gateway day. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        from: { type: 'string', description: 'Start date "YYYY-MM-DD HH:mm:ss" (default: gateway today 00:00:00)' },
        to: { type: 'string', description: 'End date "YYYY-MM-DD HH:mm:ss" (default: gateway today 23:59:59)' },
        status: { type: 'string', enum: ['APPROVED', 'PENDING', 'DECLINED', 'REFUNDED', 'CANCELLED'] },
        minAmount: { type: 'number', description: 'Minimum amount filter' },
        maxAmount: { type: 'number', description: 'Maximum amount filter' },
        page: { type: 'number', description: 'Page number (default 1)' },
        pagination: { type: 'number', description: 'Page size, 1–1000 (default 50)' },
      },
      required: [],
    },
  },
  journal_stats: {
    description:
      'Local transaction-journal statistics (latency, retries, errors, funnel) recorded by the CLI/SDK while journaling was enabled. No network call. Read-only.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {}, required: [] },
  },
  journal_timeline: {
    description:
      'Reconstruct one transaction from the local transaction journal: chronological digest events plus an RCA verdict/steps/hints. Digest projection only — request/response bodies never leave the machine. No network call. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        transactionId: { type: 'string', description: 'The tran_id to reconstruct' },
        kind: {
          type: 'string',
          description: 'Optional event-kind filter (e.g. "status.observed", "execution.error")',
        },
        last: { type: 'number', description: 'Return only the last N events (default 100)' },
      },
      required: ['transactionId'],
    },
  },
};

const EXTRA_NAMES: readonly string[] = MCP_EXTRAS;

/** Builds the effective MCP tool catalog for this server instance. */
export function buildMcpToolCatalog(options: { allowMutations?: boolean } = {}): McpToolDef[] {
  const schemas = buildToolSchemas() as OpenAiFunctionTool[];
  const byName = new Map(schemas.map((def) => [def.function.name as string, def.function]));

  const parity: McpToolDef[] = [];
  for (const name of AGENT_TOOL_NAMES) {
    const fn = byName.get(name);
    if (!fn) continue;
    const readOnly = isReadOnlyTool(name);
    if (!readOnly && !options.allowMutations) continue;
    parity.push({
      name,
      description: fn.description,
      inputSchema: fn.parameters,
      annotations: readOnly ? { readOnlyHint: true } : { readOnlyHint: false },
      source: 'agent-parity',
    });
  }

  const extras: McpToolDef[] = MCP_EXTRAS.map((name) => ({
    name,
    description: EXTRA_DEFS[name].description,
    inputSchema: EXTRA_DEFS[name].inputSchema,
    annotations: { readOnlyHint: true },
    source: 'mcp-extra',
  }));

  void EXTRA_NAMES;
  return [...parity, ...extras];
}

/** True when `name` is a parity tool the server would only expose with --allow-mutations. */
export function isMutationParityTool(name: string): boolean {
  return (AGENT_TOOL_NAMES as readonly string[]).includes(name) && !isReadOnlyTool(name);
}

export type { AgentToolName };
