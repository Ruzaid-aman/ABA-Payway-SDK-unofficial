/**
 * Agentic CLI rendering coverage: human-readable summaries, versioned JSON
 * serialization (schema-validated), and the create-plan confirmation view.
 */
import { describe, expect, it } from 'vitest';
import type { AgentCommandResultV1 } from '../agent/contracts.js';
import { renderCreatePlanConfirmation, renderHumanResult, serializeCommandResult } from '../agent/output.js';

function baseResult(overrides: Partial<AgentCommandResultV1> = {}): AgentCommandResultV1 {
  return { version: 'agent-command/v1', status: 'succeeded', ...overrides };
}

describe('renderHumanResult', () => {
  it('renders status, request, message, session, and execution ids', () => {
    const text = renderHumanResult(
      baseResult({
        request: 'sell 5 USD',
        message: 'done',
        sessionId: 'sess-1',
        executionIds: ['e1', 'e2'],
      }),
    );
    expect(text).toContain('Status: succeeded');
    expect(text).toContain('Request: sell 5 USD');
    expect(text).toContain('Message: done');
    expect(text).toContain('Session: sess-1');
    expect(text).toContain('Executions: e1, e2');
  });

  it('renders plan actions with a fallback tool name', () => {
    const text = renderHumanResult(
      baseResult({
        plan: { version: 'agent-plan/v1', actions: [{ tool: 'generate_qr' }, {}] } as never,
      }),
    );
    expect(text).toContain('Plan:');
    expect(text).toContain('- generate_qr');
    expect(text).toContain('- ?');
  });

  it('renders action results with ok/failed, error codes, and artifacts', () => {
    const text = renderHumanResult(
      baseResult({
        actions: [
          { tool: 'generate_qr', ok: true },
          { tool: 'check_status', ok: false, error: { code: 'E1', message: 'bad' }, artifact: { path: '/tmp/a.json' } },
          { tool: 'no_artifact', ok: false, error: { message: 'plain' }, artifact: {} },
        ],
      } as never),
    );
    expect(text).toContain('- generate_qr: ok');
    expect(text).toContain('- check_status: failed (E1: bad)');
    expect(text).toContain('artifact: /tmp/a.json');
    expect(text).toContain('- no_artifact: failed (plain)');
    expect(text).toContain('artifact: (unknown)');
  });

  it('renders the error block when present', () => {
    const text = renderHumanResult(baseResult({ status: 'failed', error: { code: 'X', message: 'nope' } }));
    expect(text).toContain('Error: X - nope');
  });
});

describe('serializeCommandResult', () => {
  it('produces JSON that validates against the agent-command/v1 schema', () => {
    const serialized = serializeCommandResult(baseResult({ message: 'ok', sessionId: 's1' }));
    const parsed = JSON.parse(serialized) as AgentCommandResultV1;
    expect(parsed.version).toBe('agent-command/v1');
    expect(parsed.message).toBe('ok');
  });

  it('carries the resolved environment through serialization', () => {
    const serialized = serializeCommandResult(baseResult({ environment: 'production', message: 'ok' }));
    const parsed = JSON.parse(serialized) as AgentCommandResultV1;
    expect(parsed.environment).toBe('production');
  });

  it('rejects an environment outside the sandbox/production enum', () => {
    expect(() =>
      serializeCommandResult(baseResult({ environment: 'staging' } as unknown as AgentCommandResultV1)),
    ).toThrow('failed validation');
  });
});

describe('renderCreatePlanConfirmation', () => {
  it('renders routes, money, transaction strategy, urls, artifacts, and assumptions', () => {
    const text = renderCreatePlanConfirmation({
      request: 'charge 5 USD',
      context: 'cli',
      environment: 'sandbox',
      actions: [
        {
          route: 'generate_qr' as never,
          money: '5.00 USD',
          transactionIdStrategy: 'explicit: TX-1',
          lifetime: 600,
          urls: ['https://example.com/cb'],
          artifacts: ['qr.png'],
        },
        {
          route: 'check_status' as never,
          money: 'none',
          transactionIdStrategy: 'reuse',
          urls: [],
          artifacts: [],
        },
      ],
      assumptions: ['sandbox credentials'],
      planContext: {},
    });
    expect(text).toContain('Create plan proposal');
    expect(text).toContain('Route: generate_qr');
    expect(text).toContain('Money: 5.00 USD');
    expect(text).toContain('Transaction ID: explicit: TX-1');
    expect(text).toContain('Lifetime: 600 seconds');
    expect(text).toContain('URLs: https://example.com/cb');
    expect(text).toContain('Artifacts: qr.png');
    expect(text).toContain('URLs: none');
    expect(text).toContain('Artifacts: none');
    expect(text).toContain('Assumptions: sandbox credentials');
    expect(text).toContain('Plan context: none');
  });

  it('serializes a non-empty plan context as JSON', () => {
    const text = renderCreatePlanConfirmation({
      request: 'r',
      context: 'cli',
      environment: 'production',
      actions: [],
      assumptions: [],
      planContext: { merchantId: 'm1' },
    });
    expect(text).toContain('"merchantId":"m1"');
  });
});
