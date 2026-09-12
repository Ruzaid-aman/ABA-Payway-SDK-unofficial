/**
 * Payment-link pushback receiver + success redirect.
 *  - POST (gateway pushback {tran_id, status, merchant_ref_no}, no hash): recorded
 *    to pushbacks.jsonl, answered 200 application/json {"received":true}.
 *  - GET (browser landing after payment): 302 redirect to https://chat.z.ai.
 */
import { appendFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 8787;
const REDIRECT_TO = 'https://chat.z.ai';
const OUT = resolve(fileURLToPath(new URL('.', import.meta.url)), 'pushbacks.jsonl');

const server = createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8') || null;
    const rec = {
      at: new Date().toISOString(),
      method: req.method,
      url: req.url,
      headers: req.headers,
      body,
    };
    appendFileSync(OUT, JSON.stringify(rec) + '\n');
    console.log(`[${rec.at}] ${req.method} ${req.url} body=${body ?? '(none)'}`);

    if (req.method === 'GET') {
      res.writeHead(302, { Location: REDIRECT_TO });
      res.end();
      console.log(`  -> 302 redirected browser to ${REDIRECT_TO}`);
      return;
    }

    // Pushback POSTs (and anything else): acknowledge so the gateway treats it delivered.
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ received: true }));
    console.log('  -> 200 ack (pushback recorded)');
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`pushback receiver listening on http://127.0.0.1:${PORT}`);
  console.log(`GET -> 302 ${REDIRECT_TO}; POST -> captured to ${OUT}`);
});
