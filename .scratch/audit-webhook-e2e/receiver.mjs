// Receiver stub for the webhook-workbench live audit: appends every POST it
// receives as one JSON line: {body, sig, headers} to the file in argv[2].
// Prints its listening port on stdout so the bash driver can parse it.
import http from 'node:http';
import { appendFileSync } from 'node:fs';

const out = process.argv[2];
const srv = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    appendFileSync(
      out,
      JSON.stringify({
        body: Buffer.concat(chunks).toString('utf-8'),
        sig: req.headers['x-payway-hmac-sha512'] ?? null,
        path: req.url,
      }) + '\n',
    );
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"received":true}');
  });
});
srv.listen(0, '127.0.0.1', () => {
  const addr = srv.address();
  console.log(`PORT:${addr.port}`);
});
