import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(path.join(tmpdir(), 'payway-example-smoke-'));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PAYWAY_') && key !== 'NODE_OPTIONS'));
Object.assign(env, { PORT: '0', HOST: '127.0.0.1', ORDER_STORE_FILE: path.join(temporary, 'orders.json'), PUBLIC_BASE_URL: '', ALLOW_PRIVATE_CALLBACK_HOSTS: '' });
const child = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', path.join(root, 'examples/first-payment/src/main.ts')], { cwd: temporary, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let output = '';
let errorOutput = '';
child.stdout.on('data', data => { output += data; });
child.stderr.on('data', data => { errorOutput += data; });
let spawnError;
child.on('error', error => { spawnError = error; });
try {
  const deadline = Date.now() + 20000;
  let base;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error(`Example exited ${child.exitCode}: ${errorOutput}`);
    base = output.match(/UI:\s+(http:\/\/127\.0\.0\.1:\d+)/)?.[1];
    if (base) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!base) throw new Error(`Example startup timed out: ${errorOutput}`);
  const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
  const body = await health.json();
  if (!health.ok || body.mode !== 'demo') throw new Error('Example health did not confirm demo mode');
  const page = await fetch(base, { signal: AbortSignal.timeout(5000) });
  if (!page.ok || !(await page.text()).includes('<html')) throw new Error('Example HTML did not render');
  console.log('Reference-app smoke passed: native TypeScript startup, demo health, and HTML. No gateway credentials loaded.');
} finally {
  if (child.exitCode === null && child.pid) {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
  const relative = path.relative(path.resolve(tmpdir()), path.resolve(temporary));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe temporary cleanup path');
  rmSync(temporary, { recursive: true, force: true });
}
