export type EnvIssueSeverity = 'error' | 'warn';

export interface EnvIssue {
  readonly code: string;
  readonly severity: EnvIssueSeverity;
  readonly message: string;
  readonly varName: string;
}

const REQUIRED_VARS = ['PAYWAY_ENV', 'PAYWAY_MERCHANT_ID', 'PAYWAY_API_KEY'] as const;
const URL_VARS = ['PAYWAY_RETURN_URL', 'PAYWAY_CANCEL_URL', 'PAYWAY_CALLBACK_URL'] as const;

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

  return issues;
}

export function hasBlockingIssues(issues: ReadonlyArray<EnvIssue>): boolean {
  return issues.some((i) => i.severity === 'error');
}
