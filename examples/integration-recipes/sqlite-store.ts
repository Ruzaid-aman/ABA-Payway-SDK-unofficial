import { DatabaseSync } from 'node:sqlite';
import {
  IntegrationError,
  type Attempt,
  type Artifact,
  type Order,
  type Proof,
  type Route,
  type Scope,
  type Store,
  type PaymentView,
} from './service.js';
import { fromGatewayAmount, validateMinor } from './money.js';

// One-host teaching DB. Version 2 requires a fresh file or reviewed migration;
// never delete old attempts/receipts to work around a schema error.
export class SqliteStore implements Store {
  readonly db: DatabaseSync;
  readonly scope: Scope;
  private readonly key: string;
  constructor(
    file: string,
    scope: Scope = { environment: 'sandbox', merchantId: 'teaching-only', tenantId: 'single-merchant' },
  ) {
    if (!['sandbox', 'production'].includes(scope.environment) || !scope.merchantId || !scope.tenantId)
      throw new Error('Invalid payment scope');
    this.scope = Object.freeze({ ...scope });
    this.key = JSON.stringify([scope.environment, scope.merchantId, scope.tenantId]);
    this.db = new DatabaseSync(file);
    if (
      this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='orders'").get() &&
      this.db.prepare('PRAGMA user_version').get()?.user_version !== 2
    ) {
      this.db.close();
      throw new Error('Payment schema migration required: back up and migrate the existing file; do not discard it');
    }
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS orders (
        scope TEXT NOT NULL, id TEXT NOT NULL, owner_id TEXT NOT NULL,
        amount_minor INTEGER NOT NULL CHECK(amount_minor>0), currency TEXT NOT NULL CHECK(currency IN ('USD','KHR')),
        paid INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(scope,id));
      CREATE TABLE IF NOT EXISTS attempts (
        scope TEXT NOT NULL, id TEXT NOT NULL, order_id TEXT NOT NULL, owner_id TEXT NOT NULL,
        amount_minor INTEGER NOT NULL, currency TEXT NOT NULL, created_at INTEGER NOT NULL,
        route TEXT NOT NULL, state TEXT NOT NULL, artifact TEXT, link_id TEXT,
        raw_status TEXT NOT NULL DEFAULT 'UNKNOWN', verification TEXT NOT NULL DEFAULT 'unverified',
        PRIMARY KEY(scope,id), FOREIGN KEY(scope,order_id) REFERENCES orders(scope,id));
      CREATE UNIQUE INDEX IF NOT EXISTS active_attempt ON attempts(scope,order_id)
        WHERE state IN ('creating','ready','unknown','review');
      CREATE TABLE IF NOT EXISTS inbox (
        scope TEXT NOT NULL, delivery_id TEXT NOT NULL, attempt_id TEXT NOT NULL, received_at INTEGER NOT NULL,
        PRIMARY KEY(scope,delivery_id), FOREIGN KEY(scope,attempt_id) REFERENCES attempts(scope,id));
      CREATE TABLE IF NOT EXISTS reconciliation (
        scope TEXT NOT NULL, attempt_id TEXT NOT NULL, needed INTEGER NOT NULL,
        PRIMARY KEY(scope,attempt_id), FOREIGN KEY(scope,attempt_id) REFERENCES attempts(scope,id));
      CREATE TABLE IF NOT EXISTS receipts (
        scope TEXT NOT NULL, receipt_id TEXT NOT NULL, attempt_id TEXT NOT NULL, amount_minor INTEGER NOT NULL,
        currency TEXT NOT NULL, source TEXT NOT NULL, verified_at INTEGER NOT NULL,
        PRIMARY KEY(scope,receipt_id), FOREIGN KEY(scope,attempt_id) REFERENCES attempts(scope,id));
      CREATE TABLE IF NOT EXISTS outbox (
        scope TEXT NOT NULL, order_id TEXT NOT NULL, attempt_id TEXT NOT NULL,
        PRIMARY KEY(scope,order_id), FOREIGN KEY(scope,order_id) REFERENCES orders(scope,id));
      PRAGMA user_version=2;`);
  }
  seed(order: Order): void {
    validateMinor(order.amountMinor, order.currency);
    this.db
      .prepare('INSERT INTO orders(scope,id,owner_id,amount_minor,currency) VALUES(?,?,?,?,?)')
      .run(this.key, order.id, order.ownerId, order.amountMinor, order.currency);
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
    const row = this.db.prepare('SELECT * FROM attempts WHERE scope=? AND id=?').get(this.key, id);
    if (!row) return undefined;
    return {
      id: String(row.order_id),
      ownerId: String(row.owner_id),
      amountMinor: Number(row.amount_minor),
      currency: row.currency as 'USD' | 'KHR',
      attemptId: String(row.id),
      route: row.route as Route,
      state: String(row.state),
      createdAt: Number(row.created_at),
      artifact: row.artifact ? (JSON.parse(String(row.artifact)) as Artifact) : undefined,
      linkId: row.link_id ? String(row.link_id) : undefined,
    };
  }
  reserve(orderId: string, ownerId: string, route: Route, id: string, validate?: (order: Order, route: Route) => void) {
    return this.atomic(() => {
      const order = this.db.prepare('SELECT * FROM orders WHERE scope=? AND id=?').get(this.key, orderId);
      if (!order || order.owner_id !== ownerId) throw new IntegrationError(404, 'Order not found');
      if (order.paid) throw new IntegrationError(409, 'Order is already paid');
      validateMinor(Number(order.amount_minor), order.currency as 'USD' | 'KHR');
      const existing = this.db
        .prepare(
          "SELECT id,route FROM attempts WHERE scope=? AND order_id=? AND state IN ('creating','ready','unknown','review')",
        )
        .get(this.key, orderId);
      if (existing && existing.route !== route) throw new IntegrationError(409, 'Existing attempt uses another route');
      if (!existing) {
        validate?.(
          { id: orderId, ownerId, amountMinor: Number(order.amount_minor), currency: order.currency as 'USD' | 'KHR' },
          route,
        );
        this.db
          .prepare(
            'INSERT INTO attempts(scope,id,order_id,owner_id,amount_minor,currency,created_at,route,state) VALUES(?,?,?,?,?,?,?,?,?)',
          )
          .run(this.key, id, orderId, ownerId, order.amount_minor, order.currency, Date.now(), route, 'creating');
        this.db.prepare('INSERT INTO reconciliation VALUES(?,?,1)').run(this.key, id);
      }
      const attempt = this.get(existing ? String(existing.id) : id);
      if (!attempt) throw new Error('Reserved attempt missing');
      return { created: !existing, attempt };
    });
  }
  ready(id: string, result: { artifact: Artifact; linkId?: string }): void {
    this.db
      .prepare(
        "UPDATE attempts SET state=CASE WHEN state='creating' THEN 'ready' ELSE state END,artifact=?,link_id=? WHERE scope=? AND id=?",
      )
      .run(JSON.stringify(result.artifact), result.linkId ?? null, this.key, id);
  }
  unknown(id: string): void {
    this.db
      .prepare("UPDATE attempts SET state='unknown' WHERE scope=? AND id=? AND state='creating'")
      .run(this.key, id);
  }
  rejectLocal(id: string): void {
    this.atomic(() => {
      const changed = this.db
        .prepare(
          "UPDATE attempts SET state='rejected-local',raw_status='LOCAL_REJECTED',verification='not-submitted' WHERE scope=? AND id=? AND state='creating'",
        )
        .run(this.key, id);
      if (changed.changes)
        this.db.prepare('UPDATE reconciliation SET needed=0 WHERE scope=? AND attempt_id=?').run(this.key, id);
    });
  }
  enqueue(id: string, deliveryId: string): void {
    this.atomic(() => {
      this.db.prepare('INSERT OR IGNORE INTO inbox VALUES(?,?,?,?)').run(this.key, deliveryId, id, Date.now());
      const verified = this.view(id).verified;
      this.db
        .prepare(
          'INSERT INTO reconciliation VALUES(?,?,?) ON CONFLICT(scope,attempt_id) DO UPDATE SET needed=excluded.needed',
        )
        .run(this.key, id, verified ? 0 : 1);
    });
  }
  view(id: string): PaymentView {
    const row = this.db.prepare('SELECT * FROM attempts WHERE scope=? AND id=?').get(this.key, id);
    if (!row) throw new IntegrationError(404, 'Order not found');
    const verified = Boolean(
      this.db.prepare('SELECT 1 FROM receipts WHERE scope=? AND attempt_id=?').get(this.key, id),
    );
    return {
      attemptId: id,
      status: verified
        ? 'APPROVED'
        : row.state === 'review'
          ? 'REVIEW'
          : row.state === 'ready' && row.verification === 'unverified'
            ? 'AWAITING_CUSTOMER'
            : String(row.raw_status),
      rawStatus: String(row.raw_status),
      verified,
      verification: String(row.verification),
      fulfillmentQueued: false,
      amountMinor: Number(row.amount_minor),
      currency: row.currency as 'USD' | 'KHR',
      attemptState: String(row.state),
    };
  }
  observe(id: string, proof: Proof): PaymentView {
    return this.atomic(() => {
      const attempt = this.get(id);
      if (!attempt) throw new IntegrationError(404, 'Order not found');
      const wasVerified = this.view(id).verified;
      const money = fromGatewayAmount(proof.amount, attempt.currency);
      const mismatch =
        proof.identity !== id ||
        (proof.status === 'APPROVED' && (money !== attempt.amountMinor || proof.currency !== attempt.currency));
      this.db.prepare('UPDATE attempts SET raw_status=? WHERE scope=? AND id=?').run(proof.status, this.key, id);
      if (mismatch) {
        this.db
          .prepare(
            "UPDATE attempts SET state=CASE WHEN state='paid' THEN state ELSE 'review' END,verification='mismatch' WHERE scope=? AND id=?",
          )
          .run(this.key, id);
        return this.view(id);
      }
      if (wasVerified) {
        this.db.prepare("UPDATE attempts SET verification='duplicate' WHERE scope=? AND id=?").run(this.key, id);
        this.db.prepare('UPDATE reconciliation SET needed=0 WHERE scope=? AND attempt_id=?').run(this.key, id);
        return this.view(id);
      }
      if (proof.status !== 'APPROVED') {
        this.db
          .prepare(
            "UPDATE attempts SET state=CASE WHEN ?='DECLINED' THEN 'declined' ELSE state END,verification='not-approved' WHERE scope=? AND id=?",
          )
          .run(proof.status, this.key, id);
        if (proof.status === 'DECLINED')
          this.db.prepare('UPDATE reconciliation SET needed=0 WHERE scope=? AND attempt_id=?').run(this.key, id);
        return this.view(id);
      }
      if (money === undefined) throw new Error('Approved payment money missing');
      const receiptId = proof.receiptId ?? id;
      const receipt = this.db.prepare('SELECT * FROM receipts WHERE scope=? AND receipt_id=?').get(this.key, receiptId);
      if (
        receipt &&
        (receipt.attempt_id !== id || receipt.amount_minor !== money || receipt.currency !== proof.currency)
      ) {
        this.db
          .prepare("UPDATE attempts SET state='review',verification='receipt-conflict' WHERE scope=? AND id=?")
          .run(this.key, id);
        return this.view(id);
      }
      this.db
        .prepare('INSERT OR IGNORE INTO receipts VALUES(?,?,?,?,?,?,?)')
        .run(
          this.key,
          receiptId,
          id,
          money,
          proof.currency,
          proof.source ?? 'synthetic-or-merchant-adapter',
          Date.now(),
        );
      this.db.prepare('UPDATE orders SET paid=1 WHERE scope=? AND id=?').run(this.key, attempt.id);
      const queued =
        this.db.prepare('INSERT OR IGNORE INTO outbox VALUES(?,?,?)').run(this.key, attempt.id, id).changes === 1;
      this.db
        .prepare("UPDATE attempts SET state='paid',verification=? WHERE scope=? AND id=?")
        .run(queued ? 'accepted' : 'additional-receipt', this.key, id);
      this.db.prepare('UPDATE reconciliation SET needed=0 WHERE scope=? AND attempt_id=?').run(this.key, id);
      return { ...this.view(id), fulfillmentQueued: queued };
    });
  }
  pending(): string[] {
    return this.db
      .prepare('SELECT attempt_id FROM reconciliation WHERE scope=? AND needed=1')
      .all(this.key)
      .map((row) => String(row.attempt_id));
  }
  jobs(): { orderId: string; attemptId: string }[] {
    return this.db
      .prepare('SELECT * FROM outbox WHERE scope=?')
      .all(this.key)
      .map((row) => ({ orderId: String(row.order_id), attemptId: String(row.attempt_id) }));
  }
  close(): void {
    this.db.close();
  }
}
