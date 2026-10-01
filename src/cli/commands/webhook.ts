/**
 * `payway-sdk webhook` — local webhook workbench (P0 Wave 1 of
 * docs/strategy/competitive-analysis-cli-stripe-razorpay.md; the Stripe
 * listen/trigger/events-resend analog for PayWay).
 *
 * Subcommands:
 *  - `verify-callback` (W-4) — one-shot HMAC check over a body+signature,
 *    or a captured webhook record; explains WHY a delivery failed.
 *  - `resend` (W-3) — re-POST a stored webhook record to a URL (receiver
 *    regression testing against real captured payloads).
 *  - `trigger` (W-2) — send a signed fixture callback to a receiver URL
 *    (or the local webhook server) without the ABA Simulator.
 *  - `list` — print captured records with their ids (the `resend` join key).
 *
 * All local operations — no gateway calls. Exit codes follow the CLI
 * contract: 0 success, 1 validation (incl. INVALID signature verdict),
 * 3 network (forward/re-POST transport failures).
 */

import { existsSync, readFileSync } from 'node:fs';
import { Command } from 'commander';
import { verifyCallbackDetailed } from '../../auth.js';
import { resolveWebhookDir } from '../../config/data-root.js';
import { currentPalette } from '../ui/theme.js';
import {
  buildWebhookFixture,
  WEBHOOK_FIXTURE_EVENTS,
  type WebhookFixture,
  type WebhookFixtureEvent,
} from '../../webhook/fixtures.js';
import { parseForwardHeaders } from '../../webhook/forwarder.js';
import type { WebhookRecord, WebhookStorage } from '../../webhook/storage.js';
import { clearLifecycleState, readLifecycleState } from '../../webhook/lifecycle.js';
import { stopReceiver } from '../../webhook/receiver-control.js';

const EXIT_VALIDATION = 1;
const EXIT_NETWORK = 3;

export interface WebhookCommandDeps {
  /**
   * Storage seam: resolves the webhook record store. Default reads the CLI
   * store (PAYWAY_WEBHOOK_DIR or <data root>/webhook_data, json then sqlite).
   */
  loadStorage?: () => WebhookStorage;
  /** Body source for verify-callback (default: --body-file / stdin / --body). */
  fetchImpl?: typeof fetch;
  /** Log sink for human output (default console.log). */
  log?: (line: string) => void;
}

/** Resolve the captured-record store: JSON file first, SQLite fallback. */
async function loadDefaultStorage(): Promise<WebhookStorage> {
  const dir = resolveWebhookDir();
  const { JsonWebhookStorage } = await import('../../webhook/storage-json.js');
  const jsonPath = `${dir.replace(/[\\/]+$/, '')}/callbacks.jsonl`;
  if (existsSync(jsonPath)) return new JsonWebhookStorage(jsonPath);
  const { SqliteWebhookStorage } = await import('../../webhook/storage-sqlite.js');
  try {
    return await SqliteWebhookStorage.create(`${dir.replace(/[\\/]+$/, '')}/callbacks.db`);
  } catch {
    // No sqlite driver and no json file: an empty json store (reads []).
    return new JsonWebhookStorage(jsonPath);
  }
}

function readStdinBody(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      raw += chunk;
    });
    process.stdin.on('end', () => resolve(raw));
  });
}

function isRecordId(value: string): boolean {
  return /^wh_[a-z0-9_]+$/.test(value);
}

function describeRecord(record: WebhookRecord): string {
  const bits = [record.id, record.receivedAt];
  if (record.matchedTransactionId) bits.push(`tran_id=${record.matchedTransactionId}`);
  if (record.matchedStatus) bits.push(`status=${record.matchedStatus}`);
  if (record.signatureVerdict) {
    bits.push(`sig=${record.signatureVerdict}${record.signatureSource ? `(${record.signatureSource})` : ''}`);
  }
  if (record.replay) bits.push('replay');
  if (record.khqr?.parsed) bits.push('route=khqr');
  if (record.paymentLinkPushback?.parsed) bits.push('route=pushback');
  if (record.customerQr?.parsed) {
    bits.push('route=customer-qr');
    bits.push(`customer_id=${record.customerQr.parsed.notification.merchantRef}`);
  }
  return bits.join('  ');
}

export function registerWebhookCommands(program: Command, deps: WebhookCommandDeps = {}): void {
  const c = currentPalette();
  const log = deps.log ?? ((line: string) => console.log(line));
  const loadStorage = deps.loadStorage ?? (() => loadDefaultStorage());

  const webhook = new Command('webhook').description('Local webhook workbench: verify, trigger, resend captured callbacks');

  const status = new Command('status').description('Show the owned local webhook receiver state').option('--json').action((opts: { json?: boolean }) => {
    const state = readLifecycleState();
    const running = state ? (() => { try { process.kill(state.pid, 0); return true; } catch { return false; } })() : false;
    const result = { state: state ? (running ? 'running' : 'stale') : 'absent', receiver: state };
    if (opts.json) log(JSON.stringify(result));
    else log(state ? `Webhook receiver: ${result.state} (pid ${state.pid}, port ${state.port}, host ${state.host})` : 'Webhook receiver: absent');
  });

  const stop = new Command('stop')
    .description('Stop the owned local webhook receiver (identity-verified; never signals a foreign process)')
    .option('--json')
    .action(async (opts: { json?: boolean }) => {
      const state = readLifecycleState();
      if (!state) {
        if (opts.json) log(JSON.stringify({ stopped: false, reason: 'absent', detail: 'no receiver state recorded' }));
        else log('Webhook receiver is not running.');
        return;
      }
      const outcome = await stopReceiver({
        state,
        fetchImpl: deps.fetchImpl,
        log,
        quiet: opts.json === true,
      });
      // Clear the state file only when OUR receiver is confirmed gone; a
      // pid-reused/unreachable receiver keeps its record for diagnosis.
      if (outcome.stateCleared || outcome.reason === 'pid-reused') clearLifecycleState();
      if (opts.json) {
        log(JSON.stringify({ stopped: outcome.stopped, reason: outcome.reason, detail: outcome.detail, pid: outcome.pid, port: outcome.port }));
      } else if (outcome.stopped) {
        log(`Stopped webhook receiver pid ${outcome.pid}.`);
      } else {
        log(`  ${c.red('✗')} Not stopped (${outcome.reason}): ${outcome.detail}`);
      }
      if (!outcome.stopped && outcome.reason !== 'stale' && outcome.reason !== 'absent') process.exitCode = EXIT_NETWORK;
    });

  // --- webhook verify-callback (W-4) -------------------------------------
  const verify = new Command('verify-callback')
    .description('Verify an HMAC callback signature (body + X-PAYWAY-HMAC-SHA512), or a captured record by id')
    .option('--body <json>', 'Callback body as inline JSON')
    .option('--body-file <path>', 'Read the callback body from a file')
    .option('--sig <signature>', 'The X-PAYWAY-HMAC-SHA512 header value (or X_PAYWAY_HMAC_SHA512 env)')
    .option('--api-key <key>', 'Merchant API key (or PAYWAY_API_KEY env)')
    .option('--record <id>', 'Verify the signature verdict of a captured webhook record instead (no re-check)')
    .option('--json', 'Machine-readable output envelope')
    .action(async (opts: Record<string, string | boolean | undefined>) => {
      const json = opts.json === true;
      const apiKey = (opts.apiKey as string) || process.env.PAYWAY_API_KEY?.trim() || undefined;

      // Record mode: report the persisted verdict for a captured delivery.
      if (opts.record) {
        const recordId = String(opts.record);
        if (!isRecordId(recordId)) {
          if (json) {
            log(JSON.stringify({ error: { kind: 'validation', exitCode: EXIT_VALIDATION, type: 'PayWayConfigError', message: `invalid webhook record id: ${recordId}` } }));
          } else {
            log(`  ${c.red('✗')} Not a webhook record id (expected wh_…): ${c.red(recordId)}`);
          }
          process.exitCode = EXIT_VALIDATION;
          return;
        }
        const storage = await loadStorage();
        try {
          const record = storage.getAll().find((entry) => entry.id === recordId);
          if (!record) {
            if (json) {
              log(JSON.stringify({ error: { kind: 'validation', exitCode: EXIT_VALIDATION, type: 'PayWayConfigError', message: `webhook record ${recordId} not found` } }));
            } else {
              log(`  ${c.red('✗')} Webhook record ${c.red(recordId)} not found — run ${c.cyan('payway-sdk webhook list')} for ids.`);
            }
            process.exitCode = EXIT_VALIDATION;
            return;
          }
          const verdict = record.signatureVerdict ?? 'unsigned';
          if (json) {
            log(JSON.stringify({ record: recordId, verdict, signatureSource: record.signatureSource ?? null, reason: record.verificationReason ?? null, matchedTransactionId: record.matchedTransactionId ?? null, matchedStatus: record.matchedStatus ?? null, replay: record.replay ?? false }));
          } else {
            log(`\n${c.bold('Captured webhook record')} ${recordId}`);
            log(`  received:  ${record.receivedAt}`);
            log(`  signature: ${verdict === 'verified' ? c.green(`✓ verified (${record.signatureSource ?? '?'}-hash)`) : verdict === 'invalid' ? c.red(`✗ invalid (${record.verificationReason ?? 'unknown'})`) : c.yellow('unsigned (no signature header or body hash captured)')}`);
            if (record.matchedTransactionId) log(`  tran_id:    ${record.matchedTransactionId}${record.matchedStatus ? `  status=${record.matchedStatus}` : ''}`);
            if (record.replay) log(`  ${c.yellow('replay')} — the same (tran_id, status) pair was captured before`);
            log('');
          }
          if (verdict === 'invalid') process.exitCode = EXIT_VALIDATION;
          return;
        } finally {
          storage.close();
        }
      }

      // Body mode: one-shot HMAC verification.
      const sig = (opts.sig as string) || process.env.X_PAYWAY_HMAC_SHA512 || undefined;
      if (!sig) {
        if (json) {
          log(JSON.stringify({ error: { kind: 'validation', exitCode: EXIT_VALIDATION, type: 'PayWayConfigError', message: 'missing --sig "<X-PAYWAY-HMAC-SHA512 header value>"' } }));
        } else {
          log(`  ${c.red('✗')} Missing signature. Pass ${c.cyan('--sig "<X-PAYWAY-HMAC-SHA512 header value>"')}.`);
        }
        process.exitCode = EXIT_VALIDATION;
        return;
      }
      if (!apiKey) {
        if (json) {
          log(JSON.stringify({ error: { kind: 'validation', exitCode: EXIT_VALIDATION, type: 'PayWayConfigError', message: 'missing API key (PAYWAY_API_KEY env or --api-key)' } }));
        } else {
          log(`  ${c.red('✗')} Missing API key. Set ${c.cyan('PAYWAY_API_KEY')} or pass ${c.cyan('--api-key')}.`);
        }
        process.exitCode = EXIT_VALIDATION;
        return;
      }

      let raw = (opts.body as string) || undefined;
      if (!raw && opts.bodyFile) raw = readFileSync(String(opts.bodyFile), 'utf-8');
      if (!raw) raw = await readStdinBody();
      if (!raw || raw.trim() === '') {
        if (json) {
          log(JSON.stringify({ error: { kind: 'validation', exitCode: EXIT_VALIDATION, type: 'PayWayConfigError', message: "missing body — pass --body '<json>', --body-file <path>, or pipe the raw body" } }));
        } else {
          log(`  ${c.red('✗')} Missing body. Pass ${c.cyan(`--body '<json>'`)}, ${c.cyan('--body-file <path>')}, or pipe the raw body.`);
        }
        process.exitCode = EXIT_VALIDATION;
        return;
      }

      let body: Record<string, unknown>;
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch (error) {
        if (json) {
          log(JSON.stringify({ error: { kind: 'validation', exitCode: EXIT_VALIDATION, type: 'PayWayConfigError', message: `body is not valid JSON: ${error instanceof Error ? error.message : String(error)}` } }));
        } else {
          log(`  ${c.red('✗')} Body is not valid JSON: ${c.red(error instanceof Error ? error.message : String(error))}`);
        }
        process.exitCode = EXIT_VALIDATION;
        return;
      }

      const result = verifyCallbackDetailed(body, sig, apiKey, { stripHash: true });
      const tranId = typeof body.tran_id === 'string' ? body.tran_id : undefined;
      if (json) {
        log(JSON.stringify({ valid: result.valid, reason: result.reason ?? null, tranId: tranId ?? null }));
      } else {
        log(`\n${c.bold('Callback signature check')}`);
        log(`  verdict:  ${result.valid ? c.green('✓ VALID — safe to process') : c.red('✗ INVALID — DO NOT process (log and discard)')}`);
        if (result.reason) log(`  reason:   ${result.reason}`);
        if (tranId) log(`  tran_id:  ${tranId}`);
        log(`  ${c.dim('algorithm: sorted-key concat → HMAC-SHA512 → Base64, timing-safe compare (hash field stripped)')}`);
        log('');
      }
      if (!result.valid) process.exitCode = EXIT_VALIDATION;
      return;
    });

  // --- webhook show (Q18/evidence inspection) -----------------------------
  const show = new Command('show')
    .description('Print one captured webhook record in full — headers, raw body, verdicts, metadata (evidence inspection)')
    .requiredOption('--record <id>', 'Webhook record id (see webhook list)')
    .option('--json', 'Machine-readable output envelope (the full stored record)')
    .action(async (opts: Record<string, string | boolean | undefined>) => {
      const json = opts.json === true;
      const recordId = String(opts.record);
      if (!isRecordId(recordId)) {
        if (json) log(JSON.stringify({ error: { kind: 'validation', exitCode: EXIT_VALIDATION, type: 'PayWayConfigError', message: `invalid webhook record id: ${recordId}` } }));
        else log(`  ${c.red('✗')} Not a webhook record id (expected wh_…): ${c.red(recordId)}`);
        process.exitCode = EXIT_VALIDATION;
        return;
      }
      const storage = await loadStorage();
      let record: WebhookRecord | undefined;
      try {
        record = storage.getAll().find((entry) => entry.id === recordId);
      } finally {
        storage.close();
      }
      if (!record) {
        if (json) log(JSON.stringify({ error: { kind: 'validation', exitCode: EXIT_VALIDATION, type: 'PayWayConfigError', message: `webhook record ${recordId} not found` } }));
        else log(`  ${c.red('✗')} Webhook record ${c.red(recordId)} not found — run ${c.cyan('payway-sdk webhook list')} for ids.`);
        process.exitCode = EXIT_VALIDATION;
        return;
      }

      if (json) {
        log(JSON.stringify(record, null, 2));
        return;
      }

      const verdict = record.signatureVerdict ?? 'unsigned';
      log(`\n${c.bold('Captured webhook record')} ${recordId}`);
      log(`  received:   ${record.receivedAt}${record.sourceIp ? `  from ${record.sourceIp}` : ''}`);
      log(`  signature:  ${verdict === 'verified' ? c.green(`✓ verified (${record.signatureSource ?? '?'}-hash)`) : verdict === 'invalid' ? c.red(`✗ invalid (${record.verificationReason ?? 'unknown'})`) : c.yellow('unsigned (no signature header or body hash)')}`);
      if (record.matchedTransactionId) log(`  tran_id:    ${record.matchedTransactionId}${record.matchedStatus ? `  status=${record.matchedStatus}` : ''}`);
      if (record.replay) log(`  ${c.yellow('replay')} — the same (tran_id, status) pair was captured before`);
      if (record.khqr?.parsed) log(`  route:      khqr (${record.khqr.parsed.kind})`);
      if (record.paymentLinkPushback?.parsed) log('  route:      payment-link pushback');
      if (record.customerQr?.parsed) log(`  route:      customer-qr (${record.customerQr.parsed.kind})`);

      log(`\n${c.bold('Headers')}`);
      for (const [key, value] of Object.entries(record.headers)) {
        log(`  ${c.dim(key)}: ${Array.isArray(value) ? value.join(', ') : (value ?? '')}`);
      }

      log(`\n${c.bold('Body')}`);
      try {
        log(JSON.stringify(JSON.parse(record.body), null, 2));
      } catch {
        log(record.body);
      }
      log('');
    });

  // --- webhook list ------------------------------------------------------
  const list = new Command('list')
    .description('List captured webhook records (ids are the resend/verify --record keys)')
    .option('--limit <n>', 'Show only the newest n records (default 10)', '10')
    .option('--json', 'Machine-readable output envelope')
    .action(async (opts: Record<string, string | boolean | undefined>) => {
      const json = opts.json === true;
      const limit = Math.max(1, Number(opts.limit ?? 10) || 10);
      const storage = await loadStorage();
      try {
        const records = storage.getAll().slice(-limit);
        if (json) {
          log(JSON.stringify({ count: records.length, records: records.map((r) => ({ id: r.id, receivedAt: r.receivedAt, matchedTransactionId: r.matchedTransactionId ?? null, matchedStatus: r.matchedStatus ?? null, signatureVerdict: r.signatureVerdict ?? 'unsigned', signatureSource: r.signatureSource ?? null, replay: r.replay ?? false })) }));
          return;
        }
        log(`\n${c.bold('Captured webhook records')} (newest ${records.length})`);
        if (records.length === 0) {
          log(`  ${c.dim('None captured yet — run setup-webhook, or webhook trigger to synthesize one.')}`);
        }
        for (const record of records.reverse()) {
          log(`  ${describeRecord(record)}`);
        }
        log('');
      } finally {
        storage.close();
      }
    });

  // --- webhook resend (W-3) ----------------------------------------------
  const resend = new Command('resend')
    .description('Re-POST a captured webhook record to a URL (receiver regression testing)')
    .requiredOption('--record <id>', 'Webhook record id (see webhook list)')
    .requiredOption('--to <url>', 'Target URL that receives the re-delivery')
    .option('--forward-headers <headers>', 'Extra headers: "Key1:Value1, Key2:Value2"')
    .option('--json', 'Machine-readable output envelope')
    .action(async (opts: Record<string, string | boolean | undefined>) => {
      const json = opts.json === true;
      const recordId = String(opts.record);
      const to = String(opts.to);
      if (!isRecordId(recordId)) {
        if (json) log(JSON.stringify({ error: { kind: 'validation', exitCode: EXIT_VALIDATION, type: 'PayWayConfigError', message: `invalid webhook record id: ${recordId}` } }));
        else log(`  ${c.red('✗')} Not a webhook record id (expected wh_…): ${c.red(recordId)}`);
        process.exitCode = EXIT_VALIDATION;
        return;
      }
      const storage = await loadStorage();
      let record: WebhookRecord | undefined;
      try {
        record = storage.getAll().find((entry) => entry.id === recordId);
      } finally {
        storage.close();
      }
      if (!record) {
        if (json) log(JSON.stringify({ error: { kind: 'validation', exitCode: EXIT_VALIDATION, type: 'PayWayConfigError', message: `webhook record ${recordId} not found` } }));
        else log(`  ${c.red('✗')} Webhook record ${c.red(recordId)} not found — run ${c.cyan('payway-sdk webhook list')} for ids.`);
        process.exitCode = EXIT_VALIDATION;
        return;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(record.body)),
        'User-Agent': 'aba-payway-sdk-resend/1',
        ...parseForwardHeaders(opts.forwardHeaders as string | undefined),
      };
      const signature = record.headers['x-payway-hmac-sha512'];
      if (typeof signature === 'string' && signature.length > 0) headers['X-PAYWAY-HMAC-SHA512'] = signature;

      const fetchImpl = deps.fetchImpl ?? fetch;
      if (!json) {
        log(`\n${c.bold('Resending captured webhook')} ${recordId}`);
        log(`  to:      ${to}`);
        if (record.matchedTransactionId) log(`  tran_id: ${record.matchedTransactionId}${record.matchedStatus ? `  status=${record.matchedStatus}` : ''}`);
        log('');
      }
      try {
        const response = await fetchImpl(to, { method: 'POST', headers, body: record.body });
        if (json) {
          log(JSON.stringify({ record: recordId, httpStatus: response.status, ok: response.ok }));
        } else {
          log(`  ${response.ok ? c.green(`✓ delivered [HTTP ${response.status}]`) : c.yellow(`→ receiver answered HTTP ${response.status}`)}`);
        }
        if (!response.ok) process.exitCode = EXIT_NETWORK;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (json) {
          log(JSON.stringify({ error: { kind: 'network', exitCode: EXIT_NETWORK, type: 'PayWayNetworkError', message } }));
        } else {
          log(`  ${c.red('✗')} delivery failed: ${c.red(message)}`);
        }
        process.exitCode = EXIT_NETWORK;
      }
    });

  // --- webhook trigger (W-2) ---------------------------------------------
  const trigger = new Command('trigger')
    .description('Send a signed fixture callback to a URL — test your receiver without the ABA Simulator')
    .requiredOption('--url <url>', 'Receiver URL (your app, or the webhook server route)')
    .option('--event <event>', `Fixture event: ${WEBHOOK_FIXTURE_EVENTS.join(', ')}`, 'payment.approved')
    .option('-t, --tran-id <id>', 'Transaction id embedded in the fixture (auto-generated when omitted)')
    .option('--merchant-ref <ref>', 'Merchant reference (defaults to the transaction id)')
    .option('-a, --amount <number>', 'Fixture amount (default 10 USD / 40000 KHR)')
    .option('-c, --currency <code>', 'Fixture currency: USD (default) or KHR', 'USD')
    .option('--payer-name <name>', 'Payer name shown in the fixture', 'Mock Payer')
    .option('--customer-name <name>', 'Customer Module fixtures only: portal customer name in the nested customer object', 'Mock Customer')
    .option('--ctid <ctid>', 'CoF link fixture only: customer token identifier (default mockcust01)')
    .option('--api-key <key>', 'Merchant API key for signing (or PAYWAY_API_KEY env)')
    .option('--forward-headers <headers>', 'Extra headers: "Key1:Value1, Key2:Value2"')
    .option('--json', 'Machine-readable output envelope')
    .action(async (opts: Record<string, string | boolean | undefined>) => {
      const json = opts.json === true;
      const event = String(opts.event ?? 'payment.approved') as WebhookFixtureEvent;
      if (!WEBHOOK_FIXTURE_EVENTS.includes(event)) {
        if (json) log(JSON.stringify({ error: { kind: 'validation', exitCode: EXIT_VALIDATION, type: 'PayWayConfigError', message: `unknown fixture event "${event}" — valid: ${WEBHOOK_FIXTURE_EVENTS.join(', ')}` } }));
        else log(`  ${c.red('✗')} Unknown fixture event ${c.red(String(event))} — valid: ${c.cyan(WEBHOOK_FIXTURE_EVENTS.join(', '))}`);
        process.exitCode = EXIT_VALIDATION;
        return;
      }
      const apiKey = (opts.apiKey as string) || process.env.PAYWAY_API_KEY?.trim() || undefined;
      const currency = (String(opts.currency ?? 'USD').toUpperCase() === 'KHR' ? 'KHR' : 'USD') as 'USD' | 'KHR';
      const amount = opts.amount !== undefined ? Number(opts.amount) : undefined;
      if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
        if (json) log(JSON.stringify({ error: { kind: 'validation', exitCode: EXIT_VALIDATION, type: 'PayWayConfigError', message: `amount must be a positive number, received: ${opts.amount}` } }));
        else log(`  ${c.red('✗')} Amount must be a positive number, received: ${c.red(String(opts.amount))}`);
        process.exitCode = EXIT_VALIDATION;
        return;
      }

      let fixture: WebhookFixture;
      try {
        fixture = buildWebhookFixture(event, apiKey, {
          tranId: opts.tranId as string | undefined,
          merchantRef: opts.merchantRef as string | undefined,
          amount,
          currency,
          payerName: opts.payerName as string | undefined,
          customerName: opts.customerName as string | undefined,
          ctid: opts.ctid as string | undefined,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (json) log(JSON.stringify({ error: { kind: 'validation', exitCode: EXIT_VALIDATION, message } }));
        else log(`  ${c.red('✗')} ${message}`);
        process.exitCode = EXIT_VALIDATION;
        return;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(fixture.body)),
        'User-Agent': 'aba-payway-sdk-trigger/1',
        ...parseForwardHeaders(opts.forwardHeaders as string | undefined),
      };
      // Body-channel fixtures (CoF link) carry the HMAC inside the body
      // `hash` field — no signature header, so the receiver's body-hash
      // verification path is what gets exercised.
      if (fixture.signature && fixture.signatureChannel !== 'body') {
        headers['X-PAYWAY-HMAC-SHA512'] = fixture.signature;
      }

      const signedNote =
        fixture.signature === undefined
          ? c.yellow('no — this contract carries no hash; verify via check-transaction')
          : fixture.signatureChannel === 'body'
            ? c.green('yes (body `hash` field — no header)')
            : c.green('yes (X-PAYWAY-HMAC-SHA512)');

      if (!json) {
        log(`\n${c.bold('Triggering fixture webhook')} ${fixture.event}`);
        log(`  to:        ${opts.url}`);
        log(`  route:     ${fixture.route}`);
        log(`  tran_id:   ${fixture.tranId}`);
        log(`  signed:    ${signedNote}`);
        log('');
      }

      const fetchImpl = deps.fetchImpl ?? fetch;
      try {
        const response = await fetchImpl(String(opts.url), { method: 'POST', headers, body: fixture.body });
        if (json) {
          log(
            JSON.stringify({
              event: fixture.event,
              route: fixture.route,
              tranId: fixture.tranId,
              signed: fixture.verification === 'hmac',
              signatureChannel: fixture.signatureChannel ?? 'header',
              httpStatus: response.status,
              ok: response.ok,
            }),
          );
        } else {
          log(`  ${response.ok ? c.green(`✓ receiver acknowledged [HTTP ${response.status}]`) : c.yellow(`→ receiver answered HTTP ${response.status}`)}`);
          const next =
            event === 'cof-link.linked'
              ? `Next: payway-sdk cof token list — the receiver persists the fixture pwt when the body-hash verifies (fixture is synthetic; the gateway never saw it)`
              : `Next: payway-sdk check-transaction -t ${fixture.tranId} — fixture callbacks are synthetic; the gateway never saw this tran_id`;
          log(`  ${c.dim(next)}`);
        }
        if (!response.ok) process.exitCode = EXIT_NETWORK;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (json) log(JSON.stringify({ error: { kind: 'network', exitCode: EXIT_NETWORK, type: 'PayWayNetworkError', message } }));
        else log(`  ${c.red('✗')} delivery failed: ${c.red(message)}`);
        process.exitCode = EXIT_NETWORK;
      }
    });

  webhook.addCommand(verify);
  webhook.addCommand(show);
  webhook.addCommand(list);
  webhook.addCommand(resend);
  webhook.addCommand(trigger);
  webhook.addCommand(status);
  webhook.addCommand(stop);
  program.addCommand(webhook);
}
