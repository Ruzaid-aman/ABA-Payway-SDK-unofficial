/**
 * PayWay MCP stdio server (spec `.scratch/cli-modernization/design.md` §5).
 *
 * Low-level MCP `Server` over the official SDK: raw JSON Schema input schemas
 * come straight from the tool catalog (no zod, no duplication). Feature
 * surface is tools-only (initialize / tools/list / tools/call); required
 * protocol notifications still flow through the SDK.
 *
 * Safety model: read-only by default — mutation-class parity tools are not
 * registered at all unless `--allow-mutations` / PAYWAY_MCP_ALLOW_MUTATIONS=1.
 * Confirmation is the host client's responsibility (its own user gate); the
 * server refuses what it never exposed. Errors map to `isError:true` tool
 * results with the executor's sanitized detail — raw credentials never leave
 * the executors.
 *
 * Transport discipline: stdout belongs to the protocol; callers log to stderr.
 */

import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { toolRegistry } from '../agent/tools.js';
import { isReadOnlyTool } from '../agent/planning.js';
import type { AgentToolName, MaterializedAgentAction } from '../agent/contracts.js';
import type { ExecutionContext } from '../agent/executor.js';
import { createAgentPayWay, resolvePayWayContext } from '../agent/context.js';
import type { PayWay } from '../client.js';
import { buildMcpToolCatalog, isMutationParityTool, type McpToolDef } from './tool-catalog.js';
import { runMcpExtra, type McpExtraResult } from './extras.js';
import { MCP_EXTRAS, type McpExtraName } from './tool-catalog.js';

export interface McpServerOptions {
  /** Expose mutation-class parity tools (default: read-only). */
  allowMutations?: boolean;
  /** Explicit credential profile (defaults to PAYWAY_PROFILE / default profile). */
  profile?: string;
  /** Overrides for tests / embedding. */
  env?: NodeJS.ProcessEnv;
}

const SERVER_INFO = { name: 'payway-sdk', version: '1.6.0' } as const;

function toolResultJson(payload: unknown): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

function errorResult(code: string, message: string): { content: Array<{ type: 'text'; text: string }>; isError: boolean } {
  return { ...toolResultJson({ error: { code, message } }), isError: true };
}

function isExtraName(name: string): name is McpExtraName {
  return (MCP_EXTRAS as readonly string[]).includes(name);
}

/** Resolves env-driven mutation opt-in once at server construction. */
export function resolveAllowMutations(options: McpServerOptions): boolean {
  if (options.allowMutations !== undefined) return options.allowMutations;
  return (options.env ?? process.env).PAYWAY_MCP_ALLOW_MUTATIONS === '1';
}

/**
 * Builds the MCP server (not yet connected). Inject `transport` via
 * `server.connect(...)` — stdio in production, `InMemoryTransport` in tests.
 */
export function createPayWayMcpServer(options: McpServerOptions = {}): Server {
  const allowMutations = resolveAllowMutations(options);
  const catalog: McpToolDef[] = buildMcpToolCatalog({ allowMutations });
  const catalogByName = new Map(catalog.map((def) => [def.name, def]));

  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: catalog.map((def) => ({
      name: def.name,
      description: def.description,
      inputSchema: def.inputSchema,
      annotations: def.annotations,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const def = catalogByName.get(name);
    if (!def) {
      // Read-only mode: a mutation tool name is UNKNOWN_TOOL — the server
      // refuses what it never exposed (spec §5.3), never "denied".
      return errorResult('UNKNOWN_TOOL', `Unknown tool "${name}" — see tools/list for the effective catalog.`);
    }
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

    try {
      if (isExtraName(name)) {
        const client = await resolveClient(options, false);
        const result: McpExtraResult = await runMcpExtra(name, args, client);
        return result.ok
          ? toolResultJson({ tool: result.tool, data: result.data })
          : errorResult(result.error?.code ?? 'EXTRA_ERROR', result.error?.message ?? 'Extra tool failed');
      }

      const toolName = name as AgentToolName;
      const client = await resolveClient(options, !isReadOnlyTool(toolName));
      const context = resolvePayWayContext({ profile: options.profile, env: options.env ?? process.env });
      const execution = {
        version: 'agent-ledger/v1' as const,
        executionId: randomUUID(),
        sessionId: 'mcp',
        tool: toolName,
        transactionId: null,
        status: 'submitted' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const ctx: ExecutionContext = {
        context,
        sessionId: 'mcp',
        execution,
      };
      const result = await toolRegistry[toolName](args as MaterializedAgentAction, client, ctx);
      return result.ok
        ? toolResultJson({ tool: result.tool, data: result.data })
        : errorResult(result.error?.code ?? 'TOOL_ERROR', result.error?.message ?? 'Tool execution failed');
    } catch (error) {
      return errorResult(
        'INTERNAL',
        error instanceof Error ? error.message : String(error),
      );
    }
  });

  return server;
}

async function resolveClient(options: McpServerOptions, create: boolean): Promise<PayWay> {
  const context = resolvePayWayContext({ profile: options.profile, env: options.env ?? process.env });
  if (!context.merchantId || !context.apiKey) {
    // Read-only extras (journal/knowledge) work without credentials; gateway
    // tools will surface this as CONFIG_ERROR from their own paths.
    if (create) {
      throw new Error('PayWay credentials missing (PAYWAY_ENV/PAYWAY_MERCHANT_ID/PAYWAY_API_KEY or a saved profile)');
    }
  }
  return createAgentPayWay(context, create ? 'create' : 'read');
}

/** Serves the MCP server over stdio (the production transport). */
export async function runMcpStdio(options: McpServerOptions = {}): Promise<void> {
  const server = createPayWayMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport as Transport);
  const allowMutations = resolveAllowMutations(options);
  console.error(
    `payway-sdk MCP server listening on stdio (tools: ${buildMcpToolCatalog({ allowMutations }).length}, mutations: ${allowMutations ? 'on' : 'off'})`,
  );
  // The SDK keeps the process alive while the transport is open; when the
  // client disconnects the transport closes and the process exits naturally.
}
