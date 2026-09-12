#!/usr/bin/env node
// Tiny static server for link-card review e2e (2026-09-12).
// Serves a directory over http://127.0.0.1:<port> so the browser-use IAB can
// open locally-generated PayWay forms (IAB cannot navigate file: URLs).
// Usage: node serve-form.mjs <dir> [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? '.');
const port = Number(process.argv[3] ?? 8791);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json' };

createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
  const file = join(dir, rel || 'index.html');
  try {
    const s = await stat(file);
    const body = await readFile(s.isDirectory() ? join(file, 'index.html') : file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`serving ${dir} at http://127.0.0.1:${port}`));
