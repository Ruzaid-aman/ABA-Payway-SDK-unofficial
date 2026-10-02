# 03 — Executable merchant recipes and payment boundaries

Type: task
Status: resolved
Blocked by: 02

## Acceptance

Express/Next QR, hosted-form and link routes; server prices/ownership; saved attempts; durable callback acceptance; identity/amount/currency inquiry; unique fulfillment and unknown-outcome recovery.

## Answer

Five canonical source assets implement these boundaries using the existing SDK. SDK signing and lifecycle helpers are reused; custom gateway artifacts are filtered before customer response. SQLite reservation and reconciliation insertion are atomic, including a crash before submission. Payment-link inquiry binds the saved link ID/reference and exact gross currency/amount; creation log tran_id is not a paid transaction ID. Tests cover decline/pending/refund/pre-auth, malformed/invalid/unknown callbacks, ownership, mismatches, missing delivery, concurrent duplicate acceptance and restart recovery.

Existing scaffolds now persist orders before SDK initiation. Local SQLite is explicitly a single-host teaching adapter, not a distributed production database or exactly-once shipping worker. Next bundler import adaptation is documented and validated in a real Next 16.3.8 production build and HTTP run. Synthetic provider evidence does not certify a paid gateway cycle.
