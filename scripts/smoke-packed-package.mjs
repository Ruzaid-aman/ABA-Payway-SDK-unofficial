import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePackReport } from './lib/pack-report.mjs';

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

  console.log(`Packed-package smoke passed: ESM, CJS, declarations, CLI demo, ${skillCount} skills, and install/doctor/upgrade/remove preservation.`);
} finally {
  const resolvedTemporaryRoot = path.resolve(temporaryRoot);
  const resolvedSystemTemp = path.resolve(tmpdir());
  if (!resolvedTemporaryRoot.startsWith(`${resolvedSystemTemp}${path.sep}`)) {
    throw new Error(`Refusing to remove temporary path outside the system temp directory: ${resolvedTemporaryRoot}`);
  }
  rmSync(resolvedTemporaryRoot, { recursive: true, force: true });
}
