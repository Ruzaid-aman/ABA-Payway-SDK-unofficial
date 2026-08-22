import { homedir } from 'node:os';
import path from 'node:path';
import { validateKhqrConfiguration } from '../khqr-config.js';
import type { ResolvedPayWayContext } from './context.js';
import type { ProviderConfigV1 } from './contracts.js';

export type CapabilityState = 'ready' | 'missing' | 'invalid' | 'unverified';

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

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * A callback URL is only usable for online QR when it is a public HTTPS URL.
 * Localhost/loopback URLs are rejected because they are not reachable by the
 * PayWay gateway and must not silently fall back to offline KHQR generation.
 */
function isPublicHttpsUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') return false;
    return !LOCAL_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
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
  const provider: CapabilityState = 'unverified';
  const contextState: CapabilityState = context.source !== 'none' ? 'ready' : 'missing';

  let onlineQr: CapabilityState;
  if (!context.callbackUrl) {
    onlineQr = 'missing';
  } else if (isPublicHttpsUrl(context.callbackUrl)) {
    onlineQr = 'ready';
  } else {
    onlineQr = 'invalid';
  }

  const khqrReady = context.khqr ? validateKhqrConfiguration(context.khqr).ready : false;
  const offlineKhqr: CapabilityState = khqrReady ? 'ready' : 'missing';

  const checkout: CapabilityState =
    context.merchantId.trim().length > 0 && context.apiKey.trim().length > 0 ? 'ready' : 'missing';

  const paymentLinkRsa: CapabilityState = context.publicKeyPem ? 'ready' : 'missing';

  const dataDir = resolveDataDir();
  const storageState: CapabilityState = dataDir ? 'ready' : 'missing';

  return {
    provider,
    context: contextState,
    onlineQr,
    offlineKhqr,
    checkout,
    paymentLinkRsa,
    artifactStorage: storageState,
    sessionStorage: storageState,
  };
}
