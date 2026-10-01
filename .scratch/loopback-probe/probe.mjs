// One-shot probe: which loopback topology works for spawned children here?
// 1. child -> closed port (expect fast ECONNREFUSED, exit 1)
// 2. child -> child-hosted server (exit 0 if child-to-child loopback works)
// 3. child -> parent-hosted server (known to hang on this machine; 6s cap)
import { spawnSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'loopback-probe-'));
const clientScript = path.join(dir, 'client.mjs');
writeFileSync(clientScript, `
const [url] = process.argv.slice(2);
try {
  const res = await fetch(url, { method: 'POST', body: '{}', signal: AbortSignal.timeout(5000) });
  console.log('status', res.status);
  process.exit(0);
} catch (e) {
  console.log('error', e.message, e.cause?.code ?? '');
  process.exit(1);
}
`);
const serverScript = path.join(dir, 'server.mjs');
writeFileSync(serverScript, `
import { createServer } from 'node:http';
const port = Number(process.argv[2]);
const code = Number(process.argv[3]);
createServer((_q, r) => { r.writeHead(code, {'content-type':'text/plain'}); r.end('hi'); }).listen(port, '127.0.0.1', () => console.log('up'));
`);

// 1. closed port
const closed = spawnSync(process.execPath, [clientScript, 'http://127.0.0.1:1/cb'], { encoding: 'utf8', timeout: 8000 });
console.log('closed-port:', closed.status, JSON.stringify(closed.stdout.trim()), JSON.stringify(closed.stderr.trim().split('\n')[0] ?? ''), closed.error?.message ?? '');

// 2. child-hosted server, child client
const child = spawn(process.execPath, [serverScript, '0', '200'], { encoding: 'utf8' });
let out = '';
child.stdout.on('data', (d) => (out += d));
await new Promise((resolve) => {
  const t = setTimeout(resolve, 4000);
  child.stdout.on('data', function check(d) {
    if (String(d).includes('up')) { clearTimeout(t); setTimeout(resolve, 300); }
  });
});
const childPortRaw = process.argv[2];
void childPortRaw;
// server printed 'up' but port is ephemeral; restart with fixed port detection via /proc-like trick is overkill:
// instead spawn with a candidate port and reuse.
child.kill();

function probeChildToChild(port, code) {
  return new Promise((resolve) => {
    const srv = spawn(process.execPath, [serverScript, String(port), String(code)], { encoding: 'utf8' });
    let ready = false;
    srv.stdout.on('data', function onData(d) {
      if (String(d).includes('up') && !ready) {
        ready = true;
        const cli = spawnSync(process.execPath, [clientScript, `http://127.0.0.1:${port}/cb`], { encoding: 'utf8', timeout: 8000 });
        resolve({ exit: cli.status, out: cli.stdout.trim(), err: (cli.stderr.trim().split('\n')[0] ?? ''), timedOut: cli.error?.message });
        srv.kill();
      }
    });
    setTimeout(() => { if (!ready) { resolve({ exit: null, out: 'server-never-ready' }); srv.kill(); } }, 4000);
  });
}
const c2c = await probeChildToChild(0, 200); // placeholder: need real port
console.log('NOTE: ephemeral port unknown to parent in this quick probe — see fixed-port run next');

// fixed port attempt (20244 — unlikely reserved; if reserved we get EADDRINUSE and retry once)
let r = await probeChildToChild(20244, 200);
console.log('child-to-child :', JSON.stringify(r));
if (r.out === 'server-never-ready') {
  r = await probeChildToChild(20344, 200);
  console.log('child-to-child (retry port):', JSON.stringify(r));
}
const r400 = await probeChildToChild(20245, 400);
console.log('child-to-child 400:', JSON.stringify(r400));

// 3. parent-hosted (known hang) — cap at 6s
const parent = createServer((_q, res) => { res.writeHead(200); res.end('hi'); });
await new Promise((res) => parent.listen(0, '127.0.0.1', res));
const pport = parent.address().port;
const t0 = Date.now();
const toParent = spawnSync(process.execPath, [clientScript, `http://127.0.0.1:${pport}/cb`], { encoding: 'utf8', timeout: 6000 });
console.log('child-to-parent:', toParent.status, JSON.stringify(toParent.stdout.trim()), 'ms:', Date.now() - t0, toParent.error?.message ?? '');
parent.close();
