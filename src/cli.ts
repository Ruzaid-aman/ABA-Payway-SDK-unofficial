#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sdk } from './sdk.js';
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
  PAYMENT_STATUS_LABELS,
  REFUND_ERROR_CODES,
} from './constants.js';
import {
  validateRefundAmount,
  validateTransactionId,
  validateCurrency,
  validatePositiveAmount,
} from './utils.js';
import { generateOfflineQR } from './khqr-offline.js';
import { randomBytes } from 'node:crypto';

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

// --- generate-qr ---
program
  .command('generate-qr')
  .description('Generate a QR code (online via PayWay API or offline)')
  .requiredOption('-a, --amount <number>', 'Payment amount')
  .option('-c, --currency <code>', 'Currency: USD (default) or KHR', 'USD')
  .option('-t, --transaction-id <id>', 'Transaction ID (auto-generated if omitted)')
  .option('--offline', 'Generate offline QR (no API call, no credentials needed)')
  .option('--callback-url <url>', 'Webhook callback URL (required for online mode)')
  .option('--payment-option <option>', 'Payment option for online mode', 'abapay_khqr')
  .option('--template <name>', 'QR image template for online mode', 'template2')
  .option('--merchant-id <id>', 'Merchant ID (required for offline mode)')
  .option('--ref <reference>', 'Merchant reference (required for offline mode)')
  .option('--tip <number>', 'Tip amount (offline only)')
  .option('--fee <number>', 'Fee amount (offline only)')
  .option('--type <type>', 'Transaction type: purchase, refund, cash (offline only)', 'purchase')
  .option('--save-image <path>', 'Save QR image to file (online mode only, base64 decoded)')
  .action(async (opts: Record<string, string | undefined>) => {
    console.log(`\n${c.bold('ABA PayWay SDK')} — generate QR code\n`);

    const amount = Number(opts.amount);
    const currency = (opts.currency ?? 'USD').toUpperCase() as 'USD' | 'KHR';
    const transactionId =
      opts.transactionId ?? `qr-${Date.now()}-${randomBytes(4).toString('hex')}`;

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

    if (opts.offline) {
      // ── Offline mode ──────────────────────────────────────────────────
      const merchantId = opts.merchantId;
      const ref = opts.ref;

      if (!merchantId) {
        console.log(`  ${c.red('✗')} --merchant-id is required for offline mode`);
        process.exitCode = 1;
        return;
      }
      if (!ref) {
        console.log(`  ${c.red('✗')} --ref is required for offline mode`);
        process.exitCode = 1;
        return;
      }

      try {
        const qrString = generateOfflineQR({
          merchantId,
          transactionId,
          amount,
          currency,
          merchantRef: ref,
          tipAmount: opts.tip ? Number(opts.tip) : undefined,
          feeAmount: opts.fee ? Number(opts.fee) : undefined,
          transactionType: (opts.type as 'purchase' | 'refund' | 'cash') ?? 'purchase',
        });

        console.log(`  ${c.green('✓')} Offline QR generated\n`);
        console.log(`  ${c.bold('Transaction ID:')}  ${c.cyan(transactionId)}`);
        console.log(`  ${c.bold('Amount:')}           ${c.cyan(`${amount} ${currency}`)}`);
        console.log(`  ${c.bold('Merchant ID:')}      ${merchantId}`);
        console.log(`  ${c.bold('Reference:')}        ${ref}`);
        if (opts.tip) console.log(`  ${c.bold('Tip:')}              ${opts.tip} ${currency}`);
        if (opts.fee) console.log(`  ${c.bold('Fee:')}              ${opts.fee} ${currency}`);
        console.log(`  ${c.bold('Type:')}             ${opts.type ?? 'purchase'}`);
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
      const callbackUrl = opts.callbackUrl;

      if (!callbackUrl) {
        console.log(`  ${c.red('✗')} --callback-url is required for online mode`);
        console.log(
          `  ${c.dim('Tip: use --offline for offline QR generation without credentials')}`,
        );
        process.exitCode = 1;
        return;
      }

      try {
        const { PayWay } = await import('./client.js');
        const payway = new PayWay();
        const qr = await payway.qr.generateQr({
          transactionId,
          amount,
          currency,
          paymentOption: opts.paymentOption ?? 'abapay_khqr',
          callbackUrl,
          qrImageTemplate: opts.template ?? 'template2',
        });

        console.log(`  ${c.green('✓')} Online QR generated via PayWay API\n`);
        console.log(`  ${c.bold('Transaction ID:')}  ${c.cyan(transactionId)}`);
        console.log(`  ${c.bold('Amount:')}           ${c.cyan(`${amount} ${currency}`)}`);
        console.log(`  ${c.bold('Payment Option:')}   ${opts.paymentOption ?? 'abapay_khqr'}`);
        console.log(`  ${c.bold('Callback URL:')}     ${callbackUrl}`);
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
          const imgBuffer = Buffer.from(qr.qrImage, 'base64');
          writeFileSync(opts.saveImage, imgBuffer);
          console.log(`  ${c.green('✓')} Image saved to ${c.cyan(opts.saveImage)}`);
          console.log();
        } else if (qr.qrImage) {
          console.log(`  ${c.bold('QR Image:')} base64 data available (${qr.qrImage.length} chars)`);
          console.log(`  ${c.dim('Use --save-image <path> to save as PNG')}`);
          console.log();
        }
      } catch (e) {
        console.log(`  ${c.red('✗')} ${e instanceof Error ? e.message : String(e)}`);
        process.exitCode = 1;
      }
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

// --- parse ---
program.parse();
