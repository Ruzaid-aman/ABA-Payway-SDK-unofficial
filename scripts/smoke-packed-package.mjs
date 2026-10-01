import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePackReport } from './lib/pack-report.mjs';
import { navigationFailures } from './lib/public-navigation.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'aba-payway-package-smoke-'));
const npmExecPath = process.env.npm_execpath;

function runNpm(args, cwd, env = process.env) {
  if (npmExecPath) {
    return execFileSync(process.execPath, [npmExecPath, ...args], { cwd, env, encoding: 'utf8' });
  }
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return execFileSync(command, args, { cwd, env, encoding: 'utf8', shell: process.platform === 'win32' });
}

/**
 * A clean consumer environment for the temp install. `npm run` exports every
 * parent config entry as npm_config_* env vars, and npm 12 REJECTS env-sourced
 * allowScripts on project-scoped installs ("--allow-scripts is not allowed in
 * project-scoped installs"). The consumer must resolve npm config from files
 * (~/.npmrc / project .npmrc), not from the maintainer's session.
 */
function consumerNpmEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('npm_config_')) delete env[key];
  }
  return env;
}

try {
  // npm ≤11 emits an ARRAY of pack reports; npm 12 emits an OBJECT keyed by
  // package name — normalize both (audit R02: `[0]` indexing broke on npm 12).
  const packReport = normalizePackReport(
    JSON.parse(
      runNpm(['pack', '--json', '--ignore-scripts', '--pack-destination', temporaryRoot], repositoryRoot),
    ),
  );
  if (!packReport.filename) throw new Error('npm pack report missing .filename');
  const tarball = path.join(temporaryRoot, packReport.filename);

  writeFileSync(
    path.join(temporaryRoot, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
    'utf8',
  );
  runNpm(['install', tarball, '--ignore-scripts', '--no-audit', '--no-fund'], temporaryRoot, consumerNpmEnv());

  writeFileSync(
    path.join(temporaryRoot, 'smoke.mjs'),
    "import { PayWay, server } from 'aba-payway-ts';\nif (!PayWay || !server) throw new Error('missing ESM exports');\n",
    'utf8',
  );
  writeFileSync(
    path.join(temporaryRoot, 'smoke.cjs'),
    "const sdk = require('aba-payway-ts');\nif (!sdk.PayWay || !sdk.server) throw new Error('missing CJS exports');\n",
    'utf8',
  );
  writeFileSync(
    path.join(temporaryRoot, 'smoke.ts'),
    "import type { PayWayConfig, TransactionSession } from 'aba-payway-ts';\nconst config: PayWayConfig = { merchantId: 'm', apiKey: 'k' };\nconst session: TransactionSession | undefined = undefined;\nvoid config; void session;\n",
    'utf8',
  );
  // Typed CommonJS consumer (audit C1): under NodeNext a .cts file resolves
  // types through the `require` condition, so it fails with TS1479 unless the
  // exports map points `require.types` at the ESM-typed dist/index.d.cts. The
  // runtime require() in smoke.cjs cannot catch this — types are never loaded.
  writeFileSync(
    path.join(temporaryRoot, 'smoke.cts'),
    "import { PayWay } from 'aba-payway-ts';\nimport type { PayWayConfig, TransactionSession } from 'aba-payway-ts';\nconst config: PayWayConfig = { merchantId: 'm', apiKey: 'k' };\nconst session: TransactionSession | undefined = undefined;\nvoid config;\nvoid session;\nvoid PayWay;\n",
    'utf8',
  );

  execFileSync(process.execPath, ['smoke.mjs'], { cwd: temporaryRoot, stdio: 'pipe' });
  execFileSync(process.execPath, ['smoke.cjs'], { cwd: temporaryRoot, stdio: 'pipe' });
  execFileSync(
    process.execPath,
    [
      path.join(repositoryRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
      '--noEmit',
      '--strict',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--skipLibCheck',
      'smoke.ts',
      'smoke.cts',
    ],
    { cwd: temporaryRoot, stdio: 'pipe', encoding: 'utf8', env: process.env },
  );

  const cliOutput = execFileSync(
    process.execPath,
    [path.join(temporaryRoot, 'node_modules', 'aba-payway-ts', 'dist', 'cli.js'), '--help'],
    { cwd: temporaryRoot, encoding: 'utf8' },
  );
  if (!cliOutput.includes('payway-sdk')) throw new Error('installed CLI help did not render');

  const demoOutput = execFileSync(
    process.execPath,
    [path.join(temporaryRoot, 'node_modules', 'aba-payway-ts', 'dist', 'cli.js'), 'demo', '--check'],
    { cwd: temporaryRoot, encoding: 'utf8' },
  );
  if (!demoOutput.includes('Credential-free demo check passed')) {
    throw new Error('installed CLI demo self-check failed');
  }

  const skillsRoot = path.join(temporaryRoot, 'node_modules', 'aba-payway-ts', 'skills');
  const skillCount = readdirSync(skillsRoot, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && entry.name.startsWith('aba-payway-'),
  ).length;
  // Authoritative inventory: compare the installed count against the repo's
  // own skills directory, so the gate can never go stale when skills are
  // added or removed (audit R02: a hardcoded 32 broke against the 34-skill
  // package).
  const expectedSkillCount = readdirSync(path.join(repositoryRoot, 'skills'), { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && entry.name.startsWith('aba-payway-'),
  ).length;
  if (skillCount !== expectedSkillCount) {
    throw new Error(`expected ${expectedSkillCount} installed skills (repo inventory), found ${skillCount}`);
  }

  // Exercise the consumer's dependency graph (including the YAML parser) and
  // installed paths, rather than only counting guides in the tarball.
  const consumerEnv = { ...process.env, APPDATA: temporaryRoot };
  for (const key of Object.keys(consumerEnv)) if (key.startsWith('PAYWAY_')) delete consumerEnv[key];
  const cli = path.join(temporaryRoot, 'node_modules', 'aba-payway-ts', 'dist', 'cli.js');
  const dest = path.join(temporaryRoot, 'installed-skills');
  const runCli = (args) => execFileSync(process.execPath, [cli, ...args], { cwd: temporaryRoot, env: consumerEnv, encoding: 'utf8' });
  const packageRoot = path.join(temporaryRoot, 'node_modules', 'aba-payway-ts');
  const packedFiles = new Set(packReport.files.map(({ path: file }) => file.replaceAll('\\', '/')));
  for (const file of packedFiles) {
    if (!/\.(md|txt)$/.test(file)) continue;
    const failures = navigationFailures(file, readFileSync(path.join(packageRoot, file), 'utf8'), packedFiles,
      (target) => readFileSync(path.join(packageRoot, target), 'utf8'));
    if (failures.length) throw new Error(failures.join('\n'));
  }
  for (const topic of ['support', 'contributing', 'security', 'first-payment-walkthrough', 'sdk-cli-reference', 'storage-service']) {
    const result = runCli(['docs', topic]);
    if (result.length < 300) throw new Error(`Installed docs ${topic} incomplete`);
  }
  runCli(['docs', 'search', 'local-webhook-workbench']);
  const diagnosis = JSON.parse(runCli(['doctor', '--route', 'demo', '--json']));
  if (!diagnosis.dataRoot) throw new Error('Installed doctor did not locate the data root');
  // Execute the installed starter's HTTP create -> simulated approval -> verify
  // flow, importing only its allowlisted files and the installed SDK.
  writeFileSync(path.join(temporaryRoot, 'starter-smoke.mjs'), `
import { OrderStore } from './node_modules/aba-payway-ts/docs-packaged/starter/app/store.js';
import { createPaymentEngine } from './node_modules/aba-payway-ts/docs-packaged/starter/app/payments.js';
import { startExampleServer, stopExampleServer } from './node_modules/aba-payway-ts/docs-packaged/starter/app/server.js';
const store = new OrderStore('starter-store.json');
const engine = createPaymentEngine({mode:'demo', publicBaseUrl:'http://127.0.0.1:0', store});
const handle = await startExampleServer({port:0,host:'127.0.0.1',store,engine});
const base = 'http://127.0.0.1:' + handle.port;
engine.setCallbackBaseUrl(base);
const post = async (route, body={}) => {
  const response = await fetch(base + route, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  if (!response.ok) throw new Error('Starter HTTP ' + response.status);
  return response.json();
};
try {
  const page = await fetch(base);
  if (!page.ok || !(await page.text()).includes('SIMULATED')) throw new Error('Starter UI missing simulation marker');
  const {order} = await post('/api/orders', {productId:'approve'});
  const payment = await post('/api/orders/create-qr', {orderId:order.orderId});
  if (!payment.simulated) throw new Error('Starter not simulated');
  await new Promise(resolve => setTimeout(resolve, 700));
  const verified = await post('/api/orders/status/' + payment.transactionId);
  if (verified.order.status !== 'paid' || verified.gatewayStatus !== 'APPROVED') throw new Error('Starter verification failed');
  await post('/api/orders/status/' + payment.transactionId);
  if (store.listEvents(order.orderId).filter(event => event.type === 'payment_verified').length !== 1) throw new Error('Duplicate fulfillment');
} finally { await stopExampleServer(handle.server); }
`);
  execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', 'starter-smoke.mjs'],
    { cwd: temporaryRoot, env: consumerEnv, encoding: 'utf8', timeout: 30_000 });
  runCli(['skills', 'add', 'codex', '--dest', dest]);
  runCli(['skills', 'doctor', '--agent', 'codex', '--dest', dest]);
  if (!existsSync(path.join(dest, 'aba-payway-customer-qr', 'references', 'fulfillment-outbox.md'))) {
    throw new Error('installed outbox reference missing');
  }
  const customized = path.join(dest, 'aba-payway-refund', 'SKILL.md');
  const edited = `${readFileSync(customized, 'utf8')}\n<!-- consumer customization -->\n`;
  writeFileSync(customized, edited);
  runCli(['skills', 'add', 'codex', '--dest', dest]);
  runCli(['skills', 'add', 'codex', '--dest', dest, '--only', 'aba-payway-refund']);
  if (readFileSync(customized, 'utf8') !== edited) throw new Error('consumer upgrade overwrote an edit');
  runCli(['skills', 'remove', 'codex', '--dest', dest]);
  if (readFileSync(customized, 'utf8') !== edited) throw new Error('consumer uninstall removed an edit');

  const installedPackage = JSON.parse(
    readFileSync(path.join(temporaryRoot, 'node_modules', 'aba-payway-ts', 'package.json'), 'utf8'),
  );
  if (installedPackage.name !== 'aba-payway-ts') throw new Error('installed package identity mismatch');

  console.log(`Packed-package smoke passed: ESM, CJS, typed ESM + typed CJS declarations, CLI demo, corpus links/anchors, offline navigation, data root, starter create/verify/fulfill once, ${skillCount} skills, and install/doctor/upgrade/remove preservation.`);
} finally {
  const resolvedTemporaryRoot = path.resolve(temporaryRoot);
  const resolvedSystemTemp = path.resolve(tmpdir());
  if (!resolvedTemporaryRoot.startsWith(`${resolvedSystemTemp}${path.sep}`)) {
    throw new Error(`Refusing to remove temporary path outside the system temp directory: ${resolvedTemporaryRoot}`);
  }
  rmSync(resolvedTemporaryRoot, { recursive: true, force: true });
}
