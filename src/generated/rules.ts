/**
 * GENERATED FILE — do not edit by hand.
 *
 * Emitted deterministically by scripts/generate/gen-rules.ts from the
 * authored registry knowledge/rules/rules.yaml (external truth: ABA
 * documentation + dated observations, provenance-tagged and
 * expiry-checked — audit WP-02, docs/project/2026-10-05-dx-platform-audit-pass2.md
 * §29.2). Regenerate with `npm run gen:rules`; CI gates drift with
 * `npm run gen:rules -- --check`.
 */

export type RuleSeverity = 'advisory' | 'hard';

export type RuleSource = 'official' | 'sandbox';

export type RuleStatus = 'active' | 'conflict';

export interface RuleEnforcementAnchor {
  file: string;
  symbol: string;
}

export interface RuleConflictVariant {
  source: string;
  statement: string;
  evidence: string;
}

export interface RuleDefinition {
  id: string;
  statement: string;
  endpoints: string[];
  severity: RuleSeverity;
  source: RuleSource;
  status: RuleStatus;
  evidence: string;
  evidenceUrl: string;
  retrievedAt: string;
  expiresAt: string;
  enforcement: RuleEnforcementAnchor[];
  conflicts?: RuleConflictVariant[];
  resolution?: string;
}

export const RULES_SCHEMA = 'payway-rules/v1';

export const EVIDENCE_RETENTION_DAYS = 180;

export const OFFICIAL_EVIDENCE_HOST = 'developer.payway.com.kh';

export const RULES: readonly RuleDefinition[] = [
  {
    id: 'PUR-003',
    statement:
      'purchase payment_option is one of exactly six officially documented values — cards, abapay_khqr, abapay_khqr_deeplink, alipay, wechat, google_pay — and is OPTIONAL: omitting it lets the gateway pick from the merchant profile ("the payment gateway will automatically display the supported payment options based on your profile"). Values outside the official set throw locally (PayWayConfigError) in normal and strict mode. Legacy archived-spec values abapay / abapay_deeplink are advised about and NEVER rejected — not even under strictValidation — because real profiles may still accept them and option ENABLEMENT is always the gateway\'s decision (official response code 23 "Selected Payment Option is not enabled for this Merchant Profile"), never a local one.',
    endpoints: ['checkout.purchase'],
    severity: 'hard',
    source: 'official',
    status: 'active',
    evidence: 'knowledge/rules/evidence/PUR-003.md',
    evidenceUrl: 'https://developer.payway.com.kh/purchase-14530820e0',
    retrievedAt: '2026-10-05',
    expiresAt: '2027-04-03',
    enforcement: [
      { file: 'src/constants.ts', symbol: 'PURCHASE_PAYMENT_OPTIONS' },
      { file: 'src/domains/checkout.ts', symbol: 'createCheckoutDomain' },
    ],
  },
  {
    id: 'QR-012',
    statement:
      "generate-qr payment_option accepts exactly three officially documented values — abapay_khqr (ABA KHQR), wechat (USD transactions only) and alipay (USD transactions only). Purchase-path values such as cards or abapay_khqr_deeplink are NOT valid on generate-qr and throw locally (PayWayConfigError) in normal and strict mode. The official page marks the field required, but the SDK still defaults an omitted value to abapay_khqr pending the requiredness probe (audit N-17) — the default, not the requirement, is the encoded behaviour. Profile enablement remains the gateway's decision (official code 23); there is deliberately no local enablement check. The Soundbox endpoint (request-qr) keeps its own spec-derived superset and is out of scope for this rule.",
    endpoints: ['qr.generateQr'],
    severity: 'hard',
    source: 'official',
    status: 'active',
    evidence: 'knowledge/rules/evidence/QR-012.md',
    evidenceUrl: 'https://developer.payway.com.kh/qr-api-14530840e0',
    retrievedAt: '2026-10-05',
    expiresAt: '2027-04-03',
    enforcement: [
      { file: 'src/constants.ts', symbol: 'QR_PAYMENT_OPTIONS' },
      { file: 'src/domains/qr.ts', symbol: 'createQrDomain' },
    ],
  },
  {
    id: 'QR-016',
    statement:
      'items supports up to 50 line items (not the 10 the repository warned about before 2026-10-05) with no character limit on the item entries themselves; on generate-qr the base64-encoded items FIELD additionally carries a <= 500 character cap. items is description/remark only — "The price or quantity in this info will not be used for calculation or any validation purposes" — so no consumer may treat line items as an amount check. More than 50 entries produce an advisory citing this rule on both endpoints; nothing is rejected.',
    endpoints: ['qr.generateQr', 'checkout.purchase'],
    severity: 'advisory',
    source: 'official',
    status: 'active',
    evidence: 'knowledge/rules/evidence/QR-016.md',
    evidenceUrl: 'https://developer.payway.com.kh/qr-api-14530840e0',
    retrievedAt: '2026-10-05',
    expiresAt: '2027-04-03',
    enforcement: [
      { file: 'src/domains/qr.ts', symbol: 'createQrDomain' },
      { file: 'src/domains/checkout.ts', symbol: 'createCheckoutDomain' },
    ],
  },
  {
    id: 'QR-009',
    statement:
      'the transaction amount has a documented gateway floor of 100 KHR or 0.01 USD ("must be at least 100 KHR or 0.01 USD and cannot be null"), and the gateway dedicates response code 47 to it ("KHR Amount must be greater than 100 KHR"). A documented minimum with its own gateway error code is not an opinion: under-floor amounts throw locally (PayWayConfigError) before any network call, in normal and strict mode, on every amount-carrying operation the SDK validates (generate-qr, request-qr, payout, payment-credential, payment-link create).',
    endpoints: ['qr.generateQr', 'qr.requestQr', 'payout.payout', 'cof.paymentCredential', 'payment-link.create'],
    severity: 'hard',
    source: 'official',
    status: 'active',
    evidence: 'knowledge/rules/evidence/QR-009.md',
    evidenceUrl: 'https://developer.payway.com.kh/qr-api-14530840e0',
    retrievedAt: '2026-10-05',
    expiresAt: '2027-04-03',
    enforcement: [{ file: 'src/utils.ts', symbol: 'validateAmountFloor' }],
  },
  {
    id: 'ERR-001',
    statement:
      'numeric response codes are ENDPOINT-SCOPED: the same numeric code can carry different meanings per endpoint, so diagnostics must resolve a code by its operation/endpoint and never answer with a single global family. Proven collision: code 16 is "Invalid First Name" on generate-qr (official table) but "Invalid Amount" on the purchase gateway family (sandbox-verified registry); codes 1, 6, 16, 17, 23 and 96 all collide across the qr and gateway families with different titles. An unscoped lookup is confidently wrong; scoped lookups return the endpoint-correct entry and a bare ambiguous lookup must surface ambiguous: true with the per-endpoint alternatives instead of picking one silently.',
    endpoints: ['*'],
    severity: 'advisory',
    source: 'official',
    status: 'active',
    evidence: 'knowledge/rules/evidence/ERR-001.md',
    evidenceUrl: 'https://developer.payway.com.kh/qr-api-14530840e0',
    retrievedAt: '2026-10-05',
    expiresAt: '2027-04-03',
    enforcement: [
      { file: 'src/cli/explain-code.ts', symbol: 'explainPayWayCodeScoped' },
      { file: 'src/cli/explain-code.ts', symbol: 'explainCodeFamilies' },
    ],
  },
  {
    id: 'QR-001',
    statement:
      'the generate-qr lifetime UNIT is unresolved and NO unit change is encoded. Official wording reads "Transaction lifetime in minutes... Minimum: 3 mins" but the plain minutes reading was falsified live: lifetime 3 was rejected while 180 was accepted (sandbox-pinned boundary 2026-08-30: 179 -> HTTP 400 code "04", 180 -> OK). The repository keeps its coded two-domain split — generate-qr takes SECONDS with a local 180-second floor (QR_LIFETIME_MIN_SECONDS), checkout.purchase takes MINUTES with a 3-minute floor (gateway error-69 parity) — and the residual seconds-vs-minutes-180-floor ambiguity is unresolvable without a read-back expiry probe, because no read API returns the expiry. No consumer may "fix" the unit on a single dated observation; the conflict stays recorded until a read-back probe or an ABA answer resolves it.',
    endpoints: ['qr.generateQr', 'checkout.purchase'],
    severity: 'advisory',
    source: 'sandbox',
    status: 'conflict',
    evidence: 'knowledge/rules/evidence/QR-001.md',
    evidenceUrl: 'https://developer.payway.com.kh/qr-api-14530840e0',
    retrievedAt: '2026-10-05',
    expiresAt: '2027-04-03',
    enforcement: [
      { file: 'src/constants.ts', symbol: 'QR_LIFETIME_MIN_SECONDS' },
      { file: 'src/utils.ts', symbol: 'validateQrLifetimeSeconds' },
    ],
    conflicts: [
      {
        source: 'official',
        statement:
          'The qr-api page defines lifetime as "Transaction lifetime in minutes. Default: 30 days. Minimum: 3 mins. Maximum: 120 days" and its sample request uses "lifetime": 6 — a plain minutes reading with a minimum of 3.',
        evidence: 'knowledge/rules/evidence/QR-001.md',
      },
      {
        source: 'sandbox',
        statement:
          'Live probes falsified the plain minutes reading: 3 was rejected and 180 was accepted (sandbox-pinned boundary 2026-08-30: 179 -> HTTP 400 code "04" "The given data was invalid", 180 -> OK), which is consistent with seconds carrying a 3-minute (180-unit) floor.',
        evidence: 'knowledge/rules/evidence/QR-001.md',
      },
      {
        source: 'repository',
        statement:
          'The coded two-domain split is kept unchanged: generate-qr accepts seconds with a 180-second local floor; checkout.purchase accepts minutes with a 3-minute local floor. The residual seconds-vs-minutes-180-floor ambiguity is unresolvable without a read-back expiry probe (no read API returns expiry).',
        evidence: 'knowledge/rules/evidence/QR-001.md',
      },
    ],
    resolution:
      'Probe a read-back expiry (transaction detail / check-transaction at T+minutes) or obtain an ABA written answer before encoding any unit change; until then request-inspection surfaces must show this conflict rather than a resolved unit (audit §48.7: "No QR lifetime unit change (WP-17) — the probe has not run. Only the conflict record lands.").',
  },
];

export function getRuleById(id: string): RuleDefinition | undefined {
  return RULES.find((rule) => rule.id === id);
}

export function officialRules(): RuleDefinition[] {
  return RULES.filter((rule) => rule.source === 'official');
}

export function conflictedRules(): RuleDefinition[] {
  return RULES.filter((rule) => rule.status === 'conflict');
}
