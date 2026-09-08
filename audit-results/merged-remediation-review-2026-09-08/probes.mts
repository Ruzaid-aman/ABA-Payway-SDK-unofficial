// Review-only synthetic fixtures. Records observations, not a pass/fail test suite.
// Run after build: npx tsx audit-results/merged-remediation-review-2026-09-08/probes.mts
import { mkdtemp, mkdir, writeFile, readFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import { addSkills, doctorSkills, removeSkills } from '../../src/cli/commands/skills.ts';
import { computeRefundableBalance, computeTokenExpiry, daysUntilTokenExpiry } from '../../src/utils.ts';
import { generateOfflineQR, inspectKhqrPayload, khqrCrc16, validateKhqrCrc } from '../../src/khqr-offline.ts';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const output = fileURLToPath(new URL('./results.json', import.meta.url));
const require = createRequire(import.meta.url);
const mock = require('../../skills/aba-payway-hash/scripts/mock-callback.cjs');
const reconciliation = require('../../skills/aba-payway-transaction-by-merchant-ref/scripts/reconcile.cjs');
const root = await mkdtemp(path.join(tmpdir(), 'payway-second-pass-'));
const results: Record<string, unknown> = { temporaryRoot: root };
const source = path.join(root, 'source');
const dest = path.join(root, 'dest');
const fixture = (name: string, version: string) => `---\nname: ${name}\ndescription: Audit fixture\nmetadata:\n  version: 1.0.0\n---\n${version}`;
const originalLog = console.log;
async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  console.log = () => {};
  try { return await fn(); } finally { console.log = originalLog; }
}
for (const name of ['aba-payway-a', 'aba-payway-b']) {
  await mkdir(path.join(source, name), { recursive: true });
  await writeFile(path.join(source, name, 'SKILL.md'), fixture(name, 'old'));
}
await quiet(() => addSkills(['codex'], source, { dest }));
const edited = path.join(dest, 'aba-payway-a', 'SKILL.md');
await writeFile(edited, 'USER EDIT');
await quiet(() => addSkills(['codex'], source, { dest }));
const firstPreserved = (await readFile(edited, 'utf8')) === 'USER EDIT';
await quiet(() => addSkills(['codex'], source, { dest }));
results.R3 = { firstUpgradePreserved: firstPreserved, secondUpgradePreserved: (await readFile(edited, 'utf8')) === 'USER EDIT' };
await quiet(() => addSkills(['codex'], source, { dest, only: ['aba-payway-a'] }));
results.R4 = { retainedBOnDisk: existsSync(path.join(dest, 'aba-payway-b', 'SKILL.md')), manifest: JSON.parse(await readFile(path.join(dest, '.payway-skills-manifest.json'), 'utf8')) };
await quiet(() => addSkills(['codex'], source, { dest }));
await writeFile(path.join(source, 'aba-payway-a', 'SKILL.md'), fixture('aba-payway-a', 'new'));
results.R7 = { outdatedInstallReportedHealthy: await quiet(() => doctorSkills(source, { agent: 'codex', dest })) };

const customFile = path.join(dest, 'aba-payway-a', 'my-notes.md');
await writeFile(customFile, 'unmanaged user notes');
// All removal targets are fixed fixture children of this run's fresh temp directory.
if (!path.resolve(dest).startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Invalid fixture target');
await quiet(() => removeSkills(['codex'], { dest }));
results.S1 = { unmanagedFileSurvivedRemoval: existsSync(customFile) };

results.R1 = computeRefundableBalance({ payment_status: 'APPROVED', original_amount: 4000, original_currency: 'KHR', payment_amount: 1, payment_currency: 'USD', refund_amount: 0 }, 'USD');
const md = await readFile(path.join(repo, 'skills/aba-payway-customer-qr/SKILL.md'), 'utf8');
const handlerText = md.slice(md.indexOf("app.post('/payway/callback'"), md.indexOf('// Fallback job:'));
let handler: any; let queued = 0; let response: unknown;
vm.runInNewContext(ts.transpile(handlerText), {
  app: { post: (_route: string, fn: any) => { handler = fn; } }, payway: { verifyCallback: () => true },
  orders: { findByCustomerRef: () => ({ expectsExactly: () => true }) },
  fulfillments: { has: () => false, claim: () => true }, queueFulfillment: () => { queued++; },
});
handler({ body: mock.buildCallbackBody({ status: 'APPROVED', amount: 10 }), headers: {} }, { sendStatus: (s: number) => { response = s; }, status: (s: number) => ({ send: () => { response = s; } }) });
results.R2 = { status: response, jobsQueued: queued, signatureVerificationStubbedSuccessful: true };
const state = path.join(root, 'legacy.json');
await writeFile(state, JSON.stringify({ last_transaction_date: '2026-09-07 12:00:00' }));
await writeFile(path.join(root, 'legacy.seen.json'), JSON.stringify({ transaction_ids: ['already-emitted'] }));
results.R6 = reconciliation.loadCheckpoint(state);
results.R6_zcodeMirror = require('../../.zcode/skills/aba-payway-transaction-by-merchant-ref/scripts/reconcile.cjs').loadCheckpoint(state);
const linkedAt = new Date('2026-09-08T00:00:00Z');
const lifecycleMd = await readFile(path.join(repo, 'skills/aba-payway-token-lifecycle/SKILL.md'), 'utf8');
const expiryStatements = lifecycleMd.match(/const expiresAt = [^;]+;[\s\S]*?const daysLeft = [^;]+;/)?.[0];
if (!expiryStatements) throw new Error('Lifecycle expiry snippet not found');
const guideDaysLeft = vm.runInNewContext(`${expiryStatements}\ndaysLeft`, {
  linkedAt, computeTokenExpiry, daysUntilTokenExpiry: (expiry: Date) => daysUntilTokenExpiry(expiry, linkedAt),
});
results.S4 = { guideDaysLeft, correctDaysLeft: daysUntilTokenExpiry(computeTokenExpiry(linkedAt), linkedAt) };

const identity = { bakongId: 'merchant@bakong', abaMerchantId: '123456789012345', acquirerName: 'ABA Bank', merchantCategoryCode: '5999', merchantName: 'Café', merchantCity: 'Phnom Penh', paywayData: 'aba-provided-template' };
const generated = generateOfflineQR({ amount: 1, currency: 'USD', merchantRef: 'AUDIT' }, identity);
const malformedBody = '000201300106304';
results.S2 = { generatedUtf8CrcValid: validateKhqrCrc(generated), generatedUtf8Inspection: inspectKhqrPayload(generated) ?? null, malformedNestedInspection: inspectKhqrPayload(malformedBody + khqrCrc16(malformedBody)) ?? null };

const env = { ...process.env, APPDATA: root };
for (const key of Object.keys(env)) if (key.startsWith('PAYWAY_')) delete env[key];
Object.assign(env, { PAYWAY_ENV: 'sandbox', PAYWAY_KHQR_BAKONG_ID: identity.bakongId, PAYWAY_KHQR_ABA_MERCHANT_ID: identity.abaMerchantId, PAYWAY_KHQR_ACQUIRER_NAME: identity.acquirerName, PAYWAY_KHQR_MERCHANT_CATEGORY_CODE: identity.merchantCategoryCode, PAYWAY_KHQR_MERCHANT_NAME: 'Audit Shop', PAYWAY_KHQR_MERCHANT_CITY: identity.merchantCity, PAYWAY_KHQR_PAYWAY_DATA: identity.paywayData });
const png = path.join(root, 'requested.png');
const cliStdout = execFileSync(process.execPath, [path.join(repo, 'dist/cli.js'), 'generate-qr', '--offline', '--ref', 'AUDIT', '-a', '1', '-y', '--no-polling', '--no-open-image', '--save-image', png, '--output', 'json'], { cwd: root, env, encoding: 'utf8' });
results.S3 = { savedRequestedPng: existsSync(png), result: JSON.parse(cliStdout) };

// Additional acceptance checks use independent installations, so a previous
// conflict cannot accidentally make an outdated-install check pass.
let fixtureIndex = 0;
async function installFixture(names = ['aba-payway-a']) {
  const dir = path.join(root, `extra-${++fixtureIndex}`);
  const pkg = path.join(dir, 'source');
  const installed = path.join(dir, 'dest');
  for (const name of names) {
    await mkdir(path.join(pkg, name), { recursive: true });
    await writeFile(path.join(pkg, name, 'SKILL.md'), fixture(name, 'old'));
  }
  return { dir, pkg, installed };
}
const legacy = await installFixture();
await mkdir(path.join(legacy.installed, 'aba-payway-a'), { recursive: true });
const legacyGuide = path.join(legacy.installed, 'aba-payway-a/SKILL.md');
await writeFile(legacyGuide, 'MY PRE-MANIFEST CUSTOMIZATION');
await quiet(() => addSkills(['codex'], legacy.pkg, { dest: legacy.installed }));
results.R3_unowned = { preservedWithoutForce: (await readFile(legacyGuide, 'utf8')) === 'MY PRE-MANIFEST CUSTOMIZATION' };

const editedRemoval = await installFixture();
await quiet(() => addSkills(['codex'], editedRemoval.pkg, { dest: editedRemoval.installed }));
const editedRemovalGuide = path.join(editedRemoval.installed, 'aba-payway-a/SKILL.md');
await writeFile(editedRemovalGuide, 'MY EDITED MANAGED GUIDE');
if (!path.resolve(editedRemoval.installed).startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Invalid fixture target');
await quiet(() => removeSkills(['codex'], { dest: editedRemoval.installed }));
results.S1_modified = { modifiedGuideSurvivedRemoval: existsSync(editedRemovalGuide) };

const retired = await installFixture(['aba-payway-a', 'aba-payway-b']);
await quiet(() => addSkills(['codex'], retired.pkg, { dest: retired.installed }));
const retiredGuide = path.join(retired.installed, 'aba-payway-b/SKILL.md');
await writeFile(retiredGuide, 'MY EDITED RETIRED GUIDE');
await rename(path.join(retired.pkg, 'aba-payway-b'), path.join(retired.dir, 'retired-source'));
await quiet(() => addSkills(['codex'], retired.pkg, { dest: retired.installed }));
results.S1_retired = { modifiedGuideSurvivedOrdinaryUpgrade: existsSync(retiredGuide) };

const stale = await installFixture();
await quiet(() => addSkills(['codex'], stale.pkg, { dest: stale.installed }));
await writeFile(path.join(stale.pkg, 'aba-payway-a/SKILL.md'), fixture('aba-payway-a', 'new'));
results.R7_isolated = { outdatedInstallReportedHealthy: await quiet(() => doctorSkills(stale.pkg, { agent: 'codex', dest: stale.installed })) };

const invalidYaml = await installFixture();
await writeFile(path.join(invalidYaml.pkg, 'aba-payway-a/SKILL.md'), '---\nname: [unterminated\ndescription: invalid YAML fixture\n---\n# Guide');
await quiet(() => addSkills(['codex'], invalidYaml.pkg, { dest: invalidYaml.installed }));
results.R7_yaml = { invalidYamlReportedHealthy: await quiet(() => doctorSkills(invalidYaml.pkg, { agent: 'codex', dest: invalidYaml.installed })) };

const partial = await installFixture(['aba-payway-a', 'aba-payway-b']);
await quiet(() => addSkills(['codex'], partial.pkg, { dest: partial.installed, only: ['aba-payway-a'] }));
results.R7_partial = { intentionalPartialReportedHealthy: await quiet(() => doctorSkills(partial.pkg, { agent: 'codex', dest: partial.installed })) };

const renamed = await installFixture();
const scriptDir = path.join(renamed.pkg, 'aba-payway-a/scripts');
await mkdir(scriptDir, { recursive: true });
await writeFile(path.join(scriptDir, 'old.cjs'), 'module.exports = "obsolete";');
await quiet(() => addSkills(['codex'], renamed.pkg, { dest: renamed.installed }));
await rename(path.join(scriptDir, 'old.cjs'), path.join(scriptDir, 'new.cjs'));
await quiet(() => addSkills(['codex'], renamed.pkg, { dest: renamed.installed }));
results.retiredResource = {
  oldScriptStillPresent: existsSync(path.join(renamed.installed, 'aba-payway-a/scripts/old.cjs')),
  newScriptPresent: existsSync(path.join(renamed.installed, 'aba-payway-a/scripts/new.cjs')),
  doctorReportedHealthy: await quiet(() => doctorSkills(renamed.pkg, { agent: 'codex', dest: renamed.installed })),
};

const actualPortalQr = md.split(/\r?\n/).find((line) => line.startsWith('000201') && line.includes('9924'))!;
if (!actualPortalQr) throw new Error('Portal fixture not found');
const broken99Body = actualPortalQr.slice(0, -8).replace('9924001317871247638256803mmp', '99010') + '6304';
if (!broken99Body.includes('990106304')) throw new Error('Broken tag99 fixture construction failed');
results.S2_tag99 = { malformedNestedInspection: inspectKhqrPayload(broken99Body + khqrCrc16(broken99Body)) ?? null };

let crashHandler: any; let queueAttempts = 0; let delivered = 0; const seen = new Set<string>();
vm.runInNewContext(ts.transpile(handlerText), {
  app: { post: (_route: string, fn: any) => { crashHandler = fn; } }, payway: { verifyCallback: () => true },
  orders: { findByCustomerRef: () => ({ expectsExactly: () => true }) },
  fulfillments: { has: (id: string) => seen.has(id), claim: (id: string) => { seen.add(id); return true; } },
  queueFulfillment: () => { queueAttempts++; if (queueAttempts === 1) throw new Error('Simulated queue outage'); delivered++; },
});
const supportedBody = mock.buildCallbackBody({ 'tran-id': 'crash-fixture', status: 'APPROVED', amount: 10 });
const responseStub = { sendStatus: () => {}, status: () => ({ send: () => {} }) };
try { crashHandler({ body: supportedBody, headers: {} }, responseStub); } catch { /* simulated enqueue failure */ }
crashHandler({ body: supportedBody, headers: {} }, responseStub);
results.callbackRecovery = { queueAttempts, delivered, transactionPermanentlyClaimed: seen.has('crash-fixture') };

process.chdir(root);
for (const key of Object.keys(process.env)) if (key.startsWith('PAYWAY_')) delete process.env[key];
Object.assign(process.env, { APPDATA: root, PAYWAY_ENV: 'sandbox', PAYWAY_MERCHANT_ID: 'auditfixture', PAYWAY_API_KEY: 'audit-fixture-key', PAYWAY_RSA_PUBLIC_KEY: generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey.export({ type: 'spki', format: 'pem' }).toString() });
globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).includes('transaction-detail') ? { status: { code: '00' }, data: { payment_status: 'APPROVED', original_amount: 10, original_currency: 'USD', payment_amount: 10, payment_currency: 'USD', refund_amount: 0 } } : { status: { code: '00', message: 'Success' } }), { status: 200, headers: { 'content-type': 'application/json' } });
const { runCli } = await import(new URL('../../src/cli.ts', import.meta.url).href);
const lines: string[] = []; console.log = (...args) => { lines.push(args.join(' ')); };
try { await runCli(['refund', '-t', 'audit-refund', '-a', '1', '-y', '--json']); } finally { console.log = originalLog; }
let parseable = true; try { JSON.parse(lines.join('\n')); } catch { parseable = false; }
results.R5 = { stdoutParseableAsJson: parseable, stdout: lines.join('\n') };
const refundFailureCases: Record<string, unknown> = {};
for (const [name, args] of [
  ['invalidCurrency', ['refund', '-t', 'audit-refund', '-a', '1', '-c', 'EUR', '-y', '--json']],
  ['invalidAmount', ['refund', '-t', 'audit-refund', '-a', '0', '-y', '--json']],
  ['gatewayRejection', ['refund', '-t', 'audit-refund', '-a', '1', '--no-preflight', '-y', '--json']],
] as const) {
  if (name === 'gatewayRejection') globalThis.fetch = async () => new Response(JSON.stringify({ status: { code: 'PTL37', message: 'Synthetic refund rejection' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  const stdout: string[] = []; const stderr: string[] = [];
  const originalError = console.error;
  console.log = (...args) => stdout.push(args.join(' '));
  console.error = (...args) => stderr.push(args.join(' '));
  process.exitCode = undefined;
  try { await runCli([...args]); } finally { console.log = originalLog; console.error = originalError; }
  let json: unknown; try { json = JSON.parse(stdout.join('\n')); } catch { json = null; }
  refundFailureCases[name] = { json, stdout: stdout.join('\n'), stderr: stderr.join('\n'), exitCode: process.exitCode ?? 0 };
}
process.exitCode = 0; // observations above deliberately include failing CLI cases
results.R5_failures = refundFailureCases;
results.realPayWayNetworkRequests = 0;
await writeFile(output, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
