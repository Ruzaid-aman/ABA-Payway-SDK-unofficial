import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import QRCode from 'qrcode';
import { PayWay } from '../../client.js';
import { getMockPaywayUrl, startMockPaywayServer, stopMockPaywayServer } from '../../test/index.js';

export interface DemoAppOptions {
  readonly port?: number;
}

export interface DemoPayment {
  readonly transactionId: string;
  readonly amount: number;
  readonly currency: 'USD';
  readonly createdAt: string;
  readonly qrString: string;
  readonly qrImageDataUrl: string;
  readonly simulated: true;
  status: 'PENDING' | 'APPROVED';
}

export interface DemoApp {
  readonly url: string;
  readonly server: HttpServer;
  readonly mockGateway: HttpServer;
  close(): Promise<void>;
}

const DEMO_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ABA PayWay SDK — Simulated Demo</title>
  <style>
    :root { color-scheme: light; --navy:#08234a; --ink:#0b1733; --muted:#596579; --line:#d8dee8; --red:#df181f; --amber:#d98700; --green:#147a32; --soft:#f5f7fa; }
    * { box-sizing: border-box; }
    body { margin:0; background:#fff; color:var(--ink); font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; font-size:16px; line-height:1.5; }
    header { min-height:86px; padding:22px clamp(24px,4vw,56px); background:var(--navy); color:#fff; display:flex; align-items:center; justify-content:space-between; gap:24px; }
    header strong { font-size:clamp(24px,3vw,34px); letter-spacing:-.03em; }
    header span { color:#ff353b; font-size:18px; font-weight:800; letter-spacing:.04em; }
    main { width:min(1440px,100%); margin:0 auto; padding:32px clamp(20px,3vw,40px); }
    .workspace { display:grid; grid-template-columns:minmax(300px,.9fr) minmax(420px,1.15fr); gap:18px; }
    .panel { border:1px solid var(--line); border-radius:6px; padding:26px; min-width:0; }
    h1,h2 { margin:0 0 14px; line-height:1.15; letter-spacing:-.025em; }
    h1 { font-size:28px; } h2 { font-size:26px; }
    p { margin:0; color:var(--muted); }
    .rule { border:0; border-top:1px solid var(--line); margin:28px 0; }
    .label { display:block; font-weight:750; margin-bottom:10px; }
    .amount { border:1px solid #aeb8c8; border-radius:6px; padding:18px; font-size:36px; font-weight:800; letter-spacing:-.03em; }
    .help { margin-top:10px; font-size:14px; }
    button { width:100%; margin-top:42px; border:0; border-radius:5px; padding:17px 20px; background:var(--red); color:#fff; font:700 17px/1.2 inherit; cursor:pointer; }
    button:hover { background:#c81118; } button:focus-visible { outline:3px solid #78a9ff; outline-offset:3px; }
    button:disabled { background:#bdc4ce; cursor:not-allowed; }
    .intro { background:var(--soft); border:1px solid var(--line); border-radius:6px; padding:17px 20px; color:var(--ink); }
    .status-grid { display:grid; grid-template-columns:1fr 176px; gap:24px; align-items:start; margin-top:24px; }
    dl { margin:0; display:grid; grid-template-columns:130px 1fr; gap:13px 16px; }
    dt { font-weight:750; } dd { margin:0; overflow-wrap:anywhere; }
    .status { font-weight:850; color:var(--amber); } .status.approved { color:var(--green); }
    .details { margin-top:22px; padding:14px 16px; border:1px solid var(--line); border-radius:6px; background:#fff; }
    .details strong { display:block; margin-bottom:3px; }
    .qr { aspect-ratio:1; border:2px dashed #b6bec9; display:grid; place-items:center; padding:12px; text-align:center; color:var(--muted); }
    .qr img { width:100%; height:100%; object-fit:contain; display:none; }
    #approve { margin-top:24px; }
    .lifecycle { margin-top:20px; border:1px solid var(--line); border-radius:6px; padding:18px 28px 20px; }
    .lifecycle h2 { font-size:18px; margin-bottom:18px; }
    .steps { display:grid; grid-template-columns:repeat(3,1fr); position:relative; }
    .steps::before { content:""; position:absolute; top:12px; left:16.66%; right:16.66%; height:2px; background:#c8d0dc; }
    .step { position:relative; z-index:1; text-align:center; font-weight:700; }
    .dot { width:25px; height:25px; margin:0 auto 8px; border:2px solid #6c7685; border-radius:50%; background:#fff; }
    .step.pending .dot { border-color:var(--amber); } .step.verified .dot { border-color:var(--green); }
    .step.active .dot { background:currentColor; box-shadow:inset 0 0 0 6px #fff; }
    .safety { margin-top:20px; padding:14px; border:1px solid var(--line); border-radius:6px; text-align:center; color:var(--ink); }
    @media (max-width:820px) { header { align-items:flex-start; flex-direction:column; } .workspace { grid-template-columns:1fr; } .status-grid { grid-template-columns:1fr; } .qr { width:min(220px,100%); } main { padding-top:20px; } }
  </style>
</head>
<body>
  <header><strong>ABA PayWay SDK</strong><span>SIMULATED DEMO</span></header>
  <main>
    <div class="workspace">
      <section class="panel" aria-labelledby="create-title">
        <h1 id="create-title">Create a payment without credentials</h1>
        <p>This local demo exercises the SDK payment flow without reaching ABA PayWay.</p>
        <hr class="rule">
        <span class="label">Amount (fixed)</span>
        <div class="amount">3.00 USD</div>
        <p class="help">The amount is fixed so the server, UI, and expected result stay aligned.</p>
        <button id="create" type="button">Create simulated payment</button>
      </section>
      <section class="panel" aria-labelledby="status-title" aria-live="polite">
        <h2 id="status-title">Payment status</h2>
        <div class="intro">Create a payment, observe PENDING, then simulate the verified callback outcome.</div>
        <div class="status-grid">
          <div>
            <dl><dt>Transaction ID</dt><dd id="transaction">—</dd><dt>Status</dt><dd id="status">—</dd><dt>Created at</dt><dd id="created">—</dd></dl>
            <div class="details"><strong>Status details</strong><span id="detail">No transaction created yet.</span></div>
          </div>
          <div class="qr"><img id="qr" alt="Simulated payment QR"><span id="qr-empty">QR preview appears after creation</span></div>
        </div>
        <button id="approve" type="button" disabled>Simulate approval</button>
      </section>
    </div>
    <section class="lifecycle" aria-labelledby="lifecycle-title"><h2 id="lifecycle-title">Payment lifecycle</h2><div class="steps"><div class="step created" id="step-created"><div class="dot"></div>Created</div><div class="step pending" id="step-pending"><div class="dot"></div>Awaiting payment</div><div class="step verified" id="step-verified"><div class="dot"></div>Verified</div></div></section>
    <p class="safety">No ABA credentials or external network are used.</p>
  </main>
  <script>
    const createButton = document.querySelector('#create');
    const approveButton = document.querySelector('#approve');
    let transactionId;
    function render(payment) {
      transactionId = payment.transactionId;
      document.querySelector('#transaction').textContent = payment.transactionId;
      const status = document.querySelector('#status');
      status.textContent = payment.status;
      status.className = payment.status === 'APPROVED' ? 'status approved' : 'status';
      document.querySelector('#created').textContent = new Date(payment.createdAt).toLocaleString();
      document.querySelector('#detail').textContent = payment.status === 'APPROVED' ? 'Payment verified. Fulfillment can now run once.' : 'Payment created. Wait for verified status before fulfillment.';
      const qr = document.querySelector('#qr'); qr.src = payment.qrImageDataUrl; qr.style.display = 'block';
      document.querySelector('#qr-empty').style.display = 'none';
      document.querySelector('#step-created').classList.add('active');
      document.querySelector('#step-pending').classList.toggle('active', payment.status === 'PENDING');
      document.querySelector('#step-verified').classList.toggle('active', payment.status === 'APPROVED');
      approveButton.disabled = payment.status === 'APPROVED';
    }
    createButton.addEventListener('click', async () => {
      createButton.disabled = true; createButton.textContent = 'Creating…';
      try { const response = await fetch('/api/payments', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({amount:3,currency:'USD'}) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); render(body); }
      catch (error) { document.querySelector('#detail').textContent = error.message; }
      finally { createButton.disabled = false; createButton.textContent = 'Create simulated payment'; }
    });
    approveButton.addEventListener('click', async () => { if (!transactionId) return; approveButton.disabled = true; const response = await fetch('/api/payments/' + encodeURIComponent(transactionId) + '/approve', {method:'POST'}); render(await response.json()); });
  </script>
</body>
</html>`;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function sendHtml(res: ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
  });
  res.end(DEMO_HTML);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks = await new Promise<Buffer[]>((resolve, reject) => {
    const received: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > 16_384) {
        reject(new Error('Request body is too large'));
        req.destroy();
        return;
      }
      received.push(buffer);
    });
    req.on('end', () => resolve(received));
    req.on('error', reject);
  });
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new Error('Request body must be valid JSON');
  }
}

function listen(server: HttpServer, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function closeServer(server: HttpServer): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

export async function startDemoApp(options: DemoAppOptions = {}): Promise<DemoApp> {
  const mockGateway = await startMockPaywayServer(0);
  const payments = new Map<string, DemoPayment>();
  const payway = new PayWay({
    merchantId: 'simulated-merchant',
    apiKey: 'simulated-api-key',
    environment: 'sandbox',
    baseUrl: getMockPaywayUrl(mockGateway),
    maxRetries: 0,
    rateLimitThrottling: false,
  });
  let sequence = 0;

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/') return sendHtml(res);
      if (req.method === 'GET' && url.pathname === '/api/health') return sendJson(res, 200, { ok: true, mode: 'simulated' });

      if (req.method === 'POST' && url.pathname === '/api/payments') {
        const body = await readJson(req);
        const amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount <= 0) return sendJson(res, 400, { error: 'Amount must be a positive number' });
        if (body.currency !== 'USD') return sendJson(res, 400, { error: 'The demo supports USD only' });

        sequence += 1;
        const transactionId = `demo-${Date.now().toString(36)}-${sequence.toString(36)}`;
        const result = await payway.checkout.purchase({
          transactionId,
          amount,
          currency: 'USD',
          paymentOption: 'abapay_khqr_deeplink',
          retryPolicy: 'none',
        });
        const response = result as Record<string, unknown>;
        const qrString = String(response.qr_string ?? response.qrString ?? '');
        if (!qrString) throw new Error('The simulated gateway did not return a QR payload');
        const payment: DemoPayment = {
          transactionId,
          amount,
          currency: 'USD',
          createdAt: new Date().toISOString(),
          qrString,
          qrImageDataUrl: await QRCode.toDataURL(qrString),
          status: 'PENDING',
          simulated: true,
        };
        payments.set(transactionId, payment);
        return sendJson(res, 201, payment);
      }

      const match = url.pathname.match(/^\/api\/payments\/([^/]+)(\/approve)?$/);
      if (match) {
        const payment = payments.get(decodeURIComponent(match[1] ?? ''));
        if (!payment) return sendJson(res, 404, { error: 'Simulated payment not found' });
        if (req.method === 'GET' && !match[2]) return sendJson(res, 200, payment);
        if (req.method === 'POST' && match[2]) {
          payment.status = 'APPROVED';
          return sendJson(res, 200, payment);
        }
      }

      return sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  try {
    await listen(server, options.port ?? 0);
  } catch (error) {
    await stopMockPaywayServer(mockGateway);
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === 'string') {
    await closeServer(server);
    await stopMockPaywayServer(mockGateway);
    throw new Error('Demo server did not bind to a TCP port');
  }

  let closed = false;
  return {
    url: `http://127.0.0.1:${address.port}`,
    server,
    mockGateway,
    async close() {
      if (closed) return;
      closed = true;
      await closeServer(server);
      await stopMockPaywayServer(mockGateway);
    },
  };
}

export async function checkDemoApp(): Promise<{ url: string; ok: true }> {
  const app = await startDemoApp();
  try {
    const [health, page] = await Promise.all([fetch(`${app.url}/api/health`), fetch(app.url)]);
    const status = (await health.json()) as { ok?: boolean; mode?: string };
    const html = await page.text();
    if (!health.ok || status.ok !== true || status.mode !== 'simulated' || !page.ok || !html.includes('SIMULATED DEMO')) {
      throw new Error('Demo self-check failed');
    }
    const createdResponse = await fetch(`${app.url}/api/payments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 3, currency: 'USD' }),
    });
    const created = (await createdResponse.json()) as { transactionId?: string; status?: string; qrImageDataUrl?: string };
    if (!createdResponse.ok || !created.transactionId || created.status !== 'PENDING' || !created.qrImageDataUrl?.startsWith('data:image/png')) {
      throw new Error('Demo payment creation self-check failed');
    }
    const approvedResponse = await fetch(
      `${app.url}/api/payments/${encodeURIComponent(created.transactionId)}/approve`,
      { method: 'POST' },
    );
    const approved = (await approvedResponse.json()) as { status?: string };
    if (!approvedResponse.ok || approved.status !== 'APPROVED') {
      throw new Error('Demo payment approval self-check failed');
    }
    return { url: app.url, ok: true };
  } finally {
    await app.close();
  }
}
