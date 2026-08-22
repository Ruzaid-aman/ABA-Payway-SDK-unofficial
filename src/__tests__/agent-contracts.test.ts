import { describe, it, expect } from 'vitest';
import { validateAgentPlan, validateMaterializedPlan } from '../agent/schemas.js';
import type { AgentActionDraft } from '../agent/contracts.js';

function validAction(tool: string): AgentActionDraft {
  switch (tool) {
    case 'generate_online_qr':
      return { tool: 'generate_online_qr', amount: 3, currency: 'USD', transactionId: null, callbackUrl: 'https://example.com/cb' };
    case 'generate_offline_khqr':
      return { tool: 'generate_offline_khqr', currency: 'KHR', merchantRef: 'ref-1' };
    case 'create_checkout_payload':
      return { tool: 'create_checkout_payload', amount: 3, currency: 'USD', transactionId: null };
    case 'create_checkout_purchase':
      return { tool: 'create_checkout_purchase', amount: 3, currency: 'USD', transactionId: null };
    case 'create_payment_link':
      return { tool: 'create_payment_link', title: 'T', amount: 3, currency: 'USD', merchantRefNo: 'm-1', returnUrl: 'https://example.com/r' };
    case 'check_transaction':
      return { tool: 'check_transaction', transactionId: 'tx-123' };
    case 'check_transaction_by_merchant_ref':
      return { tool: 'check_transaction_by_merchant_ref', merchantRef: 'm-1' };
    case 'poll_transaction':
      return { tool: 'poll_transaction', transactionId: 'tx-123' };
    case 'save_artifact':
      return { tool: 'save_artifact', qrString: 'QR' };
    case 'open_artifact':
      return { tool: 'open_artifact', reference: 'https://example.com/x' };
    case 'copy_to_clipboard':
      return { tool: 'copy_to_clipboard', text: 'hi' };
    default:
      throw new Error(`unknown tool ${tool}`);
  }
}

const ALL_TOOLS = [
  'generate_online_qr',
  'generate_offline_khqr',
  'create_checkout_payload',
  'create_checkout_purchase',
  'create_payment_link',
  'check_transaction',
  'check_transaction_by_merchant_ref',
  'poll_transaction',
  'save_artifact',
  'open_artifact',
  'copy_to_clipboard',
];

describe('validateAgentPlan — valid actions', () => {
  for (const tool of ALL_TOOLS) {
    it(`accepts a valid ${tool} plan`, () => {
      const plan = { version: 'agent-plan/v1', request: 'do it', actions: [validAction(tool)] };
      expect(validateAgentPlan(plan)).toBe(true);
    });
  }

  it('accepts an empty actions array', () => {
    const plan = { version: 'agent-plan/v1', request: 'x', actions: [] };
    expect(validateAgentPlan(plan)).toBe(true);
  });

  it('accepts null transactionId in create drafts', () => {
    const plan = {
      version: 'agent-plan/v1',
      request: 'x',
      actions: [{ tool: 'generate_online_qr', amount: 3, currency: 'USD', transactionId: null, callbackUrl: 'https://e.com/c' }],
    };
    expect(validateAgentPlan(plan)).toBe(true);
  });
});

describe('validateAgentPlan — rejects invalid input', () => {
  it('rejects unknown tool', () => {
    const plan = { version: 'agent-plan/v1', request: 'x', actions: [{ tool: 'hack', text: 'x' }] };
    expect(validateAgentPlan(plan)).toBe(false);
  });

  it('rejects extra fields on an action', () => {
    const plan = {
      version: 'agent-plan/v1',
      request: 'x',
      actions: [{ tool: 'copy_to_clipboard', text: 'hi', evil: true }],
    };
    expect(validateAgentPlan(plan)).toBe(false);
  });

  it('rejects malformed union (missing required param)', () => {
    const plan = { version: 'agent-plan/v1', request: 'x', actions: [{ tool: 'generate_online_qr', amount: 3 }] };
    expect(validateAgentPlan(plan)).toBe(false);
  });

  it('rejects unsupported plan version', () => {
    const plan = { version: 'agent-plan/v2', request: 'x', actions: [validAction('copy_to_clipboard')] };
    expect(validateAgentPlan(plan)).toBe(false);
  });

  it('rejects invalid currency', () => {
    const plan = {
      version: 'agent-plan/v1',
      request: 'x',
      actions: [{ tool: 'generate_online_qr', amount: 3, currency: 'EUR', transactionId: null, callbackUrl: 'https://e.com/c' }],
    };
    expect(validateAgentPlan(plan)).toBe(false);
  });

  it('rejects non-HTTPS callback URL', () => {
    const plan = {
      version: 'agent-plan/v1',
      request: 'x',
      actions: [{ tool: 'generate_online_qr', amount: 3, currency: 'USD', transactionId: null, callbackUrl: 'http://e.com/c' }],
    };
    expect(validateAgentPlan(plan)).toBe(false);
  });

  it('rejects missing required top-level properties', () => {
    expect(validateAgentPlan({ version: 'agent-plan/v1', actions: [] })).toBe(false);
    expect(validateAgentPlan({ request: 'x', actions: [] })).toBe(false);
  });

  it('rejects unknown tool name with valid shape otherwise', () => {
    const plan = { version: 'agent-plan/v1', request: 'x', actions: [{ tool: 'refund', amount: 3 }] };
    expect(validateAgentPlan(plan)).toBe(false);
  });

  it('rejects transaction id longer than 20 chars', () => {
    const plan = {
      version: 'agent-plan/v1',
      request: 'x',
      actions: [{ tool: 'check_transaction', transactionId: 'a'.repeat(21) }],
    };
    expect(validateAgentPlan(plan)).toBe(false);
  });
});

describe('validateMaterializedPlan — transactionId required', () => {
  it('accepts materialized create with valid string transactionId', () => {
    const plan = {
      version: 'agent-plan/v1',
      request: 'x',
      actions: [{ tool: 'generate_online_qr', amount: 3, currency: 'USD', transactionId: 'tx-123', callbackUrl: 'https://e.com/c' }],
    };
    expect(validateMaterializedPlan(plan)).toBe(true);
  });

  it('rejects materialized create with null transactionId', () => {
    const plan = {
      version: 'agent-plan/v1',
      request: 'x',
      actions: [{ tool: 'generate_online_qr', amount: 3, currency: 'USD', transactionId: null, callbackUrl: 'https://e.com/c' }],
    };
    expect(validateMaterializedPlan(plan)).toBe(false);
  });
});
