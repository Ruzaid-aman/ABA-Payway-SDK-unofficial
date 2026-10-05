/**
 * Onboarding state snapshot.
 *
 * A pure read of the current environment: agent provider config, inference API
 * key presence, resolved PayWay profile, callback URL validity, KHQR
 * configuration, and privacy acknowledgement. No side effects — safe to call in
 * tests with an injected `env` map.
 */

import { loadProfileStore } from '../../config/profiles.js';
import { readAgentConfig } from '../config.js';
import { resolvePayWayContext, type ResolvedPayWayContext } from '../context.js';
import { isPublicHttpsUrl } from '../url-policy.js';
import type { CredentialProfile } from '../../config/profiles.js';
import type { ProviderConfigV1 } from '../contracts.js';

export interface ScanSnapshot {
  agentConfig: ProviderConfigV1 | null;
  hasAgentApiKey: boolean;
  privacyAcknowledged: boolean;
  profile: CredentialProfile | null;
  context: ResolvedPayWayContext;
  callbackUrl?: string;
  callbackValid: boolean;
  khqrPresent: boolean;
}

export function scanOnboardingState(env: NodeJS.ProcessEnv = process.env): ScanSnapshot {
  const agentConfig = readAgentConfig();
  const store = loadProfileStore();
  const profile = store.defaultProfile
    ? (store.profiles.find((p) => p.name === store.defaultProfile) ?? null)
    : store.activeProfile
      ? (store.profiles.find((p) => p.name === store.activeProfile) ?? null)
      : null;

  const context = resolvePayWayContext({ env });

  const callbackUrl = env.PAYWAY_CALLBACK_URL?.trim() || undefined;
  const callbackValid = callbackUrl ? isPublicHttpsUrl(callbackUrl) : false;

  return {
    agentConfig,
    hasAgentApiKey: !!env.PAYWAY_AGENT_API_KEY?.trim(),
    privacyAcknowledged: !!agentConfig?.privacyAcknowledgedAt,
    profile,
    context,
    callbackUrl,
    callbackValid,
    khqrPresent: !!context.khqr,
  };
}
