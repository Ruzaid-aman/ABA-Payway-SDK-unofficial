/**
 * Onboarding remedy catalog.
 *
 * Each capability row surfaced by `evaluateReadinessDetailed` maps to one remedy
 * that explains, in user terms, how to fix the missing/invalid capability. The
 * same catalog powers both the static `agent doctor` hints and the interactive
 * `onboard` wizard stage routing.
 */

export type RemedyId =
  | 'AGENT_SETUP'
  | 'AGENT_API_KEY'
  | 'PRIVACY_ACK'
  | 'PROFILE_CREATE'
  | 'CALLBACK_URL'
  | 'KHQR_CONFIG';

export type StageName = 'provider' | 'profile' | 'callback' | 'privacy';

export interface Remedy {
  id: RemedyId;
  fix: string;
  /** Wizard stage that resolves this remedy, if any. */
  stage?: StageName;
}

export const REMEDIES: Record<RemedyId, Remedy> = {
  AGENT_SETUP: {
    id: 'AGENT_SETUP',
    fix: 'Run: payway-sdk agent setup --provider <openrouter|nvidia|openai|custom> --model <name> --acknowledge-privacy',
    stage: 'provider',
  },
  AGENT_API_KEY: {
    id: 'AGENT_API_KEY',
    fix: 'Set PAYWAY_AGENT_API_KEY in your environment (session, .env, or user env). The CLI never stores this key.',
    stage: 'provider',
  },
  PRIVACY_ACK: {
    id: 'PRIVACY_ACK',
    fix: 'Acknowledge the provider privacy notice: payway-sdk agent ack (or pass --acknowledge-privacy on agent setup).',
    stage: 'privacy',
  },
  PROFILE_CREATE: {
    id: 'PROFILE_CREATE',
    fix: 'Save a PayWay credential profile: payway-sdk profiles add (then payway-sdk profiles use <name>). .env vars alone are not enough for the agent.',
    stage: 'profile',
  },
  CALLBACK_URL: {
    id: 'CALLBACK_URL',
    fix: 'Set a public HTTPS PAYWAY_CALLBACK_URL in .env, or run: payway-sdk setup-webhook --tunnel for a public URL.',
    stage: 'callback',
  },
  KHQR_CONFIG: {
    id: 'KHQR_CONFIG',
    fix: 'Optional: configure ABA KHQR merchant fields (bakongId, abaMerchantId, acquirerName, mcc, merchantName, merchantCity, paywayData) for offline QR.',
    stage: 'profile',
  },
};
