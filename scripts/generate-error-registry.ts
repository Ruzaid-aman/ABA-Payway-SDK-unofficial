/**
 * Generate the consolidated error-code registry (docs/error-codes.json).
 *
 * Source of truth: the typed maps in `src/cli/explain-code.ts` + `src/constants.ts`
 * — the same data that backs `payway-sdk explain`. The output is a versioned,
 * machine-readable registry for agents and non-TypeScript integrators; a vitest
 * drift guard (src/__tests__/error-registry.test.ts) fails when the committed
 * JSON no longer matches the maps, so regenerate after any explain-data change:
 *
 *     npm run gen:error-registry
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { explainAll } from '../src/cli/explain-code.js';

const codes = [...explainAll()].sort(
  (a, b) => a.family.localeCompare(b.family) || a.code.localeCompare(b.code, undefined, { numeric: true }),
);

const registry = {
  registryVersion: 1,
  generated: new Date().toISOString(),
  source: 'src/cli/explain-code.ts',
  description:
    'Consolidated ABA PayWay error/status code registry. sandboxVerified: true means the meaning was reproduced against the live sandbox; evidence points into docs/SANDBOX-FINDINGS.md. Regenerate with `npm run gen:error-registry`.',
  codes,
};

writeFileSync(fileURLToPath(new URL('../docs/error-codes.json', import.meta.url)), JSON.stringify(registry, null, 2) + '\n');
console.log(`Wrote docs/error-codes.json — ${codes.length} codes (${codes.filter((c) => c.sandboxVerified).length} sandbox-verified)`);
