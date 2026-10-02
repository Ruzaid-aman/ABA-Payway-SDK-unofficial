import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { createServer } from 'node:http';
import { Window } from 'happy-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signCallbackBody } from '../auth.js';
import {
  createIntegration,
  type Attempt,
  type Gateway,
  type Proof,
} from '../../examples/integration-recipes/service.ts';
import { SqliteStore } from '../../examples/integration-recipes/sqlite-store.ts';
import { paywayGateway } from '../../examples/integration-recipes/payway-gateway.ts';

const key = 'synthetic-recipe-key';
const resources: { store: SqliteStore; dir?: string }[] = [];
function setup(file = ':memory:') {
  const store = new SqliteStore(file);
  resources.push({ store });
  store.seed({ id: 'order-1', ownerId: 'alice', amountMinor: 300, currency: 'USD' });
  let creates = 0;
  let observed: Attempt | undefined;
  let proof: Partial<Proof> = {};
  const gateway: Gateway = {
    async create(attempt) {
      creates++;
      observed = attempt;
      expect(store.get(attempt.attemptId)?.state).toBe('creating');
      return {
        artifact: {
          kind: attempt.route,
          qrString: 'synthetic-qr',
          html: '<form method="post"></form>',
          url: 'https://sandbox.example/link',
        },
        linkId: attempt.route === 'link' ? 'known-link' : undefined,
      };
    },
    async lookup(attempt) {
      return { identity: attempt.attemptId, status: 'APPROVED', amount: 3, currency: 'USD', ...proof };
    },
  };
  return {
    store,
    gateway,
    service: createIntegration(store, gateway, key),
    creates: () => creates,
    observed: () => observed!,
    proof: (value: Partial<Proof>) => {
      proof = value;
    },
  };
}
afterEach(() => {
  const completed = resources.splice(0);
  for (const resource of completed) resource.store.close();
  for (const resource of completed) {
    if (resource.dir) rmSync(resource.dir, { recursive: true, force: true });
  }
  vi.unstubAllGlobals();
});

describe('installed integration recipe decisions', () => {
  it.each(['qr', 'hosted', 'link'] as const)(
    'creates %s once, using server price and a saved attempt',
    async (route) => {
      const fixture = setup();
      const result = await fixture.service.create('order-1', 'alice', route);
      expect(result.attemptId).toMatch(/^pw[a-f0-9]{16}$/);
      expect(fixture.observed().amountMinor).toBe(300);
      expect(result).not.toHaveProperty('raw');
      expect(Object.keys(result.artifact).sort()).toEqual(
        ['kind', route === 'qr' ? 'qrString' : route === 'hosted' ? 'html' : 'url'].sort(),
      );
      expect(await fixture.service.create('order-1', 'alice', route)).toEqual(result);
      expect(fixture.creates()).toBe(1);
      expect(fixture.service.pending()).toContain(result.attemptId);
    },
  );
  it('rejects unauthenticated/unknown/other-owner orders before submission', async () => {
    const f = setup();
    for (const [id, owner] of [
      ['order-1', ''],
      ['missing', 'alice'],
      ['order-1', 'mallory'],
    ])
      await expect(f.service.create(id, owner, 'qr')).rejects.toThrow();
    expect(f.creates()).toBe(0);
  });
  it('retains an unknown create outcome and never blindly submits it again', async () => {
    const f = setup();
    let calls = 0;
    f.gateway.create = async () => {
      calls++;
      throw new Error('synthetic lost response');
    };
    await expect(f.service.create('order-1', 'alice', 'qr')).rejects.toThrow('unknown');
    const id = f.service.pending()[0];
    expect(f.store.get(id)?.state).toBe('unknown');
    await expect(f.service.create('order-1', 'alice', 'qr')).rejects.toThrow('reconcile');
    expect(calls).toBe(1);
    expect((await f.service.reconcile(id)).fulfillmentQueued).toBe(true);
  });
  it('durably accepts a callback without waiting for provider inquiry', async () => {
    const f = setup();
    const { attemptId } = await f.service.create('order-1', 'alice', 'qr');
    f.gateway.lookup = async () => {
      throw new Error('provider unavailable');
    };
    const body = { tran_id: attemptId, payment_status: 'APPROVED' };
    expect(f.service.signal(body, signCallbackBody(body, key))).toEqual({ accepted: true });
    expect(f.store.jobs()).toEqual([]);
    expect(f.service.pending()).toContain(attemptId);
    expect(() => f.service.signal(body, 'invalid')).toThrow('signature');
    expect(() => f.service.signal({ tran_id: 'unknown' }, 'invalid')).toThrow('reference');
  });
  it.each([
    { status: 'PENDING' },
    { status: 'DECLINED' },
    { status: 'REFUNDED' },
    { status: 'PRE-AUTH' },
    { status: '' },
    { identity: 'another-transaction' },
    { amount: 4 },
    { amount: Number.NaN },
    { currency: 'KHR' },
  ])('never fulfills unapproved/mismatched inquiry %j', async (proof) => {
    const f = setup();
    const { attemptId } = await f.service.create('order-1', 'alice', 'qr');
    f.proof(proof);
    expect((await f.service.reconcile(attemptId)).fulfillmentQueued).toBe(false);
    expect(f.store.jobs()).toHaveLength(0);
  });
  it('treats an unsigned link pushback as a hint and authenticates customer status reads', async () => {
    const f = setup();
    const { attemptId } = await f.service.create('order-1', 'alice', 'link');
    f.proof({ status: 'PENDING' });
    expect(
      f.service.signal({ merchant_ref_no: attemptId, tran_id: 'forged-paid-id', status: 0, amount: 300 }, ''),
    ).toEqual({ accepted: true });
    expect((await f.service.reconcile(attemptId)).fulfillmentQueued).toBe(false);
    await expect(f.service.reconcile(attemptId, 'mallory')).rejects.toThrow('not found');
    expect(() => f.service.signal({ merchant_ref_no: attemptId }, '')).toThrow('Malformed');
    expect(f.store.jobs()).toHaveLength(0);
    f.proof({});
    expect((await f.service.reconcile(attemptId, 'alice')).fulfillmentQueued).toBe(true);
  });
  it('recovers across restart and two DB connections, queuing one fulfillment job', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'payway-recipe-db-'));
    const file = path.join(dir, 'payments.db');
    const f = setup(file);
    const { attemptId } = await f.service.create('order-1', 'alice', 'qr');
    const body = { tran_id: attemptId, payment_status: 'APPROVED' };
    f.service.signal(body, signCallbackBody(body, key));
    f.store.close();
    resources.pop();
    const a = new SqliteStore(file),
      b = new SqliteStore(file);
    resources.push({ store: a, dir }, { store: b });
    const serviceA = createIntegration(a, f.gateway, key),
      serviceB = createIntegration(b, f.gateway, key);
    expect(serviceA.pending()).toContain(attemptId);
    serviceA.signal(body, signCallbackBody(body, key));
    serviceB.signal(body, signCallbackBody(body, key));
    const results = await Promise.all([serviceA.reconcile(attemptId), serviceB.reconcile(attemptId)]);
    expect(results.filter((result) => result.fulfillmentQueued)).toHaveLength(1);
    expect(a.jobs()).toEqual([{ orderId: 'order-1', attemptId }]);
  });
  it('recovers a process stop between durable reservation and submission', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'payway-recipe-reserve-'));
    const file = path.join(dir, 'payments.db');
    const f = setup(file);
    f.store.reserve('order-1', 'alice', 'qr', 'reserved-before-crash');
    f.store.close();
    resources.pop();
    const store = new SqliteStore(file);
    resources.push({ store, dir });
    const service = createIntegration(store, f.gateway, key);
    expect(service.pending()).toEqual(['reserved-before-crash']);
    await expect(service.create('order-1', 'alice', 'qr')).rejects.toThrow('reconcile');
    expect(f.creates()).toBe(0);
    expect(() => service.signal(null as unknown as Record<string, unknown>, '')).toThrow('Malformed');
    expect(() => service.signal([] as unknown as Record<string, unknown>, '')).toThrow('Malformed');
  });
  it('projects real SDK requests and trusted detail responses via a synthetic fetch adapter', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      calls.push(String(input));
      const body = JSON.parse(String(init?.body)) as { tran_id: string };
      if (String(input).includes('/check-transaction-2'))
        return Response.json({ status: { code: '00', tran_id: body.tran_id }, data: { payment_status: 'APPROVED' } });
      if (String(input).includes('/transaction-detail'))
        return Response.json({
          status: { code: '00' },
          data: {
            transaction_id: body.tran_id,
            payment_status: 'APPROVED',
            total_amount: 3,
            original_currency: 'USD',
            payment_amount: 12000,
            payment_currency: 'KHR',
          },
        });
      return Response.json({ status: { code: '00' }, qrString: 'synthetic-qr' });
    });
    const gateway = paywayGateway(
      { merchantId: 'synthetic-merchant', apiKey: key, environment: 'sandbox', baseUrl: 'http://127.0.0.1:9999' },
      'https://merchant.example/callback',
    );
    const attempt: Attempt = {
      id: 'order-1',
      ownerId: 'alice',
      amountMinor: 300,
      currency: 'USD',
      attemptId: 'pw1234567890123456',
      state: 'creating',
      route: 'qr',
    };
    expect((await gateway.create(attempt)).artifact.qrString).toBe('synthetic-qr');
    expect(await gateway.lookup(attempt)).toMatchObject({
      identity: attempt.attemptId,
      status: 'APPROVED',
      amount: 3,
      currency: 'USD',
    });
    const html = (await gateway.create({ ...attempt, route: 'hosted' })).artifact.html!;
    expect(html).toContain('method="POST"');
    expect(html).toContain(attempt.attemptId);
    expect(calls).toHaveLength(3); // current status + approved detail; hosted generation is local
  });
  it('submits a real SDK hosted form as URL-encoded fields to a simulated local provider', async () => {
    let received = new URLSearchParams();
    let contentType = '';
    const server = createServer((req, res) => {
      contentType = String(req.headers['content-type']);
      let body = '';
      req.on('data', (chunk) => {
        body += String(chunk);
      });
      req.on('end', () => {
        received = new URLSearchParams(body);
        res.setHeader('content-type', 'text/html');
        res.end('<h1>SIMULATED hosted checkout</h1>');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing local provider port');
    const window = new Window();
    try {
      const gateway = paywayGateway(
        {
          merchantId: 'synthetic-merchant',
          apiKey: key,
          baseUrl: `http://127.0.0.1:${address.port}`,
          environment: 'sandbox',
        },
        'https://merchant.example/callback',
      );
      const artifact = await gateway.create({
        id: 'order',
        ownerId: 'alice',
        amountMinor: 300,
        currency: 'USD',
        attemptId: 'pwform123456789012',
        state: 'creating',
        route: 'hosted',
      });
      window.document.write(artifact.artifact.html ?? '');
      const form = window.document.querySelector('form');
      if (!form) throw new Error('Missing hosted form');
      const fields = new URLSearchParams();
      for (const input of form.querySelectorAll('input')) fields.append(input.name, input.value);
      const response = await fetch(form.action, { method: form.method.toUpperCase(), body: fields });
      expect(await response.text()).toContain('SIMULATED hosted checkout');
      expect(contentType).toContain('application/x-www-form-urlencoded');
      expect(received.get('tran_id')).toBe('pwform123456789012');
      expect(received.get('amount')).toBe('3.00');
      expect(received.get('currency')).toBe('USD');
      expect(received.get('payment_gate')).toBe('0');
      expect(received.get('lifetime')).toBe('6');
      expect(received.get('hash')).toMatch(/^[A-Za-z0-9+/]{86}==$/);
    } finally {
      await window.happyDOM.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('creates RSA payment links and rejects forged/mismatched saved-link inquiries', async () => {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
    let ref = '',
      total = 3,
      currency = 'USD',
      refunded = 0,
      responseId = 'saved-link';
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const creating = String(input).endsWith('/create');
      if (creating) {
        // Without an image the SDK uses its merchant-auth URL-encoded transport.
        expect(new URLSearchParams(String(init?.body)).get('merchant_auth')).toBeTruthy();
      }
      return Response.json({
        status: { code: '00' },
        tran_id: 'creation-log-only',
        data: {
          id: responseId,
          merchant_ref_no: ref,
          payment_link: 'https://sandbox.example/pay',
          total_trxn: 1,
          total_amount_org: total,
          total_refund: refunded,
          currency,
        },
      });
    });
    const gateway = paywayGateway(
      {
        merchantId: 'synthetic-merchant',
        apiKey: key,
        environment: 'sandbox',
        baseUrl: 'http://127.0.0.1:9999',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      },
      'https://merchant.example/callback',
    );
    const f = setup();
    f.gateway.create = async (attempt) => {
      ref = attempt.attemptId;
      return gateway.create(attempt);
    };
    f.gateway.lookup = gateway.lookup;
    const { attemptId } = await f.service.create('order-1', 'alice', 'link');
    expect(f.store.get(attemptId)?.linkId).toBe('saved-link');
    total = 4;
    expect((await f.service.reconcile(attemptId)).fulfillmentQueued).toBe(false);
    total = 3;
    currency = 'KHR';
    expect((await f.service.reconcile(attemptId)).fulfillmentQueued).toBe(false);
    currency = 'USD';
    refunded = 1;
    expect((await f.service.reconcile(attemptId)).fulfillmentQueued).toBe(false);
    refunded = 0;
    responseId = 'another-link';
    await expect(f.service.reconcile(attemptId)).rejects.toThrow('identity');
    responseId = 'saved-link';
    expect((await f.service.reconcile(attemptId)).fulfillmentQueued).toBe(true);
  });
});
