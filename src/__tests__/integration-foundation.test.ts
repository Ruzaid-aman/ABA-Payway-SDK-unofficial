import { describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PayWayConfigError } from '../errors.ts';
import { validateGate } from '../../examples/integration-recipes/evidence.ts';
import { paywayGateway } from '../../examples/integration-recipes/payway-gateway.ts';
import { nextIntegration } from '../../examples/integration-recipes/next.ts';
import { signCallbackBody } from '../auth.ts';
import { createIntegration } from '../../examples/integration-recipes/service.ts';
import { SqliteStore } from '../../examples/integration-recipes/sqlite-store.ts';
import { fromGatewayAmount, toGatewayAmount } from '../../examples/integration-recipes/money.ts';
import { customerState } from '../../examples/integration-recipes/customer-state.ts';
import { reconcileBatch } from '../../examples/integration-recipes/settlement.ts';

function fixture() {
  const store = new SqliteStore(':memory:');
  store.seed({ id: 'invoice', ownerId: 'alice', amountMinor: 300, currency: 'USD' });
  let status = 'APPROVED',
    amount = 3,
    identity: string | undefined;
  const gateway = {
    async create(a: { route: 'qr' | 'hosted' | 'link' }) {
      return { artifact: { kind: a.route, qrString: 'SYNTHETIC' } };
    },
    lookup: vi.fn(async (a: { attemptId: string }) => ({
      identity: identity ?? a.attemptId,
      status,
      amount,
      currency: 'USD',
    })),
  };
  return {
    store,
    gateway,
    service: createIntegration(store, gateway, 'synthetic'),
    proof(s: string, a = 3, i?: string) {
      status = s;
      amount = a;
      identity = i;
    },
  };
}
describe('integration recipe financial foundation', () => {
  it('keeps paid callback replay out of the active inquiry queue', async () => {
    const f = fixture();
    try {
      const a = await f.service.create('invoice', 'alice', 'qr');
      await f.service.reconcile(a.attemptId);
      const body = { tran_id: a.attemptId, payment_status: 'APPROVED' };
      f.service.signal(body, signCallbackBody(body, 'synthetic'));
      expect(f.store.pending()).toEqual([]);
      expect(f.store.db.prepare('SELECT count(*) AS n FROM inbox').get()?.n).toBe(1);
      await f.service.reconcile(a.attemptId);
      expect(f.gateway.lookup).toHaveBeenCalledTimes(1);
      expect(f.store.jobs()).toHaveLength(1);
    } finally {
      f.store.close();
    }
  });
  it('preserves worker decisions when create completion or error arrives later', () => {
    const f = fixture();
    try {
      const a = f.store.reserve('invoice', 'alice', 'qr', 'race-id').attempt;
      f.store.observe(a.attemptId, { identity: a.attemptId, status: 'APPROVED', amount: 3, currency: 'USD' });
      f.store.ready(a.attemptId, { artifact: { kind: 'qr', qrString: 'SYNTHETIC' } });
      f.store.unknown(a.attemptId);
      f.store.rejectLocal(a.attemptId);
      expect(f.store.get(a.attemptId)?.state).toBe('paid');
      expect(f.store.view(a.attemptId)).toMatchObject({ verified: true, status: 'APPROVED' });
      expect(f.store.jobs()).toHaveLength(1);
      const g = fixture();
      try {
        g.store.reserve('invoice', 'alice', 'qr', 'review-race');
        g.store.observe('review-race', { identity: 'review-race', status: 'APPROVED', amount: 4, currency: 'USD' });
        g.store.ready('review-race', { artifact: { kind: 'qr', qrString: 'SYNTHETIC' } });
        expect(g.store.get('review-race')?.state).toBe('review');
        expect(g.store.view('review-race').verified).toBe(false);
        g.store.rejectLocal('review-race');
        expect(g.store.pending()).toContain('review-race');
      } finally {
        g.store.close();
      }
    } finally {
      f.store.close();
    }
  });
  it('rejects a callback whose signed transaction and chosen reference disagree', async () => {
    const f = fixture();
    try {
      const a = await f.service.create('invoice', 'alice', 'qr');
      const body = { merchant_ref_no: a.attemptId, tran_id: 'another-id', payment_status: 'APPROVED' };
      expect(() => f.service.signal(body, signCallbackBody(body, 'synthetic'))).toThrow('identity mismatch');
      expect(f.store.db.prepare('SELECT count(*) AS n FROM inbox').get()?.n).toBe(0);
    } finally {
      f.store.close();
    }
  });
  it('requires nonempty scoped settlement evidence and canonical duplicate comparison', () => {
    const booking = {
      scope: 'sandbox:mid',
      batchId: 'batch',
      currency: 'USD',
      signedMinor: 300,
      bankReference: 'synthetic-bank-ref',
    };
    const row = { scope: booking.scope, operationId: 'operation', batchId: 'batch', currency: 'USD', signedMinor: 300 };
    expect(() => reconcileBatch([], { ...booking, signedMinor: 0 }, 0)).toThrow('Nonempty');
    expect(() => reconcileBatch([row], { ...booking, scope: '' }, 0)).toThrow('Nonempty');
    const reordered = {
      signedMinor: 300,
      currency: 'USD',
      batchId: 'batch',
      operationId: 'operation',
      scope: booking.scope,
    };
    expect(reconcileBatch([row, reordered], booking, 0)).toMatchObject({ matches: true, uniqueOperations: 1 });
  });
  it('requires a timezone-aware gate evidence timestamp', () => {
    const record = {
      gate: 'G2' as const,
      status: 'passed' as const,
      environment: 'sandbox' as const,
      operation: 'qr',
      owner: 'developer',
      checkedAt: '2026-10-02T10:00:00',
      evidence: ['synthetic-check'],
    };
    expect(() => validateGate(record)).toThrow('Incomplete');
    expect(() => validateGate({ ...record, checkedAt: record.checkedAt + '+07:00' })).not.toThrow();
  });
  it('uses only current status while pending and historical detail only outside the current window', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
      const endpoint = String(url);
      calls.push(endpoint);
      expect(endpoint).toMatch(/^http:\/\/127\.0\.0\.1:9917\//);
      const body = JSON.parse(String(init?.body)) as { tran_id: string };
      if (endpoint.includes('/check-transaction-2'))
        return Response.json({ status: { code: '00', tran_id: body.tran_id }, data: { payment_status: 'PENDING' } });
      return Response.json({
        status: { code: '00' },
        data: { transaction_id: body.tran_id, payment_status: 'APPROVED', total_amount: 3, original_currency: 'USD' },
      });
    });
    try {
      const gateway = paywayGateway(
        {
          merchantId: 'synthetic-routing-mid',
          apiKey: 'synthetic',
          environment: 'sandbox',
          baseUrl: 'http://127.0.0.1:9917',
        },
        'https://merchant.example/callback',
      );
      const attempt = {
        id: 'invoice',
        ownerId: 'alice',
        amountMinor: 300,
        currency: 'USD' as const,
        route: 'qr' as const,
        attemptId: 'pw1234567890123456',
        state: 'ready',
        createdAt: Date.now(),
      };
      expect((await gateway.lookup(attempt)).status).toBe('PENDING');
      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain('check-transaction-2');
      expect((await gateway.lookup({ ...attempt, createdAt: Date.now() - 8 * 86400000 })).currency).toBe('USD');
      expect(calls).toHaveLength(2);
      expect(calls[1]).toContain('transaction-detail');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('bounds and validates Next callbacks, ACKs only durable acceptance, and supports confirmed ACK overrides', async () => {
    const f = fixture();
    try {
      const a = await f.service.create('invoice', 'alice', 'qr');
      const handlers = nextIntegration(f.service, async () => 'alice');
      const request = (body: string, signature = '', type = 'application/json') =>
        new Request('https://merchant.example/callback', {
          method: 'POST',
          headers: { 'content-type': type, 'x-payway-hmac-sha512': signature },
          body,
        });
      expect((await handlers.callback(request('{'))).status).toBe(400);
      expect((await handlers.callback(request('{}', '', 'text/plain'))).status).toBe(415);
      expect((await handlers.callback(request(' '.repeat(65537)))).status).toBe(413);
      const body = { tran_id: a.attemptId, status: 0 };
      const response = await handlers.callback(request(JSON.stringify(body), signCallbackBody(body, 'synthetic')));
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('RECEIVEOK');
      const configured = nextIntegration(f.service, async () => 'alice', { status: 204, body: '' });
      expect(
        (await configured.callback(request(JSON.stringify(body), signCallbackBody(body, 'synthetic')))).status,
      ).toBe(204);
      f.store.db.close();
      expect((await handlers.callback(request(JSON.stringify(body), signCallbackBody(body, 'synthetic')))).status).toBe(
        503,
      );
    } finally {
      if (f.store.db.isOpen) f.store.close();
    }
  });
  it('isolates identical invoice/attempt IDs across profiles and refuses the old DB schema', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'payway-scope-'));
    const file = path.join(dir, 'scoped.db');
    const a = new SqliteStore(file, { environment: 'sandbox', merchantId: 'mid-a', tenantId: 'a' });
    const b = new SqliteStore(file, { environment: 'production', merchantId: 'mid-b', tenantId: 'b' });
    try {
      for (const s of [a, b]) {
        s.seed({ id: 'invoice', ownerId: 'alice', amountMinor: s === a ? 300 : 400, currency: 'USD' });
        s.reserve('invoice', 'alice', 'qr', 'same-id');
      }
      a.observe('same-id', { identity: 'same-id', status: 'APPROVED', amount: 3, currency: 'USD' });
      expect(a.view('same-id').verified).toBe(true);
      expect(b.view('same-id').verified).toBe(false);
      expect(b.jobs()).toEqual([]);
      expect(b.get('same-id')?.amountMinor).toBe(400);
    } finally {
      a.close();
      b.close();
      unlinkSync(file);
      rmdirSync(dir);
    }
    const oldDir = mkdtempSync(path.join(tmpdir(), 'payway-old-schema-'));
    const oldFile = path.join(oldDir, 'old.db');
    const old = new DatabaseSync(oldFile);
    old.exec('CREATE TABLE orders(id TEXT)');
    old.close();
    try {
      expect(() => new SqliteStore(oldFile)).toThrow('migration required');
    } finally {
      unlinkSync(oldFile);
      rmdirSync(oldDir);
    }
  });
  it('distinguishes SDK local rejection from an ambiguous transport outcome', async () => {
    const f = fixture();
    try {
      const g = {
        ...f.gateway,
        async create() {
          throw new PayWayConfigError('synthetic local-only invalid config');
        },
      };
      const s = createIntegration(f.store, g, 'synthetic');
      await expect(s.create('invoice', 'alice', 'qr')).rejects.toThrow('before submission');
      expect(f.store.pending()).toEqual([]);
      expect(f.store.db.prepare('SELECT state FROM attempts').get()?.state).toBe('rejected-local');
      expect((await f.service.create('invoice', 'alice', 'qr')).attemptId).toBeTruthy();
    } finally {
      f.store.close();
    }
  });
  it('returns review for mismatched approval and verified state for repeated/late evidence', async () => {
    const f = fixture();
    try {
      const a = await f.service.create('invoice', 'alice', 'qr');
      f.proof('APPROVED', 4);
      const rejected = await f.service.reconcile(a.attemptId);
      expect(rejected).toMatchObject({
        status: 'REVIEW',
        rawStatus: 'APPROVED',
        verified: false,
        fulfillmentQueued: false,
      });
      expect(customerState(rejected).state).toBe('review');
      expect(f.store.jobs()).toHaveLength(0);
      f.proof('APPROVED');
      expect(await f.service.reconcile(a.attemptId)).toMatchObject({ verified: true, fulfillmentQueued: true });
      f.proof('PENDING');
      const resumed = await f.service.reconcile(a.attemptId);
      expect(resumed).toMatchObject({ status: 'APPROVED', verified: true, fulfillmentQueued: false });
      // A direct resolver replay cannot downgrade a verified receipt either.
      expect(
        f.store.observe(a.attemptId, { identity: a.attemptId, status: 'PENDING', amount: 3, currency: 'USD' }).status,
      ).toBe('APPROVED');
      expect(f.store.jobs()).toHaveLength(1);
    } finally {
      f.store.close();
    }
  });
  it('snapshots obligation and preserves failed-attempt history when explicitly creating again', async () => {
    const f = fixture();
    try {
      const a = await f.service.create('invoice', 'alice', 'qr');
      f.store.db.prepare("UPDATE orders SET amount_minor=400 WHERE id='invoice'").run();
      expect(f.store.get(a.attemptId)?.amountMinor).toBe(300);
      f.proof('DECLINED');
      await f.service.reconcile(a.attemptId);
      const b = await f.service.create('invoice', 'alice', 'qr');
      expect(b.attemptId).not.toBe(a.attemptId);
      expect(f.store.get(a.attemptId)?.state).toBe('declined');
      expect(f.store.get(b.attemptId)?.amountMinor).toBe(400);
    } finally {
      f.store.close();
    }
  });
  it('does not replace pending, unknown, review or locally expired attempts', async () => {
    const f = fixture();
    try {
      const a = await f.service.create('invoice', 'alice', 'qr');
      f.proof('PENDING');
      await f.service.reconcile(a.attemptId);
      expect((await f.service.create('invoice', 'alice', 'qr')).attemptId).toBe(a.attemptId);
      expect(customerState(f.service.status(a.attemptId, 'alice'), 0).allowNewAttempt).toBe(false);
      const uncertain = fixture();
      try {
        const lost = createIntegration(
          uncertain.store,
          {
            ...uncertain.gateway,
            async create() {
              throw new Error('Synthetic lost response');
            },
          },
          'synthetic',
        );
        await expect(lost.create('invoice', 'alice', 'qr')).rejects.toThrow('reconcile');
        await expect(lost.create('invoice', 'alice', 'qr')).rejects.toThrow('reconcile');
        expect(uncertain.store.db.prepare('SELECT count(*) AS n FROM attempts').get()?.n).toBe(1);
      } finally {
        uncertain.store.close();
      }
    } finally {
      f.store.close();
    }
  });
  it('uses USD cents and whole KHR, rejects precision/exponents/nonfinite input without rounding', () => {
    expect(toGatewayAmount(301, 'KHR')).toBe(301);
    expect(toGatewayAmount(301, 'USD')).toBe(3.01);
    expect(fromGatewayAmount('3.010000', 'USD')).toBe(301);
    for (const value of ['3.001', '1e-2', NaN, Infinity, -1]) expect(fromGatewayAmount(value, 'USD')).toBeUndefined();
    expect(fromGatewayAmount(3.01, 'KHR')).toBeUndefined();
    const s = new SqliteStore(':memory:');
    try {
      expect(() => s.seed({ id: 'bad', ownerId: 'alice', amountMinor: 1.5, currency: 'KHR' })).toThrow();
    } finally {
      s.close();
    }
  });
  it('performs trusted local gateway preflight before any intent or submission', async () => {
    const f = fixture();
    try {
      const g = {
        ...f.gateway,
        validate() {
          throw new Error('disabled local configuration');
        },
      };
      const service = createIntegration(f.store, g, 'synthetic');
      await expect(service.create('invoice', 'alice', 'qr')).rejects.toThrow('disabled');
      expect(f.store.pending()).toEqual([]);
      expect(f.store.db.prepare('SELECT count(*) AS n FROM attempts').get()?.n).toBe(0);
    } finally {
      f.store.close();
    }
  });
  it('customer reads are local and unauthorized callers cannot join a worker lookup', async () => {
    const f = fixture();
    try {
      const a = await f.service.create('invoice', 'alice', 'qr');
      for (let i = 0; i < 20; i++) expect(f.service.status(a.attemptId, 'alice').verified).toBe(false);
      expect(f.gateway.lookup).not.toHaveBeenCalled();
      expect(() => f.service.status(a.attemptId, 'mallory')).toThrow('not found');
      const result = await Promise.all([f.service.reconcile(a.attemptId), f.service.reconcile(a.attemptId)]);
      expect(f.gateway.lookup).toHaveBeenCalledTimes(1);
      expect(result.every((r) => r.verified)).toBe(true);
      expect(result.filter((r) => r.fulfillmentQueued)).toHaveLength(1);
      expect(f.store.jobs()).toHaveLength(1);
    } finally {
      f.store.close();
    }
  });
  it('rejects a mixed gateway/store profile at startup', () => {
    const f = fixture();
    try {
      expect(() =>
        createIntegration(
          f.store,
          { ...f.gateway, scope: { ...f.store.scope, environment: 'production' } },
          'synthetic',
        ),
      ).toThrow('scope mismatch');
    } finally {
      f.store.close();
    }
  });
  it('receipt identity conflicts do not pay a different invoice', async () => {
    const f = fixture();
    try {
      const a = await f.service.create('invoice', 'alice', 'qr');
      f.store.observe(a.attemptId, {
        identity: a.attemptId,
        status: 'APPROVED',
        amount: 3,
        currency: 'USD',
        receiptId: 'receipt-1',
      });
      f.store.seed({ id: 'second', ownerId: 'alice', amountMinor: 300, currency: 'USD' });
      const b = await f.service.create('second', 'alice', 'qr');
      expect(
        f.store.observe(b.attemptId, {
          identity: b.attemptId,
          status: 'APPROVED',
          amount: 3,
          currency: 'USD',
          receiptId: 'receipt-1',
        }),
      ).toMatchObject({ status: 'REVIEW', verified: false, verification: 'receipt-conflict' });
      expect(f.store.jobs()).toHaveLength(1);
    } finally {
      f.store.close();
    }
  });
  it('keeps additional genuine late receipts without a second fulfillment', async () => {
    const f = fixture();
    try {
      const a = await f.service.create('invoice', 'alice', 'qr');
      f.proof('DECLINED');
      await f.service.reconcile(a.attemptId);
      const b = await f.service.create('invoice', 'alice', 'qr');
      for (const id of [a.attemptId, b.attemptId])
        f.store.observe(id, { identity: id, status: 'APPROVED', amount: 3, currency: 'USD' });
      expect(f.store.db.prepare('SELECT count(*) AS n FROM receipts').get()?.n).toBe(2);
      expect(f.store.jobs()).toHaveLength(1);
      expect(f.store.view(b.attemptId).verification).toBe('additional-receipt');
    } finally {
      f.store.close();
    }
  });
});
describe('merchant evidence gates', () => {
  const record = {
    gate: 'G6' as const,
    status: 'passed' as const,
    environment: 'production' as const,
    operation: 'settlement',
    owner: 'finance',
    checkedAt: '2026-10-02T00:00:00Z',
    evidence: ['protected-report-ref'],
  };
  it('cannot pass an unrun or policy-free production gate', () => {
    expect(() => validateGate({ ...record, evidence: [] })).toThrow('Unrun');
    expect(() => validateGate(record)).toThrow('production rule');
    expect(() => validateGate({ ...record, approvedPolicyRef: 'ABA-approved-rule-ref' })).not.toThrow();
    expect(() => validateGate({ ...record, status: 'blocked', reason: '' })).toThrow('reason');
  });
});
describe('agreement-specific synthetic settlement matching', () => {
  const rows = [
    { scope: 'sandbox/mid', operationId: 'sale', batchId: 'batch', currency: 'USD', signedMinor: 10000 },
    { scope: 'sandbox/mid', operationId: 'refund', batchId: 'batch', currency: 'USD', signedMinor: -2000 },
    { scope: 'sandbox/mid', operationId: 'fee', batchId: 'batch', currency: 'USD', signedMinor: -100 },
  ];
  const booking = {
    scope: 'sandbox/mid',
    batchId: 'batch',
    currency: 'USD',
    signedMinor: 7900,
    bankReference: 'synthetic-bank-entry',
  };
  it('uses explicit batch/operation identity and deduplicates only identical records', () => {
    expect(reconcileBatch([...rows, rows[0]], booking, 0)).toMatchObject({
      expectedMinor: '7900',
      matches: true,
      uniqueOperations: 3,
    });
    expect(() => reconcileBatch([...rows, { ...rows[0], signedMinor: 9000 }], booking, 0)).toThrow('Conflicting');
  });
  it('fails missing/wrong-currency/evidence and does not hide mismatch without approved tolerance', () => {
    expect(reconcileBatch(rows.slice(1), booking, 0).matches).toBe(false);
    expect(() => reconcileBatch([{ ...rows[0], currency: 'KHR' }], booking, 0)).toThrow('scope/schema');
    expect(() => reconcileBatch(rows, { ...booking, bankReference: '' }, 0)).toThrow('evidence');
    expect(() => reconcileBatch(rows, booking, -1)).toThrow('approved');
  });
});
