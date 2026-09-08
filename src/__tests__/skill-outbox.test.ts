import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';
import type { HandlerFn } from '../test/skill-harness-utils.js';
import { buildHandlerHarness, fixtureRequest } from '../test/skill-harness-utils.js';

const root = mkdtempSync(path.join(tmpdir(), 'payway-outbox-'));
const repo = fileURLToPath(new URL('../../', import.meta.url));
const markdown = readFileSync(path.join(repo, 'skills/aba-payway-customer-qr/SKILL.md'), 'utf8');
const handlerSource = markdown.slice(markdown.indexOf('app.post'), markdown.indexOf('// Fallback job:'));
const mock = createRequire(import.meta.url)('../../skills/aba-payway-hash/scripts/mock-callback.cjs');
const callback = fixtureRequest(
  mock.buildCallbackBody({ 'tran-id': 'durable-1', 'merchant-ref': 'cust-1', status: 'APPROVED', amount: 10 }),
);
type Job = { tranId: string; merchantRef: string; amount: number; currency: string };

afterAll(() => {
  if (!path.resolve(root).startsWith(`${path.resolve(tmpdir())}${path.sep}payway-outbox-`))
    throw new Error('Unexpected fixture path');
  rmSync(root, { recursive: true, force: true });
});

/** A real SQLite transaction adapter for the guide's application-owned seams. */
function fixture() {
  const file = path.join(mkdtempSync(path.join(root, 'case-')), 'store.sqlite');
  let sql = new DatabaseSync(file);
  sql.exec(
    'CREATE TABLE accepted (tran_id TEXT PRIMARY KEY); CREATE TABLE outbox (tran_id TEXT PRIMARY KEY, payload TEXT NOT NULL, delivered INTEGER DEFAULT 0); CREATE TABLE effects (tran_id TEXT PRIMARY KEY)',
  );
  let failInsert = false;
  let failDelivery = false;
  let failAck = false;
  let tail = Promise.resolve();
  const claim = (id: string) =>
    sql.prepare('INSERT INTO accepted VALUES (?) ON CONFLICT DO NOTHING').run(id).changes === 1;
  const harness = buildHandlerHarness({
    orders: { findByCustomerRef: () => ({ expectsExactly: (a, c) => a === 10 && c === 'USD' }) },
  });
  let handler: HandlerFn | undefined;
  const context = {
    ...harness.context,
    // Keep the legacy collaborators so the old guide fails for the observed
    // claim/enqueue loss, rather than for an absent test double.
    fulfillments: {
      has: (id: string) => Boolean(sql.prepare('SELECT 1 FROM accepted WHERE tran_id=?').get(id)),
      claim,
    },
    queueFulfillment: () => {
      if (failInsert) throw new Error('queue outage');
    },
    app: {
      post: (_route: string, fn: HandlerFn) => {
        handler = fn;
      },
    },
    db: {
      transaction: (
        fn: (tx: { fulfillments: { claim: typeof claim }; outbox: { insert: (job: Job) => void } }) => Promise<void>,
      ) => {
        const result = tail.then(async () => {
          sql.exec('BEGIN IMMEDIATE');
          try {
            await fn({
              fulfillments: { claim },
              outbox: {
                insert: (job) => {
                  if (failInsert) throw new Error('outbox insert failed');
                  sql.prepare('INSERT INTO outbox (tran_id,payload) VALUES (?,?)').run(job.tranId, JSON.stringify(job));
                },
              },
            });
            sql.exec('COMMIT');
          } catch (error) {
            sql.exec('ROLLBACK');
            throw error;
          }
        });
        tail = result.catch(() => {});
        return result;
      },
    },
    fulfillOrder: async (_job: Job, options: { idempotencyKey: string }) => {
      if (failDelivery) throw new Error('fulfillment unavailable');
      sql.prepare('INSERT INTO effects VALUES (?) ON CONFLICT DO NOTHING').run(options.idempotencyKey);
    },
    outbox: {
      markDelivered: async (id: string) => {
        if (failAck) throw new Error('worker died before acknowledgement');
        sql.prepare('UPDATE outbox SET delivered=1 WHERE tran_id=?').run(id);
      },
    },
  };
  vm.runInNewContext(ts.transpile(handlerSource), context);
  const count = (table: 'accepted' | 'outbox' | 'effects') =>
    Number(sql.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n);
  return {
    count,
    setFailure: (kind: 'insert' | 'delivery' | 'ack', value: boolean) => {
      if (kind === 'insert') failInsert = value;
      if (kind === 'delivery') failDelivery = value;
      if (kind === 'ack') failAck = value;
    },
    async receive() {
      const response = harness.newResponse();
      try {
        await handler?.(callback, response);
      } catch {
        /* legacy queue throw: inspect persisted state */
      }
      return response.sentStatus;
    },
    reopen() {
      sql.close();
      sql = new DatabaseSync(file);
    },
    close() {
      sql.close();
    },
    pending() {
      return sql
        .prepare('SELECT payload FROM outbox WHERE delivered=0')
        .all()
        .map((row) => JSON.parse(String(row.payload)) as Job);
    },
    async deliver(job: Job) {
      const worker = markdown.match(/async function deliverFulfillment\(job\)[\s\S]*?\n\}/)?.[0];
      if (!worker) throw new Error('Guide worker example missing');
      const deliver = vm.runInNewContext(`${ts.transpile(worker)}\ndeliverFulfillment`, context) as (
        job: Job,
      ) => Promise<void>;
      await deliver(job);
    },
  };
}

describe('customer-QR guide durable acceptance and recovery', () => {
  it('rolls back the claim on outbox failure and accepts a later reconciliation delivery', async () => {
    const f = fixture();
    try {
      f.setFailure('insert', true);
      await f.receive();
      expect(f.count('accepted')).toBe(0);
      expect(f.count('outbox')).toBe(0);
      f.reopen();
      f.setFailure('insert', false);
      expect(await f.receive()).toBe(200);
      expect(f.count('outbox')).toBe(1);
    } finally {
      f.close();
    }
  });

  it('persists one job across restart and concurrent duplicate callbacks', async () => {
    const f = fixture();
    try {
      await f.receive();
      expect(f.count('outbox')).toBe(1);
      f.reopen();
      await Promise.all([f.receive(), f.receive(), f.receive()]);
      expect(f.count('accepted')).toBe(1);
      expect(f.count('outbox')).toBe(1);
      expect(f.pending()).toHaveLength(1);
    } finally {
      f.close();
    }
  });

  it('retries failed work and safely redelivers after failure to acknowledge completion', async () => {
    const f = fixture();
    try {
      await f.receive();
      expect(f.pending()).toHaveLength(1);
      const job = f.pending()[0];
      f.setFailure('delivery', true);
      await expect(f.deliver(job)).rejects.toThrow('fulfillment unavailable');
      expect(f.count('effects')).toBe(0);
      expect(f.pending()).toHaveLength(1);
      f.setFailure('delivery', false);
      f.setFailure('ack', true);
      await expect(f.deliver(job)).rejects.toThrow('acknowledgement');
      f.reopen();
      expect(f.pending()).toHaveLength(1);
      f.setFailure('ack', false);
      await f.deliver(job);
      expect(f.count('effects')).toBe(1);
      expect(f.pending()).toHaveLength(0);
    } finally {
      f.close();
    }
  });
});
