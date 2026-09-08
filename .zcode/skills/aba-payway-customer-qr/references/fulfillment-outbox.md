# Application outbox contract

Use this when implementing the customer-QR callback handler. Scope each store
to one merchant and environment, or include those identifiers in every key.
The database and fulfillment service are application-owned, not PayWay SDK APIs.

The adapter must implement these guarantees:

- `db.transaction(fn)` commits all writes together or rolls them all back,
  including when `fn` rejects. It resolves only after durable commit.
- `tx.fulfillments.claim(tranId, money)` inserts a record protected by a unique
  transaction-ID constraint. It returns false on conflict. A read followed by
  an unprotected insert is insufficient under concurrent callbacks.
- `tx.outbox.insert(job)` inserts the complete pending fulfillment job in that
  same transaction. An external queue publish cannot replace this database write.
- Duplicate callbacks never delete or replace an existing pending job. Both
  callback processing and reconciliation use this same acceptance operation.

A minimal SQL layout for the adapter is:

```sql
CREATE TABLE accepted_payments (
  tran_id TEXT PRIMARY KEY,
  merchant_ref TEXT NOT NULL,
  amount TEXT NOT NULL,
  currency TEXT NOT NULL
);
CREATE TABLE fulfillment_outbox (
  tran_id TEXT PRIMARY KEY REFERENCES accepted_payments(tran_id),
  payload TEXT NOT NULL,
  delivered_at TEXT,
  lease_until TEXT
);
```

Within the transaction, insert the accepted payment with `ON CONFLICT DO NOTHING`.
Insert the outbox row only if that insert actually created a row. Persist the
validated order/obligation identifier too when one customer has multiple orders.
Reject or investigate mismatched obligations before accepting payment for them.

Workers claim pending rows with a lease or database lock. A failed or crashed
worker leaves a retryable row whose lease eventually expires. `fulfillOrder`
must persistently deduplicate the business effect using `job.tranId`; retain
the key long enough for reconciliation and replay. Mark delivered only after
that effect succeeds. Retrying after an acknowledgement failure is expected.

If using an external queue, an outbox dispatcher publishes pending jobs with
stable IDs, and consumers deduplicate effects. Database acceptance and delivery
are separate guarantees; a transaction alone does not make an external effect
exactly once. Reconcile missed callbacks because PayWay does not retry them.
