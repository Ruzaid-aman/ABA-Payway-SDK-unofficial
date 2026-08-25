import { existsSync } from 'node:fs';
import path from 'node:path';
import { type EnvIssue, validatePayWayEnv } from '../../config/envValidator.js';
import { type DetectedFramework, detectFramework } from '../../config/frameworkDetector.js';
import { isValidPublicKeyPem, validatePublicHttpsUrl } from '../../utils.js';
import { parseDotEnvFile } from '../dotenv.js';

export interface DoctorOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
}

export interface DoctorCheck {
  readonly id: string;
  readonly label: string;
  readonly ok: boolean;
  readonly detail: string;
  readonly fix?: string;
}

export interface DoctorResult {
  readonly checks: readonly DoctorCheck[];
  readonly envIssues: readonly EnvIssue[];
  readonly framework: DetectedFramework;
  readonly frameworkEvidence: readonly string[];
  readonly allHealthy: boolean;
}

function checkRsaPem(env: NodeJS.ProcessEnv): DoctorCheck | undefined {
  const pem = env.PAYWAY_RSA_PUBLIC_KEY?.trim();
  if (!pem) return undefined; // optional credential — absence handled by command pre-flight

  const looksValid: boolean = isValidPublicKeyPem(pem);
  if (looksValid) {
    return { id: 'env-rsa-pem', label: 'RSA public key shape', ok: true, detail: 'BEGIN/END PUBLIC KEY detected' };
  }

  const truncated = pem.startsWith('"-----BEGIN') || (pem.includes('BEGIN PUBLIC KEY') && !pem.includes('END PUBLIC KEY'));
  return {
    id: 'env-rsa-pem',
    label: 'RSA public key shape',
    ok: false,
    detail: truncated
      ? 'PEM appears truncated — only the BEGIN header is present'
      : 'Does not look like a full public key PEM',
    fix: truncated
      ? 'The CLI supports multi-line quoted PEMs in .env: wrap the whole key in double quotes across lines. Re-copy the full key from the PayWay portal.'
      : 'PAYWAY_RSA_PUBLIC_KEY must contain "-----BEGIN PUBLIC KEY-----" and "-----END PUBLIC KEY-----". Multi-line quoted values are supported.',
  };
}

function checkEnvFile(cwd: string): DoctorCheck {
  const envPath = path.join(cwd, '.env');
  const exists = existsSync(envPath);
  return {
    id: 'env-file',
    label: '.env file exists',
    ok: exists,
    detail: exists ? envPath : `.env not found in ${cwd}`,
    fix: exists ? undefined : 'Run `payway-sdk init` to create a .env template',
  };
}

function checkFramework(cwd: string): DoctorCheck {
  const detection = detectFramework(cwd);
  const ok = detection.framework !== 'unknown';
  return {
    id: 'framework',
    label: 'Framework detected',
    ok,
    detail: `${detection.framework} (${detection.evidence.join('; ')})`,
    fix: ok ? undefined : 'Install a supported framework: next, express, fastify, or nuxt',
  };
}

function checkEnvVars(env: NodeJS.ProcessEnv): DoctorCheck[] {
  const issues = validatePayWayEnv(env);
  const checks: DoctorCheck[] = [];

  const required = ['PAYWAY_ENV', 'PAYWAY_MERCHANT_ID', 'PAYWAY_API_KEY'] as const;
  for (const name of required) {
    const issue = issues.find((i) => i.varName === name && i.severity === 'error');
    checks.push({
      id: `env-${name}`,
      label: `${name} is set`,
      ok: !issue,
      detail: issue ? issue.message : `set to ${(env[name] ?? '').slice(0, 8)}...`,
      fix: issue ? `Add ${name}=<value> to your .env file` : undefined,
    });
  }

  const apiKey = env.PAYWAY_API_KEY?.trim();
  if (apiKey && apiKey.length < 16) {
    checks.push({
      id: 'env-apikey-length',
      label: 'API key length',
      ok: false,
      detail: `Only ${apiKey.length} characters (PayWay keys are usually longer)`,
      fix: 'Verify you copied the full API key from the PayWay merchant portal',
    });
  } else if (apiKey) {
    checks.push({
      id: 'env-apikey-length',
      label: 'API key length',
      ok: true,
      detail: `${apiKey.length} characters`,
    });
  }

  const envValue = env.PAYWAY_ENV?.trim();
  if (envValue) {
    const valid = envValue === 'sandbox' || envValue === 'production';
    checks.push({
      id: 'env-value',
      label: 'PAYWAY_ENV value',
      ok: valid,
      detail: `"${envValue}"`,
      fix: valid ? undefined : 'Set PAYWAY_ENV to "sandbox" or "production"',
    });
  }

  return checks;
}

function checkCallbackUrl(env: NodeJS.ProcessEnv): DoctorCheck {
  const callbackUrl = env.PAYWAY_CALLBACK_URL?.trim();
  if (!callbackUrl) {
    return {
      id: 'env-PAYWAY_CALLBACK_URL',
      label: 'PAYWAY_CALLBACK_URL is set',
      ok: false,
      detail: 'required for online QR and webhook confirmation',
      fix: 'Set PAYWAY_CALLBACK_URL=<public-https-url> or run `payway-sdk setup-webhook --tunnel`',
    };
  }

  try {
    validatePublicHttpsUrl(callbackUrl, 'callbackUrl');
    return {
      id: 'env-PAYWAY_CALLBACK_URL',
      label: 'PAYWAY_CALLBACK_URL is set',
      ok: true,
      detail: callbackUrl,
    };
  } catch {
    return {
      id: 'env-PAYWAY_CALLBACK_URL',
      label: 'PAYWAY_CALLBACK_URL is set',
      ok: false,
      detail: `${callbackUrl} is not a public HTTPS URL`,
      fix: 'Use a public HTTPS callback URL for online QR, or run `payway-sdk setup-webhook --tunnel` during local development',
    };
  }
}

/**
 * Run the `doctor` command: validate env, detect framework, report health.
 */
export function runDoctor(options: DoctorOptions = {}): DoctorResult {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;

  const envPath = path.join(cwd, '.env');
  const fileVars = parseDotEnvFile(envPath);
  const mergedEnv = { ...fileVars, ...env } as NodeJS.ProcessEnv;

  const envFileCheck = checkEnvFile(cwd);
  const frameworkCheck = checkFramework(cwd);
  const envVarChecks = checkEnvVars(mergedEnv);
  const callbackCheck = checkCallbackUrl(mergedEnv);
  const rsaCheck = checkRsaPem(mergedEnv);

  const checks = [envFileCheck, frameworkCheck, ...envVarChecks, callbackCheck, ...(rsaCheck ? [rsaCheck] : [])];
  const envIssues = validatePayWayEnv(mergedEnv);
  const detection = detectFramework(cwd);

  return {
    checks,
    envIssues,
    framework: detection.framework,
    frameworkEvidence: detection.evidence,
    allHealthy: checks.every((c) => c.ok),
  };
}
