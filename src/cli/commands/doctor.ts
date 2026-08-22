import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { type EnvIssue, validatePayWayEnv } from '../../config/envValidator.js';
import { type DetectedFramework, detectFramework } from '../../config/frameworkDetector.js';

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

function loadDotEnv(envPath: string): Record<string, string> {
  if (!existsSync(envPath)) return {};
  const content = readFileSync(envPath, 'utf8');
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    result[key] = value;
  }
  return result;
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

/**
 * Run the `doctor` command: validate env, detect framework, report health.
 */
export function runDoctor(options: DoctorOptions = {}): DoctorResult {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;

  const envPath = path.join(cwd, '.env');
  const fileVars = loadDotEnv(envPath);
  const mergedEnv = { ...fileVars, ...env } as NodeJS.ProcessEnv;

  const envFileCheck = checkEnvFile(cwd);
  const frameworkCheck = checkFramework(cwd);
  const envVarChecks = checkEnvVars(mergedEnv);

  const checks = [envFileCheck, frameworkCheck, ...envVarChecks];
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
