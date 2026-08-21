#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { sdk } from './sdk.js';
import { PayWay } from './client.js';
import { formatTestReport } from './test/index.js';
import { runInit } from './cli/commands/init.js';
import { runDoctor } from './cli/commands/doctor.js';
import {
  addSkills,
  removeSkills,
  listSkills,
  doctorSkills,
} from './cli/commands/skills.js';
import {
  PAYMENT_STATUS_CODES,
  REFUND_ERROR_CODES,
} from './constants.js';
import {
  validateRefundAmount,
  validateTransactionId,
  validatePositiveAmount,
} from './utils.js';
import { validateRequiredCredentials, hasBlockingIssues, validatePayWayEnv } from './config/envValidator.js';
import { PayWayAPIError, PollingAbortedError } from './errors.js';
import { runSetupWebhook } from './cli/commands/setup-webhook.js';
import { randomBytes } from 'node:crypto';
import {
  activateProfile,
  activeProfile,
  loadProfileStore,
  saveProfileStore,
  type CredentialProfile,
} from './config/profiles.js';
import {
  validateKhqrCallbackSetup,
  validateKhqrConfiguration,
  type KhqrCallbackEnrollment,
  type KhqrCallbackVerification,
} from './khqr-config.js';
import { readMaskedInput } from './cli/masked-input.js';

// ---------------------------------------------------------------------------
// Load .env file if present (no dotenv dependency needed)
// ---------------------------------------------------------------------------
function loadDotEnv(): void {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.replace(/\r/g, '').trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}
loadDotEnv();
const profileStore = loadProfileStore();
const selectedProfile = activeProfile(profileStore);
if (selectedProfile) activateProfile(selectedProfile);

// ---------------------------------------------------------------------------
// Pre-flight credential check for API-calling commands (QR-REQ-02)
// ---------------------------------------------------------------------------
function assertCredentialsPresent(): boolean {
  const issues = validateRequiredCredentials(process.env);
  if (!hasBlockingIssues(issues)) return true;

  console.log(`\n  ${c.red('✗')} ${c.bold('Missing merchant credentials')}\n`);
  for (const issue of issues) {
    console.log(`    ${c.red('•')} ${issue.message}`);
  }
  console.log();
  console.log(`  ${c.dim('Expected in .env file:')}`);
  console.log(`    ${c.cyan('PAYWAY_MERCHANT_ID=<your-merchant-id>')}`);
  console.log(`    ${c.cyan('PAYWAY_API_KEY=<your-api-key>')}`);
  console.log();
  console.log(`  ${c.dim('Or run')} ${c.cyan('payway-sdk init')} ${c.dim('to create a .env template.')}`);
  console.log();
  return false;
}

// ---------------------------------------------------------------------------
// Pre-flight RSA key check for merchant_auth-encrypted commands
// ---------------------------------------------------------------------------
function assertRsaKeyPresent(): boolean {
  if (process.env.PAYWAY_RSA_PUBLIC_KEY?.trim()) return true;

  console.log(`\n  ${c.red('✗')} ${c.bold('PAYWAY_RSA_PUBLIC_KEY is missing')}\n`);
  console.log(`  ${c.dim('Payment Link APIs require the PayWay RSA public key for merchant_auth encryption.')}`);
  console.log(`  ${c.dim('Add')} ${c.cyan('PAYWAY_RSA_PUBLIC_KEY=<pem>')} ${c.dim('to your .env file.')}\n`);
  return false;
}

// ---------------------------------------------------------------------------
// Shared API error printer (includes PayWay code hints)
// ---------------------------------------------------------------------------
function printApiError(e: unknown): void {
  if (e instanceof PayWayAPIError) {
    console.log(`  ${c.red('✗')} ${e.message}`);
    if (e.paywayCode) console.log(`  ${c.dim(`PayWay code: ${e.paywayCode}`)}`);
    if (e.paywayCode === 'PTL04') {
      console.log(`  ${c.dim('Hint: currency and return_url are required; description max 250 chars.')}`);
    } else if (e.paywayCode === '96') {
      console.log(`  ${c.dim('Hint: check the link id — use the data.id value returned by create.')}`);
    }
  } else {
    console.log(`  ${c.red('✗')} ${e instanceof Error ? e.message : String(e)}`);
  }
}


// ---------------------------------------------------------------------------
// ANSI helpers (no external deps)
// ---------------------------------------------------------------------------
const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

const executableDirectory = path.dirname(process.argv[1] ?? process.cwd());

// ---------------------------------------------------------------------------
// Shared polling runner for generate-qr and generate-checkout
// ---------------------------------------------------------------------------
async function runPolling(
  payway: InstanceType<typeof PayWay>,
  transactionId: string,
  opts: { pollInterval?: string; pollTimeout?: string },
): Promise<void> {
  const intervalMs = opts.pollInterval ? Number(opts.pollInterval) * 1000 : 5_000;
  const maxDurationMs = opts.pollTimeout ? Number(opts.pollTimeout) * 1000 : 600_000;

  console.log(`  ${c.bold('Polling:')}`);
  console.log(`    Interval:     ${c.cyan(`${intervalMs / 1000}s`)}`);
  console.log(`    Max duration: ${c.cyan(`${maxDurationMs / 1000}s`)}`);
  console.log();

  const startTime = Date.now();

  try {
    for await (const result of payway.checkout.pollTransactionStatus(transactionId, {
      intervalMs,
      maxDurationMs,
    })) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (result.paymentStatus.startsWith('ERROR:')) {
        console.log(`  ${c.yellow('⚠')} [${elapsed}s] Poll #${result.attempt}: ${c.yellow(result.paymentStatus)} ${c.dim(`(${result.durationMs}ms)`)}`);
        continue;
      }

      if (result.isTerminal) {
        const icon = result.paymentStatus === 'APPROVED' ? c.green('✓') : c.red('✗');
        console.log(`  ${icon} [${elapsed}s] Poll #${result.attempt}: ${c.bold(result.paymentStatus)} ${c.dim(`(${result.durationMs}ms)`)}`);
        console.log();
        console.log(`  ${c.green(`Payment ${result.paymentStatus.toLowerCase()}.`)}`);
        console.log();
        return;
      }

      console.log(`  ${c.dim('○')} [${elapsed}s] Poll #${result.attempt}: ${c.dim(result.paymentStatus)} ${c.dim(`(${result.durationMs}ms)`)}`);
    }
  } catch (error) {
    if (error instanceof PollingAbortedError) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log();
      console.log(`  ${c.yellow('⚠')} Polling stopped: ${c.yellow(error.reason)} after ${c.bold(String(error.totalAttempts))} attempts (${elapsed}s elapsed)`);
      if (error.lastStatus) {
        console.log(`  ${c.dim(`Last status: ${error.lastStatus}`)}`);
      }
      console.log();
    } else {
      throw error;
    }
  }
}

async function promptConfirmation(message: string, rl?: readline.Interface): Promise<boolean> {
  const rlInstance = rl ?? readline.createInterface({ input: process.stdin as any, output: process.stdout as any, terminal: false });
  try {
    const answer = await new Promise<string>((resolve) => {
      rlInstance.question(message, (ans) => {
        if (!rl) rlInstance.close();
        resolve(ans);
      });
    });
    return answer.trim().toLowerCase() === 'y';
  } catch {
    return false;
  }
}

async function promptLifetimeOverride(current: number, rl?: readline.Interface): Promise<number | null> {
  const rlInstance = rl ?? readline.createInterface({ input: process.stdin as any, output: process.stdout as any, terminal: false });
  try {
    const answer = await new Promise<string>((resolve) => {
      rlInstance.question(`  Modify lifetime? Current: ${current}s. Enter new value (or press Enter to skip): `, (ans) => {
        if (!rl) rlInstance.close();
        resolve(ans);
      });
    });
    const trimmed = answer.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
      console.log(`  ${c.red('✗')} Invalid lifetime: must be a positive whole number of seconds`);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(executableDirectory, '..', 'package.json'), 'utf8'),
    );
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function getSkillsDir(): string {
  return path.join(executableDirectory, '..', 'skills');
}

// ---------------------------------------------------------------------------
// Commander program
// ---------------------------------------------------------------------------
const program = new Command();

program
  .name('payway-sdk')
  .description('CLI for the ABA PayWay TypeScript SDK')
  .version(readPackageVersion());

// --- init ---
program
  .command('init')
  .description('Initialize PayWay integration in the current project')
  .action(() => {
    console.log(`\n${c.bold('ABA PayWay SDK')} — initializing project\n`);
    const result = runInit();

    console.log(`  Framework: ${c.cyan(result.framework)}`);
    for (const e of result.frameworkEvidence) {
      console.log(`    ${c.dim('•')} ${e}`);
    }
    console.log();

    if (result.writtenFiles.length > 0) {
      console.log(`  ${c.green('Files created:')}`);
      for (const f of result.writtenFiles) console.log(`    ${c.green('✓')} ${f}`);
    }
    if (result.skippedFiles.length > 0) {
      console.log(`  ${c.yellow('Files skipped (already exist):')}`);
      for (const f of result.skippedFiles) console.log(`    ${c.yellow('○')} ${f}`);
    }
    if (result.envWritten) {
      console.log(`  ${c.green('✓')} .env template created`);
    }
    console.log();

    if (result.envIssues.length > 0) {
      console.log(`  ${c.yellow('Environment issues:')}`);
      for (const issue of result.envIssues) {
        const icon = issue.severity === 'error' ? c.red('✗') : c.yellow('⚠');
        console.log(`    ${icon} ${issue.message}`);
      }
      console.log();
    }

    console.log(`  Report: ${c.cyan(result.reportPath)}`);
    console.log(`  ${c.dim('Next: fill PAYWAY_MERCHANT_ID and PAYWAY_API_KEY in .env')}\n`);
  });

// --- doctor ---
program
  .command('doctor')
  .description('Validate environment configuration and connectivity')
  .action(() => {
    console.log(`\n${c.bold('ABA PayWay SDK Doctor')}\n`);
    const result = runDoctor();

    console.log(`  Framework: ${c.cyan(result.framework)}`);
    for (const e of result.frameworkEvidence) {
      console.log(`    ${c.dim('•')} ${e}`);
    }
    console.log();

    for (const check of result.checks) {
      const icon = check.ok ? c.green('✓') : c.red('✗');
      console.log(`  ${icon} ${check.label}  ${c.dim(check.detail)}`);
      if (check.fix) {
        console.log(`    ${c.yellow('→')} ${check.fix}`);
      }
    }
    console.log();

    if (result.allHealthy) {
      console.log(`  ${c.green('All checks passed.')}\n`);
      process.exitCode = 0;
    } else {
      console.log(`  ${c.yellow('Run')} ${c.cyan('payway-sdk init')} ${c.yellow('to fix configuration issues.')}\n`);
      process.exitCode = 1;
    }
  });

// --- config ---
program
  .command('config')
  .description('Display loaded configuration and validate environment variables')
  .action(() => {
    console.log(`\n${c.bold('ABA PayWay SDK')} — configuration\n`);

    // --- .env file status ---
    const envPath = path.resolve(process.cwd(), '.env');
    const envFileExists = existsSync(envPath);
    if (envFileExists) {
      console.log(`  ${c.green('✓')} ${c.bold('.env')} file found at ${c.dim(envPath)}`);
    } else {
      console.log(`  ${c.yellow('⚠')} No ${c.bold('.env')} file found in ${c.dim(path.dirname(envPath))}`);
      console.log(`    ${c.dim('Run')} ${c.cyan('payway-sdk init')} ${c.dim('to create one.')}`);
    }
    console.log();

    // --- Core SDK variables ---
    const env = process.env;
    const secrets = new Set(['PAYWAY_API_KEY', 'PAYWAY_RSA_PUBLIC_KEY']);

    const vars: Array<{ name: string; label: string; sensitive?: boolean }> = [
      { name: 'PAYWAY_ENV', label: 'Environment' },
      { name: 'PAYWAY_MERCHANT_ID', label: 'Merchant ID', sensitive: true },
      { name: 'PAYWAY_API_KEY', label: 'API Key', sensitive: true },
      { name: 'PAYWAY_BASE_URL', label: 'Base URL' },
      { name: 'PAYWAY_SANDBOX', label: 'Sandbox mode' },
      { name: 'PAYWAY_TIMEOUT', label: 'Timeout (ms)' },
      { name: 'PAYWAY_RSA_PUBLIC_KEY', label: 'RSA Public Key', sensitive: true },
    ];

    const urlVars: Array<{ name: string; label: string }> = [
      { name: 'PAYWAY_RETURN_URL', label: 'Return URL' },
      { name: 'PAYWAY_CANCEL_URL', label: 'Cancel URL' },
      { name: 'PAYWAY_CALLBACK_URL', label: 'Callback URL' },
    ];

    console.log(`  ${c.bold('SDK Credentials')}`);
    for (const v of vars) {
      const val = env[v.name]?.trim();
      if (!val) {
        console.log(`  ${c.yellow('⚠')} ${v.label.padEnd(18)} ${c.dim('(not set)')}`);
        continue;
      }
      let display: string;
      if (secrets.has(v.name)) {
        display = val.length > 12
          ? `${val.slice(0, 8)}${'•'.repeat(Math.min(val.length - 8, 16))}`
          : '••••••••';
      } else {
        display = val;
      }
      console.log(`  ${c.green('✓')} ${v.label.padEnd(18)} ${c.cyan(display)}`);
    }
    console.log();

    if (urlVars.some((v) => env[v.name]?.trim())) {
      console.log(`  ${c.bold('URLs')}`);
      for (const v of urlVars) {
        const val = env[v.name]?.trim();
        if (!val) continue;
        console.log(`  ${c.green('✓')} ${v.label.padEnd(18)} ${c.cyan(val)}`);
      }
      console.log();
    }

    // --- Validation ---
    const issues = validatePayWayEnv(env);
    if (issues.length === 0) {
      console.log(`  ${c.green('✓')} ${c.bold('All environment variables valid.')}`);
    } else {
      const errors = issues.filter((i) => i.severity === 'error');
      const warns = issues.filter((i) => i.severity === 'warn');
      if (errors.length > 0) {
        console.log(`  ${c.red('✗')} ${c.bold(`${errors.length} error(s):`)}`);
        for (const issue of errors) {
          console.log(`    ${c.red('•')} ${issue.message}`);
        }
      }
      if (warns.length > 0) {
        console.log(`  ${c.yellow('⚠')} ${c.bold(`${warns.length} warning(s):`)}`);
        for (const issue of warns) {
          console.log(`    ${c.yellow('•')} ${issue.message}`);
        }
      }
    }
    console.log();

    process.exitCode = issues.some((i) => i.severity === 'error') ? 1 : 0;
  });

// --- test ---
program
  .command('test')
  .description('Run the PayWay sandbox test suite')
  .action(async () => {
    console.log(`\n${c.bold('ABA PayWay SDK')} — running sandbox test suite\n`);
    const report = await sdk.runTestSuite();
    console.log(formatTestReport(report));
    process.exitCode = report.success ? 0 : 1;
  });

// --- demo ---
program
  .command('demo')
  .description('Run the test suite with pass/fail output')
  .action(async () => {
    console.log(`\n${c.bold('ABA PayWay SDK')} — demo run\n`);
    const report = await sdk.runTestSuite();
    for (const result of report.results) {
      const icon = result.passed ? c.green('PASS') : c.red('FAIL');
      console.log(`  [${icon}] ${result.name} → ${result.message}`);
    }
    console.log(
      `\n  Total: ${c.bold(String(report.total))}  Passed: ${c.green(String(report.passed))}  Failed: ${c.red(String(report.failed))}`,
    );
    process.exitCode = report.success ? 0 : 1;
  });

// --- status ---
program
  .command('status')
  .description('Display payment status codes and refund error codes reference')
  .action(() => {
    console.log(`\n${c.bold('ABA PayWay SDK')} — payment status reference\n`);

    console.log(`  ${c.bold('Payment Status Codes')}`);
    console.log(`  ${c.dim('These numeric codes appear in payment_status_code fields.')}\n`);
    console.log(`    ${c.cyan('Code')}  ${c.bold('Label')}`);
    console.log(`    ${c.dim('────')}  ${c.dim('─────────')}`);
    for (const [code, label] of Object.entries(PAYMENT_STATUS_CODES)) {
      console.log(`    ${c.cyan(String(code).padStart(4))}  ${label}`);
    }
    console.log();

    console.log(`  ${c.bold('Refund Error Codes')}`);
    console.log(`  ${c.dim('These codes appear in status.code on refund responses.')}\n`);
    console.log(`    ${c.cyan('Code')}        ${c.bold('Description')}`);
    console.log(`    ${c.dim('─────')}        ${c.dim('───────────')}`);
    for (const [name, code] of Object.entries(REFUND_ERROR_CODES)) {
      const label = name
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
      console.log(`    ${c.cyan(code.padEnd(12))} ${label}`);
    }
    console.log();
  });

// --- validate ---
program
  .command('validate')
  .description('Validate a refund amount or transaction ID locally')
  .option('-a, --amount <number>', 'Refund amount to validate')
  .option('-c, --currency <code>', 'Currency code: USD (default) or KHR', 'USD')
  .option('-t, --transaction-id <id>', 'Transaction ID to validate')
  .action((opts: { amount?: string; currency?: string; transactionId?: string }) => {
    console.log(`\n${c.bold('ABA PayWay SDK')} — local validation\n`);
    let hasError = false;

    if (opts.transactionId) {
      try {
        validateTransactionId(opts.transactionId);
        console.log(`  ${c.green('✓')} Transaction ID: ${c.cyan(opts.transactionId)} — valid`);
      } catch (e) {
        console.log(`  ${c.red('✗')} Transaction ID: ${c.red(String(e instanceof Error ? e.message : e))}`);
        hasError = true;
      }
      console.log();
    }

    if (opts.amount) {
      const num = Number(opts.amount);
      const currency = (opts.currency ?? 'USD').toUpperCase();
      if (!['USD', 'KHR'].includes(currency)) {
        console.log(`  ${c.red('✗')} Currency must be USD or KHR, received: ${c.red(currency)}`);
        hasError = true;
      } else {
        try {
          validateRefundAmount(num, currency as 'USD' | 'KHR');
          console.log(
            `  ${c.green('✓')} Refund amount: ${c.cyan(opts.amount)} ${currency} — valid`,
          );
        } catch (e) {
          console.log(
            `  ${c.red('✗')} Refund amount: ${c.red(String(e instanceof Error ? e.message : e))}`,
          );
          hasError = true;
        }

        try {
          validatePositiveAmount(num, currency as 'USD' | 'KHR');
          console.log(
            `  ${c.green('✓')} Purchase amount: ${c.cyan(opts.amount)} ${currency} — valid`,
          );
        } catch (e) {
          console.log(
            `  ${c.red('✗')} Purchase amount: ${c.red(String(e instanceof Error ? e.message : e))}`,
          );
          hasError = true;
        }
      }
      console.log();
    }

    if (!opts.amount && !opts.transactionId) {
      console.log(`  ${c.yellow('No arguments provided.')}`);
      console.log(`  ${c.dim('Usage: payway-sdk validate --amount 15.00 --currency USD')}`);
      console.log(`  ${c.dim('       payway-sdk validate --transaction-id order-123')}`);
      console.log();
    }

    process.exitCode = hasError ? 1 : 0;
  });

// --- profiles ---
function printProfileStatus(profile: CredentialProfile): void {
  const khqrReadiness = validateKhqrConfiguration(profile.khqr);
  const callbackReadiness = validateKhqrCallbackSetup(profile.khqr?.callback);
  console.log(`  ${c.bold(profile.name)}${profile.name === profileStore.activeProfile ? c.green(' (active)') : ''}`);
  console.log(`    API credentials: ${profile.merchantId && profile.apiKey ? c.green('configured') : c.yellow('incomplete')}`);
  console.log(`    ABA KHQR: ${khqrReadiness.ready ? c.green('ready') : c.yellow(`not ready (${khqrReadiness.issues.map((issue) => issue.code).join(', ')})`)}`);
  console.log(`    KHQR callback: ${callbackReadiness.ready ? c.green('ready') : c.yellow('not ready')}`);
}

function askQuestion(question: string, rl: readline.Interface): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

const profilesCommand = program
  .command('profiles')
  .alias('profile')
  .description('Manage local credential and optional ABA KHQR profiles');

profilesCommand
  .command('list')
  .description('List profiles without exposing secrets or ABA merchant data')
  .action(() => {
    if (profileStore.profiles.length === 0) {
      console.log(`  ${c.yellow('No credential profiles saved.')}`);
      return;
    }
    console.log(`\n${c.bold('PayWay profiles')}\n`);
    for (const profile of profileStore.profiles) printProfileStatus(profile);
    console.log();
  });

profilesCommand
  .command('current')
  .description('Show selected profile readiness without exposing secrets')
  .action(() => {
    const profile = activeProfile(profileStore);
    if (!profile) {
      console.log(`  ${c.yellow('No active credential profile.')}`);
      process.exitCode = 1;
      return;
    }
    console.log(`\n${c.bold('Current PayWay profile')}\n`);
    printProfileStatus(profile);
    console.log();
  });

profilesCommand
  .command('use <name>')
  .description('Select a profile for subsequent CLI commands')
  .action((name: string) => {
    const profile = profileStore.profiles.find((candidate) => candidate.name === name);
    if (!profile) {
      console.log(`  ${c.red('✗')} Profile ${JSON.stringify(name)} was not found`);
      process.exitCode = 1;
      return;
    }
    profileStore.activeProfile = profile.name;
    saveProfileStore(profileStore);
    activateProfile(profile);
    console.log(`  ${c.green('✓')} Selected profile ${c.bold(profile.name)}`);
  });

profilesCommand
  .command('add <name>')
  .description('Interactively save API credentials and optional ABA KHQR configuration')
  .action(async (name: string) => {
    const rl = readline.createInterface({ input: process.stdin as any, output: process.stdout as any, terminal: false });
    try {
      const merchantId = (await askQuestion('  PayWay merchant ID (optional): ', rl)).trim();
      const apiKey = (await readMaskedInput('  PayWay API key (optional): ', {
        fallback: (prompt) => askQuestion(prompt, rl),
      })).trim();
      const configureKhqr = (await askQuestion('  Configure ABA KHQR offline generation? (y/n): ', rl)).trim().toLowerCase();
      let khqr: CredentialProfile['khqr'];
      if (configureKhqr === 'y' || configureKhqr === 'yes') {
        khqr = {
          bakongId: (await askQuestion('  Bakong ID: ', rl)).trim(),
          abaMerchantId: (await askQuestion('  ABA merchant ID: ', rl)).trim(),
          acquirerName: (await askQuestion('  Acquirer name: ', rl)).trim(),
          merchantCategoryCode: (await askQuestion('  Merchant category code: ', rl)).trim(),
          merchantName: (await askQuestion('  Merchant name: ', rl)).trim(),
          merchantCity: (await askQuestion('  Merchant city: ', rl)).trim(),
          paywayData: (await readMaskedInput('  ABA PayWay data: ', {
            fallback: (prompt) => askQuestion(prompt, rl),
          })).trim(),
        };
        const callbackUrl = (await askQuestion('  Callback URL (optional): ', rl)).trim();
        if (callbackUrl) {
          khqr.callback = {
            url: callbackUrl,
            enrollment: (await askQuestion('  Callback enrollment (not-requested/requested/confirmed-by-merchant): ', rl)).trim() as KhqrCallbackEnrollment,
            verification: (await askQuestion('  Callback verification (unknown/aba-confirmed-hmac/mTLS/ip-allowlist): ', rl)).trim() as KhqrCallbackVerification,
          };
        }
      }
      const profile: CredentialProfile = { name, merchantId: merchantId || undefined, apiKey: apiKey || undefined, khqr };
      const index = profileStore.profiles.findIndex((candidate) => candidate.name === name);
      if (index >= 0) profileStore.profiles[index] = profile;
      else profileStore.profiles.push(profile);
      profileStore.activeProfile = name;
      saveProfileStore(profileStore);
      activateProfile(profile);
      console.log(`  ${c.green('✓')} Saved and selected profile ${c.bold(name)}`);
      printProfileStatus(profile);
    } finally {
      rl.close();
    }
  });

// --- generate-qr ---
program
  .command('generate-qr')
  .description('Generate a QR code (online via PayWay API or offline)')
  .option('-a, --amount <number>', 'Payment amount (optional for static offline QR)')
  .option('-c, --currency <code>', 'Currency: USD (default) or KHR', 'USD')
  .option('-t, --transaction-id <id>', 'Transaction ID (auto-generated if omitted; online mode only)')
  .option('--offline', 'Generate official ABA KHQR offline (no API call)')
  .option('--callback-url <url>', 'Webhook callback URL (required for online mode)')
  .option('--payment-option <option>', 'Payment option for online mode', 'abapay_khqr')
  .option('--template <name>', 'QR image template for online mode', 'template2')
  .option('--lifetime <seconds>', 'Transaction lifetime in seconds (default: 180)', '180')
  .option('--ref <reference>', 'Merchant reference (required for offline mode)')
  .option('--save-image <path>', 'Save QR image to file (online mode only, base64 decoded)')
  .option('--non-interactive, -y', 'Skip interactive prompts (no confirmation, no lifetime override)')
  .option('--polling', 'Poll transaction status after QR generation (enabled by default)', true)
  .option('--no-polling', 'Disable automatic polling after QR generation')
  .option('--poll-interval <seconds>', 'Polling interval in seconds (default: 5)', '5')
  .option('--poll-timeout <seconds>', 'Max polling duration in seconds (default: 600)', '600')
  .action(async (opts: Record<string, string | undefined>) => {
    console.log(`\n${c.bold('ABA PayWay SDK')} — generate QR code\n`);

    const amount = opts.amount === undefined ? undefined : Number(opts.amount);
    const currency = (opts.currency ?? 'USD').toUpperCase() as 'USD' | 'KHR';
    const transactionId =
      opts.transactionId ?? `qr${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;

    if (!opts.offline && amount === undefined) {
      console.log(`  ${c.red('✗')} --amount is required for online mode`);
      process.exitCode = 1;
      return;
    }

    if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
      console.log(
        `  ${c.red('✗')} Amount must be a positive number, received: ${c.red(String(opts.amount))}`,
      );
      process.exitCode = 1;
      return;
    }

    if (!['USD', 'KHR'].includes(currency)) {
      console.log(`  ${c.red('✗')} Currency must be USD or KHR, received: ${c.red(currency)}`);
      process.exitCode = 1;
      return;
    }

    if (opts.offline) {
      // ── Offline mode ──────────────────────────────────────────────────
      const ref = opts.ref;

      if (!ref) {
        console.log(`  ${c.red('✗')} --ref is required for offline mode`);
        process.exitCode = 1;
        return;
      }

      try {
        // The KHQR domain performs only local TLV construction. Placeholder
        // credentials keep the API-only PayWay constructor contract intact.
        const payway = new PayWay({
          merchantId: process.env.PAYWAY_MERCHANT_ID || 'offline-khqr',
          apiKey: process.env.PAYWAY_API_KEY || 'offline-khqr',
        });
        const readiness = payway.khqr.validateConfiguration();
        if (!readiness.ready) {
          console.log(`  ${c.red('✗')} ABA KHQR configuration is not ready`);
          for (const issue of readiness.issues) console.log(`    ${c.red('•')} ${issue.code}: ${issue.message}`);
          process.exitCode = 1;
          return;
        }
        const qrString = payway.khqr.generateOfflineQR({
          ...(amount === undefined ? {} : { amount }),
          currency,
          merchantRef: ref,
        });

        console.log(`  ${c.green('✓')} Offline ABA KHQR generated\n`);
        console.log(`  ${c.bold('Amount:')}           ${c.cyan(amount === undefined ? `Static ${currency}` : `${amount} ${currency}`)}`);
        console.log(`  ${c.bold('Reference:')}        ${ref}`);
        console.log();
        console.log(`  ${c.bold('QR String:')}`);
        console.log(`  ${c.dim(qrString)}`);
        console.log();
      } catch (e) {
        console.log(`  ${c.red('✗')} ${e instanceof Error ? e.message : String(e)}`);
        process.exitCode = 1;
      }
    } else {
      // ── Online mode ───────────────────────────────────────────────────
      if (amount === undefined) {
        // Guarded above; retained for TypeScript's branch-local narrowing.
        process.exitCode = 1;
        return;
      }
      const callbackUrl = opts.callbackUrl || process.env.PAYWAY_CALLBACK_URL?.trim();

      if (!callbackUrl) {
        console.log(`  ${c.red('✗')} --callback-url is required for online mode`);
        console.log(
          `  ${c.dim('Tip: use --offline for offline QR generation without credentials')}`,
        );
        console.log(
          `  ${c.dim('Or run: payway-sdk setup-webhook --tunnel to set PAYWAY_CALLBACK_URL in .env')}`,
        );
        process.exitCode = 1;
        return;
      }

      const lifetimeSeconds = opts.lifetime ? Number(opts.lifetime) : 180;
      if (!Number.isFinite(lifetimeSeconds) || lifetimeSeconds <= 0 || !Number.isInteger(lifetimeSeconds)) {
        console.log(
          `  ${c.red('✗')} --lifetime must be a positive whole number of seconds, received: ${opts.lifetime}`,
        );
        process.exitCode = 1;
        return;
      }

    if (!assertCredentialsPresent()) {
      process.exitCode = 1;
      return;
    }

      let finalLifetime = lifetimeSeconds;

      if (opts.nonInteractive) {
        console.log(`  ${c.dim('(non-interactive mode — skipping prompts)')}`);
        console.log();
      } else {
        console.log();
        console.log(`  ${c.bold('Parameters:')}`);
        console.log(`    Amount:           ${c.cyan(`${amount} ${currency}`)}`);
        console.log(`    Transaction ID:   ${c.cyan(transactionId)}`);
        console.log(`    Payment Option:   ${c.cyan(opts.paymentOption ?? 'abapay_khqr')}`);
        console.log(`    Callback URL:     ${c.cyan(callbackUrl)}`);
        console.log(`    QR Template:      ${c.cyan(opts.template ?? 'template2')}`);
        console.log(`    Lifetime:         ${c.cyan(`${lifetimeSeconds} seconds`)}`);
        console.log();

        const rl = readline.createInterface({
          input: process.stdin as any,
          output: process.stdout as any,
          terminal: false,
        });
        const lifetimeOverride = await promptLifetimeOverride(lifetimeSeconds, rl);
        finalLifetime = lifetimeOverride ?? lifetimeSeconds;

        const confirmed = await promptConfirmation(`  Submit to PayWay? (y/n): `, rl);
        rl.close();
        if (!confirmed) {
          console.log(`  ${c.yellow('Cancelled by user.')}\n`);
          process.exitCode = 1;
          rl.close();
          process.exit(1);
        }

        console.log();
      }

    try {
      const payway = new PayWay();
      const qr = await payway.qr.generateQr({
          transactionId,
          amount,
          currency,
          paymentOption: opts.paymentOption ?? 'abapay_khqr',
          callbackUrl,
          qrImageTemplate: opts.template ?? 'template2',
          lifetime: finalLifetime,
        });

        console.log(`  ${c.green('✓')} Online QR generated via PayWay API\n`);
        console.log(`  ${c.bold('Transaction ID:')}  ${c.cyan(transactionId)}`);
        console.log(`  ${c.bold('Amount:')}           ${c.cyan(`${amount} ${currency}`)}`);
        console.log(`  ${c.bold('Payment Option:')}   ${opts.paymentOption ?? 'abapay_khqr'}`);
        console.log(`  ${c.bold('Callback URL:')}     ${callbackUrl}`);
        console.log(`  ${c.bold('Lifetime:')}         ${c.cyan(`${finalLifetime} seconds`)}`);
        console.log();

        if (qr.qrString) {
          console.log(`  ${c.bold('QR String:')}`);
          console.log(`  ${c.dim(qr.qrString)}`);
          console.log();
        }

        if (qr.qrImage && opts.saveImage) {
          const { writeFileSync, mkdirSync } = await import('node:fs');
          const imgDir = path.dirname(opts.saveImage);
          mkdirSync(imgDir, { recursive: true });
          // qrImage is a data URL: "data:image/png;base64,iVBOR..."
          const base64Data = qr.qrImage.includes('base64,')
            ? qr.qrImage.split('base64,')[1]
            : qr.qrImage;
          const imgBuffer = Buffer.from(base64Data, 'base64');
          writeFileSync(opts.saveImage, imgBuffer);
          console.log(`  ${c.green('✓')} Image saved to ${c.cyan(opts.saveImage)}`);
          console.log();
        } else if (qr.qrImage) {
          console.log(`  ${c.bold('QR Image:')} base64 data available (${qr.qrImage.length} chars)`);
          console.log(`  ${c.dim('Use --save-image <path> to save as PNG')}`);
          console.log();
        }

        // ── Polling ─────────────────────────────────────────────────────
        if ((opts as Record<string, unknown>).polling !== false) {
          await runPolling(payway, transactionId, opts);
        }
      } catch (e) {
        console.log(`  ${c.red('✗')} ${e instanceof Error ? e.message : String(e)}`);
        process.exitCode = 1;
      }
    }
  });

// --- generate-checkout ---
program
  .command('generate-checkout')
  .description('Generate a checkout QR URL (requires sandbox/production credentials)')
  .requiredOption('-a, --amount <number>', 'Payment amount')
  .option('-c, --currency <code>', 'Currency: USD (default) or KHR', 'USD')
  .option('-t, --transaction-id <id>', 'Transaction ID (auto-generated if omitted)')
  .option('--payment-option <option>', 'Payment option', 'abapay_khqr_deeplink')
  .option('--callback-url <url>', 'Callback endpoint configured in PayWay merchant settings')
  .option('--return-url <url>', 'Return URL after payment')
  .option('--cancel-url <url>', 'Cancel URL')
  .option('--polling', 'Poll transaction status after checkout (enabled by default)', true)
  .option('--no-polling', 'Disable automatic polling after checkout')
  .option('--poll-interval <seconds>', 'Polling interval in seconds (default: 5)', '5')
  .option('--poll-timeout <seconds>', 'Max polling duration in seconds (default: 600)', '600')
  .action(async (opts: Record<string, string | undefined>) => {
    console.log(`\n${c.bold('ABA PayWay SDK')} — generate checkout QR URL\n`);

    const amount = Number(opts.amount);
    const currency = (opts.currency ?? 'USD').toUpperCase() as 'USD' | 'KHR';
    const transactionId =
      opts.transactionId ?? `ck${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;

    if (!Number.isFinite(amount) || amount <= 0) {
      console.log(
        `  ${c.red('✗')} Amount must be a positive number, received: ${c.red(String(opts.amount))}`,
      );
      process.exitCode = 1;
      return;
    }

    if (!['USD', 'KHR'].includes(currency)) {
      console.log(`  ${c.red('✗')} Currency must be USD or KHR, received: ${c.red(currency)}`);
      process.exitCode = 1;
      return;
    }

    if (opts.callbackUrl) {
      console.log(
        `  ${c.yellow('⚠')} --callback-url is not sent by checkout purchase; use --return-url for the customer redirect.`,
      );
    }

    if (!assertCredentialsPresent()) {
      process.exitCode = 1;
      return;
    }

    try {
      const payway = new PayWay();

      console.log(`  ${c.dim('Calling PayWay API...')}`);

      const result = await payway.checkout.purchase({
        transactionId,
        amount,
        currency,
        paymentOption: (opts.paymentOption as 'abapay_khqr_deeplink') ?? 'abapay_khqr_deeplink',
        paymentGate: 0,
        returnUrl: opts.returnUrl,
        cancelUrl: opts.cancelUrl,
      });

      console.log(`  ${c.green('✓')} Checkout QR URL generated\n`);
      console.log(`  ${c.bold('Transaction ID:')}  ${c.cyan(transactionId)}`);
      console.log(`  ${c.bold('Amount:')}           ${c.cyan(`${amount} ${currency}`)}`);
      console.log(`  ${c.bold('Payment Option:')}   ${opts.paymentOption ?? 'abapay_khqr_deeplink'}`);
      console.log();

      if (result && typeof result === 'object') {
        const r = result as Record<string, unknown>;
        if (r.qr_string) {
          console.log(`  ${c.bold('QR String:')}`);
          console.log(`  ${c.dim(String(r.qr_string))}`);
          console.log();
        }
        if (r.abapay_deeplink) {
          console.log(`  ${c.bold('ABA Deeplink:')}`);
          console.log(`  ${c.dim(String(r.abapay_deeplink))}`);
          console.log();
        }
        if (r.checkout_qr_url) {
          console.log(`  ${c.bold('Checkout QR URL:')}`);
          console.log(`  ${c.cyan(String(r.checkout_qr_url))}`);
          console.log();
        }
      }

      // ── Polling ─────────────────────────────────────────────────────
      if ((opts as Record<string, unknown>).polling !== false) {
        await runPolling(payway, transactionId, opts);
      }
    } catch (e) {
      console.log(`  ${c.red('✗')} ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  });


// --- payment-link ---
const paymentLinkCmd = program
  .command('payment-link')
  .description('Create and inspect PayWay payment links (requires RSA credentials)');

paymentLinkCmd
  .command('create')
  .description('Create a shareable payment link via the PayWay API')
  .requiredOption('-t, --title <title>', 'Payment link title')
  .requiredOption('-a, --amount <number>', 'Payment amount')
  .requiredOption('-r, --merchant-ref-no <ref>', 'Unique merchant reference number')
  .requiredOption('--return-url <url>', 'Public HTTPS callback URL after payment')
  .option('-c, --currency <code>', 'Currency: USD (default) or KHR', 'USD')
  .option('-d, --description <text>', 'Link description (max 250 chars)')
  .option('--payment-limit <n>', 'Maximum number of payments accepted')
  .option('--expired-date <epochSeconds>', 'Expiration timestamp (epoch seconds)')
  .option('--json', 'Print the raw JSON response')
  .action(async (opts: Record<string, string | undefined>) => {
    console.log(`\n${c.bold('ABA PayWay SDK')} — create payment link\n`);

    const amount = Number(opts.amount);
    const currency = (opts.currency ?? 'USD').toUpperCase();

    if (!Number.isFinite(amount) || amount <= 0) {
      console.log(`  ${c.red('✗')} Amount must be a positive number, received: ${c.red(String(opts.amount))}`);
      process.exitCode = 1;
      return;
    }
    if (currency !== 'USD' && currency !== 'KHR') {
      console.log(`  ${c.red('✗')} Currency must be USD or KHR, received: ${c.red(currency)}`);
      process.exitCode = 1;
      return;
    }
    if (opts.description && opts.description.length > 250) {
      console.log(`  ${c.red('✗')} Description must be at most 250 characters, received: ${opts.description.length}`);
      process.exitCode = 1;
      return;
    }
    let expiredDate: number | undefined;
    if (opts.expiredDate !== undefined) {
      expiredDate = Number(opts.expiredDate);
      if (!Number.isInteger(expiredDate) || expiredDate <= 0) {
        console.log(`  ${c.red('✗')} --expired-date must be a positive whole number of epoch seconds`);
        process.exitCode = 1;
        return;
      }
    }
    let paymentLimit: number | undefined;
    if (opts.paymentLimit !== undefined) {
      paymentLimit = Number(opts.paymentLimit);
      if (!Number.isInteger(paymentLimit) || paymentLimit < 0) {
        console.log(`  ${c.red('✗')} --payment-limit must be a non-negative whole number`);
        process.exitCode = 1;
        return;
      }
    }

    if (!assertCredentialsPresent() || !assertRsaKeyPresent()) {
      process.exitCode = 1;
      return;
    }

    try {
      const payway = new PayWay();
      const result = await payway.paymentLink.create({
        title: opts.title as string,
        amount,
        currency: currency as 'USD' | 'KHR',
        merchantRefNo: opts.merchantRefNo as string,
        returnUrl: opts.returnUrl as string,
        description: opts.description,
        paymentLimit,
        expiredDate,
      });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const data = result.data;
      console.log(`  ${c.green('✓')} Payment link created\n`);
      console.log(`  ${c.bold('Share this link:')}`);
      console.log(`  ${c.cyan(data?.payment_link ?? '(not returned)')}\n`);
      console.log(`  ${c.bold('Link ID:')}        ${data?.id ?? '(not returned)'}`);
      console.log(`  ${c.dim('(save the Link ID — required for `payment-link detail`)')}`);
      console.log(`  ${c.bold('Title:')}          ${data?.title ?? opts.title}`);
      console.log(`  ${c.bold('Amount:')}         ${data?.amount ?? amount} ${data?.currency ?? currency}`);
      console.log(`  ${c.bold('Status:')}         ${data?.status ?? '-'}`);
      console.log(`  ${c.bold('Merchant Ref:')}   ${data?.merchant_ref_no ?? opts.merchantRefNo}`);
      console.log(`  ${c.bold('Transaction:')}    ${result.tran_id ?? result.status?.tran_id ?? '-'}`);
      console.log();
    } catch (e) {
      printApiError(e);
      process.exitCode = 1;
    }
  });


paymentLinkCmd
  .command('detail')
  .description('Get the status and details of a payment link')
  .requiredOption('-i, --id <id>', 'Payment link id (data.id returned by create)')
  .option('--json', 'Print the raw JSON response')
  .action(async (opts: { id: string; json?: boolean }) => {
    console.log(`\n${c.bold('ABA PayWay SDK')} — payment link details\n`);

    if (!assertCredentialsPresent() || !assertRsaKeyPresent()) {
      process.exitCode = 1;
      return;
    }

    try {
      const payway = new PayWay();
      const result = await payway.paymentLink.getDetails(opts.id);

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const data = result.data;
      console.log(`  ${c.green('✓')} Payment link details\n`);
      console.log(`  ${c.bold('Link ID:')}     ${data?.id ?? opts.id}`);
      console.log(`  ${c.bold('Title:')}       ${data?.title ?? '-'}`);
      console.log(`  ${c.bold('Amount:')}      ${data?.amount ?? '-'} ${data?.currency ?? ''}`);
      console.log(`  ${c.bold('Status:')}      ${data?.status ?? '-'}`);
      console.log(`  ${c.bold('Payments:')}    ${data?.total_trxn ?? 0} (total ${data?.total_amount ?? 0})`);
      console.log(`  ${c.bold('Created:')}     ${data?.created_at ?? '-'}`);
      console.log(`  ${c.bold('Expires:')}     ${data?.expired_date || '-'}`);
      console.log(`  ${c.bold('Link:')}        ${c.cyan(data?.payment_link ?? '-')}`);
      console.log();
    } catch (e) {
      printApiError(e);
      process.exitCode = 1;
    }
  });

// --- skills ---
const skillsCmd = program
  .command('skills')
  .description('Manage AI skill guides for coding agents');

skillsCmd
  .command('add')
  .description('Install skills for one or more agents')
  .argument('<agents...>', 'Agent names: claude, codex, opencode, cursor, copilot')
  .action(async (agents: string[]) => {
    await addSkills(agents, getSkillsDir());
  });

skillsCmd
  .command('remove')
  .description('Remove skills from one or more agents')
  .argument('<agents...>', 'Agent names: claude, codex, opencode, cursor, copilot')
  .action(async (agents: string[]) => {
    await removeSkills(agents);
  });

skillsCmd
  .command('list')
  .description('Show installed skills per agent')
  .action(async () => {
    await listSkills();
  });

skillsCmd
  .command('doctor')
  .description('Verify installation health for all agents')
  .action(async () => {
    await doctorSkills(getSkillsDir());
  });

// --- setup-webhook ---
program
  .command('setup-webhook')
  .description('Start a local webhook listener for PayWay callbacks')
  .option('-p, --port <number>', 'Port for the webhook server (default: 8443)', '8443')
  .option('--storage <type>', 'Storage backend: json or sqlite (default: auto)')
  .option('--tunnel', 'Automatically start Cloudflare Tunnel (skip prompt)')
  .option('--url <url>', 'Public webhook URL (skip prompt, no tunnel)')
  .action(async (opts: { port?: string; storage?: string; tunnel?: boolean; url?: string }) => {
    await runSetupWebhook({
      port: opts.port,
      storage: opts.storage as 'json' | 'sqlite' | undefined,
      tunnel: opts.tunnel,
      url: opts.url,
    });
  });

// --- parse ---
program.parseAsync().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
