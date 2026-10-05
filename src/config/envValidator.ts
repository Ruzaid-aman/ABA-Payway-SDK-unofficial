export type EnvIssueSeverity = 'error' | 'warn';

export interface EnvIssue {
  readonly code: string;
  readonly severity: EnvIssueSeverity;
  readonly message: string;
  readonly varName: string;
}

const REQUIRED_VARS = ['PAYWAY_ENV', 'PAYWAY_MERCHANT_ID', 'PAYWAY_API_KEY'] as const;
const URL_VARS = ['PAYWAY_RETURN_URL', 'PAYWAY_CANCEL_URL', 'PAYWAY_CALLBACK_URL'] as const;

/**
 * Every PAYWAY_-prefixed variable the SDK/CLI ecosystem understands (TD-12).
 * Anything else present in the environment is reported as a warning so
 * typos like PAYWAY_APIKEY or stale variables surface during doctor/init.
 */
const KNOWN_VARS: ReadonlySet<string> = new Set([
  ...REQUIRED_VARS,
  ...URL_VARS,
  'PAYWAY_SANDBOX',
  'PAYWAY_BASE_URL',
  'PAYWAY_TIMEOUT',
  'PAYWAY_RSA_PUBLIC_KEY',
  'PAYWAY_AGENT_API_KEY',
  'PAYWAY_AGENT_BASE_URL',
  'PAYWAY_PROFILE',
  'PAYWAY_LOG_LEVEL',
  'PAYWAY_ONBOARD_AUTO',
  'PAYWAY_JOURNAL',
  'PAYWAY_JOURNAL_DIR',
  'PAYWAY_JOURNAL_MODE',
  'PAYWAY_JOURNAL_MAX_AGE_DAYS',
  'PAYWAY_WEBHOOK_DIR',
  'PAYWAY_DATA_DIR',
  'PAYWAY_FORCE_JSON_STORAGE',
  'PAYWAY_PARTNER_ID',
  'PAYWAY_PARTNER_API_KEY',
  // DX-SEC-001 (P0-04): safe TLS verification — CA bundle + minimum protocol
  // version, mapped onto the client's tlsCaFile / tlsMinVersion options.
  'PAYWAY_TLS_CA_FILE',
  'PAYWAY_TLS_MIN_VERSION',
]);

/** Validate env-only vars actually carry values that appear in the env map. */
function collectUnknownVarWarnings(env: NodeJS.ProcessEnv): EnvIssue[] {
  const unknown = Object.keys(env)
    .filter((key) => /^PAYWAY_/i.test(key))
    .filter((key) => !KNOWN_VARS.has(key));
  if (unknown.length === 0) return [];
  return [
    {
      code: 'W-PAYWAY-UNKNOWN-VAR',
      severity: 'warn',
      varName: unknown.join(','),
      message:
        `Unrecognized PayWay environment variable(s): ${unknown.join(', ')}. ` +
        'Check for typos or removed configuration keys.',
    },
  ];
}

function isNonEmpty(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isLikelyUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate PayWay environment variables and return structured issues.
 *
 * Each issue has a machine-readable `code`, a `severity` (error/warn),
 * the offending `varName`, and a human-readable `message`.
 */
export function validatePayWayEnv(env: NodeJS.ProcessEnv): EnvIssue[] {
  const issues: EnvIssue[] = [];

  for (const name of REQUIRED_VARS) {
    if (!isNonEmpty(env[name])) {
      issues.push({
        code: `E-${name}-MISSING`,
        severity: 'error',
        varName: name,
        message: `${name} is missing or empty`,
      });
    }
  }

  const envValue = env.PAYWAY_ENV?.trim();
  if (isNonEmpty(envValue)) {
    const isKnown = envValue === 'sandbox' || envValue === 'production';
    const isUrl = isLikelyUrl(envValue);
    if (!isKnown && !isUrl) {
      issues.push({
        code: 'E-PAYWAY_ENV-WRONG',
        severity: 'error',
        varName: 'PAYWAY_ENV',
        message: `PAYWAY_ENV must be "sandbox", "production", or an https URL (got ${envValue})`,
      });
    }
  }

  const apiKey = env.PAYWAY_API_KEY?.trim();
  if (isNonEmpty(apiKey) && apiKey.length < 16) {
    issues.push({
      code: 'E-PAYWAY_API_KEY-TOO-SHORT',
      severity: 'warn',
      varName: 'PAYWAY_API_KEY',
      message: `PAYWAY_API_KEY is suspiciously short (${apiKey.length} chars); PayWay-issued keys are usually longer`,
    });
  }

  for (const name of URL_VARS) {
    const value = env[name]?.trim();
    if (!isNonEmpty(value)) {
      if (name === 'PAYWAY_RETURN_URL') {
        issues.push({
          code: 'E-PAYWAY_RETURN_URL-MISSING',
          severity: 'error',
          varName: name,
          message: 'PAYWAY_RETURN_URL is missing (required when launching checkout)',
        });
      }
      continue;
    }
    if (!isLikelyUrl(value)) {
      issues.push({
        code: `E-${name}-INVALID`,
        severity: 'error',
        varName: name,
        message: `${name} must be an http(s) URL (got ${value})`,
      });
    }
  }

  const rsaKey = env.PAYWAY_RSA_PUBLIC_KEY?.trim();
  if (isNonEmpty(rsaKey) && !rsaKey.includes('-----BEGIN')) {
    issues.push({
      code: 'E-PAYWAY_RSA_PUBLIC_KEY-INVALID',
      severity: 'warn',
      varName: 'PAYWAY_RSA_PUBLIC_KEY',
      message: 'PAYWAY_RSA_PUBLIC_KEY should be a PEM-formatted string starting with -----BEGIN',
    });
  }

  issues.push(...collectUnknownVarWarnings(env));

  return issues;
}

export function hasBlockingIssues(issues: ReadonlyArray<EnvIssue>): boolean {
  return issues.some((i) => i.severity === 'error');
}

// ---------------------------------------------------------------------------
// QR-REQ-02  Credential-only validation for CLI startup
// ---------------------------------------------------------------------------

/**
 * Lightweight credential check for CLI commands that call the PayWay API.
 *
 * Unlike `validatePayWayEnv()` which checks the full env (sandbox mode,
 * return URLs, RSA keys, etc.), this function only checks the two
 * credentials required for any API call: merchant ID and API key.
 *
 * Use this at CLI startup for commands that will call the PayWay API
 * (e.g. generate-qr, generate-checkout) so users get a clear error
 * message immediately rather than a cryptic PayWayConfigError later.
 *
 * @returns An array of blocking issues (length 0 = credentials are present).
 */
export function validateRequiredCredentials(env: NodeJS.ProcessEnv): EnvIssue[] {
  const issues: EnvIssue[] = [];

  if (!isNonEmpty(env.PAYWAY_MERCHANT_ID)) {
    issues.push({
      code: 'E-PAYWAY_MERCHANT_ID-MISSING',
      severity: 'error',
      varName: 'PAYWAY_MERCHANT_ID',
      message:
        'PAYWAY_MERCHANT_ID is missing or empty. ' +
        'Add PAYWAY_MERCHANT_ID=<value> to your .env file, ' +
        'or run `payway-sdk init` to create one.',
    });
  }

  if (!isNonEmpty(env.PAYWAY_API_KEY)) {
    issues.push({
      code: 'E-PAYWAY_API_KEY-MISSING',
      severity: 'error',
      varName: 'PAYWAY_API_KEY',
      message:
        'PAYWAY_API_KEY is missing or empty. ' +
        'Add PAYWAY_API_KEY=<value> to your .env file, ' +
        'or run `payway-sdk init` to create one.',
    });
  }

  return issues;
}
