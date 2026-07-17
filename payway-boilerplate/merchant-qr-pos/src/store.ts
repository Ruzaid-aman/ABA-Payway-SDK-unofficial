import Database from 'better-sqlite3';

export type PaymentSource = 'webhook' | 'status-check';

export interface OrderRecord {
  transaction_id: string;
  status: 'PENDING' | 'PAID' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';
  paid_event_count: number;
}

export function createOrderStore(filename: string) {
  const database = new Database(filename);
  database.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      transaction_id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'PAID', 'DECLINED', 'CANCELLED', 'EXPIRED')),
      paid_event_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS payment_events (
      transaction_id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const recordPaidOnce = database.transaction((transactionId: string, source: PaymentSource) => {
    const applied = database.prepare('INSERT OR IGNORE INTO payment_events (transaction_id, source) VALUES (?, ?)').run(transactionId, source).changes === 1;
    if (applied) {
      database.prepare("UPDATE orders SET status = 'PAID', paid_event_count = paid_event_count + 1 WHERE transaction_id = ?").run(transactionId);
    }
    return { applied };
  });

  return {
    createPending(transactionId: string): void {
      database.prepare("INSERT INTO orders (transaction_id, status) VALUES (?, 'PENDING')").run(transactionId);
    },
    recordPaidOnce,
    get(transactionId: string): OrderRecord | undefined {
      return database.prepare('SELECT transaction_id, status, paid_event_count FROM orders WHERE transaction_id = ?').get(transactionId) as OrderRecord | undefined;
    },
    close(): void {
      database.close();
    },
  };
}
