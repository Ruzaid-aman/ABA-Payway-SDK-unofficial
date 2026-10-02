# 07 — Money, durable attempt history and verified payment state

Type: task
Status: resolved

## Acceptance

Address F1/F2 defects with immutable attempt prices, exact currency units, explicit environment/MID/tenant scope, retained terminal attempts, safe replacement policy, verified customer state, separate worker inquiry and one durable fulfillment job. Verify mismatches, duplicate/restart/concurrent handling, old schema rejection, lost response and stale inquiry.

## Answer

Canonical nine-asset recipes implement these boundaries. New receipt records remain distinct from orders and attempts. Terminal declined/local-rejected attempts permit a new attempt; ambiguous, pending, expired and review attempts remain reserved. USD cents and whole KHR riel validate before submission. Customer reads use saved verified state; current inquiry precedes paced historical enrichment. Approved current status alone lacks original currency and cannot authorize fulfillment.

The SQLite schema is version 2. Existing data must be backed up and migrated; the sample rejects old files without deleting them. This is a single-host teaching adapter, not a production migration, distributed worker, complete financial ledger or completed delivery service.

## Comments

2026-10-02: Claimed following explicit user authorization. Final validation is recorded in ENHANCEMENTS-2026-10-02.md; bank proof/rate questions remain Q47–Q48.
