/**
 * Setup helper: packs the aba-payway-ts SDK from the repository checkout this
 * example lives in, and installs it as the example's dependency — no
 * directory junctions, no repository-relative imports.
 *
 * Run from the example root:
 *
 *   npm run setup     # → packs ../../ → vendor/aba-payway-ts.tgz, then npm install
 *
 * To build against a PUBLISHED version instead, edit package.json:
 *   "aba-payway-ts": "^1.5.0"
 * and run plain `npm install`.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const exampleRoot = path.resolve(here, '..');
const sdkRoot = path.resolve(exampleRoot, '..', '..');
const vendorDir = path.join(exampleRoot, 'vendor');
const vendorTarball = path.join(vendorDir, 'aba-payway-ts.tgz');

console.log('[setup] SDK checkout:', sdkRoot);

// npm is npm.cmd on Windows — always spawn through a shell for portability.
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (args, cwd) => execFileSync(npm, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });

// 1. Build the SDK fresh so the tarball always matches current source.
console.log('[setup] building SDK (npm run build)…');
run(['run', 'build'], sdkRoot);

// 2. Pack into the SDK root, then move the tarball into vendor/.
console.log('[setup] packing SDK (npm pack)…');
const tarballName = execFileSync(npm, ['pack', '--silent'], {
  cwd: sdkRoot,
  encoding: 'utf-8',
  shell: process.platform === 'win32',
}).trim();
if (!tarballName) {
  throw new Error('npm pack produced no tarball name');
}
mkdirSync(vendorDir, { recursive: true });
const packed = path.join(sdkRoot, tarballName);
rmSync(vendorTarball, { force: true });
copyFileSync(packed, vendorTarball);
rmSync(packed, { force: true });
console.log('[setup] tarball:', vendorTarball);

// 3. Install example dependencies with the freshly packed tarball.
console.log('[setup] installing example dependencies…');
run(['install'], exampleRoot);

if (!existsSync(path.join(exampleRoot, 'node_modules', 'aba-payway-ts', 'dist', 'index.js'))) {
  throw new Error('install finished but aba-payway-ts did not resolve — check the vendor tarball');
}
console.log('[setup] done. Start the app with: npm start');
