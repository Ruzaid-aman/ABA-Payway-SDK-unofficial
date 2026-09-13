import { describe, expect, it } from 'vitest';
import { buildToolSchemas } from '../agent/provider-prompts.js';
import { isReadOnlyTool } from '../agent/planning.js';
import { AGENT_TOOL_NAMES } from '../agent/contracts.js';
import { buildMcpToolCatalog, MCP_EXTRAS } from '../mcp/tool-catalog.js';

interface OpenAiToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

const ALL_PARITY = [
  'generate_online_qr',
  'generate_offline_khqr',
  'create_checkout_payload',
  'create_checkout_purchase',
  'create_payment_link',
  'get_payment_link_details',
  'query_journal',
  'query_knowledge',
  'check_transaction',
  'check_transaction_by_merchant_ref',
  'poll_transaction',
  'save_artifact',
  'open_artifact',
  'copy_to_clipboard',
];

describe('buildMcpToolCatalog', () => {
  it('exposes the 3 extras always and mutations only with allowMutations', () => {
    const byName = (names: string[]) => names;

    const dflt = buildMcpToolCatalog();
    const defaultNames = dflt.map((t) => t.name);
    for (const extra of MCP_EXTRAS) expect(defaultNames).toContain(extra);
    for (const create of ['generate_online_qr', 'create_payment_link', 'create_checkout_purchase']) {
      expect(defaultNames).not.toContain(create);
    }
    expect(defaultNames).toHaveLength(12);

    const full = buildMcpToolCatalog({ allowMutations: true });
    const fullNames = full.map((t) => t.name);
    for (const tool of ALL_PARITY) expect(fullNames).toContain(tool);
    expect(fullNames).toHaveLength(17);
    void byName;
  });

  it('keeps parity schemas identical to buildToolSchemas parameters', () => {
    const schemas = buildToolSchemas() as OpenAiToolDef[];
    const byAgentName = new Map(schemas.map((d) => [d.function.name, d.function]));
    const full = buildMcpToolCatalog({ allowMutations: true });
    for (const def of full.filter((t) => t.source === 'agent-parity')) {
      const fn = byAgentName.get(def.name);
      expect(fn, `parity tool ${def.name} must exist in buildToolSchemas`).toBeDefined();
      expect(def.description).toBe(fn!.description);
      expect(def.inputSchema).toEqual(fn!.parameters);
    }
  });

  it('mirrors isReadOnlyTool into annotations', () => {
    const full = buildMcpToolCatalog({ allowMutations: true });
    for (const def of full) {
      expect(def.annotations.readOnlyHint).toBe(isReadOnlyTool(def.name) || def.source === 'mcp-extra');
      if (def.annotations.readOnlyHint) expect(def.annotations.destructiveHint).toBeUndefined();
    }
  });

  it('declares every agent tool name in the union (compile-time guard mirrors runtime)', () => {
    // AGENT_TOOL_NAMES is the contracts-level closed list; if a 15th agent tool
    // is added there, this pin forces a conscious MCP catalog revisit.
    expect(AGENT_TOOL_NAMES).toHaveLength(14);
  });

  it('documents list_transactions gateway-time caveat in its description', () => {
    const list = buildMcpToolCatalog().find((t) => t.name === 'list_transactions');
    expect(list?.description).toContain('UTC+7');
  });
});
