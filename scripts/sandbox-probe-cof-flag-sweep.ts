/**
 * 104-blocker sweep: which linking token flags does the profile reject?
 * One POST per flag (no receiver needed — 104 precedes any callback).
 * Artifacts → .scratch/cof-full-cycle-audit/flag-sweep.json
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadDotEnvIntoProcess } from '../src/cli/dotenv.js';
import { PayWay } from '../src/client.js';

loadDotEnvIntoProcess(process.cwd());

const FLAGS = ['CITI_FLEX', 'CITO_FLEX', 'CITO_FIX', 'CITR_FLEX'] as const;
const OUT = resolve(process.cwd(), '.scratch/cof-full-cycle-audit');

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const results: Array<Record<string, unknown>> = [];
  const payway = new PayWay();
  for (const flag of FLAGS) {
    const requestId = `sweep${flag.toLowerCase().replace(/_/g, '')}`.slice(0, 24);
    try {
      const r = await payway.credentialsOnFile.linkAccount({
        requestId,
        ctid: 'custaudit01',
        tokenFlag: flag,
        currency: 'USD',
        callbackUrl: 'https://badge-towers-carrier-exactly.trycloudflare.com/aba-payway-webhook',
      });
      results.push({ flag, requestId, outcome: 'SUCCESS', result: r });
      console.log(`${flag}: SUCCESS (unexpected!)`);
    } catch (e) {
      const err = e as { paywayCode?: string; message?: string; type?: string };
      results.push({ flag, requestId, paywayCode: err.paywayCode, type: err.type, message: err.message?.slice(0, 120) });
      console.log(`${flag}: ${err.type} code=${err.paywayCode ?? '—'} ${err.message?.slice(0, 80) ?? ''}`);
    }
  }
  // Card leg via getLinkCardFormHtml → direct POST (hosted path) once, CITI_FLEX
  try {
    const html = payway.credentialsOnFile.getLinkCardFormHtml({
      requestId: 'sweepcard01',
      ctid: 'custaudit01',
      tokenFlag: 'CITI_FLEX',
      currency: 'USD',
      frequency: '1M',
      callbackUrl: 'https://badge-towers-carrier-exactly.trycloudflare.com/aba-payway-webhook',
    });
    const fields = [...html.matchAll(/name="([a-z_]+)" value="([^"]*)"/g)].map((m) => [m[1], m[2]] as const);
    const res = await fetch('https://checkout-sandbox.payway.com.kh/api/payment-credential/v3/cof/link-card', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields.map(([k, v]) => [k, v])).toString(),
      redirect: 'manual',
    });
    const location = res.headers.get('location');
    let decoded: unknown = null;
    if (location?.includes('/add-card/')) {
      try {
        decoded = JSON.parse(Buffer.from(location.split('/add-card/')[1], 'base64').toString('utf8'));
      } catch { decoded = location; }
    }
    results.push({ flag: 'CARD-CITI_FLEX', requestId: 'sweepcard01', httpStatus: res.status, hostedPayload: decoded });
    console.log(`CARD CITI_FLEX: HTTP ${res.status} hosted payload: ${JSON.stringify(decoded)}`);
  } catch (e) {
    results.push({ flag: 'CARD-CITI_FLEX', error: (e as Error).message });
    console.log(`CARD CITI_FLEX: ${(e as Error).message}`);
  }
  writeFileSync(resolve(OUT, 'flag-sweep.json'), JSON.stringify(results, null, 2));
  console.log(`\nsaved → ${resolve(OUT, 'flag-sweep.json')}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
