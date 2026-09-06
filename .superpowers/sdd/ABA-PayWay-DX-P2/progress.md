# ABA PayWay DX P2 progress

Branch: `codex/dx-p2`
Base: P0 commit `6331e48` (+ cherry-picked `5505127` sqlite typecheck fix from dx-p1 to keep branches convergable)

## Task 7 — portable first-payment reference app

- [x] `examples/first-payment/` own package: `aba-payway-ts` via packed tarball
      (`npm run setup` → `vendor/aba-payway-ts.tgz`), no junctions, no
      repo-relative imports; runtime deps = the SDK only; Node ≥ 22.6
      type-stripping for `npm start`.
- [x] Order store: orders/attempts/events/paid-once ledger; per-attempt
      unique transaction IDs (≤ 20 chars, gateway rule); idempotent
      fulfillment guarded by source (webhook/status-check); amount +
      currency match required; late-payment-after-close → `needs_resolution`
      (explicit merchant fulfill/refund decision, never automatic);
      quantitative partial refunds (REFUNDED ≠ full refund).
- [x] Payment engine: sandbox mode (real `PayWay`, private-callback opt-in
      explicit) and demo mode (simulator with sandbox wire shapes —
      snake_case envelopes, base64'd URLs, signed `x-payway-hmac-sha512`
      pushbacks). Verified pushbacks are SIGNALS: fulfillment reads amount
      and currency from a server-side status read.
- [x] Server routes: catalog-only pricing, QR + hosted-card creation, HMAC
      verification + reconciliation on callback, status polling, close,
      refund, resolve; 409 refusal for new attempts on paid/refunded/
      needs-resolution orders; sanitized client payloads only.
- [x] UI: QR + hosted-card tabs, countdown, lifecycle event log,
      SIMULATED banner in demo mode, sandboxed iframe for hosted forms.
- [x] Teaching products: approve / decline / late (pays after close) /
      no-callback (missed-callback reconciliation).
- [x] Lifecycle acceptance tests (`src/__tests__/first-payment-examples.test.ts`):
      10/10 green through the real HTTP surface — fulfill-once across
      callback + replay + poll, mismatch refusal, unverified rejection,
      no-silent-recreate (409), late-payment resolution, missed-callback
      reconcile, partial refunds, signed hosted form, catalog-only pricing,
      decline + fresh-ID retry.
- [x] Repo hygiene: example `.gitignore` (vendor/, store artifacts,
      machine-specific lockfile), `examples/` + `payway-boilerplate/`
      forbidden-path guards in `check-package-contents.mjs`, pack dry-run
      unchanged (61 files, 30 skills, 0 example files).
- [x] Gates: root build, full vitest (1337 passed / 13 skipped / 0 failed),
      typecheck, lint clean; example `tsc --noEmit` clean; `npm start`
      smoke (health/catalog/banner) verified.

## Deliberate scope decisions

- vitest/tsx are NOT example dependencies (npm arborist `edgesOut` crash on
  vitest 4 peer graphs in this environment); tests live in the repo suite,
  typecheck runs from the example with only typescript + @types/node.
- The example's `package-lock.json` is gitignored: it pins the local
  tarball hash. When the SDK is published, switch to a registry version and
  commit the lockfile.
- `npm ci` portability is provided via `npm run setup` (pack → install);
  the plan's "tested package tarball" allowance covers pre-publication use.

## Remaining P1 (from DX-P1 tracker)

- [ ] Task 8: refresh public skills around the canonical flow.
- [ ] Task 9: durable documentation and drift checks.
