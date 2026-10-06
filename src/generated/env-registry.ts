/**
 * GENERATED FILE — do not edit by hand.
 *
 * Emitted deterministically by scripts/generate/gen-env-vars.ts from the
 * authored registry knowledge/rules/env-vars.yaml (audit P1-04 / P1-05,
 * docs/project/2026-10-05-dx-platform-audit-pass2.md §29.2, §47). Regenerate
 * with `npm run gen:env-vars`; CI gates drift with
 * `npm run gen:env-vars -- --check`. The same generator emits the root
 * .env.example; src/config/envValidator.ts consumes the allow-list below.
 */

export type PayWayEnvVarKind = 'secret' | 'credential' | 'non-secret';

export type PayWayEnvVarGroup = 'connection' | 'credentials' | 'urls' | 'tls' | 'behavior' | 'data' | 'integrations';

export interface PayWayEnvVarDefinition {
  name: string;
  kind: PayWayEnvVarKind;
  group: PayWayEnvVarGroup;
  description: string;
  defaultValue: string | null;
  required: boolean;
  consumedBy: string[];
  docsAnchor?: string;
  example?: string;
  external?: boolean;
  pemSyntax?: boolean;
}

export const PAYWAY_ENV_VARS_SCHEMA = 'payway-env-vars/v1';

export const PAYWAY_ENV_VARS: readonly PayWayEnvVarDefinition[] = [
  {
    name: 'PAYWAY_ENV',
    kind: 'non-secret',
    group: 'connection',
    description:
      'Target environment: sandbox, production, or an https base URL (a URL value is honored as the API base URL and takes precedence over PAYWAY_SANDBOX).',
    defaultValue: 'sandbox',
    required: true,
    consumedBy: [
      'src/client.ts',
      'src/cli.ts',
      'src/config/templates/express.ts',
      'src/config/templates/nextApp.ts',
      'src/config/envValidator.ts',
    ],
    docsAnchor: 'docs/guides/02-prerequisites-and-setup.md',
  },
  {
    name: 'PAYWAY_SANDBOX',
    kind: 'non-secret',
    group: 'connection',
    description:
      "Legacy environment switch for the SDK client: 'true' resolves the sandbox endpoint, 'false' resolves production. Ignored when PAYWAY_ENV is sandbox/production/a URL.",
    defaultValue: 'true',
    required: false,
    consumedBy: ['src/client.ts'],
    docsAnchor: 'docs/guides/02-prerequisites-and-setup.md',
  },
  {
    name: 'PAYWAY_BASE_URL',
    kind: 'non-secret',
    group: 'connection',
    description:
      'Overrides the API base URL for the SDK client (highest-priority URL source after explicit constructor config). Useful for the ABA Mobile Simulator or a local mock.',
    defaultValue: null,
    required: false,
    consumedBy: ['src/client.ts'],
    docsAnchor: 'docs/guides/02-prerequisites-and-setup.md',
    example: 'https://api-example.sandbox.payway.com.kh',
  },
  {
    name: 'PAYWAY_TIMEOUT',
    kind: 'non-secret',
    group: 'connection',
    description:
      'Request timeout in milliseconds for SDK API calls (integer). Unset uses the SDK default of 30000 ms; non-positive or non-numeric values throw a PayWayConfigError.',
    defaultValue: null,
    required: false,
    consumedBy: ['src/client.ts'],
    docsAnchor: 'docs/guides/02-prerequisites-and-setup.md',
    example: '30000',
  },
  {
    name: 'PAYWAY_STRICT_VALIDATION',
    kind: 'non-secret',
    group: 'connection',
    description: "'1' or 'true' enables SDK strict local validation (tighter request checks before any network call).",
    defaultValue: '0',
    required: false,
    consumedBy: ['src/client.ts'],
    docsAnchor: 'docs/guides/02-prerequisites-and-setup.md',
  },
  {
    name: 'PAYWAY_PROFILE',
    kind: 'non-secret',
    group: 'connection',
    description:
      'Selects the active CLI profile from the user profile store when no --profile flag is given (agent REPL, session shell, and top-level commands all honor it).',
    defaultValue: null,
    required: false,
    consumedBy: [
      'src/cli.ts',
      'src/agent/context.ts',
      'src/agent/repl.ts',
      'src/cli/commands/agent.ts',
      'src/cli/session.ts',
    ],
    docsAnchor: 'docs/guides/AGENTIC-PAYWAY-CLI-USER-GUIDE.md',
  },
  {
    name: 'PAYWAY_MERCHANT_ID',
    kind: 'credential',
    group: 'credentials',
    description:
      'ABA-issued merchant ID (MID) used to sign every merchant-authenticated API request. Required together with PAYWAY_API_KEY.',
    defaultValue: null,
    required: true,
    consumedBy: [
      'src/client.ts',
      'src/cli.ts',
      'src/config/templates/express.ts',
      'src/config/templates/nextApp.ts',
      'src/config/envValidator.ts',
    ],
    docsAnchor: 'docs/guides/02-prerequisites-and-setup.md',
    example: 'ec476910',
  },
  {
    name: 'PAYWAY_API_KEY',
    kind: 'secret',
    group: 'credentials',
    description:
      'ABA-issued merchant API key used for HMAC request signing and callback verification. Never commit a real value; .env is git-ignored.',
    defaultValue: null,
    required: true,
    consumedBy: [
      'src/client.ts',
      'src/cli.ts',
      'src/cli/commands/setup-webhook.ts',
      'src/cli/commands/webhook.ts',
      'src/config/templates/express.ts',
      'src/config/templates/nextApp.ts',
      'src/config/envValidator.ts',
    ],
    docsAnchor: 'docs/guides/02-prerequisites-and-setup.md',
  },
  {
    name: 'PAYWAY_RSA_PUBLIC_KEY',
    kind: 'credential',
    group: 'credentials',
    description:
      'ABA-issued RSA PUBLIC key (PEM). Required for refund, pre-auth, payout/beneficiary, payment-link and COF operations. Single-line values with literal \\n escapes and multi-line quoted PEMs are both supported by the CLI .env loader.',
    defaultValue: null,
    required: false,
    consumedBy: ['src/client.ts', 'src/cli.ts', 'src/config/envValidator.ts'],
    docsAnchor: 'docs/guides/02-prerequisites-and-setup.md',
    pemSyntax: true,
  },
  {
    name: 'PAYWAY_PARTNER_ID',
    kind: 'credential',
    group: 'credentials',
    description:
      'Partner ID for merchant self-activation endpoints (requestWithPartnerAuth). A partner-only configuration can construct the SDK and call partner endpoints without merchant credentials.',
    defaultValue: null,
    required: false,
    consumedBy: ['src/client.ts', 'src/cli.ts'],
    docsAnchor: 'docs/guides/02-prerequisites-and-setup.md',
    example: 'partner-0001',
  },
  {
    name: 'PAYWAY_PARTNER_API_KEY',
    kind: 'secret',
    group: 'credentials',
    description:
      'Partner API key for self-activation endpoints (SHA256 HMAC; the get-mc-credential-info leg uses SHA512). Never commit a real value.',
    defaultValue: null,
    required: false,
    consumedBy: ['src/client.ts', 'src/cli.ts'],
    docsAnchor: 'docs/guides/02-prerequisites-and-setup.md',
  },
  {
    name: 'PAYWAY_RETURN_URL',
    kind: 'non-secret',
    group: 'urls',
    description:
      'Default customer return URL after checkout. Required when launching checkout (validatePayWayEnv reports a blocking error when missing); the CLI uses it as the fallback for the matching --return-url flag.',
    defaultValue: null,
    required: true,
    consumedBy: ['src/cli.ts', 'src/config/envValidator.ts'],
    docsAnchor: 'docs/guides/02-prerequisites-and-setup.md',
    example: 'https://yoursite.com/payment/return',
  },
  {
    name: 'PAYWAY_CANCEL_URL',
    kind: 'non-secret',
    group: 'urls',
    description:
      'Customer cancel URL for hosted checkout. Must be an http(s) URL when set; the CLI uses it as the fallback for the matching --cancel-url flag.',
    defaultValue: null,
    required: false,
    consumedBy: ['src/cli.ts', 'src/config/envValidator.ts'],
    docsAnchor: 'docs/guides/02-prerequisites-and-setup.md',
    example: 'https://yoursite.com/payment/cancel',
  },
  {
    name: 'PAYWAY_CALLBACK_URL',
    kind: 'non-secret',
    group: 'urls',
    description:
      'Server-to-server callback URL (transaction pushback, COF linking, webhook workbench). Must be publicly reachable; verify incoming callbacks with the X-PAYWAY-HMAC-SHA512 header.',
    defaultValue: null,
    required: false,
    consumedBy: [
      'src/cli.ts',
      'src/cli/commands/setup-webhook.ts',
      'src/cli/templates/first-payment/index.ts',
      'src/config/envValidator.ts',
    ],
    docsAnchor: 'docs/guides/11-callbacks-and-webhooks.md',
    example: 'https://yoursite.com/api/payment/callback',
  },
  {
    name: 'PAYWAY_TLS_CA_FILE',
    kind: 'non-secret',
    group: 'tls',
    description:
      'Path to a PEM CA bundle used to verify the PayWay endpoint certificate (DX-SEC-001: the safe replacement for the legacy TLS-verification bypass).',
    defaultValue: null,
    required: false,
    consumedBy: ['src/client.ts'],
    docsAnchor: 'docs/guides/13-deployment-checklist.md',
    example: './certs/payway-sandbox-ca.pem',
  },
  {
    name: 'PAYWAY_TLS_MIN_VERSION',
    kind: 'non-secret',
    group: 'tls',
    description:
      'Minimum TLS protocol version for SDK requests: TLSv1, TLSv1.1, TLSv1.2, or TLSv1.3. Anything else throws a PayWayConfigError.',
    defaultValue: null,
    required: false,
    consumedBy: ['src/client.ts'],
    docsAnchor: 'docs/guides/13-deployment-checklist.md',
    example: 'TLSv1.2',
  },
  {
    name: 'PAYWAY_UI',
    kind: 'non-secret',
    group: 'behavior',
    description:
      "CLI presentation mode: 'classic' forces the legacy plain output on real TTYs too; anything else auto-selects the interactive TUI (agents/CI and pipes always stay classic).",
    defaultValue: 'auto',
    required: false,
    consumedBy: ['src/cli/ui/mode.ts'],
    docsAnchor: 'docs/guides/AGENTIC-PAYWAY-CLI-USER-GUIDE.md',
  },
  {
    name: 'PAYWAY_ADVISORY_IGNORE',
    kind: 'non-secret',
    group: 'behavior',
    description:
      "Comma-separated advisory rule ids (e.g. 'QR-016,GW-CAP-EMAIL') to suppress entirely — no warning, no session collection, and no strictValidation escalation.",
    defaultValue: null,
    required: false,
    consumedBy: ['src/core/advisories.ts'],
    docsAnchor: 'docs/guides/12-error-handling-and-debugging.md',
  },
  {
    name: 'PAYWAY_LOG_LEVEL',
    kind: 'non-secret',
    group: 'behavior',
    description:
      'SDK log level: debug, info, warn, or error. Unset resolves to info (debug when the legacy debug config/DEBUG_PAYWAY flag is set).',
    defaultValue: 'info',
    required: false,
    consumedBy: ['src/logger.ts'],
    docsAnchor: 'docs/guides/12-error-handling-and-debugging.md',
  },
  {
    name: 'PAYWAY_NO_UPDATE_CHECK',
    kind: 'non-secret',
    group: 'behavior',
    description: "'1' disables the CLI's once-per-day update check (which only runs on interactive TTYs anyway).",
    defaultValue: '0',
    required: false,
    consumedBy: ['src/cli/update-check.ts'],
    docsAnchor: 'docs/guides/AGENTIC-PAYWAY-CLI-USER-GUIDE.md',
  },
  {
    name: 'PAYWAY_ONBOARD_AUTO',
    kind: 'non-secret',
    group: 'behavior',
    description:
      "'1' launches the interactive onboarding wizard automatically on the first unconfigured CLI command (interactive TTYs only). Opt-in.",
    defaultValue: '0',
    required: false,
    consumedBy: ['src/cli/commands/onboard.ts'],
    docsAnchor: 'docs/guides/AGENTIC-PAYWAY-CLI-USER-GUIDE.md',
  },
  {
    name: 'PAYWAY_MCP_ALLOW_MUTATIONS',
    kind: 'non-secret',
    group: 'behavior',
    description:
      "'1' registers the mutating MCP tools (the MCP server is read-only by default). Equivalent to the --allow-mutations CLI flag.",
    defaultValue: '0',
    required: false,
    consumedBy: ['src/mcp/server.ts'],
    docsAnchor: 'docs/guides/AGENTIC-PAYWAY-CLI-USER-GUIDE.md',
  },
  {
    name: 'PAYWAY_AGENT_NO_RECOVER_HINT',
    kind: 'non-secret',
    group: 'behavior',
    description: "Set to suppress the agent REPL's recovery hint when the inference provider fails to propose a plan.",
    defaultValue: null,
    required: false,
    consumedBy: ['src/agent/repl.ts'],
    docsAnchor: 'docs/guides/24-agent-integration.md',
  },
  {
    name: 'PAYWAY_JOURNAL',
    kind: 'non-secret',
    group: 'behavior',
    description:
      "Journal recording switch. SDK library: opt-in ('1'/'true'/'yes'/'on'). CLI: API commands record by default; PAYWAY_JOURNAL=0 (or --no-journal) opts out.",
    defaultValue: null,
    required: false,
    consumedBy: ['src/journal/writer.ts'],
    docsAnchor: 'docs/guides/18-transaction-journal.md',
  },
  {
    name: 'PAYWAY_JOURNAL_MODE',
    kind: 'non-secret',
    group: 'behavior',
    description:
      "Journal record detail: 'digest' (default — non-secret fields only) or 'full' (complete payloads; never journal secrets).",
    defaultValue: 'digest',
    required: false,
    consumedBy: ['src/journal/writer.ts'],
    docsAnchor: 'docs/guides/18-transaction-journal.md',
  },
  {
    name: 'PAYWAY_JOURNAL_MAX_AGE_DAYS',
    kind: 'non-secret',
    group: 'behavior',
    description:
      'Retention guard: journal events older than this many days are pruned on write (best-effort, never blocks the emitting call). Unset disables age-based pruning.',
    defaultValue: null,
    required: false,
    consumedBy: ['src/journal/writer.ts'],
    docsAnchor: 'docs/guides/18-transaction-journal.md',
    example: '90',
  },
  {
    name: 'PAYWAY_FORCE_JSON_STORAGE',
    kind: 'non-secret',
    group: 'behavior',
    description:
      "'1' forces the JSON file storage backend even when better-sqlite3 is importable (the SQLite default is one shared <data root>/payway.db).",
    defaultValue: '0',
    required: false,
    consumedBy: ['src/storage/storage-service.ts'],
    docsAnchor: 'docs/guides/21-storage-service.md',
  },
  {
    name: 'PAYWAY_DATA_DIR',
    kind: 'non-secret',
    group: 'data',
    description:
      'Overrides the shared data root for every local store (journal.jsonl, linked-tokens.json, webhook_data/, payway.db). Default: <APPDATA|~/.config>/aba-payway-sdk/data.',
    defaultValue: null,
    required: false,
    consumedBy: ['src/config/data-root.ts'],
    docsAnchor: 'docs/guides/21-storage-service.md',
  },
  {
    name: 'PAYWAY_JOURNAL_DIR',
    kind: 'non-secret',
    group: 'data',
    description:
      'Journal directory override (default: the PAYWAY_DATA_DIR data root). Precedence: explicit --dir arg > this variable > the data root.',
    defaultValue: null,
    required: false,
    consumedBy: ['src/journal/writer.ts', 'src/mcp/extras.ts'],
    docsAnchor: 'docs/guides/18-transaction-journal.md',
  },
  {
    name: 'PAYWAY_WEBHOOK_DIR',
    kind: 'non-secret',
    group: 'data',
    description:
      'Webhook capture directory override (default: <data root>/webhook_data). The webhook workbench stores signed captures here for resend/verify.',
    defaultValue: null,
    required: false,
    consumedBy: ['src/config/data-root.ts'],
    docsAnchor: 'docs/guides/16-webhook-setup-guide.md',
  },
  {
    name: 'PAYWAY_TOKEN_STORE_DIR',
    kind: 'non-secret',
    group: 'data',
    description:
      'COF linked-token store directory override (default: the PAYWAY_DATA_DIR data root; tokens live in linked-tokens.json).',
    defaultValue: null,
    required: false,
    consumedBy: ['src/webhook/token-store.ts'],
    docsAnchor: 'docs/guides/21-storage-service.md',
  },
  {
    name: 'PAYWAY_KNOWLEDGE_DIR',
    kind: 'non-secret',
    group: 'data',
    description:
      'Overrides the knowledge-base directory (the packaged knowledge/ corpus with MANIFEST.json). Default resolves relative to the executable, then ./knowledge from the working directory.',
    defaultValue: null,
    required: false,
    consumedBy: ['src/knowledge/store.ts'],
  },
  {
    name: 'PAYWAY_AGENT_API_KEY',
    kind: 'secret',
    group: 'integrations',
    description:
      'Inference-provider API key for the agent REPL (`payway-sdk agent`). The CLI never stores, logs, or accepts this key as an argument — it is read from the environment only and redacted from all agent output.',
    defaultValue: null,
    required: false,
    consumedBy: [
      'src/agent/onboarding/scan.ts',
      'src/agent/onboarding/stages.ts',
      'src/agent/orchestrator.ts',
      'src/agent/provider.ts',
    ],
    docsAnchor: 'docs/guides/24-agent-integration.md',
  },
  {
    name: 'PAYWAY_AGENT_BASE_URL',
    kind: 'non-secret',
    group: 'integrations',
    description:
      "Base URL for the agent REPL's inference provider (documented contract for self-hosted/proxied OpenAI-compatible endpoints; the in-repo provider adapter currently receives baseUrl via its config object, so no direct process.env read exists — registered so setting it is never reported as unrecognized).",
    defaultValue: null,
    required: false,
    consumedBy: [],
    docsAnchor: 'docs/guides/24-agent-integration.md',
    external: true,
  },
  {
    name: 'PAYWAY_KHQR_BAKONG_ID',
    kind: 'credential',
    group: 'integrations',
    description:
      'Bakong account ID (user@bakong) for ABA KHQR generation — part of the nested merchant-account template (max 32 UTF-8 bytes).',
    defaultValue: null,
    required: false,
    consumedBy: ['src/khqr-config.ts'],
    docsAnchor: 'docs/guides/07-qr-code-handling.md',
    example: 'merchant@bakong',
  },
  {
    name: 'PAYWAY_KHQR_ABA_MERCHANT_ID',
    kind: 'credential',
    group: 'integrations',
    description: 'ABA merchant ID embedded in the KHQR merchant-account template (exactly 15 digits).',
    defaultValue: null,
    required: false,
    consumedBy: ['src/khqr-config.ts'],
    docsAnchor: 'docs/guides/07-qr-code-handling.md',
    example: '000000000000000',
  },
  {
    name: 'PAYWAY_KHQR_ACQUIRER_NAME',
    kind: 'non-secret',
    group: 'integrations',
    description: 'Acquirer name for the KHQR merchant-account template (max 32 UTF-8 bytes).',
    defaultValue: null,
    required: false,
    consumedBy: ['src/khqr-config.ts'],
    docsAnchor: 'docs/guides/07-qr-code-handling.md',
    example: 'ABA Bank',
  },
  {
    name: 'PAYWAY_KHQR_MERCHANT_CATEGORY_CODE',
    kind: 'non-secret',
    group: 'integrations',
    description: 'KHQR merchant category code (exactly 4 digits, ISO 18245).',
    defaultValue: null,
    required: false,
    consumedBy: ['src/khqr-config.ts'],
    docsAnchor: 'docs/guides/07-qr-code-handling.md',
    example: '5999',
  },
  {
    name: 'PAYWAY_KHQR_MERCHANT_NAME',
    kind: 'non-secret',
    group: 'integrations',
    description: 'KHQR merchant name (max 25 characters).',
    defaultValue: null,
    required: false,
    consumedBy: ['src/khqr-config.ts'],
    docsAnchor: 'docs/guides/07-qr-code-handling.md',
    example: 'My Shop',
  },
  {
    name: 'PAYWAY_KHQR_MERCHANT_CITY',
    kind: 'non-secret',
    group: 'integrations',
    description: 'KHQR merchant city (max 15 characters).',
    defaultValue: null,
    required: false,
    consumedBy: ['src/khqr-config.ts'],
    docsAnchor: 'docs/guides/07-qr-code-handling.md',
    example: 'Phnom Penh',
  },
  {
    name: 'PAYWAY_KHQR_PAYWAY_DATA',
    kind: 'non-secret',
    group: 'integrations',
    description:
      'ABA PayWay template string embedded in KHQR tag 62 (max 99 UTF-8 bytes; must leave room for a 25-byte merchant reference).',
    defaultValue: null,
    required: false,
    consumedBy: ['src/khqr-config.ts'],
    docsAnchor: 'docs/guides/07-qr-code-handling.md',
  },
];

const KNOWN_PAYWAY_ENV_VAR_NAMES: ReadonlySet<string> = new Set(PAYWAY_ENV_VARS.map((envVar) => envVar.name));

export function getPayWayEnvVar(name: string): PayWayEnvVarDefinition | undefined {
  return PAYWAY_ENV_VARS.find((envVar) => envVar.name === name);
}

export function knownPayWayEnvVarNames(): ReadonlySet<string> {
  return KNOWN_PAYWAY_ENV_VAR_NAMES;
}

export function isKnownPayWayEnvVar(name: string): boolean {
  return KNOWN_PAYWAY_ENV_VAR_NAMES.has(name);
}

/**
 * PAYWAY_-prefixed keys present in the env map that the registry does not
 * know (the W-PAYWAY-UNKNOWN-VAR input). Sorted for deterministic output.
 */
export function collectUnknownPayWayVarNames(env: Record<string, string | undefined>): string[] {
  return Object.keys(env)
    .filter((key) => /^PAYWAY_/i.test(key))
    .filter((key) => !KNOWN_PAYWAY_ENV_VAR_NAMES.has(key))
    .sort();
}

/**
 * Registry name nearest to a typo'd variable (smallest edit distance, ties
 * broken by registry order). Undefined when nothing is close enough to be
 * a plausible typo.
 */
export function nearestPayWayEnvVarName(input: string): string | undefined {
  const maxDistance = Math.max(2, Math.floor(input.length / 4));
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const envVar of PAYWAY_ENV_VARS) {
    const distance = editDistance(input, envVar.name);
    if (distance < bestDistance) {
      best = envVar.name;
      bestDistance = distance;
    }
  }
  return bestDistance <= maxDistance ? best : undefined;
}

function editDistance(a: string, b: string): number {
  const previous = new Array<number>(b.length + 1);
  const current = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) previous[j] = j;
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
    }
    for (let j = 0; j <= b.length; j++) previous[j] = current[j];
  }
  return previous[b.length];
}
