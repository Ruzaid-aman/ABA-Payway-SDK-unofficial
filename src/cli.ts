#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import { Command, Help } from 'commander';
import { confirmCheckoutSubmit } from './cli/flows/checkout-flow.js';
import { chooseNextStep } from './cli/flows/next-steps.js';
import { collectQrParams } from './cli/flows/qr-flow.js';
import { loadDotEnvIntoProcess } from './cli/dotenv.js';
import { explainAll, explainPayWayCode } from './cli/explain-code.js';
import { renderFirstPaymentQuickstart } from './cli/first-payment.js';
import { renderBanner } from './cli/ui/banner.js';
import { renderGroupedHelp, unknownCommandSuggestion, unknownOptionSuggestion } from './cli/ui/help.js';
import { formatClock, mapPollOutcomeToExitCode } from './cli/journey.js';
import { resolvePromptMode } from './cli/ui/mode.js';
import { withOneShotSpinner } from './cli/ui/one-shot.js';
import { createPollDisplay } from './cli/ui/poll-display.js';
import { CliCancelled, createClackIO } from './cli/ui/prompts.js';
import type { PaymentIO } from './cli/ui/prompts.js';
import { currentPalette, setColorOverride } from './cli/ui/theme.js';
import type { AnsiPalette } from './cli/ui/theme.js';
import { suggestMessage } from './cli/ui/suggest.js';
import { renderQrToTerminal, shouldAutoRenderQr } from './cli/terminal-qr.js';
import { registerAgentCommands } from './cli/commands/agent.js';
import { registerOnboardCommand } from './cli/commands/onboard.js';
import { runDoctor } from './cli/commands/doctor.js';
import { runInit } from './cli/commands/init.js';
import { runSetupWebhook } from './cli/commands/setup-webhook.js';
import { addSkills, doctorSkills, listSkills, removeSkills } from './cli/commands/skills.js';
import { readMaskedInput } from './cli/masked-input.js';
import { loadPaymentLinkImage } from './cli/payment-link-image.js';
import { PayWay } from './client.js';
import type { ItemEntry, PaymentLinkImage } from './client.js';
import { hasBlockingIssues, validatePayWayEnv, validateRequiredCredentials } from './config/envValidator.js';
import {
  activateProfile,
  addProfile,
  getProfileByName,
  loadProfileStore,
  removeProfile,
  saveProfileStore,
  setDefaultProfile,
} from './config/profiles.js';
import {
  PAYMENT_OPTIONS,
  PAYMENT_STATUS_CODES,
  PAYMENT_STATUS_LABELS,
  QR_LIFETIME_MIN_SECONDS,
  QR_TEMPLATE_NAMES,
  REFUND_ERROR_CODES,
} from './constants.js';
import { listSandboxBeneficiaries } from './sandbox-beneficiaries.js';
import {
  PayWayAPIError,
  PayWayBusinessError,
  PayWayConfigError,
  PayWayError,
  PayWayNetworkError,
  PayWayRateLimitError,
  PollingAbortedError,
} from './errors.js';
import type { KhqrCallbackEnrollment, KhqrCallbackVerification, KhqrMerchantConfiguration } from './khqr-config.js';
import { openImageInDefaultViewer } from './open-image.js';
import { sdk } from './sdk.js';
import { formatTestReport } from './test/index.js';
import { validatePositiveAmount, validateRefundAmount, validateTransactionId } from './utils.js';

// ---------------------------------------------------------------------------
// Load .env file if present (shared parser; supports multi-line quoted PEMs)
// ---------------------------------------------------------------------------
loadDotEnvIntoProcess(process.cwd());

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

// Parse a `--items`/`--custom-fields`/`--payout`/`--return-deeplink` value that
// may be either inline JSON or a raw string (the SDK helpers accept both and
// base64-encode object/array forms before signing). Returns `undefined` when
// omitted, the parsed JSON value when it parses, otherwise the raw string.
function parseJsonOrString(raw: string | undefined): unknown {
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// ---------------------------------------------------------------------------
// Standardized CLI exit codes (agent-friendly):
//   0 = success | 1 = validation/input error | 2 = PayWay API failure | 3 = timeout/network/rate-limit
// ---------------------------------------------------------------------------
const EXIT_OK = 0;
const EXIT_VALIDATION = 1;
const EXIT_API_FAILURE = 2;
const EXIT_NETWORK = 3;

function classifyError(e: unknown): number {
  if (e instanceof PollingAbortedError) return e.reason === 'max_consecutive_errors' ? EXIT_API_FAILURE : EXIT_NETWORK;
  if (e instanceof PayWayNetworkError || e instanceof PayWayRateLimitError) return EXIT_NETWORK;
  if (e instanceof PayWayAPIError) {
    if (e.statusCode === undefined && e.retryable === true) return EXIT_NETWORK;
    return EXIT_API_FAILURE;
  }
  if (e instanceof PayWayError) return EXIT_VALIDATION;
  return EXIT_VALIDATION;
}

// ---------------------------------------------------------------------------
// Shared API error printer (includes PayWay code hints). Returns exit code.
// ---------------------------------------------------------------------------
function printApiError(e: unknown): number {
  if (e instanceof PayWayAPIError) {
    console.log(`  ${c.red('✗')} ${e.message}`);
    if (e.paywayCode) console.log(`  ${c.dim(`PayWay code: ${e.paywayCode}`)}`);
    if (e.paywayCode === 'PTL04') {
      console.log(`  ${c.dim('Hint: currency and return_url are required; description max 250 chars.')}`);
    } else if (e.paywayCode === '96') {
      console.log(`  ${c.dim('Hint: check the link id — use the data.id value returned by create.')}`);
    } else if (e.paywayCode === '49') {
      console.log(`  ${c.dim('Hint: transaction-list dates must be "YYYY-MM-DD HH:mm:ss" (sandbox-verified format).')}`);
    } else if (e.paywayCode === '8' || e.paywayCode === '15' || e.paywayCode === '26') {
      console.log(
        `  ${c.dim('Hint: PayWay rejected the merchant identity — verify PAYWAY_MERCHANT_ID (env or active profile) and that it belongs to this environment. Run: payway-sdk profiles list')}`,
      );
    } else if (e.paywayCode === '429' || e instanceof PayWayRateLimitError) {
      console.log(
        `  ${c.dim('Hint: strict documented cap hit (sandbox sends HTTP 403 + body code 429). Wait for the window to reset, or use check-transaction (600 req/s) for status-only reads.')}`,
      );
    } else if (/HTML page instead of JSON/.test(e.message)) {
      console.log(`  ${c.dim('Hint: a parameter value was rejected server-side — try removing optional params (e.g. payment_gate).')}`);
    } else if (e.paywayCode === '12' || e.paywayCode === 'PTL147') {
      console.log(
        `  ${c.dim('Hint: payout currency must match the beneficiary account currency AND your merchant credential currency — send USD to a USD account, KHR to a KHR account.')}`,
      );
    } else if (e.paywayCode === '37' || e.paywayCode === 'PTL146' || e.paywayCode === 'PTL-PAYOUT-37' || e.paywayCode === 'PTL46') {
      console.log(
        `  ${c.dim('Hint: the payout beneficiary is not whitelisted — register it first via addBeneficiary() (or the payment-link whitelist).')}`,
      );
    } else if (e.paywayCode === 'PTL-PAYOUT-36') {
      console.log(
        `  ${c.dim('Hint: the sum of beneficiary amounts must equal the payout (transaction complete) amount.')}`,
      );
    } else if (e.statusCode === 415) {
      console.log(
        `  ${c.dim('Hint: the direct payout API requires Content-Type: application/json — ensure the request body is JSON, not form-encoded.')}`,
      );
    }
    return classifyError(e);
  }
  console.log(`  ${c.red('✗')} ${e instanceof Error ? e.message : String(e)}`);
  return classifyError(e);
}

// ---------------------------------------------------------------------------
// ANSI helpers (no external deps) — palette from the TUI theme layer, which
// resolves the --no-color override, NO_COLOR/FORCE_COLOR env, and TTY state.
// Re-resolved in the program's preAction hook once options are parsed.
// ---------------------------------------------------------------------------
let c: AnsiPalette = currentPalette();

const executableDirectory = path.dirname(process.argv[1] ?? process.cwd());

interface GenerateQrCommandOptions {
  amount?: string;
  currency?: string;
  transactionId?: string;
  offline?: boolean;
  callbackUrl?: string;
  paymentOption?: string;
  template?: string;
  lifetime?: string;
  ref?: string;
  saveImage?: string | boolean;
  openImage?: boolean;
  showQr?: boolean;
  nonInteractive?: boolean;
  polling?: boolean;
  pollInterval?: string;
  pollTimeout?: string;
  // B6 parity: the 9 live-documented optional generate-qr params.
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  items?: string;
  returnDeeplink?: string;
  customFields?: string;
  returnParams?: string;
  payout?: string;
}

// ---------------------------------------------------------------------------
// Shared polling runner for generate-qr and generate-checkout.
// With a clack PaymentIO the loop renders through an in-place spinner
// (createPollDisplay) and offers a next-step picker on APPROVED; with a null
// IO the historical plain-line output is produced byte-for-byte.
// ---------------------------------------------------------------------------
type PollingOptions = { pollInterval?: string; pollTimeout?: string; json?: boolean };

async function runNextStepPicker(
  payway: InstanceType<typeof PayWay>,
  transactionId: string,
  opts: PollingOptions,
  io: PaymentIO,
): Promise<void> {
  try {
    const choice = await chooseNextStep(io, {
      transactionId,
      refundCommand: `payway-sdk refund -t ${transactionId} -a <amount>`,
      approved: true,
    });
    if (choice === 'detail') {
      const detail = await withOneShotSpinner(io, 'Fetching transaction detail…', () =>
        payway.checkout.getTransactionDetail(transactionId),
      );
      const data = ((detail as Record<string, unknown>).data ?? {}) as Record<string, unknown>;
      console.log(`  ${c.bold('Detail:')} ${transactionId}`);
      for (const key of ['payment_status', 'payment_amount', 'apv', 'transaction_date']) {
        if (data[key] !== undefined) console.log(`  ${key.padEnd(20)} ${c.cyan(String(data[key]))}`);
      }
      console.log();
    } else if (choice === 'watch') {
      await runPolling(payway, transactionId, opts, io);
    } else if (choice === 'print-refund') {
      console.log(`  payway-sdk refund -t ${transactionId} -a <amount>`);
      console.log();
    }
  } catch (error) {
    if (error instanceof CliCancelled) {
      console.log('  Cancelled by user.');
      process.exit(130);
    }
    throw error;
  }
}

async function runPolling(
  payway: InstanceType<typeof PayWay>,
  transactionId: string,
  opts: PollingOptions,
  io: PaymentIO | null = null,
): Promise<{ terminalReached: boolean; status?: string; abortedReason?: 'max_duration_exceeded' | 'max_consecutive_errors' | 'caller_aborted' }> {
  const intervalMs = opts.pollInterval ? Number(opts.pollInterval) * 1000 : 5_000;
  const maxDurationMs = opts.pollTimeout ? Number(opts.pollTimeout) * 1000 : 600_000;
  const asJson = opts.json === true;
  const display = io === null ? null : createPollDisplay(io, { transactionId, intervalMs, maxDurationMs });

  if (!asJson && display === null) {
    console.log(`  ${c.bold('Polling:')} ${c.cyan(transactionId)}`);
    console.log(`    Interval:     ${c.cyan(`${intervalMs / 1000}s`)}`);
    console.log(`    Max duration: ${c.cyan(`${maxDurationMs / 1000}s`)}`);
    console.log();
  }

  const startTime = Date.now();
  const emit = (line: string): void => console.log(asJson ? line : `  ${line}`);

  try {
    for await (const result of payway.checkout.pollTransactionStatus(transactionId, {
      intervalMs,
      maxDurationMs,
    })) {
      const elapsed = formatClock(Date.now() - startTime);

      if (result.paymentStatus.startsWith('ERROR:')) {
        if (asJson) {
          emit(
            JSON.stringify({
              event: 'poll',
              attempt: result.attempt,
              error: result.paymentStatus,
              timestamp: result.timestamp,
            }),
          );
        } else if (display) {
          display.onEvent({
            kind: 'error-attempt',
            attempt: result.attempt,
            paymentStatus: result.paymentStatus,
            durationMs: result.durationMs,
            elapsedMs: Date.now() - startTime,
          });
        } else {
          emit(
            `${c.yellow('⚠')} [${elapsed}] Poll #${result.attempt}: ${c.yellow(result.paymentStatus)} ${c.dim(`(${result.durationMs}ms)`)}`,
          );
        }
        continue;
      }

      if (result.isTerminal) {
        if (asJson) {
          emit(
            JSON.stringify({
              event: 'terminal',
              transactionId,
              payment_status: result.paymentStatus,
              attempt: result.attempt,
              elapsed_seconds: (Date.now() - startTime) / 1000,
              response: result.response,
            }),
          );
        } else if (display) {
          display.onEvent({
            kind: 'terminal',
            attempt: result.attempt,
            paymentStatus: result.paymentStatus,
            durationMs: result.durationMs,
            elapsedMs: Date.now() - startTime,
          });
          emit('');
          emit(c.green(`Payment ${result.paymentStatus.toLowerCase()}.`));
          emit('');
          if (result.paymentStatus === 'APPROVED') {
            emit(c.dim(`Next: payway-sdk transaction-detail -t ${transactionId}`));
            emit(c.dim(`      or refund it:     payway-sdk refund -t ${transactionId} -a <amount>`));
          } else {
            emit(c.dim(`Next: create a new transaction with generate-qr or generate-checkout.`));
          }
          emit('');
        } else {
          const icon = result.paymentStatus === 'APPROVED' ? c.green('✓') : c.red('✗');
          emit(`${icon} [${elapsed}] Poll #${result.attempt}: ${c.bold(result.paymentStatus)} ${c.dim(`(${result.durationMs}ms)`)}`);
          emit('');
          emit(c.green(`Payment ${result.paymentStatus.toLowerCase()}.`));
          emit('');
          if (result.paymentStatus === 'APPROVED') {
            emit(c.dim(`Next: payway-sdk transaction-detail -t ${transactionId}`));
            emit(c.dim(`      or refund it:     payway-sdk refund -t ${transactionId} -a <amount>`));
          } else {
            emit(c.dim(`Next: create a new transaction with generate-qr or generate-checkout.`));
          }
          emit('');
        }
        if (display && result.paymentStatus === 'APPROVED' && io !== null) {
          await runNextStepPicker(payway, transactionId, opts, io);
        }
        return { terminalReached: true, status: result.paymentStatus };
      }

      if (asJson) {
        emit(
          JSON.stringify({
            event: 'poll',
            attempt: result.attempt,
            payment_status: result.paymentStatus,
            timestamp: result.timestamp,
          }),
        );
      } else if (display) {
        display.onEvent({
          kind: 'attempt',
          attempt: result.attempt,
          paymentStatus: result.paymentStatus,
          elapsedMs: Date.now() - startTime,
        });
      } else {
        const remaining = formatClock(maxDurationMs - (Date.now() - startTime));
        emit(`${c.dim('○')} [${elapsed} elapsed / ${remaining} left] Poll #${result.attempt}: ${result.paymentStatus}`);
      }
    }
    return { terminalReached: false };
  } catch (error) {
    if (error instanceof PollingAbortedError) {
      if (asJson) {
        emit(JSON.stringify({ event: 'aborted', reason: error.reason, totalAttempts: error.totalAttempts, lastStatus: error.lastStatus }));
      } else if (display) {
        display.onEvent({ kind: 'aborted', reason: error.reason, totalAttempts: error.totalAttempts });
      } else {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        emit('');
        emit(
          `${c.yellow('⚠')} Polling stopped: ${c.yellow(error.reason)} after ${c.bold(String(error.totalAttempts))} attempts (${elapsed}s elapsed)`,
        );
        if (error.lastStatus) emit(c.dim(`Last status: ${error.lastStatus}`));
        emit('');
      }
      return { terminalReached: false, abortedReason: error.reason };
    }
    throw error;
  } finally {
    display?.dispose();
  }
}

/** Typed readline factory (avoids `as any` on process.stdin/stdout). */
function createCliReadline(terminal = false): readline.Interface {
  return readline.createInterface({
    input: process.stdin as unknown as NodeJS.ReadableStream,
    output: process.stdout as unknown as NodeJS.WritableStream,
    terminal,
  });
}

async function promptConfirmation(message: string, rl?: readline.Interface): Promise<boolean> {
  const rlInstance = rl ?? createCliReadline(false);
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

function promptInput(rl: readline.Interface, message: string): Promise<string> {
  return new Promise((resolve) => rl.question(message, resolve));
}

/** Normalize a commander boolean flag that may arrive typed as string|undefined. */
function asBoolFlag(v: unknown): boolean | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'boolean') return v;
  if (v === 'false') return false;
  if (v === 'true') return true;
  return undefined;
}

async function promptLifetimeOverride(current: number, rl?: readline.Interface): Promise<number | null> {
  const rlInstance = rl ?? createCliReadline(false);
  try {
    const answer = await new Promise<string>((resolve) => {
      rlInstance.question(
        `  Modify lifetime? Current: ${current}s. Enter new value (or press Enter to skip): `,
        (ans) => {
          if (!rl) rlInstance.close();
          resolve(ans);
        },
      );
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
    const pkg = JSON.parse(readFileSync(path.join(executableDirectory, '..', 'package.json'), 'utf8'));
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

/**
 * Top-level help with the flat "Commands:" list replaced by the curated,
 * grouped overview (src/cli/ui/help.ts). Only the program uses this subclass;
 * subcommand help keeps commander's default rendering.
 */
class GroupedProgramHelp extends Help {
  override formatHelp(cmd: Command, helper: Help): string {
    const termWidth = helper.padWidth(cmd, helper);
    const output: string[] = [`${helper.styleTitle('Usage:')} ${helper.styleUsage(helper.commandUsage(cmd))}`, ''];

    const description = helper.commandDescription(cmd);
    if (description.length > 0) {
      output.push(helper.boxWrap(helper.styleCommandDescription(description), helper.helpWidth ?? 80), '');
    }

    // Grouped command overview — renderGroupedHelp keeps the curated group
    // order and appends any ungrouped registered command under "Other:".
    const summaries = new Map(cmd.commands.map((sub) => [sub.name(), String(helper.subcommandDescription(sub) ?? '')]));
    const grouped = renderGroupedHelp(cmd.commands.map((sub) => sub.name()));
    const nameWidth = grouped.reduce(
      (max, line) => (line.startsWith('  ') ? Math.max(max, line.trim().length) : max),
      0,
    );
    for (const line of grouped) {
      if (!line.startsWith('  ')) {
        output.push(helper.styleTitle(line));
        continue;
      }
      const name = line.trim();
      output.push(helper.formatItem(name, nameWidth, helper.styleSubcommandDescription(summaries.get(name) ?? ''), helper));
    }
    output.push('');

    // Arguments
    const argumentList = helper.visibleArguments(cmd).map((argument) =>
      helper.formatItem(
        helper.styleArgumentTerm(helper.argumentTerm(argument)),
        termWidth,
        helper.styleArgumentDescription(helper.argumentDescription(argument)),
        helper,
      ),
    );
    if (argumentList.length > 0) {
      output.push(helper.styleTitle('Arguments:'), ...argumentList, '');
    }

    // Options
    const optionList = helper.visibleOptions(cmd).map((option) =>
      helper.formatItem(
        helper.styleOptionTerm(helper.optionTerm(option)),
        termWidth,
        helper.styleOptionDescription(helper.optionDescription(option)),
        helper,
      ),
    );
    if (optionList.length > 0) {
      output.push(helper.styleTitle('Options:'), ...optionList, '');
    }

    return output.join('\n');
  }
}

/** Grouped command lines (with descriptions) for the interactive bare invocation. */
function renderBareInvocationHelp(): void {
  const palette = currentPalette();
  for (const line of renderBanner(readPackageVersion(), palette)) {
    console.log(line);
  }
  console.log();
  const summaries = new Map(program.commands.map((sub) => [sub.name(), sub.summary() || sub.description()]));
  const grouped = renderGroupedHelp(program.commands.map((sub) => sub.name()));
  const nameWidth = grouped.reduce((max, line) => (line.startsWith('  ') ? Math.max(max, line.trim().length) : max), 0);
  for (const line of grouped) {
    if (!line.startsWith('  ')) {
      console.log(palette.bold(line));
      continue;
    }
    const name = line.trim();
    const summary = summaries.get(name) ?? '';
    console.log(`  ${name.padEnd(nameWidth)}${summary ? `  ${summary}` : ''}`);
  }
  console.log();
  console.log(palette.dim('Exit codes: 0 success · 1 input/validation · 2 PayWay API failure · 3 network/timeout/rate-limit.'));
  console.log();
}

const program = new Command();
program.createHelp = () => new GroupedProgramHelp();

program
  .name('payway-sdk')
  .description('CLI for the ABA PayWay TypeScript SDK')
  .version(readPackageVersion())
  .option('--profile <name>', 'Use a saved credential profile for this command')
  .option('--no-color', 'Disable ANSI colors in output')
  .showSuggestionAfterError()
  .addHelpText(
    'after',
    `
${'Journey examples'}:
  ${'$ payway-sdk init && payway-sdk doctor --live'.padEnd(0)}   set up, then prove a real sandbox round-trip
  $ payway-sdk generate-qr -a 5.00                create QR (scans right in your terminal) and poll until paid
  $ payway-sdk check-transaction -t <id>          one-shot status check
  $ payway-sdk poll-transaction -t <id> --json    watch a transaction until terminal status (agent-friendly)
  $ payway-sdk transaction-list                   today's transactions
  $ payway-sdk refund -t <id> -a 2.00             partial refund with pre-flight balance check
  $ payway-sdk explain PTL36                      decode any PayWay error code

Exit codes: 0 success · 1 input/validation · 2 PayWay API failure · 3 network/timeout/rate-limit.
`,
  );

function isProfilesCommand(command: Command): boolean {
  let current: Command | null = command;
  while (current) {
    if (current.name() === 'profiles') return true;
    current = current.parent ?? null;
  }
  return false;
}

function activateSelectedProfile(command: Command): void {
  if (isProfilesCommand(command)) return;
  const selectedName =
    program.opts<{ profile?: string }>().profile ??
    process.env.PAYWAY_PROFILE ??
    loadProfileStore().defaultProfile ??
    loadProfileStore().activeProfile;
  if (!selectedName) return;

  const profile = getProfileByName(loadProfileStore(), selectedName);
  if (!profile) throw new Error(`Credential profile "${selectedName}" does not exist`);
  activateProfile(profile);
  console.log(`  ${c.dim(`Using profile: ${profile.name} (${profile.environment})`)}`);
}

program.hook('preAction', (_thisCommand, actionCommand) => {
  // Re-resolve the palette per command so the global --no-color flag
  // (opts.color === false when passed; true by default via the negatable
  // option's implicit default) takes effect before any output.
  const optsColor = program.opts<{ color?: boolean }>().color === false ? false : undefined;
  setColorOverride(optsColor);
  c = currentPalette();
  activateSelectedProfile(actionCommand);
});

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
  .option('--live', 'Also perform a real sandbox round-trip (exchange-rate) when credentials are present')
  .action(async (opts: { live?: boolean }) => {
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

    // Live probe depends on credentials, NOT cosmetic rows like framework detection
    // (the SDK's own repo fails that check and previously could never go live).
    const liveGateIds = new Set(['env-PAYWAY_ENV', 'env-PAYWAY_MERCHANT_ID', 'env-PAYWAY_API_KEY']);
    const blockingCheckIds = new Set([...liveGateIds, 'env-PAYWAY_CALLBACK_URL']);
    const credChecks = result.checks.filter((c) => liveGateIds.has(c.id));
    const credFailures = credChecks.filter((c) => !c.ok);
    const blockingFailures = result.checks.filter((c) => blockingCheckIds.has(c.id) && !c.ok);
    let liveStatus: 'ok' | 'fail' | undefined;

    if (opts.live && process.env.PAYWAY_MERCHANT_ID && process.env.PAYWAY_API_KEY) {
      if (credFailures.length > 0) {
        console.log(`  ${c.dim('(skipping live probe — fix credential checks first)')}\n`);
      } else {
        process.stdout.write(`  ${c.dim('Live probe: calling PayWay sandbox (exchange-rate)...')} `);
        const start = Date.now();
        try {
          const payway = new PayWay({ rateLimitThrottling: false });
          await payway.checkout.getExchangeRate();
          const ms = Date.now() - start;
          console.log(`${c.green('✓')} ${c.dim(`round-trip ${ms}ms`)}`);
          liveStatus = 'ok';
        } catch (e) {
          console.log(c.red('✗'));
          printApiError(e);
          liveStatus = 'fail';
        }
        console.log();
      }
    } else if (opts.live && credChecks.length === 0) {
      console.log(`  ${c.dim('(live probe skipped — no PAYWAY_MERCHANT_ID / PAYWAY_API_KEY configured)')}\n`);
    }

    if (blockingFailures.length === 0 && liveStatus !== 'fail') {
      console.log(`  ${c.green('All credential & connectivity checks passed.')}\n`);
      if (!result.allHealthy) {
        const cosmetic = result.checks.filter((c) => !c.ok && !c.id.startsWith('env-'));
        for (const c2 of cosmetic) {
          console.log(`  ${c.dim(`ℹ ${c2.label}: ${c2.detail} — advisory only for SDK/CLI usage.`)}`);
        }
        console.log();
      }
      if (!opts.live) {
        console.log(`  ${c.dim('Tip: run')} ${c.cyan('payway-sdk doctor --live')} ${c.dim('to verify a real sandbox round-trip.')}`);
        console.log();
      }
      process.exitCode = EXIT_OK;
    } else {
      const hasCoreCredentials = credFailures.length === 0;
      if (hasCoreCredentials) {
        for (const line of renderFirstPaymentQuickstart()) {
          console.log(`  ${line}`);
        }
        console.log();
      }
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
        display = val.length > 12 ? `${val.slice(0, 8)}${'•'.repeat(Math.min(val.length - 8, 16))}` : '••••••••';
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

// --- explain ---
program
  .command('explain')
  .description('Decode a PayWay error/status code (e.g. explain PTL36, explain 49). No credentials needed.')
  .argument('[code]', 'PayWay code to explain — omit to list all known codes')
  .action((code?: string) => {
    console.log(`\n${c.bold('ABA PayWay SDK')} — code reference\n`);
    if (!code) {
      for (const e of explainAll()) {
        console.log(`  ${c.cyan(e.code.padEnd(7))} ${c.bold(`[${e.family}]`).padEnd(0)} ${e.title}`);
        if (e.hint) console.log(`  ${''.padEnd(7)} ${c.dim(e.hint)}`);
      }
      console.log();
      return;
    }
    const explanation = explainPayWayCode(code);
    if (!explanation) {
      console.log(`  ${c.yellow('?')} Unknown or undocumented code: ${c.bold(code)}`);
      console.log(`  ${c.dim('Run')} ${c.cyan('payway-sdk explain')} ${c.dim('to list all known codes.')}`);
      console.log();
      return;
    }
    console.log(`  ${c.cyan(explanation.code)}  ${c.bold(explanation.title)}  ${c.dim(`(${explanation.family})`)}`);
    if (explanation.hint) console.log(`  → ${explanation.hint}`);
    console.log();
  });

// --- get-transactions-by-ref ---
program
  .command('get-transactions-by-ref')
  .description('Get up to 50 transactions by merchant reference')
  .requiredOption('-r, --merchant-ref <reference>', 'Merchant reference to look up')
  .option('--request-time <YYYYMMDDHHmmss>', 'Optional PayWay request timestamp')
  .action(async (opts: { merchantRef: string; requestTime?: string }) => {
    if (!assertCredentialsPresent()) {
      process.exitCode = 1;
      return;
    }

    try {
      const payway = new PayWay();
      const result = await payway.khqr.getTransactionsByMerchantRef(opts.merchantRef, opts.requestTime);
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      process.exitCode = printApiError(error);
    }
  });

// --- check-transaction ---
program
  .command('check-transaction')
  .description('Check the payment status of a transaction (rate limit: 600/s)')
  .requiredOption('-t, --transaction-id <id>', 'Transaction ID')
  .option('--json', 'Print the raw JSON response')
  .action(async (opts: { transactionId: string; json?: boolean }) => {
    if (!assertCredentialsPresent()) {
      process.exitCode = EXIT_VALIDATION;
      return;
    }
    try {
      validateTransactionId(opts.transactionId);
      const payway = new PayWay();
      const result = await payway.checkout.checkTransaction(opts.transactionId);
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      const data = (result as Record<string, unknown>).data as Record<string, unknown> | undefined;
      const status = String(data?.payment_status ?? 'UNKNOWN');
      const icon =
        status === 'APPROVED' ? c.green('✓') : status === 'PENDING' ? c.yellow('⚠') : c.red('✗');
      console.log(`  ${icon} ${c.bold(opts.transactionId)} → ${c.bold(status)}`);
      if (data?.payment_status_code !== undefined) {
        console.log(`  ${c.dim(`status code: ${String(data.payment_status_code)} (${PAYMENT_STATUS_LABELS[Number(data.payment_status_code)] ?? '?'})`)}`);
      }
    } catch (error) {
      if (error instanceof Error && !(error instanceof PayWayError)) {
        // Local validation failure
        console.log(`  ${c.red('✗')} ${error.message}`);
        process.exitCode = EXIT_VALIDATION;
        return;
      }
      process.exitCode = printApiError(error);
    }
  });

// --- poll-transaction ---
program
  .command('poll-transaction')
  .description('Poll a transaction until it reaches a terminal status (APPROVED, DECLINED, CANCELLED, REFUNDED)')
  .requiredOption('-t, --transaction-id <id>', 'Transaction ID to watch')
  .option('--poll-interval <seconds>', 'Seconds between status checks (default: 5)', '5')
  .option('--poll-timeout <seconds>', 'Give up after this many seconds — exit code 3, outcome unknown (default: 600)', '600')
  .option('--json', 'Emit one JSON object per event (poll/terminal/aborted) for agents')
  .action(async (opts: { transactionId: string; pollInterval: string; pollTimeout: string; json?: boolean }) => {
    if (!assertCredentialsPresent()) {
      process.exitCode = EXIT_VALIDATION;
      return;
    }
    try {
      validateTransactionId(opts.transactionId);
    } catch (e) {
      console.log(`  ${c.red('✗')} ${(e as Error).message}`);
      process.exitCode = EXIT_VALIDATION;
      return;
    }

    try {
      const payway = new PayWay();
      const outcome = await runPolling(payway, opts.transactionId, {
        pollInterval: opts.pollInterval,
        pollTimeout: opts.pollTimeout,
        json: opts.json,
      });
      process.exitCode = mapPollOutcomeToExitCode(outcome);
    } catch (error) {
      process.exitCode = printApiError(error);
    }
  });

// --- close-transaction ---
program
  .command('close-transaction')
  .description('Void/close an open transaction before it is paid')
  .requiredOption('-t, --transaction-id <id>', 'Transaction ID')
  .option('-y, --force', 'Skip confirmation prompt (for scripts/agents)')
  .option('--json', 'Print the raw JSON response')
  .action(async (opts: { transactionId: string; force?: boolean; json?: boolean }) => {
    const io = resolvePromptMode({ json: opts.json, force: opts.force }) === 'clack' ? createClackIO() : null;
    if (!assertCredentialsPresent()) {
      process.exitCode = EXIT_VALIDATION;
      return;
    }
    try {
      validateTransactionId(opts.transactionId);
      if (!opts.force && !opts.json) {
        const confirmed = io
          ? await io.confirm({ message: `Void/close transaction ${opts.transactionId}? This cannot be undone.`, initial: false })
          : await promptConfirmation(`  Void/close transaction ${c.cyan(opts.transactionId)}? This cannot be undone. (y/n): `);
        if (!confirmed) {
          console.log(`  ${c.yellow('Cancelled by user.')}`);
          process.exitCode = EXIT_OK;
          return;
        }
      }
      const payway = new PayWay();
      const result = io
        ? await withOneShotSpinner(io, 'Closing transaction…', () => payway.checkout.closeTransaction(opts.transactionId))
        : await payway.checkout.closeTransaction(opts.transactionId);
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`  ${c.green('✓')} Close request accepted for ${c.bold(opts.transactionId)}`);
      console.log(`  ${c.dim(JSON.stringify(result).slice(0, 200))}`);
      console.log(`  ${c.dim(`Note: unpaid closed transactions may keep reporting PENDING — verify with: payway-sdk check-transaction -t ${opts.transactionId}`)}`);
      process.exitCode = EXIT_OK;
    } catch (error) {
      if (error instanceof CliCancelled) {
        console.log('  Cancelled by user.');
        process.exit(130);
      }
      process.exitCode = printApiError(error);
    }
  });

// --- transaction-detail ---
program
  .command('transaction-detail')
  .description('Get full detail for one transaction (strict rate limit: 10/min)')
  .requiredOption('-t, --transaction-id <id>', 'Transaction ID')
  .option(
    '--wait <seconds>',
    'Retry until the transaction is indexed (detail lags creation by ~5s; check-transaction sees it instantly)',
    '0',
  )
  .option('--json', 'Print the raw JSON response')
  .action(async (opts: { transactionId: string; wait?: string; json?: boolean }) => {
    if (!assertCredentialsPresent()) {
      process.exitCode = EXIT_VALIDATION;
      return;
    }
    try {
      validateTransactionId(opts.transactionId);
      const payway = new PayWay();
      const waitMs = (Number.parseInt(opts.wait ?? '0', 10) || 0) * 1000;
      const deadline = Date.now() + waitMs;

      let result: Awaited<ReturnType<typeof payway.checkout.getTransactionDetail>> | undefined;
      for (;;) {
        try {
          result = await payway.checkout.getTransactionDetail(opts.transactionId);
          break;
        } catch (error) {
          const notIndexed = error instanceof PayWayBusinessError && error.paywayCode === '6';
          if (!notIndexed || Date.now() >= deadline) {
            if (notIndexed && waitMs === 0) {
              console.log(
                `  ${c.dim('Hint: detail lags creation by ~5s in sandbox. Retry, use --wait <seconds>, or check status instantly with:')} payway-sdk check-transaction -t ${opts.transactionId}`,
              );
            }
            throw error;
          }
          console.log(`  ${c.dim(`not indexed yet — retrying for up to ${Math.ceil(waitMs / 1000)}s...`)}`);
          await new Promise((resolve) => setTimeout(resolve, 2_000));
        }
      }

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      const data = (result as Record<string, unknown>).data as Record<string, unknown> | undefined;
      console.log(`  ${c.bold('Detail:')} ${opts.transactionId}`);
      for (const key of [
        'payment_status',
        'payment_status_code',
        'payment_amount',
        'original_amount',
        'refund_amount',
        'payment_currency',
        'apv',
        'payment_type',
        'transaction_date',
      ]) {
        if (data?.[key] !== undefined) console.log(`  ${key.padEnd(20)} ${c.cyan(String(data[key]))}`);
      }
    } catch (error) {
      process.exitCode = printApiError(error);
    }
  });

// --- transaction-list ---
const DATE_FMT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
program
  .command('transaction-list')
  .description('List transactions in a time window (rate limit: 50/min; defaults to today)')
  .option('--from <date>', 'Start date "YYYY-MM-DD HH:mm:ss" (default: today 00:00:00)')
  .option('--to <date>', 'End date "YYYY-MM-DD HH:mm:ss" (default: today 23:59:59)')
  .option('--status <status>', 'Filter: APPROVED, PENDING, DECLINED, REFUNDED, CANCELLED')
  .option('--min-amount <n>', 'Minimum amount filter')
  .option('--max-amount <n>', 'Maximum amount filter')
  .option('--page <n>', 'Page number', '1')
  .option('--pagination <n>', 'Page size', '50')
  .option('--json', 'Print the raw JSON response')
  .action(
    async (opts: {
      from?: string;
      to?: string;
      status?: string;
      minAmount?: string;
      maxAmount?: string;
      page: string;
      pagination: string;
      json?: boolean;
    }) => {
      if (!assertCredentialsPresent()) {
        process.exitCode = EXIT_VALIDATION;
        return;
      }

      // Default window = today (sandbox-verified date format)
      const now = new Date();
      const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const fromDate = opts.from ?? `${day} 00:00:00`;
      const toDate = opts.to ?? `${day} 23:59:59`;

      if (!DATE_FMT.test(fromDate) || !DATE_FMT.test(toDate)) {
        console.log(`  ${c.red('✗')} Dates must use "YYYY-MM-DD HH:mm:ss"`);
        console.log(`  ${c.dim('Example: --from "2026-08-25 00:00:00" --to "2026-08-25 23:59:59"')}`);
        console.log(`  ${c.dim('(Compact formats like 20260825 are rejected by PayWay with code 49 — sandbox-verified.)')}`);
        process.exitCode = EXIT_VALIDATION;
        return;
      }

      // B6: local pre-validation of the gateway's ≤3-day window and ≤1000 page
      // size. The gateway 403 on a wider window contains a typo, so we fail
      // fast client-side with a clear hint instead of echoing the broken text.
      const winFromMs = Date.parse(fromDate.replace(' ', 'T'));
      const winToMs = Date.parse(toDate.replace(' ', 'T'));
      if (!Number.isNaN(winFromMs) && !Number.isNaN(winToMs) && winToMs - winFromMs > 3 * 86_400_000) {
        console.log(`  ${c.red('✗')} The requested window spans more than 3 days, which PayWay rejects.`);
        console.log(`  ${c.dim('Split the query into ≤3-day windows (e.g. --from "2026-08-25 00:00:00" --to "2026-08-27 23:59:59").')}`);
        console.log(`  ${c.dim('(Sandbox-verified: the gateway returns HTTP 403 for windows wider than 3 days.)')}`);
        process.exitCode = EXIT_VALIDATION;
        return;
      }
      const pageSize = Number(opts.pagination);
      if (Number.isNaN(pageSize) || !Number.isInteger(pageSize) || pageSize <= 0 || pageSize > 1000) {
        console.log(`  ${c.red('✗')} --pagination must be a whole number between 1 and 1000, received: ${String(opts.pagination)}`);
        console.log(`  ${c.dim('PayWay caps the page size at 1000 — wider pages are rejected server-side.')}`);
        process.exitCode = EXIT_VALIDATION;
        return;
      }
      try {
        const payway = new PayWay();
        const result = await payway.checkout.getTransactionList({
          fromDate,
          toDate,
          fromAmount: opts.minAmount ?? null,
          toAmount: opts.maxAmount ?? null,
          status: opts.status ?? null,
          page: opts.page,
          pagination: opts.pagination,
        });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        const raw = result as unknown as Record<string, unknown>;
        const list = Array.isArray(raw.data) ? (raw.data as Record<string, unknown>[]) : [];
        console.log(`\n  Window: ${c.cyan(`${fromDate} → ${toDate}`)}${opts.status ? c.dim(`  status=${opts.status}`) : ''}`);
        console.log(`  ${c.green('✓')} ${list.length} transaction(s)\n`);

        if (list.length > 0) {
          const idPad = 24;
          console.log(`  ${'TRANSACTION ID'.padEnd(idPad)}${'STATUS'.padEnd(11)}${'AMOUNT'.padEnd(12)}DATE`);
          console.log(`  ${'-'.repeat(idPad + 11 + 12 + 19)}`);
          for (const t of list.slice(0, 20)) {
            const id = String(t.transaction_id ?? '').slice(0, idPad - 1);
            const statusStr = String(t.payment_status ?? '?');
            const amount = `${String(t.original_amount ?? '')} ${String(t.original_currency ?? '')}`.trim();
            console.log(
              `  ${id.padEnd(idPad)}${statusStr.padEnd(11)}${amount.padEnd(12)}${String(t.transaction_date ?? '')}`,
            );
          }
          if (list.length > 20) console.log(`\n  ${c.dim(`… and ${list.length - 20} more (--json or --pagination)`)}`);
          console.log(`\n  ${c.dim('Next: payway-sdk transaction-detail -t <id>   ·   explain a code with payway-sdk explain')}`);
        }
        console.log();
      } catch (error) {
        process.exitCode = printApiError(error);
      }
    },
  );

// --- refund ---
program
  .command('refund')
  .description('Refund a captured transaction (pre-flight balance check against transaction-detail)')
  .requiredOption('-t, --transaction-id <id>', 'Original transaction ID')
  .requiredOption('-a, --amount <number>', 'Refund amount (≥ 0.01 USD / ≥ 1 KHR)')
  .option('-c, --currency <code>', 'Currency of the original transaction: USD (default) or KHR', 'USD')
  .option('-y, --force', 'Skip pre-flight check and confirmation prompt')
  .option('--no-preflight', 'Skip the balance pre-flight check (detail API is rate-limited to 10/min)')
  .option('--json', 'Print the raw JSON response')
  .action(
    async (opts: {
      transactionId: string;
      amount: string;
      currency: string;
      force?: boolean;
      preflight?: boolean;
      json?: boolean;
    }) => {
      const io = resolvePromptMode({ json: opts.json, force: opts.force }) === 'clack' ? createClackIO() : null;
      if (!assertCredentialsPresent() || !assertRsaKeyPresent()) {
        process.exitCode = EXIT_VALIDATION;
        return;
      }
      const currency = opts.currency.toUpperCase() as 'USD' | 'KHR';
      if (currency !== 'USD' && currency !== 'KHR') {
        console.log(`  ${c.red('✗')} Currency must be USD or KHR, received: ${opts.currency}`);
        process.exitCode = EXIT_VALIDATION;
        return;
      }
      const amount = Number(opts.amount);
      try {
        validateTransactionId(opts.transactionId);
        validateRefundAmount(amount, currency);
      } catch (e) {
        console.log(`  ${c.red('✗')} ${(e as Error).message}`);
        process.exitCode = EXIT_VALIDATION;
        return;
      }

      // ── Pre-flight: verify refundable balance via transaction-detail ──
      if (opts.preflight !== false && !opts.force) {
        try {
          const payway = new PayWay();
          console.log(`  ${c.dim('Pre-flight: fetching original transaction (10/min rate limit)...')}`);
          const detail = await payway.checkout.getTransactionDetail(opts.transactionId);
          const data = ((detail as Record<string, unknown>).data ?? {}) as Record<string, unknown>;
          const status = String(data.payment_status ?? '').toUpperCase();
          const paid = Number(data.payment_amount ?? Number.NaN);
          const refunded = Number(data.refund_amount ?? 0);
          if (Number.isFinite(paid)) {
            const remaining = paid - refunded;
            if (remaining <= 0) {
              console.log(`  ${c.red('✗')} Nothing left to refund: paid=${paid}, already refunded=${refunded}`);
              process.exitCode = EXIT_VALIDATION;
              return;
            }
            if (amount > remaining + 1e-9) {
              console.log(
                `  ${c.red('✗')} Refund ${amount} exceeds remaining refundable balance ${remaining} (paid=${paid}, refunded=${refunded})`,
              );
              console.log(`  ${c.dim('Use --force to submit anyway (PayWay will reject with PTL37/PTL58).')}`);
              process.exitCode = EXIT_VALIDATION;
              return;
            }
            console.log(`  ${c.green('✓')} Pre-flight OK: remaining refundable = ${remaining}`);
          } else if (status !== 'APPROVED') {
            console.log(`  ${c.yellow('⚠')} Original transaction status is "${status || 'UNKNOWN'}" — refunds usually require APPROVED.`);
          }
        } catch (e) {
          console.log(`  ${c.yellow('⚠')} Pre-flight lookup failed: ${(e as Error).message}`);
          console.log(`  ${c.dim('Continuing without balance validation. Use --no-preflight to silence this check.')}`);
        }
      }

      if (!opts.force && !opts.json) {
        const confirmed = io
          ? await io.confirm({ message: `Refund ${String(amount)} ${currency} from ${opts.transactionId}?`, initial: false })
          : await promptConfirmation(`  Refund ${c.cyan(String(amount))} ${currency} from ${c.cyan(opts.transactionId)}? (y/n): `);
        if (!confirmed) {
          console.log(`  ${c.yellow('Cancelled by user.')}`);
          process.exitCode = EXIT_OK;
          return;
        }
      }

      try {
        const payway = new PayWay();
        const result = io
          ? await withOneShotSpinner(io, 'Submitting refund…', () =>
              payway.checkout.refund(opts.transactionId, amount, currency),
            )
          : await payway.checkout.refund(opts.transactionId, amount, currency);
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        const status = (result as Record<string, unknown>).status as Record<string, unknown> | undefined;
        const displayAmount = currency === 'USD' ? amount.toFixed(2) : String(amount);
        console.log(`  ${c.green('✓')} Refund submitted for ${c.bold(opts.transactionId)}`);
        console.log(`  ${c.bold('Requested refund:')} ${c.cyan(`${displayAmount} ${currency}`)}`);
        if (status) console.log(`  ${c.dim(JSON.stringify(status).slice(0, 220))}`);
        console.log(`  ${c.dim(`Next: verify with payway-sdk transaction-detail -t ${opts.transactionId}`)}`);
        console.log(`  ${c.dim('      Read refund_amount = total refunded so far')}`);
        console.log(`  ${c.dim('      Read transaction_operations = refund event history')}`);
        process.exitCode = EXIT_OK;
      } catch (error) {
        if (error instanceof CliCancelled) {
          console.log('  Cancelled by user.');
          process.exit(130);
        }
        process.exitCode = printApiError(error);
      }
    },
  );

// --- exchange-rate ---
program
  .command('exchange-rate')
  .description('Fetch the current USD/KHR exchange rate from PayWay')
  .option('--json', 'Print the raw JSON response')
  .action(async (opts: { json?: boolean }) => {
    if (!assertCredentialsPresent()) {
      process.exitCode = EXIT_VALIDATION;
      return;
    }
    try {
      const payway = new PayWay();
      const result = await payway.checkout.getExchangeRate();
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`  ${c.green('✓')} Exchange rate:`);
      console.log(`  ${JSON.stringify(result).slice(0, 300)}`);
    } catch (error) {
      process.exitCode = printApiError(error);
    }
  });


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
          console.log(`  ${c.green('✓')} Refund amount: ${c.cyan(opts.amount)} ${currency} — valid`);
        } catch (e) {
          console.log(`  ${c.red('✗')} Refund amount: ${c.red(String(e instanceof Error ? e.message : e))}`);
          hasError = true;
        }

        try {
          validatePositiveAmount(num, currency as 'USD' | 'KHR');
          console.log(`  ${c.green('✓')} Purchase amount: ${c.cyan(opts.amount)} ${currency} — valid`);
        } catch (e) {
          console.log(`  ${c.red('✗')} Purchase amount: ${c.red(String(e instanceof Error ? e.message : e))}`);
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

// --- checkout-form ---
// Local-only render of the signed hosted-checkout form. Requires merchant
// credentials (merchant_id is a hidden field and the hash needs the API key)
// but never touches the network and needs no RSA key. HTML goes to stdout or
// --out; diagnostics go to stderr so `checkout-form ... > form.html` is clean.
program
  .command('checkout-form')
  .description('Generate the hosted-checkout HTML form (local signing, no API call)')
  .requiredOption('-a, --amount <number>', 'Payment amount')
  .option('-c, --currency <code>', 'Currency: USD (default) or KHR', 'USD')
  .option('-t, --transaction-id <id>', 'Transaction ID (auto-generated if omitted)')
  .option('--payment-option <option>', 'Payment option (omit to let PayWay show all options)')
  .option('--return-url <url>', 'Return URL after payment')
  .option('--cancel-url <url>', 'Cancel URL')
  .option('--firstname <name>', 'Customer first name')
  .option('--lastname <name>', 'Customer last name')
  .option('--email <email>', 'Customer email')
  .option('--phone <phone>', 'Customer phone')
  .option('--auto-submit', 'Submit the form on page load (same-tab navigation)')
  .option('--popup', 'Use the official AbaPayway popup plugin (checkout2-0.js)')
  .option('-o, --out <path>', 'Write the HTML document to a file instead of stdout')
  .action((opts: Record<string, string | undefined>) => {
    const say = opts.out ? console.log : console.error;
    say(`\n${c.bold('ABA PayWay SDK')} — hosted checkout form\n`);

    const amount = Number(opts.amount);
    const currency = (opts.currency ?? 'USD').toUpperCase() as 'USD' | 'KHR';
    const transactionId = opts.transactionId ?? `ck${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;

    if (!Number.isFinite(amount) || amount <= 0) {
      say(`  ${c.red('✗')} Amount must be a positive number, received: ${c.red(String(opts.amount))}`);
      process.exitCode = EXIT_VALIDATION;
      return;
    }
    if (!['USD', 'KHR'].includes(currency)) {
      say(`  ${c.red('✗')} Currency must be USD or KHR, received: ${c.red(currency)}`);
      process.exitCode = EXIT_VALIDATION;
      return;
    }
    if (!assertCredentialsPresent()) {
      process.exitCode = EXIT_VALIDATION;
      return;
    }

    try {
      const payway = new PayWay();
      const html = payway.checkout.getCheckoutFormHtml(
        {
          transactionId,
          amount,
          currency,
          ...(opts.paymentOption ? { paymentOption: opts.paymentOption } : {}),
          ...(opts.returnUrl ? { returnUrl: opts.returnUrl } : {}),
          ...(opts.cancelUrl ? { cancelUrl: opts.cancelUrl } : {}),
          ...(opts.firstname ? { firstname: opts.firstname } : {}),
          ...(opts.lastname ? { lastname: opts.lastname } : {}),
          ...(opts.email ? { email: opts.email } : {}),
          ...(opts.phone ? { phone: opts.phone } : {}),
        },
        { autoSubmit: Boolean(opts.autoSubmit), popupMode: Boolean(opts.popup) },
      );

      if (opts.out) {
        writeFileSync(opts.out, html, 'utf8');
        say(`  ${c.green('✓')} Hosted checkout form written to ${c.cyan(opts.out)}`);
        say(`  ${c.dim('Transaction ID:')} ${c.cyan(transactionId)}`);
        say(
          `  ${c.dim('Next: open/serve the page, complete the payment, then')} ${c.cyan(`payway-sdk check-transaction -t ${transactionId}`)}`,
        );
      } else {
        process.stdout.write(html);
        say(`  ${c.dim('Transaction ID:')} ${c.cyan(transactionId)}`);
        say(
          `  ${c.dim('Next: complete the payment, then')} ${c.cyan(`payway-sdk check-transaction -t ${transactionId}`)}`,
        );
      }
      process.exitCode = EXIT_OK;
    } catch (e) {
      say(`  ${c.red('✗')} ${String(e instanceof Error ? e.message : e)}`);
      process.exitCode = classifyError(e);
    }
  });

// --- generate-qr ---
// Historical defaults (USD / abapay_khqr / template2 / 180s) are applied in
// the action instead of here, so the clack wizard can see which flags were
// explicitly provided and only probe what is missing.
program
  .command('generate-qr')
  .description('Generate a QR code (online via PayWay API or offline)')
  .option('-a, --amount <number>', 'Payment amount (optional for static offline QR)')
  .option('-c, --currency <code>', 'Currency: USD (default) or KHR')
  .option('-t, --transaction-id <id>', 'Transaction ID (auto-generated if omitted; online mode only)')
  .option('--offline', 'Generate official ABA KHQR offline (no API call)')
  .option('--callback-url <url>', 'Webhook callback URL (required for online mode)')
  .option('--payment-option <option>', 'Payment option for online mode')
  .option('--template <name>', 'QR image template for online mode')
  .option(
    '--lifetime <seconds>',
    'Transaction lifetime in seconds — minimum 180, sent to the API as whole minutes (default: 180)',
  )
  .option('--ref <reference>', 'Merchant reference (required for offline mode)')
  .option('--save-image <path>', 'Save QR image to file (online mode only, base64 decoded)')
  .option('--no-save-image', 'Do not save the QR image PNG to payway-output/<transaction-id>.png by default')
  .option('--open-image', 'Open the saved QR image with the OS default viewer (default: auto when interactive)')
  .option('--no-open-image', 'Never open the QR image, even in interactive terminals')
  .option('--no-show-qr', 'Do not render the QR code in the terminal (auto-enabled for interactive terminals)')
  .option('--first-name <name>', 'Payer first name (gateway caps at 20 chars, err 16/17)')
  .option('--last-name <name>', 'Payer last name (gateway caps at 20 chars, err 16/17)')
  .option('--email <email>', 'Payer email (gateway caps at 50 chars, err 19)')
  .option('--phone <phone>', 'Payer phone (gateway caps at 20 chars, err 18)')
  .option('--items <json>', 'Item list — JSON array or string (base64-encoded, max 500 chars / 10 items)')
  .option('--return-deeplink <value>', 'Mobile app deeplink — JSON {`ios_scheme`,`android_scheme`} or string')
  .option('--custom-fields <json>', 'Custom fields echoed in callbacks — JSON object or string (max 255 chars)')
  .option('--return-params <value>', 'Extra params echoed in the pushback')
  .option('--payout <json>', 'Split-payout instructions — JSON [{`account`,`amount`}] or string (max 255 chars)')
  .option('--non-interactive, -y', 'Skip interactive prompts (no confirmation, no lifetime override)')
  .option('--polling', 'Poll transaction status after QR generation (enabled by default)', true)
  .option('--no-polling', 'Disable automatic polling after QR generation')
  .option('--poll-interval <seconds>', 'Polling interval in seconds (default: 5)', '5')
  .option('--poll-timeout <seconds>', 'Max polling duration in seconds (default: 600)', '600')
  .action(async (opts: GenerateQrCommandOptions) => {
    console.log(`\n${c.bold('ABA PayWay SDK')} — generate QR code\n`);

    const mode = resolvePromptMode({ nonInteractive: opts.nonInteractive });
    const io = mode === 'clack' ? createClackIO() : null;

    // Wizard-resolved values. In readline/none modes these are exactly the
    // historical flag-derived values (defaults applied here, not in commander).
    let amount = opts.amount === undefined ? undefined : Number(opts.amount);
    let currency = (opts.currency ?? 'USD').toUpperCase() as 'USD' | 'KHR';
    let transactionId = opts.transactionId ?? `qr${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
    let offline = Boolean(opts.offline);
    let ref = opts.ref;
    let callbackUrl: string | undefined;
    let paymentOption = opts.paymentOption ?? 'abapay_khqr';
    let template = opts.template ?? 'template2';
    let lifetimeSeconds = opts.lifetime ? Number(opts.lifetime) : 180;

    if (io !== null) {
      // ── Guided wizard (real interactive TTY only) ────────────────────────
      try {
        const flow = await collectQrParams(
          {
            amount: opts.amount,
            currency: opts.currency,
            template: opts.template,
            paymentOption: opts.paymentOption,
            lifetime: opts.lifetime,
            callbackUrl: opts.callbackUrl || process.env.PAYWAY_CALLBACK_URL || undefined,
            offline: opts.offline,
            ref: opts.ref,
            transactionId: opts.transactionId,
          },
          io,
        );
        if (flow.cancelled) {
          console.log(`  ${c.yellow('Cancelled by user.')}`);
          process.exitCode = 1;
          return;
        }
        amount = flow.params.amount;
        currency = flow.params.currency;
        template = flow.params.template;
        paymentOption = flow.params.paymentOption;
        lifetimeSeconds = flow.params.lifetimeSeconds;
        callbackUrl = flow.params.callbackUrl;
        offline = flow.offline;
        ref = flow.params.ref;
        transactionId = flow.params.transactionId;
      } catch (error) {
        if (error instanceof CliCancelled) {
          console.log('  Cancelled by user.');
          process.exit(130);
        }
        throw error;
      }
    }

    if (!io && !offline && amount === undefined) {
      console.log(`  ${c.red('✗')} --amount is required for online mode`);
      process.exitCode = 1;
      return;
    }

    if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
      console.log(`  ${c.red('✗')} Amount must be a positive number, received: ${c.red(String(opts.amount))}`);
      process.exitCode = 1;
      return;
    }

    if (!['USD', 'KHR'].includes(currency)) {
      console.log(`  ${c.red('✗')} Currency must be USD or KHR, received: ${c.red(currency)}`);
      process.exitCode = 1;
      return;
    }

    // Template typo → warning only (never a new exit code); the clack wizard
    // already guarantees a valid value.
    if (!io && opts.template !== undefined && !QR_TEMPLATE_NAMES.includes(opts.template)) {
      const hint = suggestMessage(opts.template, QR_TEMPLATE_NAMES, 'QR template');
      console.log(`  ${c.yellow('⚠')} ${hint ?? `Unknown QR template '${opts.template}'.`}`);
    }

    // Unknown payment option → hard validation error (mirrors the currency check).
    if (!io && opts.paymentOption !== undefined && !(PAYMENT_OPTIONS as readonly string[]).includes(opts.paymentOption)) {
      const hint = suggestMessage(opts.paymentOption, [...PAYMENT_OPTIONS], 'payment option');
      console.log(`  ${c.red('✗')} ${hint ?? `Payment option must be one of: ${PAYMENT_OPTIONS.join(', ')}, received: ${opts.paymentOption}`}`);
      process.exitCode = 1;
      return;
    }

    if (opts.nonInteractive) {
      console.log(`  ${c.dim('(non-interactive mode — skipping prompts)')}`);
      console.log();
    }

    if (offline) {
      // ── Offline mode ──────────────────────────────────────────────────
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
        console.log(
          `  ${c.bold('Amount:')}           ${c.cyan(amount === undefined ? `Static ${currency}` : `${amount} ${currency}`)}`,
        );
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

      if (!io) {
        callbackUrl = opts.callbackUrl || process.env.PAYWAY_CALLBACK_URL?.trim();

        if (!callbackUrl) {
          console.log(`  ${c.red('✗')} --callback-url is required for online mode`);
          console.log(`  ${c.dim('Tip: use --offline for offline QR generation without credentials')}`);
          console.log(`  ${c.dim('Or run: payway-sdk setup-webhook --tunnel to set PAYWAY_CALLBACK_URL in .env')}`);
          process.exitCode = 1;
          return;
        }

        if (!Number.isFinite(lifetimeSeconds) || lifetimeSeconds <= 0 || !Number.isInteger(lifetimeSeconds)) {
          console.log(
            `  ${c.red('✗')} --lifetime must be a positive whole number of seconds, received: ${opts.lifetime}`,
          );
          process.exitCode = 1;
          return;
        }
        if (lifetimeSeconds < QR_LIFETIME_MIN_SECONDS) {
          console.log(
            `  ${c.red('✗')} --lifetime must be at least ${QR_LIFETIME_MIN_SECONDS} seconds (3 minutes — PayWay gateway minimum; below that the API rejects with code "04"), received: ${opts.lifetime}`,
          );
          process.exitCode = 1;
          return;
        }
      }

      if (callbackUrl === undefined) {
        // Unreachable: the legacy path guards above; the clack wizard always
        // resolves a callback URL for online payments. Kept for narrowing.
        process.exitCode = 1;
        return;
      }

      if (!assertCredentialsPresent()) {
        process.exitCode = 1;
        return;
      }

      let finalLifetime = lifetimeSeconds;

      if (!io && !opts.nonInteractive) {
        console.log();
        console.log(`  ${c.bold('Parameters:')}`);
        console.log(`    Amount:           ${c.cyan(`${amount} ${currency}`)}`);
        console.log(`    Transaction ID:   ${c.cyan(transactionId)}`);
        console.log(`    Payment Option:   ${c.cyan(paymentOption)}`);
        console.log(`    Callback URL:     ${c.cyan(callbackUrl)}`);
        console.log(`    QR Template:      ${c.cyan(template)}`);
        console.log(`    Lifetime:         ${c.cyan(`${lifetimeSeconds} seconds`)}`);
        console.log();

        const rl = createCliReadline(false);
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
          paymentOption,
          callbackUrl,
          qrImageTemplate: template,
          lifetime: finalLifetime,
          firstName: opts.firstName,
          lastName: opts.lastName,
          email: opts.email,
          phone: opts.phone,
          items: parseJsonOrString(opts.items) as ItemEntry[] | string | undefined,
          returnDeeplink: parseJsonOrString(opts.returnDeeplink) as
            | { ios_scheme: string; android_scheme: string }
            | string
            | undefined,
          customFields: parseJsonOrString(opts.customFields) as Record<string, unknown> | string | undefined,
          returnParams: opts.returnParams,
          payout: parseJsonOrString(opts.payout) as Array<{ account: string; amount: number }> | string | undefined,
        });

        console.log(`  ${c.green('✓')} Online QR generated via PayWay API\n`);
        console.log(`  ${c.bold('Transaction ID:')}  ${c.cyan(transactionId)}`);
        console.log(`  ${c.bold('Amount:')}           ${c.cyan(`${amount} ${currency}`)}`);
        console.log(`  ${c.bold('Payment Option:')}   ${paymentOption}`);
        console.log(`  ${c.bold('Callback URL:')}     ${callbackUrl}`);
        console.log(`  ${c.bold('Lifetime:')}         ${c.cyan(`${finalLifetime} seconds`)}`);
        console.log();

        if (qr.qrString) {
          console.log(`  ${c.bold('QR String:')}`);
          console.log(`  ${c.dim(qr.qrString)}`);
          console.log();

          // Render a scannable QR right in the terminal when interactive.
          if (shouldAutoRenderQr(process.stdout, asBoolFlag(opts.showQr))) {
            try {
              const terminalQr = await renderQrToTerminal(qr.qrString);
              console.log(terminalQr);
              console.log(`  ${c.dim('Scan the QR above with the ABA app to pay.')}\n`);
            } catch {
              // Terminal rendering is best-effort; the raw string is already printed.
            }
          }
        }

        const resolvedSaveImage =
          opts.saveImage === false
            ? false
            : typeof opts.saveImage === 'string'
              ? opts.saveImage
              : path.join(process.cwd(), 'payway-output', `${transactionId}.png`);

        if (qr.qrImage && resolvedSaveImage) {
          const { writeFileSync, mkdirSync } = await import('node:fs');
          const imgDir = path.dirname(resolvedSaveImage);
          mkdirSync(imgDir, { recursive: true });
          // qrImage is a data URL: "data:image/png;base64,iVBOR..."
          const base64Data = qr.qrImage.includes('base64,') ? qr.qrImage.split('base64,')[1] : qr.qrImage;
          const imgBuffer = Buffer.from(base64Data, 'base64');
          writeFileSync(resolvedSaveImage, imgBuffer);
          console.log(`  ${c.green('✓')} Image saved to ${c.cyan(resolvedSaveImage)}`);

          // Open with the OS default viewer: forced via --open-image,
          // suppressed via --no-open-image, otherwise only for humans
          // (interactive TTYs — agents and CI keep stdout clean).
          const shouldOpenImage =
            opts.openImage === true || (opts.openImage === undefined && Boolean(process.stdout.isTTY));
          if (shouldOpenImage) {
            const opened = await openImageInDefaultViewer(resolvedSaveImage);
            if (opened.opened) {
              console.log(`  ${c.green('✓')} QR image opened in default viewer ${c.dim(`(${opened.viewer})`)}`);
            } else {
              console.log(
                `  ${c.yellow('⚠')} Could not open QR image automatically ${c.dim(`(${opened.error ?? opened.reason})`)}`,
              );
              console.log(`  ${c.dim(`Open it manually: ${resolvedSaveImage}`)}`);
            }
          }
          console.log();
        } else if (qr.qrImage) {
          console.log(`  ${c.bold('QR Image:')} base64 data available (${qr.qrImage.length} chars)`);
          console.log(`  ${c.dim('Image auto-save disabled for this run.')}`);
          console.log();
        }

        // ── Polling ─────────────────────────────────────────────────────
        if ((opts as Record<string, unknown>).polling !== false) {
          await runPolling(payway, transactionId, opts, io);
        } else {
          console.log(`  ${c.dim(`Next: payway-sdk check-transaction -t ${transactionId}`)}`);
          console.log();
        }
      } catch (e) {
        process.exitCode = printApiError(e);
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
  .option('--ctid <ctid>', 'Subscription token identifier (required with --token-flag)')
  .option('--token-flag <flag>', 'Subscription token flag (purchase path: CITR_FIX only)')
  .option('--frequency <code>', 'Billing frequency: 1W | 1M | 2M (required when token-flag=CITR_FIX)')
  .option('--type <type>', 'Transaction type: purchase (default) or pre-auth')
  .option('--firstname <name>', 'Customer first name')
  .option('--lastname <name>', 'Customer last name')
  .option('--email <email>', 'Customer email')
  .option('--phone <phone>', 'Customer phone')
  .option('--items <json>', 'Item list — JSON array or string (base64-encoded)')
  .option('--shipping <number>', 'Shipping fee amount')
  .option('--lifetime <minutes>', 'Lifetime in minutes (min 3, max 43200)')
  .option('--custom-fields <json>', 'Custom fields — JSON object or string')
  .option('--return-params <value>', 'Extra params echoed in the pushback')
  .option('--skip-success-page <0|1>', 'Skip the success page (0 or 1)')
  .option('--view-type <type>', 'View type: hosted_view or popup')
  .option('--continue-success-url <url>', 'Continue-success URL (base64 target for the result page)')
  .option('--json', 'Print the raw JSON response')
  .option('--polling', 'Poll transaction status after checkout (enabled by default)', true)
  .option('--no-polling', 'Disable automatic polling after checkout')
  .option('--poll-interval <seconds>', 'Polling interval in seconds (default: 5)', '5')
  .option('--poll-timeout <seconds>', 'Max polling duration in seconds (default: 600)', '600')
  .option('--no-show-qr', 'Do not render the QR code in the terminal (auto-enabled for interactive terminals)')
  .action(async (opts: Record<string, string | undefined>) => {
    console.log(`\n${c.bold('ABA PayWay SDK')} — generate checkout QR URL\n`);

    const io = resolvePromptMode() === 'clack' ? createClackIO() : null;
    const amount = Number(opts.amount);
    const currency = (opts.currency ?? 'USD').toUpperCase() as 'USD' | 'KHR';
    const transactionId = opts.transactionId ?? `ck${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;

    if (!Number.isFinite(amount) || amount <= 0) {
      console.log(`  ${c.red('✗')} Amount must be a positive number, received: ${c.red(String(opts.amount))}`);
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

    if (io !== null) {
      // Guided confirmation (clack only): summary note + submit prompt.
      try {
        const confirmed = await confirmCheckoutSubmit(
          {
            transactionId,
            amount,
            currency,
            paymentOption: opts.paymentOption ?? 'abapay_khqr_deeplink',
            returnUrl: opts.returnUrl,
            cancelUrl: opts.cancelUrl,
          },
          io,
        );
        if (!confirmed) {
          console.log(`  ${c.yellow('Cancelled by user.')}`);
          process.exitCode = 1;
          return;
        }
      } catch (error) {
        if (error instanceof CliCancelled) {
          console.log('  Cancelled by user.');
          process.exit(130);
        }
        throw error;
      }
    }

    try {
      const payway = new PayWay();

      console.log(`  ${c.dim('Calling PayWay API...')}`);

      const result = await payway.checkout.purchase({
        transactionId,
        amount,
        currency,
        paymentOption: (opts.paymentOption as 'abapay_khqr_deeplink') ?? 'abapay_khqr_deeplink',
        returnUrl: opts.returnUrl,
        cancelUrl: opts.cancelUrl,
        type: opts.type === undefined ? undefined : (opts.type as 'purchase' | 'pre-auth'),
        firstname: opts.firstname,
        lastname: opts.lastname,
        email: opts.email,
        phone: opts.phone,
        shipping: opts.shipping !== undefined ? Number(opts.shipping) : undefined,
        lifetime: opts.lifetime !== undefined ? Number(opts.lifetime) : undefined,
        skipSuccessPage: opts.skipSuccessPage !== undefined ? (Number(opts.skipSuccessPage) as 0 | 1) : undefined,
        viewType: opts.viewType === undefined ? undefined : (opts.viewType as 'hosted_view' | 'popup'),
        continueSuccessUrl: opts.continueSuccessUrl,
        items: parseJsonOrString(opts.items) as ItemEntry[] | string | undefined,
        customFields: parseJsonOrString(opts.customFields) as Record<string, unknown> | string | undefined,
        returnParams: opts.returnParams,
        ctid: opts.ctid,
        tokenFlag: opts.tokenFlag === undefined ? undefined : (opts.tokenFlag as 'CITR_FIX'),
        frequency: opts.frequency === undefined ? undefined : (opts.frequency as '1W' | '1M' | '2M'),
      });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

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

          if (shouldAutoRenderQr(process.stdout, asBoolFlag(opts.showQr))) {
            try {
              const terminalQr = await renderQrToTerminal(String(r.qr_string));
              console.log(terminalQr);
              console.log(`  ${c.dim('Scan the QR above with the ABA app to pay.')}\n`);
            } catch {
              // best-effort
            }
          }
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
        await runPolling(payway, transactionId, opts, io);
      } else {
        console.log(`  ${c.dim(`Next: payway-sdk check-transaction -t ${transactionId}`)}`);
        console.log();
      }
    } catch (e) {
      process.exitCode = printApiError(e);
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
  .option('--image <path>', 'Image file to attach to the link (jpg/jpeg/png/webp/gif)')
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

    let image: PaymentLinkImage | undefined;
    if (opts.image !== undefined) {
      try {
        image = loadPaymentLinkImage(opts.image);
      } catch (e) {
        console.log(`  ${c.red('✗')} ${String(e instanceof Error ? e.message : e)}`);
        process.exitCode = 1;
        return;
      }
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
        image,
      });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const data = result.data;
      console.log(`  ${c.green('✓')} Payment link created\n`);
      const shareLink = data?.payment_link ?? '(not returned)';
      console.log(`  ${c.bold('Share this link:')}`);
      console.log(`  ${c.cyan(shareLink)}\n`);

      if (typeof shareLink === 'string' && shareLink.startsWith('http') && shouldAutoRenderQr(process.stdout)) {
        try {
          const terminalQr = await renderQrToTerminal(shareLink);
          console.log(terminalQr);
          console.log(`  ${c.dim('Customers can scan this QR to open the payment link.')}\n`);
        } catch {
          // best-effort
        }
      }

      console.log(`  ${c.bold('Link ID:')}        ${data?.id ?? '(not returned)'}`);
      console.log(`  ${c.dim('(save the Link ID — required for `payment-link detail`)')}`);
      console.log(`  ${c.bold('Title:')}          ${data?.title ?? opts.title}`);
      console.log(`  ${c.bold('Amount:')}         ${data?.amount ?? amount} ${data?.currency ?? currency}`);
      console.log(`  ${c.bold('Status:')}         ${data?.status ?? '-'}`);
      console.log(`  ${c.bold('Merchant Ref:')}   ${data?.merchant_ref_no ?? opts.merchantRefNo}`);
      console.log(`  ${c.bold('Transaction:')}    ${result.tran_id ?? result.status?.tran_id ?? '-'}`);
      console.log();
    } catch (e) {
      process.exitCode = printApiError(e);
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
      process.exitCode = printApiError(e);
    }
  });

// --- sandbox-beneficiaries ---
program
  .command('sandbox-beneficiaries')
  .description('List seeded sandbox beneficiary accounts and test MIDs for payout testing (SANDBOX ONLY)')
  .option('--currency <code>', 'Filter by currency: USD or KHR')
  .option('--json', 'Print as JSON')
  .action((opts: { currency?: string; json?: boolean }) => {
    const currency = opts.currency?.toUpperCase();
    if (currency && currency !== 'USD' && currency !== 'KHR') {
      console.log(`  ${c.red('✗')} --currency must be USD or KHR, received: ${currency}`);
      process.exitCode = 1;
      return;
    }
    const all = listSandboxBeneficiaries();
    const filtered = currency ? all.filter((b) => b.currencies.includes(currency as 'USD' | 'KHR')) : all;

    if (opts.json) {
      console.log(JSON.stringify(filtered, null, 2));
      return;
    }

    console.log(`\n${c.bold('Sandbox beneficiaries')} ${c.dim('— sandbox-only test fixtures, NEVER use in production')}\n`);
    const accounts = filtered.filter((b) => b.kind === 'account');
    const mids = filtered.filter((b) => b.kind === 'mid');

    if (accounts.length > 0) {
      console.log(`  ${c.bold('USD accounts (9-digit)')}`);
      for (const a of accounts) console.log(`    ${c.cyan(a.id)}   ${a.currencies.join('/')}`);
      console.log();
    }
    if (mids.length > 0) {
      console.log(`  ${c.bold('Test MIDs (15-digit, KHR)')}`);
      for (const m of mids) console.log(`    ${c.cyan(m.id)}   ${m.currencies.join('/')}`);
      console.log();
    }
    console.log(`  ${c.dim('Use these in payout / split-payout calls while environment=sandbox.')}`);
    console.log(`  ${c.dim('Any other account is rejected in sandbox (format: 9/11/15 digits).')}\n`);
  });

// --- payout ---
function parseBeneficiariesArg(raw: string): { account: string; amount: number }[] {
  return raw.split(',').map((part) => {
    const idx = part.indexOf(':');
    if (idx < 0) {
      throw new PayWayConfigError(`invalid beneficiary "${part.trim()}" — expected account:amount`);
    }
    const account = part.slice(0, idx).trim();
    const amount = Number(part.slice(idx + 1).trim());
    if (!account) throw new PayWayConfigError(`beneficiary account is empty in "${part.trim()}"`);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new PayWayConfigError(`invalid beneficiary amount in "${part.trim()}" — must be a positive number`);
    }
    return { account, amount };
  });
}

program
  .command('payout')
  .description('Send a payout / split-payout to one or more whitelisted beneficiary accounts')
  .requiredOption('-t, --transaction-id <id>', 'Source transaction id (pre-auth completed, or a paid transaction)')
  .requiredOption('-a, --amount <number>', 'Total payout amount (must equal sum of beneficiary amounts)')
  .option('-c, --currency <code>', 'Currency: USD (default) or KHR', 'USD')
  .requiredOption(
    '-b, --beneficiaries <list>',
    'Comma-separated beneficiaries as account:amount (e.g. "500000001:10,500000002:5")',
  )
  .option('--custom-fields <json>', 'Optional JSON custom fields object/string')
  .option('--json', 'Print the raw response as JSON')
  .action(async (opts: { transactionId: string; amount: string; currency: string; beneficiaries: string; customFields?: string; json?: boolean }) => {
    console.log(`\n${c.bold('ABA PayWay SDK')} — payout\n`);

    if (!assertCredentialsPresent() || !assertRsaKeyPresent()) {
      process.exitCode = EXIT_VALIDATION;
      return;
    }

    const currency = opts.currency.toUpperCase() as 'USD' | 'KHR';
    if (currency !== 'USD' && currency !== 'KHR') {
      console.log(`  ${c.red('✗')} Currency must be USD or KHR, received: ${c.red(currency)}`);
      process.exitCode = EXIT_VALIDATION;
      return;
    }

    let beneficiaries: { account: string; amount: number }[];
    try {
      beneficiaries = parseBeneficiariesArg(opts.beneficiaries);
    } catch (e) {
      console.log(`  ${c.red('✗')} ${(e as Error).message}`);
      process.exitCode = EXIT_VALIDATION;
      return;
    }

    const amount = Number(opts.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      console.log(`  ${c.red('✗')} Amount must be a positive number, received: ${c.red(String(opts.amount))}`);
      process.exitCode = EXIT_VALIDATION;
      return;
    }

    let customFields: unknown;
    if (opts.customFields) {
      try {
        customFields = JSON.parse(opts.customFields);
      } catch {
        console.log(`  ${c.red('✗')} --custom-fields is not valid JSON: ${opts.customFields}`);
        process.exitCode = EXIT_VALIDATION;
        return;
      }
    }

    try {
      const payway = new PayWay();
      console.log(`  ${c.dim('Calling PayWay payout API...')}`);
      const result = await payway.payout.payout({
        transactionId: opts.transactionId,
        amount,
        currency,
        beneficiaries,
        customFields: customFields as Record<string, unknown> | string | undefined,
      });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        const data = ((result as Record<string, unknown>).data ?? result) as Record<string, unknown>;
        console.log(`  ${c.green('✓')} Payout submitted`);
        if (data?.tran_id) console.log(`  ${c.bold('Transaction ID:')} ${c.cyan(String(data.tran_id))}`);
        if (data?.status) console.log(`  ${c.bold('Status:')} ${c.cyan(String(data.status))}`);
      }
      console.log();
    } catch (e) {
      process.exitCode = printApiError(e);
    }
  });

// --- cof (credentials on file) ---
const cofCmd = program
  .command('cof')
  .description('Credentials-on-file: link account/card, charge, and renew/inspect/remove tokens');

cofCmd
  .command('link-account')
  .description('Link an ABA account for credential-on-file (COF) payments')
  .requiredOption('-r, --request-id <id>', 'Unique request id (5-24 characters)')
  .requiredOption('-c, --ctid <ctid>', 'Customer token identifier (5-24 alphanumeric)')
  .requiredOption('-f, --token-flag <flag>', 'Live-documented values: CITI_FLEX | CITO_FLEX')
  .option('--currency <code>', 'Profile-enabled currency (required by the gateway): USD or KHR', 'USD')
  .option('--callback-url <url>', 'Webhook callback URL for the link result')
  .option('--json', 'Print the raw JSON response')
  .action(async (opts: Record<string, string | undefined>) => {
    if (!assertCredentialsPresent()) {
      process.exitCode = EXIT_VALIDATION;
      return;
    }
    try {
      const payway = new PayWay();
      const result = await payway.credentialsOnFile.linkAccount({
        requestId: opts.requestId as string,
        ctid: opts.ctid as string,
        tokenFlag: opts.tokenFlag as string,
        currency: (opts.currency ?? 'USD') as 'KHR' | 'USD',
        callbackUrl: opts.callbackUrl,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`  ${c.green('✓')} Account link requested`);
      console.log(`  ${c.bold('Request ID:')} ${c.cyan(opts.requestId as string)}`);
      console.log(`  ${c.bold('CTID:')}       ${c.cyan(opts.ctid as string)}`);
      console.log(`  ${c.dim('Result arrives via the callback_url; then charge with "cof charge" using --token <pwt>.')}\n`);
    } catch (e) {
      process.exitCode = printApiError(e);
    }
  });

cofCmd
  .command('link-card')
  .description('Link a card for credential-on-file (COF) payments')
  .requiredOption('-r, --request-id <id>', 'Unique request id (5-24 characters)')
  .requiredOption('-c, --ctid <ctid>', 'Customer token identifier (5-24 alphanumeric)')
  .requiredOption('-f, --token-flag <flag>', 'Live-documented values: CITI_FLEX | CITO_FLEX')
  .option('--currency <code>', 'Payment currency: USD (default) or KHR', 'USD')
  .option('--frequency <code>', 'Billing frequency: 1W | 1M | 2M')
  .option('--callback-url <url>', 'Webhook callback URL for the link result')
  .option('--continue-success-url <url>', 'Base64-encoded target of the hosted form Done button')
  .option('--json', 'Print the raw JSON response')
  .action(async (opts: Record<string, string | undefined>) => {
    if (!assertCredentialsPresent()) {
      process.exitCode = EXIT_VALIDATION;
      return;
    }
    try {
      const payway = new PayWay();
      const result = await payway.credentialsOnFile.linkCard({
        requestId: opts.requestId as string,
        ctid: opts.ctid as string,
        tokenFlag: opts.tokenFlag as string,
        currency: (opts.currency ?? 'USD') as 'USD' | 'KHR',
        frequency: opts.frequency === undefined ? undefined : (opts.frequency as '1W' | '1M' | '2M'),
        callbackUrl: opts.callbackUrl,
        continueSuccessUrl: opts.continueSuccessUrl,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`  ${c.green('✓')} Card link requested`);
      console.log(`  ${c.bold('Request ID:')} ${c.cyan(opts.requestId as string)}`);
      console.log(`  ${c.bold('CTID:')}       ${c.cyan(opts.ctid as string)}`);
      console.log(`  ${c.dim('The customer continues on the hosted form; result arrives via callback_url.')}\n`);
    } catch (e) {
      process.exitCode = printApiError(e);
    }
  });

cofCmd
  .command('charge')
  .description('Submit a credentials-on-file (COF) payment against a linked token')
  .requiredOption('-t, --transaction-id <id>', 'Transaction ID for this payment')
  .requiredOption('-a, --amount <number>', 'Payment amount')
  .requiredOption('--token <pwt>', 'Payment token (pwt) returned by a prior link/charge')
  .option('-c, --currency <code>', 'Currency: USD (default) or KHR', 'USD')
  .option('--ctid <ctid>', 'Customer token identifier (optional on repeat charges)')
  .option('--token-flag <flag>', 'Charge flags: CITU_FLEX|MITU_FLEX|MITU_FIX|MITR_FLEX|MITR_FIX')
  .option('--callback-url <url>', 'Webhook callback URL')
  .option('--first-name <name>', 'Payer first name (gateway caps at 20 chars)')
  .option('--last-name <name>', 'Payer last name (gateway caps at 20 chars)')
  .option('--email <email>', 'Payer email (gateway caps at 50 chars)')
  .option('--phone <phone>', 'Payer phone (gateway caps at 20 chars)')
  .option('--purchase-type <type>', 'purchase (default) or pre-auth')
  .option('--items <json>', 'Item list — JSON array or string (base64-encoded)')
  .option('--return-params <value>', 'Extra params echoed in the pushback')
  .option('--payout <json>', 'Split-payout instructions — JSON [{`account`,`amount`}] or string')
  .option('--custom-fields <json>', 'Custom fields — JSON object or string')
  .option('--shipping-fee <number>', 'Shipping fee amount')
  .option('--json', 'Print the raw JSON response')
  .action(async (opts: Record<string, string | undefined>) => {
    if (!assertCredentialsPresent()) {
      process.exitCode = EXIT_VALIDATION;
      return;
    }
    const amount = Number(opts.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      console.log(`  ${c.red('✗')} Amount must be a positive number, received: ${c.red(String(opts.amount))}`);
      process.exitCode = EXIT_VALIDATION;
      return;
    }
    try {
      const payway = new PayWay();
      const result = await payway.credentialsOnFile.payment({
        transactionId: opts.transactionId as string,
        amount,
        paymentToken: opts.token as string,
        currency: (opts.currency ?? 'USD') as 'USD' | 'KHR',
        ctid: opts.ctid,
        tokenFlag: opts.tokenFlag,
        callbackUrl: opts.callbackUrl,
        firstName: opts.firstName,
        lastName: opts.lastName,
        email: opts.email,
        phone: opts.phone,
        purchaseType: opts.purchaseType === undefined ? undefined : (opts.purchaseType as 'purchase' | 'pre-auth'),
        items: parseJsonOrString(opts.items) as ItemEntry[] | string | undefined,
        returnParams: opts.returnParams,
        payout: parseJsonOrString(opts.payout) as Array<{ acc: string; amt: number }> | string | undefined,
        customFields: parseJsonOrString(opts.customFields) as Record<string, unknown> | string | undefined,
        shippingFee: opts.shippingFee !== undefined ? Number(opts.shippingFee) : undefined,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      const data = ((result as Record<string, unknown>).data ?? result) as Record<string, unknown>;
      console.log(`  ${c.green('✓')} COF charge submitted`);
      if (data.tran_id) console.log(`  ${c.bold('Transaction ID:')} ${c.cyan(String(data.tran_id))}`);
      console.log(`  ${c.dim(`Next: verify with payway-sdk check-transaction -t ${String(data.tran_id)}`)}\n`);
    } catch (e) {
      process.exitCode = printApiError(e);
    }
  });

const cofTokenCmd = cofCmd.command('token').description('Renew, inspect, or remove a COF token');

cofTokenCmd
  .command('renew')
  .description('Renew an expired (or expiring) ACCOUNT token')
  .requiredOption('-r, --request-id <id>', 'Unique request id (5-24 characters)')
  .requiredOption('-c, --ctid <ctid>', 'Customer token identifier')
  .requiredOption('--token <pwt>', 'Existing payment token (pwt) to renew')
  .option('--json', 'Print the raw JSON response')
  .action(async (opts: Record<string, string | undefined>) => {
    if (!assertCredentialsPresent()) {
      process.exitCode = EXIT_VALIDATION;
      return;
    }
    try {
      const payway = new PayWay();
      const result = await payway.credentialsOnFile.renewToken({
        requestId: opts.requestId as string,
        ctid: opts.ctid as string,
        paymentToken: opts.token as string,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`  ${c.green('✓')} Token renew requested`);
      console.log(`  ${c.dim('Result arrives via the callback_url.')}\n`);
    } catch (e) {
      process.exitCode = printApiError(e);
    }
  });

cofTokenCmd
  .command('details')
  .description('Retrieve stored-token details (request carries request_id ONLY)')
  .requiredOption('-r, --request-id <id>', 'Unique request id (5-24 characters)')
  .option('--json', 'Print the raw JSON response')
  .action(async (opts: Record<string, string | undefined>) => {
    if (!assertCredentialsPresent()) {
      process.exitCode = EXIT_VALIDATION;
      return;
    }
    try {
      const payway = new PayWay();
      const result = await payway.credentialsOnFile.getTokenDetails({
        requestId: opts.requestId as string,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`  ${c.green('✓')} Token details returned`);
      console.log(`  ${c.bold('Request ID:')} ${c.cyan(opts.requestId as string)}`);
      console.log(`  ${c.dim(JSON.stringify(result).slice(0, 300))}\n`);
    } catch (e) {
      process.exitCode = printApiError(e);
    }
  });

cofTokenCmd
  .command('remove')
  .description('Remove a linked account or card token (irreversible)')
  .requiredOption('-c, --ctid <ctid>', 'Customer token identifier')
  .requiredOption('--token <pwt>', 'Payment token (pwt) to remove')
  .option('--json', 'Print the raw JSON response')
  .action(async (opts: Record<string, string | undefined>) => {
    if (!assertCredentialsPresent()) {
      process.exitCode = EXIT_VALIDATION;
      return;
    }
    try {
      const payway = new PayWay();
      const result = await payway.credentialsOnFile.removeToken({
        ctid: opts.ctid as string,
        paymentToken: opts.token as string,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`  ${c.green('✓')} Token removed`);
      console.log(`  ${c.bold('CTID:')} ${c.cyan(opts.ctid as string)}\n`);
    } catch (e) {
      process.exitCode = printApiError(e);
    }
  });

// --- beneficiary (whitelist management, RSA-encrypted) ---
const beneficiaryCmd = program.command('beneficiary').description('Manage payout beneficiary whitelist accounts (requires RSA key)');

beneficiaryCmd
  .command('add')
  .description('Add a payout beneficiary to the merchant whitelist')
  .argument('<payee>', 'Beneficiary account number (ABA account or test MID)')
  .option('--json', 'Print the raw JSON response')
  .action(async (payee: string, opts: { json?: boolean }) => {
    if (!assertCredentialsPresent() || !assertRsaKeyPresent()) {
      process.exitCode = EXIT_VALIDATION;
      return;
    }
    try {
      const payway = new PayWay();
      const result = await payway.payout.addBeneficiary({ payee });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`  ${c.green('✓')} Beneficiary whitelist request submitted`);
      console.log(`  ${c.bold('Payee:')} ${c.cyan(payee)}`);
      console.log(`  ${c.dim('Activation is usually manual/async — confirm status via beneficiary update-status.')}\n`);
    } catch (e) {
      process.exitCode = printApiError(e);
    }
  });

beneficiaryCmd
  .command('update-status')
  .description('Update a payout beneficiary whitelist status')
  .argument('<payee>', 'Beneficiary account number')
  .requiredOption('-s, --status <0|1>', 'New status: 0 (deactivated) or 1 (active)')
  .option('--json', 'Print the raw JSON response')
  .action(async (payee: string, opts: { status: string; json?: boolean }) => {
    if (!assertCredentialsPresent() || !assertRsaKeyPresent()) {
      process.exitCode = EXIT_VALIDATION;
      return;
    }
    const status = Number(opts.status);
    if (status !== 0 && status !== 1) {
      console.log(`  ${c.red('✗')} --status must be 0 or 1, received: ${opts.status}`);
      process.exitCode = EXIT_VALIDATION;
      return;
    }
    try {
      const payway = new PayWay();
      const result = await payway.payout.updateBeneficiaryStatus({ payee, status: status as 0 | 1 });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`  ${c.green('✓')} Beneficiary status update submitted`);
      console.log(`  ${c.bold('Payee:')}  ${c.cyan(payee)}`);
      console.log(`  ${c.bold('Status:')} ${status === 1 ? c.green('1 (active)') : c.yellow('0 (deactivated)')}\n`);
    } catch (e) {
      process.exitCode = printApiError(e);
    }
  });

// --- profiles ---
const profilesCmd = program.command('profiles').description('Manage saved sandbox and production credential profiles');

profilesCmd
  .command('add')
  .description('Interactively add a credential profile (maximum 8 profiles)')
  .action(async () => {
    const rl = createCliReadline(true);
    try {
      const name = (await promptInput(rl, 'Profile name: ')).trim();
      const environment = (await promptInput(rl, 'Environment (sandbox/production): ')).trim().toLowerCase() as
        | 'sandbox'
        | 'production';
      const merchantId = (await promptInput(rl, 'Merchant ID: ')).trim();
      const apiKey = (await readMaskedInput('API key: ', { fallback: (prompt) => promptInput(rl, prompt) })).trim();
      const publicKeyPem = (await promptInput(rl, 'RSA public key PEM (optional): ')).trim() || undefined;
      const baseUrl = (await promptInput(rl, 'Base URL override (optional): ')).trim() || undefined;
      const note = (await promptInput(rl, 'Note (optional, max 300 characters): ')).trim() || undefined;
      const configureKhqr = (await promptInput(rl, 'Configure ABA KHQR offline generation? (y/n): '))
        .trim()
        .toLowerCase();
      let khqr: KhqrMerchantConfiguration | undefined;
      if (configureKhqr === 'y' || configureKhqr === 'yes') {
        khqr = {
          bakongId: (await promptInput(rl, 'Bakong ID: ')).trim(),
          abaMerchantId: (await promptInput(rl, 'ABA merchant ID: ')).trim(),
          acquirerName: (await promptInput(rl, 'Acquirer name: ')).trim(),
          merchantCategoryCode: (await promptInput(rl, 'Merchant category code: ')).trim(),
          merchantName: (await promptInput(rl, 'Merchant name: ')).trim(),
          merchantCity: (await promptInput(rl, 'Merchant city: ')).trim(),
          paywayData: (
            await readMaskedInput('ABA PayWay data: ', { fallback: (prompt) => promptInput(rl, prompt) })
          ).trim(),
        };
        const callbackUrl = (await promptInput(rl, 'KHQR callback URL (optional): ')).trim();
        if (callbackUrl) {
          khqr.callback = {
            url: callbackUrl,
            enrollment: (
              await promptInput(rl, 'Callback enrollment (not-requested/requested/confirmed-by-merchant): ')
            ).trim() as KhqrCallbackEnrollment,
            verification: (
              await promptInput(rl, 'Callback verification (unknown/aba-confirmed-hmac/mTLS/ip-allowlist): ')
            ).trim() as KhqrCallbackVerification,
          };
        }
      }
      const store = loadProfileStore();
      addProfile(store, { name, environment, merchantId, apiKey, publicKeyPem, baseUrl, note, khqr });
      if (!store.defaultProfile) setDefaultProfile(store, name);
      saveProfileStore(store);
      console.log(`\n${c.green('✓')} Saved profile ${c.cyan(name)} (${environment})`);
    } catch (error) {
      console.log(`\n${c.red('✗')} ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    } finally {
      rl.close();
    }
  });

profilesCmd
  .command('list')
  .description('List saved profiles without exposing secrets')
  .action(() => {
    const store = loadProfileStore();
    if (store.profiles.length === 0) {
      console.log('No saved profiles. Run `payway-sdk profiles add`.');
      return;
    }
    for (const profile of store.profiles) {
      const marker = profile.name === store.defaultProfile ? '*' : ' ';
      const merchant = profile.merchantId.length > 6 ? `${profile.merchantId.slice(0, 4)}•••` : '••••••';
      console.log(
        `${marker} ${profile.name} (${profile.environment})  merchant: ${merchant}${profile.note ? `  note: ${profile.note}` : ''}`,
      );
    }
  });

profilesCmd
  .command('use')
  .description('Set the default profile')
  .argument('<name>', 'Saved profile name')
  .action((name: string) => {
    const store = loadProfileStore();
    setDefaultProfile(store, name);
    saveProfileStore(store);
    const profile = getProfileByName(store, name);
    if (!profile) throw new Error(`Profile "${name}" does not exist`);
    console.log(`${c.green('✓')} Default profile: ${profile.name} (${profile.environment})`);
  });

profilesCmd
  .command('current')
  .description('Show the selected default profile without exposing secrets')
  .action(() => {
    const store = loadProfileStore();
    if (!store.defaultProfile) {
      console.log('No default profile is selected.');
      return;
    }
    const profile = getProfileByName(store, store.defaultProfile);
    if (!profile) throw new Error(`Profile "${store.defaultProfile}" does not exist`);
    console.log(
      `Default profile: ${profile.name} (${profile.environment})${profile.note ? `\nNote: ${profile.note}` : ''}`,
    );
  });

profilesCmd
  .command('remove')
  .description('Remove a saved profile')
  .argument('<name>', 'Saved profile name')
  .action((name: string) => {
    const store = loadProfileStore();
    removeProfile(store, name);
    saveProfileStore(store);
    console.log(`${c.green('✓')} Removed profile ${name}`);
  });

// --- skills ---
const skillsCmd = program.command('skills').description('Manage AI skill guides for coding agents');

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

// --- agentic command tree ---
registerAgentCommands(program);
registerOnboardCommand(program);

// --- pre-auth (complete / complete-with-payout / cancel) ---
const preAuthComplete = new Command('complete')
  .description('Complete (capture) a PayWay pre-authorization')
  .requiredOption('-t, --transaction-id <id>', 'Pre-auth transaction ID')
  .requiredOption('-a, --amount <number>', 'Completion amount (USD)')
  .option('--original-amount <number>', 'Original pre-auth amount (enables the 110% over-capture guard)')
  .option('--max-over-capture-pct <number>', 'Over-capture ceiling as % of original (default 110)', '110')
  .option('--idempotency-key <key>', 'Idempotency key forwarded to PayWay')
  .option('-y, --force', 'Skip confirmation prompt (for scripts/agents)')
  .option('--json', 'Print the raw JSON response')
  .action(
    async (opts: {
      transactionId: string;
      amount: string;
      originalAmount?: string;
      maxOverCapturePct?: string;
      idempotencyKey?: string;
      force?: boolean;
      json?: boolean;
    }) => {
      const io = resolvePromptMode({ json: opts.json, force: opts.force }) === 'clack' ? createClackIO() : null;
      if (!assertCredentialsPresent() || !assertRsaKeyPresent()) {
        process.exitCode = EXIT_VALIDATION;
        return;
      }
      try {
        const amount = Number(opts.amount);
        validateTransactionId(opts.transactionId);
        const originalAmount = opts.originalAmount !== undefined ? Number(opts.originalAmount) : undefined;
        const payway = new PayWay();
        const result = io
          ? await withOneShotSpinner(io, 'Completing pre-auth…', () =>
              payway.preAuth.complete(opts.transactionId, amount, {
                idempotencyKey: opts.idempotencyKey,
                originalAmount,
                maxOverCapturePct: Number(opts.maxOverCapturePct ?? 110),
              }),
            )
          : await payway.preAuth.complete(opts.transactionId, amount, {
              idempotencyKey: opts.idempotencyKey,
              originalAmount,
              maxOverCapturePct: Number(opts.maxOverCapturePct ?? 110),
            });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(`  ${c.green('✓')} Pre-auth completed for ${c.bold(opts.transactionId)}`);
        console.log(`  ${c.dim(JSON.stringify(result).slice(0, 200))}`);
        process.exitCode = EXIT_OK;
      } catch (error) {
        if (error instanceof CliCancelled) {
          console.log('  Cancelled by user.');
          process.exit(130);
        }
        process.exitCode = printApiError(error);
      }
    },
  );

const preAuthCompletePayout = new Command('complete-payout')
  .description('Complete a pre-auth and push funds to beneficiary accounts in one call')
  .requiredOption('-t, --transaction-id <id>', 'Pre-auth transaction ID')
  .requiredOption('-a, --amount <number>', 'Completion amount (USD)')
  .requiredOption(
    '--payout <json>',
    'Payout array as JSON, e.g. \'[{"acc":"500000001","amt":10}]\'',
  )
  .option('--original-amount <number>', 'Original pre-auth amount (over-capture guard)')
  .option('--max-over-capture-pct <number>', 'Over-capture ceiling as % of original (default 110)', '110')
    .option('--idempotency-key <key>', 'Idempotency key forwarded to PayWay')
  .option('--json', 'Print the raw JSON response')
  .action(
    async (opts: {
      transactionId: string;
      amount: string;
      payout: string;
      originalAmount?: string;
      maxOverCapturePct?: string;
      idempotencyKey?: string;
      json?: boolean;
    }) => {
      const io = resolvePromptMode({ json: opts.json }) === 'clack' ? createClackIO() : null;
      if (!assertCredentialsPresent() || !assertRsaKeyPresent()) {
        process.exitCode = EXIT_VALIDATION;
        return;
      }
      try {
        const amount = Number(opts.amount);
        validateTransactionId(opts.transactionId);
        let payout: { acc: string; amt: number }[];
        try {
          payout = JSON.parse(opts.payout) as { acc: string; amt: number }[];
        } catch {
          throw new PayWayConfigError('Invalid --payout JSON. Expected an array like \'[{"acc":"500000001","amt":10}]\'.');
        }
        if (!Array.isArray(payout) || payout.length === 0) {
          throw new PayWayConfigError('payout must be a non-empty array');
        }
        const originalAmount = opts.originalAmount !== undefined ? Number(opts.originalAmount) : undefined;
        const payway = new PayWay();
        const result = io
          ? await withOneShotSpinner(io, 'Completing pre-auth…', () =>
              payway.preAuth.completeWithPayout(opts.transactionId, amount, payout, {
                idempotencyKey: opts.idempotencyKey,
                originalAmount,
                maxOverCapturePct: Number(opts.maxOverCapturePct ?? 110),
              }),
            )
          : await payway.preAuth.completeWithPayout(opts.transactionId, amount, payout, {
              idempotencyKey: opts.idempotencyKey,
              originalAmount,
              maxOverCapturePct: Number(opts.maxOverCapturePct ?? 110),
            });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(`  ${c.green('✓')} Pre-auth completed with payout for ${c.bold(opts.transactionId)}`);
        console.log(`  ${c.dim(JSON.stringify(result).slice(0, 200))}`);
        process.exitCode = EXIT_OK;
      } catch (error) {
        if (error instanceof CliCancelled) {
          console.log('  Cancelled by user.');
          process.exit(130);
        }
        process.exitCode = printApiError(error);
      }
    },
  );

const preAuthCancel = new Command('cancel')
  .description('Cancel (void) an open PayWay pre-authorization')
  .requiredOption('-t, --transaction-id <id>', 'Pre-auth transaction ID')
  .option('--reason <reason>', 'Optional cancellation reason')
  .option('--idempotency-key <key>', 'Idempotency key forwarded to PayWay')
  .option('-y, --force', 'Skip confirmation prompt')
  .option('--json', 'Print the raw JSON response')
  .action(
    async (opts: {
      transactionId: string;
      reason?: string;
      idempotencyKey?: string;
      force?: boolean;
      json?: boolean;
    }) => {
      const io = resolvePromptMode({ json: opts.json, force: opts.force }) === 'clack' ? createClackIO() : null;
      if (!assertCredentialsPresent() || !assertRsaKeyPresent()) {
        process.exitCode = EXIT_VALIDATION;
        return;
      }
      try {
        validateTransactionId(opts.transactionId);
        if (!opts.force && !opts.json) {
          const confirmed = io
            ? await io.confirm({ message: `Cancel pre-auth ${opts.transactionId}? This cannot be undone.`, initial: false })
            : await promptConfirmation(`  Cancel pre-auth ${c.cyan(opts.transactionId)}? This cannot be undone. (y/n): `);
          if (!confirmed) {
            console.log(`  ${c.yellow('Cancelled by user.')}`);
            process.exitCode = EXIT_OK;
            return;
          }
        }
        const payway = new PayWay();
        const result = io
          ? await withOneShotSpinner(io, 'Cancelling pre-auth…', () =>
              payway.preAuth.cancel(opts.transactionId, {
                reason: opts.reason,
                idempotencyKey: opts.idempotencyKey,
              }),
            )
          : await payway.preAuth.cancel(opts.transactionId, {
              reason: opts.reason,
              idempotencyKey: opts.idempotencyKey,
            });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(`  ${c.green('✓')} Pre-auth cancelled for ${c.bold(opts.transactionId)}`);
        console.log(`  ${c.dim(JSON.stringify(result).slice(0, 200))}`);
        process.exitCode = EXIT_OK;
      } catch (error) {
        if (error instanceof CliCancelled) {
          console.log('  Cancelled by user.');
          process.exit(130);
        }
        process.exitCode = printApiError(error);
      }
    },
  );

program
  .command('pre-auth')
  .description('Complete, complete-with-payout, or cancel a PayWay pre-authorization')
  .addCommand(preAuthComplete)
  .addCommand(preAuthCompletePayout)
  .addCommand(preAuthCancel);

// --- parse ---
/**
 * Run the CLI in-process against an explicit argv (defaults to process.argv).
 * Exported so tests (and embedders) can drive commands without spawning a
 * child process; `node dist/cli.js` / `npx tsx src/cli.ts` executions go
 * through the direct-invocation guard below instead.
 */
export async function runCli(argv: string[]): Promise<void> {
  await program.parseAsync(argv, { from: 'user' });
}

const invokedDirectly = (() => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

/** All registered option flags (long and short, including --no-* forms), for suggestions. */
function collectKnownFlags(): string[] {
  const flags = new Set<string>();
  const visit = (command: Command): void => {
    for (const option of command.options) {
      if (option.long) flags.add(option.long);
      if (option.short) flags.add(option.short);
    }
    for (const sub of command.commands) visit(sub);
  };
  visit(program);
  return [...flags];
}

/** All registered top-level command names, for suggestions. */
function registeredCommandNames(): string[] {
  return program.commands.map((command) => command.name());
}

if (invokedDirectly) {
  // Interactive bare invocation: a guided overview screen instead of
  // commander's help-on-stderr. Non-TTY / CI / PAYWAY_UI=classic keep the
  // historical fall-through (commander help on stderr, exit 1).
  if (process.argv.slice(2).length === 0 && resolvePromptMode() === 'clack') {
    renderBareInvocationHelp();
    process.exit(0);
  }

  runCli(process.argv.slice(2)).catch((err: unknown) => {
    if (err instanceof CliCancelled) {
      console.log('  Cancelled by user.');
      process.exit(130);
    }
    const message = err instanceof Error ? err.message : String(err);
    const unknownOptionMatch = /unknown option '--?([^' ]+)'/.exec(message);
    if (unknownOptionMatch) {
      const suggestion = unknownOptionSuggestion(`--${unknownOptionMatch[1]}`, collectKnownFlags());
      if (suggestion) console.error(`  ${suggestion}`);
    }
    const unknownCommandMatch = /unknown command '?([^' ]+)'?/.exec(message);
    if (unknownCommandMatch) {
      const suggestion = unknownCommandSuggestion(unknownCommandMatch[1], registeredCommandNames());
      if (suggestion) console.error(`  ${suggestion}`);
    }
    console.error(err);
    process.exitCode = 1;
  });
}
