import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dist = await import(pathToFileURL(process.cwd() + '/dist/index.js').href);
const { createWebhookServer, createStorage } = dist;
const tempDir = mkdtempSync(join(tmpdir(), 'mini-'));
const storage = await createStorage('json', join(tempDir, 'cb.jsonl'));
const port = await new Promise((res) => { const s = http.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const server = createWebhookServer(storage, { port, quiet: true, apiKey: 'k' });
await server.start();
console.log('server on', port);
try {
  const out = execFileSync('node', ['dist/cli.js', 'webhook', 'trigger', '--url', `http://127.0.0.1:${port}/aba-payway-khqr-webhook`, '--event', 'customer-qr.payment', '--merchant-ref', 'dt-one-8989', '--api-key', 'k', '--json'], { encoding: 'utf-8', env: { ...process.env } });
  console.log('CLI said:', out.trim());
} catch (e) {
  console.log('CLI failed:', e.status, String(e.stdout), String(e.stderr).slice(0, 300));
}
console.log('captures:', storage.count());
await server.stop(); storage.close(); rmSync(tempDir, { recursive: true, force: true });
