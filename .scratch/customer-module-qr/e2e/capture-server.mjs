// Capture server sibling: hosts the dist webhook server, appends every capture
// {id, body, headers, record} to the evidence JSONL, prints PORT: on stdout.
import http from 'node:http';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [evidenceFile, apiKey] = process.argv.slice(2);
const dist = await import(pathToFileURL(process.cwd() + '/dist/index.js').href);
const port = await new Promise((res) => { const s = http.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

const storage = await dist.createStorage('json', process.cwd() + '/.scratch/customer-module-qr/e2e/captures.jsonl');
const server = dist.createWebhookServer(storage, { port, quiet: true, apiKey });
await server.start();
console.log(`PORT:${port}`);

// Poll the storage for captures and mirror them to the evidence file.
setInterval(() => {
  for (const record of storage.getAll()) {
    if (record.id !== appendFileSync.seen?.[record.id]) {
      appendFileSync(evidenceFile, JSON.stringify(record) + '\n');
      (appendFileSync.seen ??= {})[record.id] = record.id;
    }
  }
}, 200);
