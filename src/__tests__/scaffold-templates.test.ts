/**
 * Generated-scaffold acceptance (audit S02): the Express and Next framework
 * templates must teach the reference application's trust model in EXECUTABLE
 * form — not just exist. These tests generate the real template files,
 * transpile them (as a consumer bundler/tsx would), resolve `aba-payway-ts`
 * through a junction into the built package, and drive the generated route
 * handlers through the trust-boundary matrix: client pricing is ignored,
 * invalid/unknown/mismatched callbacks fulfill nothing, delivery acceptance
 * is idempotent, and the raw gateway session never reaches the browser.
 */
import { createServer, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ts from 'typescript';
import { EXPRESS_TEMPLATE } from '../config/templates/express.js';
import { NEXT_APP_TEMPLATE } from '../config/templates/nextApp.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const baseTemp = mkdtempSync(path.join(tmpdir(), 'payway-scaffold-'));
const API_KEY = 'stub-api-key';

let stub: Server;
let stubUrl = '';
let lastCreateBody: Record<string, string> = {};

beforeAll(async () => {
  stub = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => (raw += chunk));
    req.on('end', () => {
      // The purchase endpoint posts application/json (verified live in the
      // SDK's request pipeline); fall back to urlencoded for safety.
      try {
        lastCreateBody = JSON.parse(raw) as Record<string, string>;
      } catch {
        lastCreateBody = Object.fromEntries(new URLSearchParams(raw).entries());
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ status: { code: '0', message: 'Success!' }, qrString: 'stub-qr-payload' }));
    });
  });
  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
  stubUrl = `http://127.0.0.1:${(stub.address() as { port: number }).port}`;
  process.env.PAYWAY_BASE_URL = stubUrl;
  process.env.PAYWAY_MERCHANT_ID = 'stub-merchant';
  process.env.PAYWAY_API_KEY = API_KEY;
  process.env.PAYWAY_ENV = 'sandbox';
});

afterAll(() => {
  stub?.close();
  try {
    rmSync(baseTemp, { recursive: true, force: true });
  } catch {
    // Windows file locks after child processes — a leftover temp dir is
    // harmless; never fail the suite over cleanup.
  }
});

/** Generate the template files, transpile .ts → .js, and wire resolvers. */
function materialize(template: typeof EXPRESS_TEMPLATE, sub: string): string {
  const dir = path.join(baseTemp, sub);
  mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
  // Resolve 'aba-payway-ts' to the built package at the repo root.
  symlinkSync(repoRoot, path.join(dir, 'node_modules', 'aba-payway-ts'), 'junction');
  for (const file of template.files) {
    const source = ts.transpileModule(file.content, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    });
    const outPath = path.join(dir, file.path.replace(/\.ts$/, '.js'));
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, source.outputText, 'utf8');
  }
  return dir;
}

/** Sorted-key value concatenation — verifyCallbackDetailed's canonical form. */
function sign(body: Record<string, string>): string {
  return createHmac('sha512', API_KEY)
    .update(Object.keys(body).sort().map((key) => body[key]).join(''))
    .digest('base64');
}

interface MockRes {
  statusCode: number;
  body: unknown;
  status(code: number): MockRes;
  json(payload: unknown): MockRes;
}

function mockRes(): MockRes {
  const res = { statusCode: 200, body: undefined as unknown } as MockRes;
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (payload) => ((res.body = payload), res);
  return res;
}

const APPROVAL_BODY = (tranId: string): Record<string, string> => ({
  tran_id: tranId,
  status: '0',
  payway_amount: '3.00',
  payway_currency: 'USD',
  apex_mark: '000000',
});

describe('generated scaffold files (S02)', () => {
  it('parse cleanly as TypeScript for both frameworks', () => {
    for (const template of [EXPRESS_TEMPLATE, NEXT_APP_TEMPLATE]) {
      for (const file of template.files) {
        const parsed = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.ES2022, true);
        const parseDiagnostics = (parsed as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics ?? [];
        expect(parseDiagnostics, `${template.framework}/${file.path} has parse errors`).toHaveLength(0);
      }
    }
  });

  it('use the real verification API and never leak the raw session', () => {
    for (const template of [EXPRESS_TEMPLATE, NEXT_APP_TEMPLATE]) {
      for (const file of template.files) {
        expect(file.content.includes('sdk.auth'), `${file.path} names the nonexistent sdk.auth API`).toBe(false);
        if (file.path.includes('callback')) {
          expect(file.content).toContain('verifyCallbackDetailed');
          expect(file.content).not.toMatch(/res\.json\(session\)|NextResponse\.json\(session/);
        }
      }
    }
  });

  describe('express generated routes (executed)', () => {
    let checkoutHandler: (req: unknown, res: MockRes) => Promise<unknown>;
    let callbackHandler: (req: unknown, res: MockRes) => Promise<unknown>;
    const dir = path.join(baseTemp, 'express');

    beforeAll(async () => {
      materialize(EXPRESS_TEMPLATE, 'express');
      // The express shim records registered routes; the generated modules
      // only use `Router().post`, which is all the shim needs to support.
      const expressDir = path.join(dir, 'node_modules', 'express');
      mkdirSync(expressDir, { recursive: true });
      writeFileSync(
        path.join(expressDir, 'package.json'),
        JSON.stringify({ name: 'express', main: 'index.cjs' }),
        'utf8',
      );
      writeFileSync(
        path.join(expressDir, 'index.cjs'),
        `function Router() { const routes = []; return { routes, post(path, handler) { routes.push({ path, handler }); } }; }\nmodule.exports = { Router };\n`,
        'utf8',
      );

      const storeUrl = pathToFileURL(path.join(dir, 'routes', 'payment', 'order-store.js')).href;
      const checkoutUrl = pathToFileURL(path.join(dir, 'routes', 'payment', 'checkout.js')).href;
      const callbackUrl = pathToFileURL(path.join(dir, 'routes', 'payment', 'callback.js')).href;
      await import(storeUrl); // proves the shared store module loads
      const checkout = await import(checkoutUrl);
      const callback = await import(callbackUrl);
      checkoutHandler = checkout.default.routes[0].handler;
      callbackHandler = callback.default.routes[0].handler;
    });

    async function createOrder(clientBody: unknown): Promise<{ statusCode: number; body: Record<string, unknown> }> {
      const res = mockRes();
      await checkoutHandler({ body: clientBody }, res);
      return { statusCode: res.statusCode, body: res.body as Record<string, unknown> };
    }

    async function deliver(body: Record<string, string>): Promise<MockRes> {
      const res = mockRes();
      await callbackHandler(
        { headers: { 'x-payway-hmac-sha512': sign(body) }, body },
        res,
      );
      return res;
    }

    it('checkout derives amount from the server catalog and returns only the artifact projection', async () => {
      const { statusCode, body } = await createOrder({ sku: 'demo-item', amount: 999999 });
      expect(statusCode, `create failed: ${JSON.stringify(body)}`).toBe(201);
      // The client's 999999 "offer" is ignored — the stored order is 3.00.
      expect(body.transactionId).toMatch(/^payo/);
      // Gateway contract: tran_id must fit in 20 characters.
      expect(String(body.transactionId).length).toBeLessThanOrEqual(20);
      expect(body.paymentArtifact).toBe('stub-qr-payload');
      expect(body.responseType).toBe('qr_string');
      expect(JSON.stringify(body)).not.toContain('"raw"');
      expect(lastCreateBody.merchant_id).toBe('stub-merchant');
      expect(Number(lastCreateBody.amount)).toBe(3);
    });

    it('rejects a signature-invalid callback without fulfilling (fail closed)', async () => {
      const created = await createOrder({ sku: 'demo-item' });
      const tranId = String(created.body.transactionId);
      const body = APPROVAL_BODY(tranId);
      const res = mockRes();
      await callbackHandler({ headers: { 'x-payway-hmac-sha512': 'forged' }, body }, res);
      expect(res.statusCode).toBe(401);
    });

    it('never creates state for a verified callback about an unknown transaction', async () => {
      const body = APPROVAL_BODY('pay-never-created');
      const res = await deliver(body);
      expect(res.statusCode).toBe(202);
      expect((res.body as { fulfilled?: boolean }).fulfilled).toBeUndefined();
    });

    it('parks a wrong-amount approval unfulfilled', async () => {
      const created = await createOrder({ sku: 'demo-item' });
      const tranId = String(created.body.transactionId);
      const body = { ...APPROVAL_BODY(tranId), payway_amount: '999999.00' };
      const res = await deliver(body);
      expect(res.statusCode).toBe(202);
      expect((res.body as { reason?: string }).reason).toBe('amount mismatch');
    });

    it('fulfills exactly once across replays and duplicates, then idempotently ACKs', async () => {
      const created = await createOrder({ sku: 'demo-item' });
      const tranId = String(created.body.transactionId);
      const body = APPROVAL_BODY(tranId);

      const first = await deliver(body);
      expect((first.body as { fulfilled?: boolean }).fulfilled).toBe(true);

      // Replay of the same delivery and a concurrent duplicate both see the
      // durable inbox, not a second fulfillment.
      const replay = await deliver(body);
      const concurrent = deliver(body);
      expect((replay.body as { duplicate?: boolean }).duplicate).toBe(true);
      expect((await concurrent).body).toEqual(replay.body);

      // Fulfillment ran once (setImmediate job): a further approval for the
      // same order reports the paid state, not a new fulfillment.
      const again = deliver({ ...body, status: '0', apex_mark: '000001' });
      expect((await again).body).toEqual({ ok: true, duplicate: true });
    });

    it('updates the order but fulfills nothing for a verified decline', async () => {
      const created = await createOrder({ sku: 'demo-item' });
      const tranId = String(created.body.transactionId);
      const body = { ...APPROVAL_BODY(tranId), status: '3' };
      const res = await deliver(body);
      expect((res.body as { fulfilled?: boolean }).fulfilled).toBe(false);
    });

    it('rejects an unknown item with a 400 instead of pricing it', async () => {
      const { statusCode } = await createOrder({ sku: 'not-in-catalog' });
      expect(statusCode).toBe(400);
    });
  });

  describe('next generated routes (executed)', () => {
    let checkoutPost: (req: Request) => Promise<Response>;
    let callbackPost: (req: Request) => Promise<Response>;

    beforeAll(async () => {
      const dir = materialize(NEXT_APP_TEMPLATE, 'next');
      const nextDir = path.join(dir, 'node_modules', 'next');
      mkdirSync(nextDir, { recursive: true });
      writeFileSync(
        path.join(nextDir, 'package.json'),
        JSON.stringify({ name: 'next', type: 'module', exports: { './server': './server.mjs' } }),
        'utf8',
      );
      writeFileSync(
        path.join(nextDir, 'server.mjs'),
        `export const NextResponse = { json: (body, init) => new Response(JSON.stringify(body), init) };\n`,
        'utf8',
      );
      const checkoutUrl = pathToFileURL(path.join(dir, 'app', 'api', 'payment', 'checkout', 'route.js')).href;
      const callbackUrl = pathToFileURL(path.join(dir, 'app', 'api', 'payment', 'callback', 'route.js')).href;
      const checkout = await import(checkoutUrl);
      const callback = await import(callbackUrl);
      checkoutPost = checkout.POST;
      callbackPost = callback.POST;
    });

    const jsonRequest = (url: string, payload: unknown, headers: Record<string, string> = {}): Request =>
      new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload) });

    it('checkout stores server-owned values and projects the artifact only', async () => {
      const res = await checkoutPost(jsonRequest('http://test/api/payment/checkout', { sku: 'demo-item', amount: 1 }));
      expect(res.status).toBe(201);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.paymentArtifact).toBe('stub-qr-payload');
      expect(JSON.stringify(body)).not.toContain('"raw"');
    });

    it('callback fails closed on an invalid signature and fulfills a verified one once', async () => {
      const created = await checkoutPost(jsonRequest('http://test/api/payment/checkout', { sku: 'demo-item' }));
      const tranId = ((await created.json()) as { transactionId: string }).transactionId;

      const bad = await callbackPost(
        jsonRequest('http://test/api/payment/callback', APPROVAL_BODY(tranId), { 'x-payway-hmac-sha512': 'forged' }),
      );
      expect(bad.status).toBe(401);

      const goodBody = APPROVAL_BODY(tranId);
      const good = await callbackPost(
        jsonRequest('http://test/api/payment/callback', goodBody, { 'x-payway-hmac-sha512': sign(goodBody) }),
      );
      expect(((await good.json()) as { fulfilled?: boolean }).fulfilled).toBe(true);

      const replayBody = APPROVAL_BODY(tranId);
      const replay = await callbackPost(
        jsonRequest('http://test/api/payment/callback', replayBody, { 'x-payway-hmac-sha512': sign(replayBody) }),
      );
      expect(((await replay.json()) as { duplicate?: boolean }).duplicate).toBe(true);
    });
  });
});
