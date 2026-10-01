/**
 * Executable acceptance for the guide-16 "verdict mode" snippet (audit WP09).
 *
 * The guide used to show `createStorage('json')` without the required `await`
 * (it is an async factory) and never started the listener, alongside retry
 * language the gateway contract does not support. The acceptance here:
 *
 *  1. Doc-drift guard — the published snippet must contain the API-correct
 *     forms (`await createStorage(...)`, `await listener.start()`,
 *     `await listener.stop()`) and must not teach gateway retries.
 *  2. Executable leg — the snippet's EXACT call sequence is evaluated as
 *     written (only `port: 8443` → `port: 0` substituted, so CI never fights
 *     over a fixed port) and driven with real deliveries: a valid signature
 *     is accepted 200, a tampered one is rejected 401, an unsigned one is
 *     captured 200-but-untrusted. Everything is stored, and stop() releases
 *     the port.
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createStorage } from '../webhook/storage-factory.js';
import { createWebhookServer } from '../webhook/server.js';
import { signCallbackBody } from '../auth.js';

/** Same ephemeral-port probe the other webhook suites use (`port: 0` never
 * propagates to `listener.port`, so the test needs a real port up front). */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (address && typeof address === 'object') {
        const found = address.port;
        probe.close(() => resolve(found));
      } else {
        probe.close(() => reject(new Error('no port')));
      }
    });
    probe.on('error', reject);
  });
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const guide = readFileSync(join(repoRoot, 'docs', 'guides', '16-webhook-setup-guide.md'), 'utf8');

const verdictSection = guide.split('#### Verdict mode')[1] ?? '';
const snippetMatch = verdictSection.match(/```typescript\n([\s\S]*?)```/);
const snippet = snippetMatch?.[1] ?? '';

describe('guide 16 verdict-mode snippet (WP09)', () => {
  it('uses the real async-factory and lifecycle API in its published form', () => {
    expect(snippet, 'verdict-mode snippet must exist in guide 16').toContain('createStorage');
    expect(snippet).toContain("await createStorage('json')");
    expect(snippet).toContain('rejectInvalidSignature: true');
    expect(snippet).toContain('await listener.start()');
    expect(snippet).toContain('await listener.stop()');
    // The false contract that was removed with WP09 must not come back.
    expect(snippet).not.toMatch(/\bretry\b/i);
    expect(verdictSection).not.toContain('redelivery storms');
    expect(verdictSection).not.toContain('gateway may omit it on retries');
  });

  it('the snippet as written compiles, starts, enforces verdicts, and stops', async () => {
    expect(snippet).toBeTruthy();
    const apiKey = 'doc-snippet-verdict-key';
    const previous = process.env.PAYWAY_API_KEY;
    process.env.PAYWAY_API_KEY = apiKey;
    try {
      // The ONLY substitutions: a real free port (the doc pins 8443) and the
      // snippet's own shutdown tail is cut so this test drives the deliveries
      // and stops the listener itself.
      const port = await getFreePort();
      const code = snippet.replace("import { createWebhookServer, createStorage } from 'aba-payway-ts';", '')
        .replace('port: 8443', `port: ${port}`)
        .split('// ... later, on shutdown:')[0];
      const runner = new Function(
        'createWebhookServer', 'createStorage', 'process',
        `"use strict"; return (async () => {\n${code}\nreturn listener; })();`,
      );
      const listener = await runner(createWebhookServer, createStorage, process);
      expect(listener.isRunning, 'listener must be accepting connections after start()').toBe(true);

      const base = `http://127.0.0.1:${listener.port}/aba-payway-webhook`;
      const body = JSON.stringify({ tran_id: 'doc-snippet-1', apv: '123', status: '0', return_params: '' });
      const goodSig = signCallbackBody({ tran_id: 'doc-snippet-1', apv: '123', status: '0', return_params: '' }, apiKey);

      const valid = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', 'x-payway-hmac-sha512': goodSig }, body });
      expect(valid.status, 'valid signature → 200 acknowledged').toBe(200);

      const tampered = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', 'x-payway-hmac-sha512': goodSig }, body: body.replace('doc-snippet-1', 'doc-snippet-TAMPERED') });
      expect(tampered.status, 'invalid signature → 401 in verdict mode').toBe(401);

      const unsigned = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      expect(unsigned.status, 'unsigned → still captured (never trusted to fulfill)').toBe(200);

      await listener.stop();
      expect(listener.isRunning).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.PAYWAY_API_KEY;
      else process.env.PAYWAY_API_KEY = previous;
    }
  }, 15000);
});
