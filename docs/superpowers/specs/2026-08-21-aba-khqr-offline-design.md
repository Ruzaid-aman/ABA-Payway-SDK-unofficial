# Official ABA KHQR Offline Generation Design

## Goal

Replace the SDK's proprietary offline TLV generator with an official ABA KHQR-compatible payload builder. The public `payway.khqr.generateOfflineQR()` method must produce a QR payload that consumer banking applications can scan, without calling a PayWay API.

The SDK must support ABA KHQR merchant configuration from an explicit `PayWay` constructor configuration, environment variables, and the existing optional local CLI credential profile. It must report configuration readiness before generation and must never invent ABA-issued fields.

## Authority and Compatibility

The ABA PayWay KHQR guideline is the authority for payload structure. Its required root objects are `00`, `01`, `30`, `52`, `53`, `58`, `59`, `60`, `62`, `99`, and `63`; `54` is conditional. Within the additional-data template, `62.01` is the merchant reference and `62.68` is PayWay data supplied by ABA. ABA also supplies merchant account information in `30`.

The current `generateOfflineQR()` encodes private tags `01` through `08`. Its own source says it is not a Bakong KHQR / EMVCo QR-MPM code. This change intentionally replaces that behavior. It is a breaking semantic change, accepted by the user, and no legacy compatibility mode will be retained under the official method name.

## Public API

Add a typed `KhqrMerchantConfiguration` to `PayWayConfig`:

```ts
interface KhqrMerchantConfiguration {
  bakongId: string;           // tag 30.00, supplied by ABA
  abaMerchantId: string;      // tag 30.01, supplied by ABA
  acquirerName: string;       // tag 30.02, supplied by ABA
  merchantCategoryCode: string; // tag 52
  merchantName: string;       // tag 59, matches ABA registration
  merchantCity: string;       // tag 60, ABA-supported city
  paywayData: string;         // tag 62.68, supplied by ABA
}
```

`GenerateOfflineQrParams` changes to represent the official payload: `amount?`, `currency`, `merchantRef`, and optional creation/expiry timestamps. `merchantId`, `transactionId`, proprietary fee/tip fields, and transaction type are removed because they have no approved position in the cited ABA payload. Absence of `amount` creates static tag `01=11`; an amount creates dynamic tag `01=12`.

Expose `payway.khqr.validateConfiguration(): KhqrConfigurationReadiness`. The result identifies every missing or malformed field by stable code and field path. It does not contain API keys or full ABA-provided values.

`generateOfflineQR()` throws a dedicated configuration error if readiness is not valid. It returns only the encoded string; rendering remains the caller's job.

## Configuration Resolution and Storage

The `khqr` constructor property is highest priority. Each missing field falls back to field-specific environment variables and then to the selected CLI profile. Explicit values therefore allow serverless/container applications to avoid machine-local state.

Add the same optional `khqr` block to `CredentialProfile` in `%APPDATA%/aba-payway-sdk/profiles.json`. The file already contains API credentials and is local CLI convenience storage, not an application configuration system. CLI profile activation exports the resolved KHQR values into the environment before constructing `PayWay`.

The profile setup command must prompt for the KHQR block as an explicit optional section and show readiness state in list/current output without printing the fields. Missing values are allowed for API-only merchants, but the CLI's offline QR command must stop with the readiness report rather than emitting a non-compliant payload.

Recommended environment names are `PAYWAY_KHQR_BAKONG_ID`, `PAYWAY_KHQR_ABA_MERCHANT_ID`, `PAYWAY_KHQR_ACQUIRER_NAME`, `PAYWAY_KHQR_MERCHANT_CATEGORY_CODE`, `PAYWAY_KHQR_MERCHANT_NAME`, `PAYWAY_KHQR_MERCHANT_CITY`, and `PAYWAY_KHQR_PAYWAY_DATA`.

## Payload Construction

The builder uses an internal byte-aware TLV encoder. It must support nested templates and measure the encoded byte length, not JavaScript character count. It constructs, in canonical order:

1. `00=01` and point-of-initiation `01=11` (static) or `01=12` (dynamic).
2. Merchant account information `30` containing ABA-provided `00`, `01`, and `02` sub-tags.
3. `52` MCC, `53` numeric currency (`116` for KHR, `840` for USD), optional `54` amount, `58=KH`, `59` name, and `60` city.
4. `62`, containing `01` merchant reference and ABA-provided `68` PayWay data.
5. Required Bakong `99` timestamp data, using explicit valid timestamps when supplied or generated clock values under defined rules.
6. `63` CRC, calculated using the CRC-16 algorithm and input boundary required by the ABA/EMV payload convention (including `6304`, excluding its value).

Amount rules: KHR uses no decimal places; USD uses a decimal amount within ABA's permitted length. Merchant reference length is capped at 25. The validator enforces applicable ABA length and format constraints before serialization.

## Error Handling and Security

No online HMAC or API request is made by the generator. Online tracking remains a separate PayWay API flow; the offline generator must not claim automatic reconciliation. The SDK should encourage the specified HTTPS webhook where ABA supports payment notifications, but webhook configuration is not embedded in a QR payload.

Configuration errors reveal field names and validation codes only. Debug hooks and CLI output must redact `paywayData` and all API credentials. Documentation distinguishes ABA-issued/registered values from integrator-supplied values and directs merchants to obtain missing `30` and `62.68` data from ABA.

## Tests and Verification

Tests are written before implementation and cover:

- successful payload generation matching the ABA published example structure, including nested tag parsing and CRC verification;
- static and dynamic tag `01` behavior, KHR/USD amount formatting, generated/explicit timestamps, and the 25-character merchant-reference boundary;
- no network call from `generateOfflineQR()`;
- one readiness error for each missing configuration field, malformed numeric/length values, and unsafe values;
- precedence across constructor config, environment variables, and profile activation;
- CLI prompts and offline command failure/success behavior without disclosing secret or ABA template content;
- regression assertions that the old proprietary tags are not emitted.

Final verification will run focused Vitest tests, the complete Vitest suite, TypeScript typecheck, Biome lint, and package build. The working tree is already dirty; only files attributable to this change will be staged in its own commits.

## Out of Scope

- Deriving or guessing ABA-issued merchant account/payway-template values.
- Submitting the QR to PayWay, tracking payment status, or replacing the online QR API.
- Rendering a PNG/SVG QR image.
- Backward-compatible operation of the prior proprietary offline format.
