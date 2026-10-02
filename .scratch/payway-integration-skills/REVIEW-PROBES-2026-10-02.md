# Fresh review probes — 2026-10-02

Candidate: `24dbb4a`. Local in-memory SQLite and a synthetic Gateway only. **Zero PayWay requests or money movements.**

## Observations

| Probe | Observed response / storage | Finding |
|---|---|---|
| USD 4 approved proof against stored USD 3 order | status APPROVED; lifecycle approved; fulfilled false; no fulfillment job | Correct acceptance rejection but misleading customer payment state |
| First correct proof then duplicate | first fulfilled true; duplicate false; one total outbox row | Boolean means a new queued job, not durable payment/fulfillment state |
| PENDING after accepted approval | response status/lifecycle pending; paid flag and one job remain | Response does not preserve verified state monotonically |
| KHR amountMinor 301 | Store accepts; adapter converts to 3.01 KHR; SDK validator rejects before transport | Validate currency scale before reservation; local rejection is not ambiguous submission |
| Order changes amountMinor 301 → 400 after reservation | Saved attempt subsequently reads 400 | Submitted amount is not an immutable attempt snapshot |
| Create again after synthetic verified decline | Same attempt returned; no new submission | One attempt/order constraint prevents safe replacement after final resolution |

The SDK validator was invoked directly with synthetic input, returning: `KHR amount must be an integer, received: 3.01`. This is not evidence that the gateway accepts fractional KHR.

Mismatch never produced fulfillment; no duplicate or unverified fulfillment is claimed. The probes identify gaps in status semantics and lifecycle completeness beyond current assertions.

## Fresh focused checks

```text
node node_modules/vitest/vitest.mjs run src/__tests__/integration-recipes.test.ts src/__tests__/integration-skill.test.ts --maxWorkers=2 --testTimeout=30000

Test Files  2 passed (2)
Tests       27 passed (27)
```

The recipe suite supplies 21 cases; installation/manual-copy suite supplies six. No full-suite/build/packed-consumer/paid-bank/device/production/settlement rerun was performed for this review.

## Reproduction outline

Run from the worktree with Node/tsx and existing built SDK dependencies:

1. Construct `new SqliteStore(':memory:')`; seed USD order 300 and KHR order 301 for an authenticated synthetic owner.
2. Supply a Gateway whose create returns a synthetic QR artifact and lookup returns an explicitly controlled Proof. Do not use `paywayGateway` or any network provider.
3. Create the USD attempt; reconcile first with APPROVED amount 4, then APPROVED amount 3, duplicate APPROVED amount 3, then PENDING. Inspect responses, paid flag and jobs.
4. Create the KHR attempt; inspect its amountMinor and the adapter's /100 conversion. Change only this in-memory order to 400; read its saved attempt again.
5. Reconcile the KHR attempt with DECLINED, then create again and compare IDs/submission count.
6. Invoke `validatePositiveAmount(3.01, 'KHR')` directly from `src/utils.ts`; observe local rejection.

Close the in-memory store. These probes mutate only synthetic memory records. They do not edit the SDK, templates, merchant database, signing configuration or tests.
