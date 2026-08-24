import { homedir } from 'node:os';
import path from 'node:path';
import { validateKhqrConfiguration } from '../khqr-config.js';
import type { ResolvedPayWayContext } from './context.js';
import type { ProviderConfigV1 } from './contracts.js';
import { isPublicHttpsUrl } from './url-policy.js';
import type { RemedyId } from './onboarding/remedies.js';

export type CapabilityState = 'ready' | 'missing' | 'invalid' | 'unverified' | 'blocked';

export interface CapabilityMatrix {
  provider: CapabilityState;
  context: CapabilityState;
  onlineQr: CapabilityState;
  offlineKhqr: CapabilityState;
  checkout: CapabilityState;
  paymentLinkRsa: CapabilityState;
  artifactStorage: CapabilityState;
  sessionStorage: CapabilityState;
}

/**
 * Detailed capability row: the matrix state plus a stable id, a human-readable
 * label, an optional detail string, and a cross-reference to the remedy that
 * fixes it. This is the single source of truth rendered by both `agent doctor`
 * (fix hints) and the interactive `onboard` wizard (stage routing).
 */
export interface CapabilityRow {
  id: string;
  label: string;
  state: CapabilityState;
  detail?: string;
  remedyId?: RemedyId;
}

/**
 * Resolve a stable local data directory for artifacts and sessions.
 *
 * The directory is only *resolved*, never created or mutated, so readiness
 * evaluation stays deterministic and side-effect free.
 */
function resolveDataDir(): string | undefined {
  try {
    const base = process.env.APPDATA ?? path.join(homedir(), '.config');
    return path.join(base, 'aba-payway-sdk');
  } catch {
    return undefined;
  }
}

/**
 * Evaluate capability readiness against a resolved context and provider config.
 *
 * Connectivity to the provider is intentionally left `unverified` here; that
 * is checked elsewhere. Generic payment readiness (online QR) FAILS when the
 * online callback URL is missing and MUST NOT fall back to offline KHQR.
 */
export function evaluateReadiness(context: ResolvedPayWayContext, _providerConfig: ProviderConfigV1): CapabilityMatrix {
  const rows = evaluateReadinessDetailed(context, _providerConfig);
  const pick = (id: string) => rows.find((r) => r.id === id)?.state ?? ('missing' as CapabilityState);
  return {
    provider: pick('provider'),
    context: pick('context'),
    onlineQr: pick('onlineQr'),
    offlineKhqr: pick('offlineKhqr'),
    checkout: pick('checkout'),
    paymentLinkRsa: pick('paymentLinkRsa'),
    artifactStorage: pick('artifactStorage'),
    sessionStorage: pick('sessionStorage'),
  };
}

/**
 * Produce the full detailed capability matrix used for rendering and wizard
 * routing. The `provider` row is `unverified` here (live connectivity is checked
 * elsewhere); the `privacy` row reflects the agent config acknowledgement.
 */
export function evaluateReadinessDetailed(
  context: ResolvedPayWayContext,
  providerConfig: ProviderConfigV1,
  options: { privacyAcknowledged?: boolean } = {},
): CapabilityRow[] {
  const contextState: CapabilityState = context.source !== 'none' ? 'ready' : 'missing';

  let onlineQrState: CapabilityState;
  let onlineQrDetail: string | undefined;
  if (!context.callbackUrl) {
    onlineQrState = 'missing';
  } else if (isPublicHttpsUrl(context.callbackUrl)) {
    onlineQrState = 'ready';
  } else {
    onlineQrState = 'invalid';
    onlineQrDetail = `${context.callbackUrl} is not a public HTTPS URL`;
  }

  const khqrReady = context.khqr ? validateKhqrConfiguration(context.khqr).ready : false;
  const offlineKhqrState: CapabilityState = khqrReady ? 'ready' : 'missing';

  const checkoutState: CapabilityState =
    context.merchantId.trim().length > 0 && context.apiKey.trim().length > 0 ? 'ready' : 'missing';

  const paymentLinkRsaState: CapabilityState = context.publicKeyPem ? 'ready' : 'missing';

  const dataDir = resolveDataDir();
  const storageState: CapabilityState = dataDir ? 'ready' : 'missing';

  const providerState: CapabilityState = providerConfig.provider ? 'unverified' : 'missing';

  return [
    {
      id: 'provider',
      label: 'Provider connectivity',
      state: providerState,
      detail: providerState === 'missing' ? 'agent not configured' : undefined,
      remedyId: providerState === 'missing' ? 'AGENT_SETUP' : undefined,
    },
    {
      id: 'privacy',
      label: 'Privacy acknowledgment',
      state: options.privacyAcknowledged ? 'ready' : 'missing',
      remedyId: options.privacyAcknowledged ? undefined : 'PRIVACY_ACK',
    },
    {
      id: 'context',
      label: 'PayWay context',
      state: contextState,
      detail: context.displayLabel,
      remedyId: contextState === 'missing' ? 'PROFILE_CREATE' : undefined,
    },
    {
      id: 'onlineQr',
      label: 'Online QR callback',
      state: onlineQrState,
      detail: onlineQrDetail,
      remedyId: onlineQrState === 'ready' ? undefined : 'CALLBACK_URL',
    },
    {
      id: 'offlineKhqr',
      label: 'Offline KHQR',
      state: offlineKhqrState,
      remedyId: offlineKhqrState === 'ready' ? undefined : 'KHQR_CONFIG',
    },
    {
      id: 'checkout',
      label: 'Checkout',
      state: checkoutState,
      remedyId: checkoutState === 'missing' ? 'PROFILE_CREATE' : undefined,
    },
    {
      id: 'paymentLinkRsa',
      label: 'Payment-link RSA',
      state: paymentLinkRsaState,
      remedyId: paymentLinkRsaState === 'missing' ? 'PROFILE_CREATE' : undefined,
    },
    {
      id: 'artifactStorage',
      label: 'Artifact storage',
      state: storageState,
    },
    {
      id: 'sessionStorage',
      label: 'Session storage',
      state: storageState,
    },
  ];
}
