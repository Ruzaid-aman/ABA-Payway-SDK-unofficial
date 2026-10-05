/**
 * Payment-link VOID e2e — the IMPLEMENTED SDK + CLI against the live sandbox
 * (2026-09-11, SANDBOX-FINDINGS §23 implementation verification).
 *
 * Distinct from scripts/sandbox-probe-payment-link-void.ts (hand-rolled raw
 * requests that MAPPED the contract): this runs the shipped surfaces —
 * payway.paymentLink.void() and `npx tsx src/cli.ts payment-link void` —
 * and pins the §23 facts end-to-end:
 *
 *   E1  SDK void on a fresh OPEN link → status 00, numeric tran_id
 *   E2  detail after void → status "VOIDED", total_trxn still 0
 *   E3  SDK double-void → PayWayAPIError, paywayCode PTL188
 *   E4  SDK void bogus id → PayWayAPIError, paywayCode 96
 *   E5  CLI --json success → one JSON doc, status 00 (exit 0)
 *   E6  CLI --json double-void → {error:{paywayCode:'PTL188',kind:'api',
 *       exitCode:2}} envelope, exit 2, hint mentions terminal state
 *
 * Evidence → test-output/payment-link-void-e2e/ (worktree-local).
 *
 *   PAYWAY_TLS_CA_FILE="$PWD/payway-sandbox-ca.pem" npx tsx scripts/e2e-payment-link-void.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadDotEnvIntoProcess } from '../src/cli/dotenv.js';
import { PayWay } from '../src/client.js';
import { PayWayAPIError } from '../src/errors.js';

loadDotEnvIntoProcess(process.cwd());

const OUT_DIR = resolve(process.cwd(), 'test-output/payment-link-void-e2e');

interface Leg {
  leg: string;
  question: string;
  verdict: string;
  evidence: unknown;
}
const legs: Leg[] = [];
function record(leg: string, question: string, verdict: string, evidence: unknown): void {
  legs.push({ leg, question, verdict, evidence });
  console.log(`\n[${leg}] ${question}\n  → ${verdict}`);
}

async function main(): Promise<void> {
  const payway = new PayWay();
  const stamp = Date.now().toString(36);
  mkdirSync(OUT_DIR, { recursive: true });

  // ── Leg 1-2: create → SDK void → detail reports VOIDED ──────────────────
  const created = await payway.paymentLink.create({
    title: 'PLV e2e void leg',
    amount: 1.5,
    currency: 'USD',
    merchantRefNo: `plv-e2e-${stamp}`,
    returnUrl: 'https://merchant.example/payway/pushback',
    expiredDate: Math.floor(Date.now() / 1000) + 3600,
  });
  const linkId = (created.data as Record<string, unknown> | undefined)?.id as string;
  console.log(`created id=${linkId}`);

  const voided = await payway.paymentLink.void(linkId);
  record(
    'E1',
    'SDK void on a fresh OPEN link',
    `status.code=${voided.status?.code} tran_id=${JSON.stringify(voided.tran_id)} (type ${typeof voided.tran_id})`,
    voided,
  );

  const detail = await payway.paymentLink.getDetails(linkId);
  const d = detail.data as Record<string, unknown> | undefined;
  record(
    'E2',
    'detail after void',
    `status=${JSON.stringify(d?.status)} total_trxn=${JSON.stringify(d?.total_trxn)} updated_at=${JSON.stringify(d?.updated_at)}`,
    { status: d?.status, total_trxn: d?.total_trxn, updated_at: d?.updated_at },
  );

  // ── Leg 3: double-void → PTL188 ─────────────────────────────────────────
  try {
    await payway.paymentLink.void(linkId);
    record('E3', 'SDK double-void', 'UNEXPECTED SUCCESS — §23 says PTL188', {});
  } catch (e) {
    const apiErr = e as PayWayAPIError;
    record(
      'E3',
      'SDK double-void → PayWayAPIError PTL188',
      `paywayCode=${apiErr.paywayCode} message="${apiErr.message}" httpStatus=${apiErr.statusCode}`,
      { paywayCode: apiErr.paywayCode, message: apiErr.message, httpStatus: apiErr.statusCode },
    );
  }

  // ── Leg 4: bogus id → 96 ────────────────────────────────────────────────
  try {
    await payway.paymentLink.void(`bogus-${stamp}==`);
    record('E4', 'SDK void bogus id', 'UNEXPECTED SUCCESS', {});
  } catch (e) {
    const apiErr = e as PayWayAPIError;
    record(
      'E4',
      'SDK void bogus id → PayWayAPIError 96',
      `paywayCode=${apiErr.paywayCode} message="${apiErr.message}" httpStatus=${apiErr.statusCode}`,
      { paywayCode: apiErr.paywayCode, message: apiErr.message, httpStatus: apiErr.statusCode },
    );
  }

  // ── Legs 5-6: the real CLI (non-TTY → no confirm prompt; -y belt+braces) ─
  // Direct node + tsx loader (spawnSync of npx/.cmd is EINVAL on this Node/Win).
  const cli = (args: string[]): { status: number | null; stdout: string; stderr: string } =>
    spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], {
      encoding: 'utf8',
      // Sandbox TLS (DX-SEC-001): the child inherits PAYWAY_TLS_CA_FILE from
      // the environment (a locally-extracted CA bundle) instead of a
      // verification bypass — the CA-bundle mechanism replaces it.
      env: { ...process.env },
    });

  // The E1 link is already voided — create a FRESH link and void THAT
  // through the CLI for the success leg.
  const created2 = await payway.paymentLink.create({
    title: 'PLV e2e CLI void leg',
    amount: 1.5,
    currency: 'USD',
    merchantRefNo: `plv-e2e-cli-${stamp}`,
    returnUrl: 'https://merchant.example/payway/pushback',
    expiredDate: Math.floor(Date.now() / 1000) + 3600,
  });
  const linkId2 = (created2.data as Record<string, unknown> | undefined)?.id as string;

  const cliOk = cli(['payment-link', 'void', '-i', linkId2, '-y', '--json']);
  const okDoc = cliOk.stdout.slice(cliOk.stdout.indexOf('{'), cliOk.stdout.lastIndexOf('}') + 1);
  const okParsed = JSON.parse(okDoc) as { status?: { code?: string }; tran_id?: number | string };
  record(
    'E5',
    'CLI void --json success: one JSON doc, status 00, exit 0',
    `exit=${cliOk.status} status.code=${okParsed.status?.code} tran_id=${JSON.stringify(okParsed.tran_id)}`,
    { exit: cliOk.status, stdout: cliOk.stdout.slice(0, 400) },
  );

  const cliDouble = cli(['payment-link', 'void', '-i', linkId2, '-y', '--json']);
  const errDoc = cliDouble.stdout.slice(cliDouble.stdout.indexOf('{'), cliDouble.stdout.lastIndexOf('}') + 1);
  const errParsed = errDoc
    ? (JSON.parse(errDoc) as { error?: { paywayCode?: string; kind?: string; exitCode?: number; hint?: string } })
    : {};
  record(
    'E6',
    'CLI void --json double-void: PTL188 error envelope, exit 2',
    `exit=${cliDouble.status} paywayCode=${errParsed.error?.paywayCode} kind=${errParsed.error?.kind} exitCode=${errParsed.error?.exitCode}`,
    { exit: cliDouble.status, stdout: cliDouble.stdout.slice(0, 500), stderr: cliDouble.stderr.slice(0, 200) },
  );

  writeFileSync(
    resolve(OUT_DIR, `void-e2e-${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
    JSON.stringify({ ranAt: new Date().toISOString(), legs }, null, 2),
  );
  console.log('\nevidence written');
}

main().catch((e) => {
  console.error('e2e crashed:', e);
  process.exitCode = 1;
});
