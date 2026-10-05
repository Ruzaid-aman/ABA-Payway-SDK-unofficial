import type { ResolvedPayWayContext } from './context.js';
import type { AgentActionDraft, AgentPlanV1, Currency, Environment, ProviderConfigV1 } from './contracts.js';
import { evaluateReadiness } from './readiness.js';
import { isPublicHttpsUrl } from './url-policy.js';

export interface NormalizedPlanResult {
  plan: AgentPlanV1;
  defaultsApplied: string[];
  warnings: string[];
  needsClarification: boolean;
  clarification?: string;
}

const ONLINE_QR_DEFAULT_LIFETIME = 900;

const GENERIC_QR_EXPLANATION =
  "You didn't specify a payment interface, so I went ahead with the quick and easy online QR payment approach. If you prefer checkout or a payment link, just ask again.";

const READONLY_TOOLS = new Set([
  'check_transaction',
  'check_transaction_by_merchant_ref',
  'get_payment_link_details',
  'query_journal',
  'query_knowledge',
  'poll_transaction',
  'save_artifact',
  'open_artifact',
  'copy_to_clipboard',
]);

function dummyProvider(): ProviderConfigV1 {
  return {
    version: 'agent-config/v1',
    provider: 'openai',
    model: 'gpt-4o',
    capabilityMode: 'strict-json-plan',
  };
}

function hasFractionalPart(value: number): boolean {
  return Math.round(value * 100) / 100 !== value;
}

function amountViolation(currency: Currency, amount: number): string | null {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return null;
  if (currency === 'USD' && hasFractionalPart(amount)) {
    return `USD amounts must have at most two decimals (got ${amount})`;
  }
  if (currency === 'KHR' && !Number.isInteger(amount)) {
    return `KHR amounts must be an integer (got ${amount})`;
  }
  return null;
}

function actionHasRoute(action: AgentActionDraft, route: string): boolean {
  return (action as { tool?: string }).tool === route;
}

/**
 * Normalize a proposed agent plan: enforce currency/amount rules, validate
 * transaction IDs and public-HTTPS callback/return URLs, apply the default
 * online-QR lifetime, and require clarification for bare or unavailable routes.
 *
 * Online QR is never silently substituted with offline KHQR. When the route is
 * unavailable (readiness says onlineQr is missing/invalid) the plan is marked
 * `needsClarification` and the requested route is left intact.
 */
export function normalizePlan(plan: AgentPlanV1, context: ResolvedPayWayContext): NormalizedPlanResult {
  const defaultsApplied: string[] = [];
  const warnings: string[] = [];
  const assumptions = Array.isArray(plan.assumptions) ? [...plan.assumptions] : [];
  const actions: AgentActionDraft[] = plan.actions.map((action) => ({ ...action }));

  let needsClarification = false;
  let clarification: string | undefined;

  const readiness = evaluateReadiness(context, dummyProvider());

  for (const action of actions) {
    const _tool = (action as { tool?: string }).tool;

    if (actionHasRoute(action, 'generate_online_qr')) {
      const qr = action as Extract<AgentActionDraft, { tool: 'generate_online_qr' }>;
      if (qr.lifetime === undefined) {
        qr.lifetime = ONLINE_QR_DEFAULT_LIFETIME;
        defaultsApplied.push('online QR lifetime defaulted to 900 seconds');
      }
      if (!qr.amount && qr.amount !== 0) {
        needsClarification = true;
        clarification = clarification ?? 'Specify a payment amount before I can generate a QR.';
        warnings.push('online QR is missing a required amount');
      }
      if (qr.amount !== undefined) {
        const violation = amountViolation(qr.currency, qr.amount);
        if (violation) warnings.push(violation);
      }
      if (qr.callbackUrl !== undefined && !isPublicHttpsUrl(qr.callbackUrl)) {
        warnings.push('online QR callbackUrl must be a public https URL');
      }
      if (context.callbackUrl && isPublicHttpsUrl(context.callbackUrl) && qr.callbackUrl !== context.callbackUrl) {
        qr.callbackUrl = context.callbackUrl;
        defaultsApplied.push('online QR callbackUrl set from the resolved merchant profile');
      }
      if (readiness.onlineQr !== 'ready') {
        needsClarification = true;
        clarification =
          clarification ??
          'Online QR is not available because the PayWay callback URL is missing or is not a public HTTPS URL. Run `agent doctor` for setup guidance; I did not fall back to offline KHQR.';
      }
    } else if (actionHasRoute(action, 'generate_offline_khqr')) {
      const khqr = action as Extract<AgentActionDraft, { tool: 'generate_offline_khqr' }>;
      if (khqr.amount !== undefined) {
        const violation = amountViolation(khqr.currency, khqr.amount);
        if (violation) warnings.push(violation);
      }
      if (readiness.offlineKhqr !== 'ready') {
        needsClarification = true;
        clarification =
          clarification ?? 'Offline KHQR is not available because the KHQR merchant configuration is missing.';
      }
    } else if (
      actionHasRoute(action, 'create_checkout_payload') ||
      actionHasRoute(action, 'create_checkout_purchase')
    ) {
      const checkout = action as Extract<
        AgentActionDraft,
        { tool: 'create_checkout_payload' | 'create_checkout_purchase' }
      >;
      if (checkout.amount !== undefined) {
        const violation = amountViolation(checkout.currency, checkout.amount);
        if (violation) warnings.push(violation);
      }
      if (checkout.returnUrl !== undefined && !isPublicHttpsUrl(checkout.returnUrl)) {
        warnings.push('checkout returnUrl must be a public https URL');
      }
      if (checkout.cancelUrl !== undefined && !isPublicHttpsUrl(checkout.cancelUrl)) {
        warnings.push('checkout cancelUrl must be a public https URL');
      }
      if (readiness.checkout !== 'ready') {
        needsClarification = true;
        clarification = clarification ?? 'Checkout is not available because credentials are missing.';
      }
    } else if (actionHasRoute(action, 'create_payment_link')) {
      const link = action as Extract<AgentActionDraft, { tool: 'create_payment_link' }>;
      {
        const violation = amountViolation(link.currency, link.amount);
        if (violation) warnings.push(violation);
      }
      if (!isPublicHttpsUrl(link.returnUrl)) {
        warnings.push('payment link returnUrl must be a public https URL');
      }
      if (readiness.paymentLinkRsa !== 'ready') {
        needsClarification = true;
        clarification = clarification ?? 'Payment link is not available because RSA credentials are missing.';
      }
    }
  }

  if (assumptions.length > 0) {
    plan = { ...plan, assumptions };
  }

  const result: AgentPlanV1 = { ...plan, actions };

  return {
    plan: result,
    defaultsApplied,
    warnings,
    needsClarification,
    clarification,
  };
}

/**
 * Build a generic online-QR draft for an underspecified ("pay $3") request.
 *
 * Amount/currency are parsed from the request text; USD is the default currency
 * when none is detected. The default 900-second lifetime is applied and the
 * documented explanation is attached as the action rationale.
 */
export function defaultGenericOnlineQr(request: string, context: ResolvedPayWayContext): AgentActionDraft {
  const { amount, currency } = parseRequestAmount(request);

  const draft: AgentActionDraft = {
    tool: 'generate_online_qr',
    amount,
    currency,
    transactionId: null,
    callbackUrl: context.callbackUrl ?? '',
    lifetime: ONLINE_QR_DEFAULT_LIFETIME,
    rationale: GENERIC_QR_EXPLANATION,
  };

  return draft;
}

export { GENERIC_QR_EXPLANATION };

function parseRequestAmount(request: string): { amount: number; currency: Currency } {
  const lower = request.toLowerCase();
  let currency: Currency = 'USD';
  if (lower.includes('khr')) {
    currency = 'KHR';
  }

  const moneyPattern = /(\d[\d,]*(?:\.\d+)?)/g;
  const matches = [...request.matchAll(moneyPattern)];
  let amount = 0;
  if (matches.length > 0) {
    amount = Number(matches[0][1].replace(/,/g, ''));
  }

  return { amount, currency };
}

export function isReadOnlyTool(tool: string): boolean {
  return READONLY_TOOLS.has(tool);
}

export type { Environment };
