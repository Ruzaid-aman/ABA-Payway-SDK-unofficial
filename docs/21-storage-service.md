<!-- GENERATED STUB: copy of docs/guides/21-storage-service.md for compatibility. Do not edit here. -->

# 21 — Storage Service (`createStorageService`)

One programmatic facade over the three PayWay local stores, introduced in storage wave 3
(2026-09-13). The CLI's own commands keep using the store functions directly — the facade composes
the exact same implementations, so both paths behave identically.

```ts
import { createStorageService } from 'aba-payway-ts';

const storage = await createStorageService({ backend: 'auto' }); // sqlite if better-sqlite3 is installed, else json
storage.journal.append({ kind: 'execution.started', correlationId: 'c1' });
storage.journal.read();                 // { file, events, malformed } — same shape as readJournalEvents
storage.journal.prune(new Date(...));

storage.tokens.save({ ctid: 'customer123', pwt: '...' }); // pwt arrives via link callback (docs/09)
storage.tokens.latestForCtid('customer123');
storage.tokens.remove('customer123');   // local deletion — the gateway remove is separate (cof token remove)

storage.webhooks.save({ headers, body }); // WebhookStorage interface (docs/16)
storage.webhooks.getAll();

storage.close();                        // closes the shared sqlite handle; no-op on json
```

## Layout (all under the wave-1 data root)

| Store | JSON backend | SQLite backend |
| --- | --- | --- |
| journal | `<dataRoot>/journal.jsonl` | `<dataRoot>/payway.db` (table `journal_events`) |
| tokens | `<dataRoot>/linked-tokens.json` | `<dataRoot>/payway.db` (table `linked_tokens`) |
| webhooks | `<dataRoot>/webhook_data/callbacks.jsonl` | `<dataRoot>/payway.db` (table `callbacks`) |

The data root is `PAYWAY_DATA_DIR` or `<APPDATA|~/.config>/aba-payway-sdk/data`
(`src/config/data-root.ts`; surfaced by `doctor --json` as `.dataRoot`). Store-specific env overrides
(`PAYWAY_JOURNAL_DIR`, `PAYWAY_TOKEN_STORE_DIR`, `PAYWAY_WEBHOOK_DIR`) apply to the CLI/store
functions; the facade honors an explicit `dir` option above all of them.

## Backends

- `json` (default when the driver is absent): zero dependencies, append-only JSONL / atomic JSON.
- `sqlite`: ONE `better-sqlite3` handle on `<dataRoot>/payway.db` shared by all three stores
  (WAL mode); the facade owns it and `close()` releases it exactly once. Optional peer dep — the
  SDK never requires it, and `backend: 'auto'` falls back to json when it is not importable.
- `probeStorageBackend()` reports what `'auto'` would pick. `PAYWAY_FORCE_JSON_STORAGE=1` forces json.

## Join keys (unchanged)

Journal events carry the SDK `correlationId` (and `traceId` where the gateway returned one); token
records carry the originating webhook record id (`sourceRecordId`); webhook records carry
`matchedTransactionId`/`matchedStatus` and the persisted signature verdict. Never invent new keys.

## What the storage service is NOT

- Not a fulfillment source of truth — merchant order state remains yours (docs/18).
- Not a gateway mirror: PENDING does not mean alive, a missing callback is not proof of
  non-payment, and no EXPIRED/CLOSED status exists remotely.
- Not multi-merchant yet (records are not tagged per merchant profile).
- The pwt is stored in plaintext like the JSON store (masking is a display concern — `maskPwt`);
  encryption was deliberately deferred (data root lives outside the repo; key management would add
  platform-specific deps without a threat model that justifies them).
- Token lifecycle is enforced locally since wave 4: records carry `capturedAt` + `renewedAt`
  (renewal restarts the ~90-day docs/09 window), `tokenExpiryStatus()` buckets each record, the CLI
  `cof token remove` prunes the local copy after gateway success, and `cof charge --ctid` refuses
  locally-expired tokens — see docs/09 §4a.
