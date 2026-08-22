import { loadProfileStore, KHQR_ENVIRONMENT_FIELDS } from '../config/profiles.js';
import { PayWay } from '../client.js';

/**
 * Resolved, explicit PayWay context for agentic operations.
 *
 * A resolved context never depends on ambient process state once produced:
 * the credentials are always sourced explicitly (a selected profile, an
 * explicit option, or a supplied environment map) and the `displayLabel`
 * intentionally omits any secret material.
 */
export interface ResolvedPayWayContext {
  source: 'option' | 'env' | 'default' | 'legacy' | 'none';
  profileName?: string;
  environment: 'sandbox' | 'production';
  merchantId: string;
  apiKey: string;
  baseUrl?: string;
  publicKeyPem?: string;
  callbackUrl?: string;
  khqr?: import('../khqr-config.js').KhqrMerchantConfiguration;
  displayLabel: string;
}

export interface ResolvePayWayContextOptions {
  profile?: string;
  env?: NodeJS.ProcessEnv;
}

type ProfileEnvironment = 'sandbox' | 'production';

interface CandidateProfile {
  name: string;
  environment: ProfileEnvironment;
  merchantId: string;
  apiKey: string;
  publicKeyPem?: string;
  baseUrl?: string;
  khqr?: import('../khqr-config.js').KhqrMerchantConfiguration;
}

function getProfileByName(store: { profiles: CandidateProfile[] }, name: string): CandidateProfile | undefined {
  return store.profiles.find((profile) => profile.name === name);
}

function resolveEnvironmentFromEnv(env: NodeJS.ProcessEnv): ProfileEnvironment {
  const named = env.PAYWAY_ENV?.trim();
  if (named === 'sandbox' || named === 'production') return named;
  if (env.PAYWAY_SANDBOX === 'true') return 'sandbox';
  if (env.PAYWAY_SANDBOX === 'false') return 'production';
  return 'sandbox';
}

function readKhqrFromEnv(env: NodeJS.ProcessEnv): import('../khqr-config.js').KhqrMerchantConfiguration {
  const khqr: Record<string, string> = {};
  for (const [field, varName] of Object.entries(KHQR_ENVIRONMENT_FIELDS)) {
    const value = env[varName];
    if (typeof value === 'string' && value.trim().length > 0) {
      khqr[field] = value;
    }
  }
  return khqr as import('../khqr-config.js').KhqrMerchantConfiguration;
}

/**
 * Resolve the effective PayWay context.
 *
 * Precedence for the profile name is:
 *   options.profile ?? PAYWAY_PROFILE ?? store.defaultProfile ?? store.activeProfile
 *
 * A resolved profile's credentials are authoritative; stale ambient
 * PAYWAY_MERCHANT_ID / PAYWAY_API_KEY values MUST NOT override a selected
 * profile. This function never mutates `process.env`.
 */
export function resolvePayWayContext(
  options: ResolvePayWayContextOptions = {},
): ResolvedPayWayContext {
  const env = options.env ?? process.env;
  const store = loadProfileStore();

  let selectedProfile: CandidateProfile | undefined;
  let source: ResolvedPayWayContext['source'] = 'none';

  if (options.profile) {
    const found = getProfileByName(store, options.profile);
    if (found) {
      selectedProfile = found;
      source = 'option';
    }
  }

  if (!selectedProfile && env.PAYWAY_PROFILE) {
    const found = getProfileByName(store, env.PAYWAY_PROFILE);
    if (found) {
      selectedProfile = found;
      source = 'env';
    }
  }

  if (!selectedProfile && store.defaultProfile) {
    const found = getProfileByName(store, store.defaultProfile);
    if (found) {
      selectedProfile = found;
      source = 'default';
    }
  }

  if (!selectedProfile && store.activeProfile) {
    const found = getProfileByName(store, store.activeProfile);
    if (found) {
      selectedProfile = found;
      source = 'legacy';
    }
  }

  let merchantId: string;
  let apiKey: string;
  let environment: ProfileEnvironment;
  let baseUrl: string | undefined;
  let publicKeyPem: string | undefined;
  let khqr: import('../khqr-config.js').KhqrMerchantConfiguration | undefined;

  if (selectedProfile) {
    merchantId = selectedProfile.merchantId;
    apiKey = selectedProfile.apiKey;
    environment = selectedProfile.environment;
    baseUrl = selectedProfile.baseUrl;
    publicKeyPem = selectedProfile.publicKeyPem;
    khqr = selectedProfile.khqr;
  } else {
    merchantId = env.PAYWAY_MERCHANT_ID ?? '';
    apiKey = env.PAYWAY_API_KEY ?? '';
    environment = resolveEnvironmentFromEnv(env);
    baseUrl = env.PAYWAY_BASE_URL;
    publicKeyPem = env.PAYWAY_RSA_PUBLIC_KEY;
    khqr = readKhqrFromEnv(env);
  }

  const callbackUrl = env.PAYWAY_CALLBACK_URL?.trim() || undefined;
  const profileName = selectedProfile?.name;

  const displayLabel = `profile: ${profileName ?? 'none'} (${environment})`;

  return {
    source,
    profileName,
    environment,
    merchantId,
    apiKey,
    baseUrl,
    publicKeyPem,
    callbackUrl,
    khqr,
    displayLabel,
  };
}

/**
 * Build a `PayWay` client from an explicit resolved context.
 *
 * `operationKind: 'create'` forces `maxRetries: 0` so agent-driven writes
 * never silently duplicate side-effecting operations on transient errors.
 * The client is constructed entirely from the resolved values; it does not
 * rely on ambient environment variables.
 */
export function createAgentPayWay(
  context: ResolvedPayWayContext,
  operationKind: 'create' | 'read',
): PayWay {
  const maxRetries = operationKind === 'create' ? 0 : undefined;
  return new PayWay({
    maxRetries,
    merchantId: context.merchantId,
    apiKey: context.apiKey,
    environment: context.environment,
    baseUrl: context.baseUrl,
    publicKeyPem: context.publicKeyPem,
    khqr: context.khqr,
  });
}
