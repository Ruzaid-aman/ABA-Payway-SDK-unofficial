# First payment: create, verify, recover

This is the simulated application exercise after the [quickstart](../../QUICKSTART.md). For ABA sandbox registration, callback setup, and completing an actual gateway test payment, follow that guide first. This exercise teaches verification and recovery without ABA test-payer access.

This exercise uses the existing reference app and simulated payments. Run from
the repository root with Node 22.12+ and dependencies installed. In a fresh shell,
ensure `PAYWAY_MERCHANT_ID` and `PAYWAY_API_KEY` are unset; the app automatically
selects sandbox mode when both are present. Stop if its startup banner says SANDBOX.

```sh
npm --prefix examples/first-payment run setup
npm --prefix examples/first-payment start
```

Open the printed localhost URL. Confirm the SIMULATED banner before continuing.
Choose a new order for each exercise; QR and hosted checkout are alternative
attempts, not two simultaneous payments for the same pending order.

| Exercise | What to do | Expected result |
|---|---|---|
| Show a payment artifact | Choose Coffee and create a QR. | A simulated QR appears. The order remains `awaiting_payment`; showing the artifact does not fulfill it. |
| Verify and fulfill | Create an Approve Demo order. | The simulated approval is checked server-side and the order becomes `paid`. The event log records one fulfillment. |
| Recover a missed notification | Create a Missed Callback Demo order. | No callback is delivered. The server-side status poll discovers approval and fulfills once. |
| Reject an overlapping attempt | While a Coffee order is pending, request another QR or hosted payment for that order. | The server returns HTTP 409. The original transaction ID remains the recovery target. |
| Retry after rejection | Create a Decline Demo order, wait for rejection, then retry. | The next attempt has a fresh transaction ID. |

Stop the app with Ctrl+C when done. Its local `first-payment-store.json` preserves
orders and attempts across restarts; keep it private.

## Check duplicate delivery and ambiguous creation

From the repository root, run the repeatable HTTP integration checks:

```sh
npm run build
npm test -- src/__tests__/first-payment-examples.test.ts
```

These checks deliver signed callbacks repeatedly, poll the same transaction,
reject incorrect amounts/currencies, and verify that fulfillment occurs once.
They also verify that a pending saved attempt blocks QR and hosted replacements,
including after reopening the on-disk store. A simulated lost create response
test recovers the saved ID through the status endpoint without creating a second
attempt. Creation remains unresolved until a server-side lookup establishes its outcome.
After a timeout, retain the saved ID and query it; a missing callback or PENDING
result is not permission to create another charge.

## Move to your application

Use the [quickstart SDK sequence](../../QUICKSTART.md#6-integrate-the-server) on your
server. Return only the selected artifact to the authorized customer. Bind verified
transaction ID, amount and currency to your stored order before fulfilling it.
Payment-link callbacks require lookup because they are unsigned.

The reference app is a single-process teaching implementation backed by a JSON
file. Its guard is not a distributed database lock or a transactional job queue.
For deployment, use database uniqueness/transactions plus a durable fulfillment
job, authenticate and authorize order access, and follow the
[deployment checklist](13-deployment-checklist.md). Local closure can still be
followed by a late payment; reconcile it explicitly.
