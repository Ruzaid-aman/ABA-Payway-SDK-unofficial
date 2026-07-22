# Plan: Implement QR-REQ-04 & QR-REQ-05 (lifetime parameter for generate-qr)

## Context

- **Confirmed source of truth**: `https://developer.payway.com.kh/qr-api-14530840e0` lists `lifetime` as an **integer** field on the generate-qr request body: *"Transaction lifetime in minutes. Default: 30 days. Minimum: 3 mins, Maximum: 120 days."*
- **Current gap**: Local OpenAPI spec (`payway-openapi/components/schemas/qr-api.yaml`) omits `lifetime` from `GenerateQrRequest`; `GenerateQrParams` in `src/client.ts` has no `lifetime`; `src/domains/qr.ts` does not send it; the CLI has no `--lifetime` flag or interactive prompt.
- **Unit decision**: The CLI requirements explicitly state `--lifetime` is in **seconds** (default 180s = 3 minutes). The existing SDK convention (`validateLifetime`, checkout domain, native Android/iOS SDKs, test scripts) also treats `lifetime` as **seconds** at the SDK boundary. The API wire format is **minutes**. Therefore:
  - `GenerateQrParams.lifetime` will be typed as `number` representing **seconds**.
  - `qr.ts` will convert seconds → minutes (`Math.floor(lifetime / 60)`) when building the API payload.
  - The CLI default of `180` seconds maps to `3` minutes, matching the API minimum.

## Tasks (ordered)

### 1. Update OpenAPI spec
- **File**: `payway-openapi/components/schemas/qr-api.yaml`
  - Add `lifetime` property to `GenerateQrRequest`:
    ```yaml
    lifetime:
      type: integer
      description: >-
        Transaction lifetime in minutes. Default: 30 days.
        Minimum: 3 mins. Maximum: 120 days (172800 mins).
    ```
  - Add `lifetime` to the `required` array (the developer docs list it as required).
- **File**: `payway-openapi/paths/qr-api.yaml`
  - Add `lifetime` to `x-hmac-fields` immediately before `qr_image_template` to match the documented concatenation order (`..., payout, lifetime, qr_image_template`).

### 2. Regenerate TypeScript types
- Run `npm run bundle && npm run generate-types` to regenerate `src/types.ts`.
- This will add `lifetime?: number` to `components['schemas']['GenerateQrRequest']`.

### 3. Update SDK public interface
- **File**: `src/client.ts`
  - Add `lifetime?: number;` to `GenerateQrParams` (around line 153).

### 4. Update QR domain implementation
- **File**: `src/domains/qr.ts`
  - Import `validateLifetime` from `../utils.js`.
  - Call `validateLifetime(params.lifetime)` alongside existing validations.
  - In the `filterParams` payload, add:
    ```ts
    lifetime: params.lifetime ? Math.floor(params.lifetime / 60) : undefined,
    ```
  - Add `'lifetime'` to the HMAC fields array (between `currency` and `qr_image_template`).

### 5. Update CLI command
- **File**: `src/cli.ts`
  - Add `.option('--lifetime <seconds>', 'Transaction lifetime in seconds (default: 180)', '180')` to the `generate-qr` command definition.
  - Parse `lifetime` as `Number(opts.lifetime)` with a default of `180`.
  - Validate: if provided, must be a finite integer > 0.
  - In the online-mode parameter display block, add:
    ```ts
    console.log(`    Lifetime:           ${c.cyan(`${lifetimeSeconds} seconds`)}`);
    ```
  - Insert a new prompt **before** the existing `Submit to PayWay? (y/n)` confirmation:
    ```ts
    const lifetimeInput = await promptConfirmation(
      `  Modify lifetime? Current: ${lifetimeSeconds}s. Enter new value (or press Enter to skip): `
    );
    ```
    Wait — the existing `promptConfirmation` only accepts `y/n`. We need a free-text input. Add a new helper `promptLifetimeOverride(current: number): Promise<number | null>` that uses `readline.question` and returns the parsed number or `null` if the user presses Enter.
  - If the user enters a value, validate it (positive integer) and update `lifetimeSeconds`.
  - Pass `lifetime: lifetimeSeconds` to `payway.qr.generateQr(...)`.

### 6. Update tests
- **File**: `src/__tests__/merchant-scenario-coverage.test.ts`
  - Update the `generateQr` mock call(s) to include `lifetime` where applicable, or adjust expectations if tests intentionally omit it.
- **File**: `src/__tests__/client.test.ts`
  - Update the `generateQr sends the sandbox-verified QR API payload` test to expect `lifetime` in the request body (since it will now be sent by default with the CLI default or explicitly in the test).
- **File**: `src/__tests__/cli.test.ts`
  - Add a test case for `generate-qr` with `--lifetime 600` verifying the prompt and parameter display.
  - Add a test case verifying default lifetime of `180` is applied when `--lifetime` is omitted.

### 7. Validation
- Run `npm run typecheck` to ensure `src/types.ts` and `src/client.ts` align.
- Run `npm run lint` to check formatting.
- Run `npm test` to verify all tests pass.

## Out of scope
- Fixing the pre-existing checkout-domain `lifetime` unit mismatch (checkout currently sends seconds to an API documented as minutes). This is a separate issue from QR-REQ-04/05.
- Expanding the `x-hmac-fields` list beyond `lifetime` to match the full developer-docs concatenation (the current list is already missing many optional fields like `items`, `first_name`, etc.).
- Background polling (QR-REQ-08/09).
