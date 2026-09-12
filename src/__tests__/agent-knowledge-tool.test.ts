/**
 * Knowledge wave (2026-09-12): the 14th agent tool `query_knowledge` —
 * read-only, offline search/read over the packaged knowledge corpus — plus
 * the domain-constraints digest injected into the strict-JSON system prompt.
 */
import { describe, expect, it } from 'vitest';
import { toolRegistry } from '../agent/tools.js';
import { buildStrictJsonSystemPrompt, buildToolSchemas } from '../agent/provider-prompts.js';
import { buildKnowledgeDigest } from '../agent/knowledge-digest.js';
import type { MaterializedAgentAction } from '../agent/contracts.js';
import type { PayWay } from '../client.js';

// query_knowledge never touches the client — a bare object satisfies the
// registry signature without constructing a real PayWay instance.
const client = {} as unknown as PayWay;
const ctx = { sessionId: 'test-session' } as never;

function action(params: Record<string, unknown>): MaterializedAgentAction {
  return { tool: 'query_knowledge', ...params } as unknown as MaterializedAgentAction;
}

describe('query_knowledge tool', () => {
  it('is registered in the closed tool registry', () => {
    expect(typeof toolRegistry.query_knowledge).toBe('function');
  });

  it('reads a topic by slug and returns content with metadata', async () => {
    const result = await toolRegistry.query_knowledge(action({ query: 'read', topic: 'quickstart' }), client, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { query: string; topic: string; content: string };
      expect(data.query).toBe('read');
      expect(data.topic).toBe('quickstart');
      expect(data.content).toContain('ABA PayWay SDK quickstart');
    }
  });

  it('searches with multi-term AND semantics and caps hits', async () => {
    const result = await toolRegistry.query_knowledge(
      action({ query: 'search', pattern: 'payment link void' }),
      client,
      ctx,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { query: string; totalHits: number; hits: Array<{ topic: string }> };
      expect(data.query).toBe('search');
      expect(data.totalHits).toBeGreaterThan(0);
      expect(data.hits.length).toBeLessThanOrEqual(40);
    }
  });

  it('validates params and unknown topics with actionable errors', async () => {
    const noPattern = await toolRegistry.query_knowledge(action({ query: 'search' }), client, ctx);
    expect(noPattern.ok).toBe(false);
    if (!noPattern.ok) expect(noPattern.error.code).toBe('VALIDATION');

    const noTopic = await toolRegistry.query_knowledge(action({ query: 'read' }), client, ctx);
    expect(noTopic.ok).toBe(false);

    const unknown = await toolRegistry.query_knowledge(action({ query: 'read', topic: 'zzz' }), client, ctx);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe('VALIDATION');

    const ambiguous = await toolRegistry.query_knowledge(action({ query: 'read', topic: 'e' }), client, ctx);
    expect(ambiguous.ok).toBe(false);
    if (!ambiguous.ok) expect(ambiguous.error.message).toContain('matches several topics');
  });
});

describe('knowledge in the planning layer', () => {
  it('injects the domain-constraints digest into the strict-JSON system prompt', () => {
    const prompt = buildStrictJsonSystemPrompt();
    expect(prompt).toContain('DOMAIN CONSTRAINTS');
    expect(prompt).toContain('query_knowledge');
    expect(prompt).toContain('no guaranteed retry');
    expect(prompt).toContain('MINUTES');
  });

  it('keeps the digest compact (prompt-size budget)', () => {
    expect(buildKnowledgeDigest().length).toBeLessThan(2000);
  });

  it('exposes the query_knowledge JSON schema in the native-tools catalog', () => {
    const tools = buildToolSchemas() as Array<{ function: { name: string } }>;
    expect(tools.map((t) => t.function.name)).toContain('query_knowledge');
  });
});
