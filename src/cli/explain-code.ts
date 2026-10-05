/**
 * Thin re-export of the error-code registry.
 *
 * The registry moved to `src/error-registry.ts` (audit DX-ERR-001,
 * docs/project/2026-10-05-dx-platform-audit-pass2.md §47, 2026-10-05): SDK
 * consumers import `explainPayWayCode` / `explainPayWayCodeScoped` / `explain`
 * from the package barrel (src/index.ts) without pulling any CLI dependency,
 * while this path keeps the existing CLI import site (src/cli.ts), the
 * generated rules' enforcement anchors (src/generated/rules.ts — file paths
 * `src/cli/explain-code.ts`) and the test suites working unchanged.
 */
export {
  ABA_TELEMETRY,
  EXPLAIN_FAMILIES,
  OPERATION_FAMILY,
  SANDBOX_VERIFIED_EVIDENCE,
  explain,
  explainAll,
  explainCodeFamilies,
  explainPayWayCode,
  explainPayWayCodeScoped,
} from '../error-registry.js';
export type {
  CodeAlternative,
  CodeExplanation,
  ExplainFamily,
  ScopedCodeExplanation,
  ScopedExplainOptions,
} from '../error-registry.js';
