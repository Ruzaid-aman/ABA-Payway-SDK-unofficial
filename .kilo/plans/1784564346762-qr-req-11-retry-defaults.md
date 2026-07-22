# Plan: QR-REQ-11 — Configure SDK Retry Defaults for CLI Flow

## Context
`src/client.ts:_executeFetch` (line 575) implements retry logic with exponential backoff, defaulting to `maxRetries: 0, retryDelayMs: 1000`. The CLI (`src/cli.ts`) instantiates `new PayWay()` without passing retry options at lines 638 and 737, so the generate + polling flow never retries on transient failures.

Requirement: "The entire flow (generate + initial polling) MUST timeout gracefully. If the API is unreachable, the SDK MUST retry up to 3 times before failing the CLI command."

The requirement note identifies the gap specifically as: "CLI does not set `maxRetries` when constructing `PayWay()`." This is a CLI-layer configuration gap, not an SDK-defaults problem. Other consumers (`src/server/index.ts`, scripts, boilerplate) should not be forced into 3 retries by a global default change.

## Decision
Configure retries **only in the CLI layer**. The CLI will explicitly pass `maxRetries: 3, retryDelayMs: 3000` when constructing `PayWay()`. SDK defaults remain at `maxRetries: 0, retryDelayMs: 1000`.

This satisfies the requirement because:
- The retry mechanism exists in the SDK layer (`_executeFetch` in `src/client.ts`)
- The CLI layer activates it with the required 3 retries / 3s base delay
- The generate step and polling step both inherit the retry config from the same `PayWay` instance

## Tasks

### 1. Update CLI instantiations in `src/cli.ts`
- **Line 638**: `new PayWay()` → `new PayWay({ maxRetries: 3, retryDelayMs: 3000 })`
- **Line 737**: `new PayWay()` → `new PayWay({ maxRetries: 3, retryDelayMs: 3000 })`

### 2. Add unit test for 3-retry behavior in `src/__tests__/client.test.ts`
Add a test alongside the existing retry test (around line 665) to verify the exact 3-retry default behavior:

```ts
it('retries 3 times with default config on HTTP 503 and succeeds', async () => {
  const pw = new PayWay({ ...TEST_CONFIG, maxRetries: 3, retryDelayMs: 1 });
  fetchSpy
    .mockResolvedValueOnce(mockJsonResponse({ error: 'Service unavailable' }, 503, 'Service Unavailable'))
    .mockResolvedValueOnce(mockJsonResponse({ error: 'Service unavailable' }, 503, 'Service Unavailable'))
    .mockResolvedValueOnce(mockJsonResponse({ error: 'Service unavailable' }, 503, 'Service Unavailable'))
    .mockResolvedValueOnce(mockJsonResponse({ status: { code: '00', message: 'Success' } }));

  const result = await pw.checkout.checkTransaction('T001');

  expect(fetchSpy).toHaveBeenCalledTimes(4);
  expect(result).toEqual({ status: { code: '00', message: 'Success' } });
});
```

### 3. Validate
- Run tests: verify all pass with CLI retry config added
- Verify no other `new PayWay()` instantiations in `src/cli.ts` need updating
- Verify CLI `generate-qr` and `generate-checkout` construct `PayWay` with retry config

## Risk
Low. Only two lines change in production code. Retry logic is already implemented and tested. No SDK defaults are changed, so server-side SDK, scripts, and boilerplate are unaffected.

## Out of Scope
- Changing SDK global defaults — this would be a breaking change for `src/server/index.ts`, scripts, and `payway-boilerplate`
- Modifying `pollTransactionStatus` retry semantics — the existing `maxConsecutiveErrors` handles polling-level graceful failure
