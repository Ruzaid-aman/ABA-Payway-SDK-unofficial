import { DatabaseSync } from 'node:sqlite';
import {
  IntegrationError,
  type Attempt,
  type Artifact,
  type Order,
  type Proof,
  type Route,
  type Store,
} from './service.js';

// Local teaching adapter: one SQLite file on one host. For a distributed or
// serverless deployment implement Store using the merchant's transactional DB.
// Protect/back up this file; do not place it in a public/static directory.
export class SqliteStore implements Store {
  readonly db: DatabaseSync;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL,
        amount_minor INTEGER NOT NULL CHECK(amount_minor>0), currency TEXT NOT NULL CHECK(currency IN ('USD','KHR')),
        paid INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, order_id TEXT UNIQUE NOT NULL REFERENCES orders(id),
        route TEXT NOT NULL, state TEXT NOT NULL, artifact TEXT, link_id TEXT);
      CREATE TABLE IF NOT EXISTS inbox (delivery_id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id));
      CREATE TABLE IF NOT EXISTS reconciliation (attempt_id TEXT PRIMARY KEY REFERENCES attempts(id), needed INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox (order_id TEXT PRIMARY KEY REFERENCES orders(id), attempt_id TEXT NOT NULL);
    `);
  }
  seed(order: Order): void {
    if (!Number.isSafeInteger(order.amountMinor) || order.amountMinor <= 0) throw new Error('Invalid server price');
    this.db
      .prepare('INSERT INTO orders(id,owner_id,amount_minor,currency) VALUES(?,?,?,?)')
      .run(order.id, order.ownerId, order.amountMinor, order.currency);
  }
  private atomic<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  get(id: string): Attempt | undefined {
    const row = this.db
      .prepare(`SELECT a.*,o.owner_id,o.amount_minor,o.currency,o.id AS order_id
      FROM attempts a JOIN orders o ON o.id=a.order_id WHERE a.id=?`)
      .get(id);
    if (!row) return undefined;
    return {
      id: String(row.order_id),
      ownerId: String(row.owner_id),
      amountMinor: Number(row.amount_minor),
      currency: row.currency as 'USD' | 'KHR',
      attemptId: String(row.id),
      route: row.route as Route,
      state: String(row.state),
      artifact: row.artifact ? (JSON.parse(String(row.artifact)) as Artifact) : undefined,
      linkId: row.link_id ? String(row.link_id) : undefined,
    };
  }
  reserve(orderId: string, ownerId: string, route: Route, id: string) {
    return this.atomic(() => {
      const order = this.db.prepare('SELECT owner_id,paid FROM orders WHERE id=?').get(orderId);
      if (!order || order.owner_id !== ownerId) throw new IntegrationError(404, 'Order not found');
      if (order.paid) throw new IntegrationError(409, 'Order is already paid');
      const existing = this.db.prepare('SELECT id,route FROM attempts WHERE order_id=?').get(orderId);
      if (existing && existing.route !== route) throw new IntegrationError(409, 'Existing attempt uses another route');
      if (!existing) {
        this.db
          .prepare('INSERT INTO attempts(id,order_id,route,state) VALUES(?,?,?,?)')
          .run(id, orderId, route, 'creating');
        // A crash before submission must also leave an inquiry-recoverable attempt.
        this.db.prepare('INSERT INTO reconciliation VALUES(?,1)').run(id);
      }
      const attempt = this.get(existing ? String(existing.id) : id);
      if (!attempt) throw new Error('Reserved attempt missing');
      return { created: !existing, attempt };
    });
  }
  ready(id: string, result: { artifact: Artifact; linkId?: string }): void {
    this.atomic(() => {
      this.db
        .prepare('UPDATE attempts SET state=?,artifact=?,link_id=? WHERE id=?')
        .run('ready', JSON.stringify(result.artifact), result.linkId ?? null, id);
      // Schedule every attempt, so recovery does not depend on receiving a callback.
      this.db.prepare('INSERT INTO reconciliation VALUES(?,1) ON CONFLICT(attempt_id) DO UPDATE SET needed=1').run(id);
    });
  }
  unknown(id: string): void {
    this.atomic(() => {
      this.db.prepare('UPDATE attempts SET state=? WHERE id=?').run('unknown', id);
      this.db.prepare('INSERT INTO reconciliation VALUES(?,1) ON CONFLICT(attempt_id) DO UPDATE SET needed=1').run(id);
    });
  }
  enqueue(id: string, deliveryId: string): void {
    this.atomic(() => {
      this.db.prepare('INSERT OR IGNORE INTO inbox VALUES(?,?)').run(deliveryId, id);
      this.db.prepare('INSERT INTO reconciliation VALUES(?,1) ON CONFLICT(attempt_id) DO UPDATE SET needed=1').run(id);
    });
  }
  accept(id: string, proof: Proof): boolean {
    return this.atomic(() => {
      const attempt = this.get(id);
      if (
        !attempt ||
        proof.identity !== id ||
        proof.status !== 'APPROVED' ||
        !Number.isFinite(proof.amount) ||
        Math.abs(proof.amount * 100 - attempt.amountMinor) > 1e-6 ||
        proof.currency !== attempt.currency
      )
        return false;
      this.db.prepare('UPDATE orders SET paid=1 WHERE id=?').run(attempt.id);
      const inserted = this.db.prepare('INSERT OR IGNORE INTO outbox VALUES(?,?)').run(attempt.id, id).changes;
      this.db.prepare('UPDATE reconciliation SET needed=0 WHERE attempt_id=?').run(id);
      return inserted === 1;
    });
  }
  pending(): string[] {
    return this.db
      .prepare('SELECT attempt_id FROM reconciliation WHERE needed=1')
      .all()
      .map((row) => String(row.attempt_id));
  }
  jobs(): { orderId: string; attemptId: string }[] {
    return this.db
      .prepare('SELECT * FROM outbox')
      .all()
      .map((row) => ({ orderId: String(row.order_id), attemptId: String(row.attempt_id) }));
  }
  close(): void {
    this.db.close();
  }
}
