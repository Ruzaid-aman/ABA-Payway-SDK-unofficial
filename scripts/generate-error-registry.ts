/**
 * Generate the consolidated error-code registry (docs/error-codes.json).
 *
 * Source of truth: the typed maps in `src/error-registry.ts` + `src/constants.ts`
 * — the same data that backs `payway-sdk explain` and the public SDK
 * `explain()` API (moved out of the CLI layer by audit DX-ERR-001,
 * 2026-10-05). The output is a versioned,
 * machine-readable registry for agents and non-TypeScript integrators; a vitest
 * drift guard (src/__tests__/error-registry.test.ts) fails when the committed
 * JSON no longer matches the maps, so regenerate after any explain-data change:
 *
 *     npm run gen:error-registry
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { explainAll } from '../src/error-registry.js';

const codes = [...explainAll()].sort(
  (a, b) => a.family.localeCompare(b.family) || a.code.localeCompare(b.code, undefined, { numeric: true }),
);

const registry = {
  registryVersion: 1,
  generated: new Date().toISOString(),
  source: 'src/error-registry.ts',
  description:
    'Consolidated ABA PayWay error/status code registry. sandboxVerified: true means the meaning was reproduced against the live sandbox; evidence points into docs/SANDBOX-FINDINGS.md. observedOn/observedMessage carry ABA production telemetry (dev-team CSV, 2026-09-15): the gateway APIs where the code was seen and the exact gateway message; API labels map to paths in docs/12 (errors-and-debugging topic). QR-family titles are harvested from the OFFICIAL generate-qr response-code table (developer.payway.com.kh/qr-api-14530840e0, retrieved 2026-10-05; evidence: knowledge/rules/evidence/ERR-001.md). Hints additionally fold the purchase payment-credential endpoint error table (ABA dev team, 2026-10-01 — raw table archived at docs/internal/PAYMENT-CREDENTIAL-ERROR-TABLE-2026-10.md, maintainers only). Regenerate with `npm run gen:error-registry`.',
  codes,
};

writeFileSync(
  fileURLToPath(new URL('../docs/error-codes.json', import.meta.url)),
  JSON.stringify(registry, null, 2) + '\n',
);
console.log(
  `Wrote docs/error-codes.json — ${codes.length} codes (${codes.filter((c) => c.sandboxVerified).length} sandbox-verified)`,
);
