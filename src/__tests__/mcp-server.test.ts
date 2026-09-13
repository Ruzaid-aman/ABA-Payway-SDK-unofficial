import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Server as HttpServer } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { startMockPaywayServer, getMockPaywayUrl, stopMockPaywayServer } from '../test/index.js';
import { createPayWayMcpServer } from '../mcp/server.js';

const ENV_KEYS = ['PAYWAY_BASE_URL', 'PAYWAY_ENV', 'PAYWAY_MERCHANT_ID', 'PAYWAY_API_KEY', 'PAYWAY_MCP_ALLOW_MUTATIONS'];
const savedEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

/** Connects a fresh server+client pair through the in-memory transport. */
async function connect(options: { allowMutations?: boolean } = {}): Promise<Client> {
  const server = createPayWayMcpServer(options);
  const client = new Client({ name: 'test-client', version: '0.0.1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

let mockServer: HttpServer | null = null;

afterEach(async () => {
  if (mockServer) {
    await stopMockPaywayServer(mockServer);
    mockServer = null;
  }
});

async function wireMockGateway(): Promise<void> {
  mockServer = await startMockPaywayServer();
  process.env.PAYWAY_BASE_URL = getMockPaywayUrl(mockServer);
  process.env.PAYWAY_ENV = 'sandbox';
  process.env.PAYWAY_MERCHANT_ID = 'test-merchant-001';
  process.env.PAYWAY_API_KEY = 'a'.repeat(32);
}

describe('payway-sdk MCP server', () => {
  let client: Client;

  beforeEach(() => {
    delete process.env.PAYWAY_MCP_ALLOW_MUTATIONS;
  });

  afterEach(async () => {
    if (client) await client.close();
  });

  it('handshakes and reports serverInfo payway-sdk', async () => {
    client = await connect();
    const serverVersion = client.getServerVersion();
    expect(serverVersion?.name).toBe('payway-sdk');
    expect(serverVersion?.version).toBeTruthy();
  });

  it('lists 12 tools by default (9 read-only parity + 3 extras)', async () => {
    client = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toHaveLength(12);
    expect(names).toContain('check_transaction');
    expect(names).toContain('query_knowledge');
    expect(names).toContain('list_transactions');
    expect(names).not.toContain('generate_online_qr');
    expect(names).not.toContain('create_payment_link');
    for (const tool of tools) {
      expect(tool.inputSchema).toMatchObject({ type: 'object' });
    }
  });

  it('lists 17 tools with allowMutations and marks annotations', async () => {
    client = await connect({ allowMutations: true });
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(17);
    const create = tools.find((t) => t.name === 'create_payment_link');
    expect(create?.annotations?.readOnlyHint).toBe(false);
    const read = tools.find((t) => t.name === 'check_transaction');
    expect(read?.annotations?.readOnlyHint).toBe(true);
  });

  it('honors PAYWAY_MCP_ALLOW_MUTATIONS=1 from the environment', async () => {
    process.env.PAYWAY_MCP_ALLOW_MUTATIONS = '1';
    client = await connect();
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(17);
  });

  it('calls query_knowledge offline (search)', async () => {
    client = await connect();
    const result = await client.callTool({ name: 'query_knowledge', arguments: { query: 'search', pattern: 'callback hmac' } });
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text) as {
      tool: string;
      data: { totalHits: number };
    };
    expect(payload.tool).toBe('query_knowledge');
    expect(typeof payload.data.totalHits).toBe('number');
  });

  it('answers a gateway read tool without credentials with CONFIG_ERROR', async () => {
    client = await connect();
    const result = await client.callTool({ name: 'check_transaction', arguments: { transactionId: 'ANY' } });
    expect(result.isError).toBe(true);
    const payload = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text) as {
      error: { code: string; message: string };
    };
    expect(payload.error.code).toBe('CONFIG_ERROR');
    expect(payload.error.message).toContain('credentials missing');
  });

  it('calls check_transaction against the mock gateway', async () => {
    await wireMockGateway();
    client = await connect();
    const result = await client.callTool({ name: 'check_transaction', arguments: { transactionId: 'APPROVED-DX' } });
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text) as {
      tool: string;
      data: { transactionId: string; raw: Record<string, unknown> };
    };
    expect(payload.data.transactionId).toBe('APPROVED-DX');
    expect(payload.data.raw).toBeDefined();
  });

  it('refuses mutation tools that were never exposed (default mode)', async () => {
    client = await connect();
    const result = await client.callTool({ name: 'create_payment_link', arguments: {} });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0].text).toContain('UNKNOWN_TOOL');
  });

  it('returns isError for an unknown tool', async () => {
    client = await connect();
    const result = await client.callTool({ name: 'no_such_tool', arguments: {} });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0].text).toContain('UNKNOWN_TOOL');
  });

  it('maps executor ok:false results to isError:true content', async () => {
    client = await connect();
    // poll_transaction with a validation-shaped missing field fails fast in the executor path.
    const result = await client.callTool({ name: 'query_journal', arguments: { query: 'timeline' } });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0].text).toContain('VALIDATION');
  });
});
