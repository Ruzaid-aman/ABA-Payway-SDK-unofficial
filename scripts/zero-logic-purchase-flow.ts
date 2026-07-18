import { sdk } from '../src/index.js';
import type { ResponseType } from '../src/schema.js';

async function main() {
  console.log('PayWay SDK - Zero-Logic Purchase Flow Demo');
  const types = ['deeplink','qr_string','qr_image','url','html'];
  for (const t of types) {
    const s = sdk.test(t, { transactionId: 'demo-'+t, amount: 10 });
    const r = await sdk.handle(s, {});
    console.log('  ['+(r.success?'PASS':'FAIL')+'] '+t+' -> '+r.action);
  }
  const report = await sdk.runTestSuite();
  for (const r of report.results) {
    console.log('  ['+(r.passed?'PASS':'FAIL')+'] '+r.name+' -> '+r.message);
  }
  console.log('Total: '+report.total+' Passed: '+report.passed+' Failed: '+report.failed);
  if (!report.success) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
