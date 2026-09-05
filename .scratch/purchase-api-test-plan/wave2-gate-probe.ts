/**
 * Probe: which purchase param combos yield JSON vs the hosted HTML page,
 * and capture the full hosted HTML for the user checklist (R2 routes).
 * Run: NODE_TLS_REJECT_UNAUTHORIZED='0' npx tsx .scratch/purchase-api-test-plan/wave2-gate-probe.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { PayWay } from '../../src/index.js';

for (const line of fs.readFileSync(path.resolve(import.meta.dirname, '../../.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
}
const OUT_DIR = path.resolve(import.meta.dirname, '../../test-output/purchase-test-campaign');
const RETURN_URL = 'https://example.com/checkout/return';
const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID,
  apiKey: process.env.PAYWAY_API_KEY,
  publicKeyPem: process.env.PAYWAY_RSA_PUBLIC_KEY,
  environment: 'sandbox',
});

interface ProbeResult {
  combo: string;
  result: 'JSON' | 'HTML' | 'ERROR';
  fields?: string[];
  checkoutQrUrl?: string;
  htmlBytes?: number;
  htmlTitle?: string;
}

async function probe(id: string, combo: string, params: Record<string, unknown>): Promise<ProbeResult> {
  try {
    const r = (await payway.checkout.purchase({
      transactionId: id, amount: 2.0, currency: 'USD', paymentOption: 'cards', returnUrl: RETURN_URL, lifetime: 1440, ...params,
    })) as Record<string, unknown>;
    return { combo, result: 'JSON', fields: Object.keys(r), checkoutQrUrl: r.checkout_qr_url as string | undefined };
  } catch (err) {
    const e = err as Error & { rawBody?: unknown };
    const raw = typeof e.rawBody === 'string' ? e.rawBody : undefined;
    if (raw?.startsWith('<!DOCTYPE html')) {
      const file = path.join(OUT_DIR, `${id}-hosted-page.html`);
      fs.writeFileSync(file, raw);
      return { combo, result: 'HTML', htmlBytes: raw.length, htmlTitle: (raw.match(/<title>([^<]*)</) ?? [])[1] };
    }
    return { combo, result: 'ERROR', fields: [e.constructor.name], checkoutQrUrl: e.message.slice(0, 160) };
  }
}

const results: ProbeResult[] = [];
results.push(await probe('w2p1khqrgate0', 'gate0-only khqr', { paymentOption: 'abapay_khqr', paymentGate: 0 }));
results.push(await probe('w2p2cardsgate0', 'gate0-only cards', { paymentOption: 'cards', paymentGate: 0 }));
results.push(await probe('w2p3cardshosted', 'hosted_view-only cards', { paymentOption: 'cards', viewType: 'hosted_view' }));
results.push(await probe('w2p4khqrhosted', 'hosted_view-only khqr', { paymentOption: 'abapay_khqr', viewType: 'hosted_view' }));
results.push(await probe('w2p5cardsgate1', 'gate1 cards', { paymentOption: 'cards', paymentGate: 1 }));
results.push(await probe('w2p6cardsgate0hosted', 'gate0+hosted cards (F8)', { paymentOption: 'cards', paymentGate: 0, viewType: 'hosted_view' }));
console.log(JSON.stringify(results, null, 1));
fs.writeFileSync(path.join(OUT_DIR, 'wave2-gate-probe.json'), JSON.stringify(results, null, 2));
