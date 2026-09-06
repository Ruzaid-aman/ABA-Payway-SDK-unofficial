import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'aba-payway-package-smoke-'));
const npmExecPath = process.env.npm_execpath;

function runNpm(args, cwd) {
  if (npmExecPath) {
    return execFileSync(process.execPath, [npmExecPath, ...args], { cwd, encoding: 'utf8' });
  }
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return execFileSync(command, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
}

try {
  const packReport = JSON.parse(
    runNpm(['pack', '--json', '--ignore-scripts', '--pack-destination', temporaryRoot], repositoryRoot),
  )[0];
  const tarball = path.join(temporaryRoot, packReport.filename);

  writeFileSync(
    path.join(temporaryRoot, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
    'utf8',
  );
  runNpm(['install', tarball, '--ignore-scripts', '--no-audit', '--no-fund'], temporaryRoot);

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

  const skillsRoot = path.join(temporaryRoot, 'node_modules', 'aba-payway-ts', 'skills');
  const skillCount = readdirSync(skillsRoot, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && entry.name.startsWith('aba-payway-'),
  ).length;
  if (skillCount !== 30) throw new Error(`expected 30 installed skills, found ${skillCount}`);

  const installedPackage = JSON.parse(
    readFileSync(path.join(temporaryRoot, 'node_modules', 'aba-payway-ts', 'package.json'), 'utf8'),
  );
  if (installedPackage.name !== 'aba-payway-ts') throw new Error('installed package identity mismatch');

  console.log(`Packed-package smoke passed: ESM, CJS, declarations, CLI, and ${skillCount} skills.`);
} finally {
  const resolvedTemporaryRoot = path.resolve(temporaryRoot);
  const resolvedSystemTemp = path.resolve(tmpdir());
  if (!resolvedTemporaryRoot.startsWith(`${resolvedSystemTemp}${path.sep}`)) {
    throw new Error(`Refusing to remove temporary path outside the system temp directory: ${resolvedTemporaryRoot}`);
  }
  rmSync(resolvedTemporaryRoot, { recursive: true, force: true });
}
