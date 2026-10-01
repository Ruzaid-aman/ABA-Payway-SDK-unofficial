import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const trialRoot = mkdtempSync(path.join(tmpdir(), 'payway-agent-trials-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function run(args, cwd) { return execFileSync(npm, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 10_000_000 }); }
const packed = JSON.parse(run(['pack', '--json', '--ignore-scripts', '--pack-destination', trialRoot], root));
const pack = Array.isArray(packed) ? packed[0] : Object.values(packed)[0];
const archive = path.join(trialRoot, pack.filename);
const consumer = path.join(trialRoot, 'dependencies');
mkdirSync(consumer);
writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
run(['install', '--ignore-scripts', '--no-audit', '--no-fund', archive, 'express@5', '@types/express@5', 'typescript@5', '@types/node@24'], consumer);
for (const agent of ['codex', 'claude']) {
  const dir = path.join(trialRoot, agent);
  mkdirSync(dir);
  // Full physical package copy; no junction back to the private checkout.
  cpSync(path.join(consumer, 'node_modules'), path.join(dir, 'node_modules'), { recursive: true });
  const skill = path.join(dir, '.agents/skills/aba-payway-integration');
  cpSync(path.join(consumer, 'node_modules/aba-payway-ts/skills/aba-payway-integration'), skill, { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module', scripts: {
    build: 'tsc', test: 'npm run build && node acceptance.mjs',
  } }, null, 2));
  writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, skipLibCheck: true, outDir: 'build',
  }, include: ['*.ts', 'src/**/*.ts'] }, null, 2));
  writeFileSync(path.join(dir, 'merchant-context.ts'), `export const orders = [{ id: 'order-1', ownerId: 'alice', amountMinor: 300, currency: 'USD' as const }];
// Demonstration of an existing application session; never use this header as real production auth.
export function sessionUser(request: { headers: unknown }): string | undefined {
  const headers = request.headers as Headers | Record<string, string>;
  const value = headers instanceof Headers ? headers.get('x-demo-session') : headers['x-demo-session'];
  return value === 'alice' || value === 'mallory' ? value : undefined;
}
`);
  writeFileSync(path.join(dir, 'TASK.md'), `Use the aba-payway-integration skill at .agents/skills/aba-payway-integration/SKILL.md.
Add PayWay integration to this existing synthetic merchant project. Read merchant-context.ts and keep its orders/prices/authentication.
Implement merchant.ts exporting createMerchant(gateway, databaseFile). It must return:
{ expressApp, next: { qrPOST, hostedPOST, linkPOST, callbackPOST, statusGET(request,attemptId) }, store }.
Gateway is an injected synthetic provider with async create(attempt), lookup(attempt), following the recipe's interface.
Express endpoints are POST /payments/create/qr|hosted|link, POST /payments/callback, GET /payments/status/:attemptId.
Next handlers take standard Request objects. Customers send only orderId; existing server prices and session determine ownership.
Use durable storage across restart and expose store.jobs(), store.pending(), store.close() for the acceptance harness.
Use only synthetic callback signing key 'synthetic-trial-key'. Do not access real credentials or contact a payment gateway.
Support QR, hosted form and payment link. Verify signed online callbacks, treat unsigned link notifications as hints, query the injected provider,
fulfill once, and recover a lost response without another create. Return only attemptId and payment artifact to the customer.
Compile and run the existing acceptance harness without editing it. Add DIAGNOSIS.md explaining code 104, code 1/Wrong Hash and ambiguous-create recovery,
including evidence/enablement limits. Explain storage and production prerequisites. Keep all changes within this directory; do not modify dependencies.
`);
  writeFileSync(path.join(dir, 'acceptance.mjs'), `import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { signCallbackBody } from 'aba-payway-ts';
import { createMerchant } from './build/merchant.js';
const area = mkdtempSync(path.join(tmpdir(), 'merchant-acceptance-'));
let checks=0;
for(const framework of ['express','next']) for(const route of ['qr','hosted','link']){
  const file=path.join(area, framework+'-'+route+'.db');
  let submissions=0, proofStatus='APPROVED';
  const gateway={
    async create(attempt){submissions++; assert.equal(attempt.amountMinor,300); assert.equal(attempt.ownerId,'alice');
      return {artifact:{kind:route,qrString:'simulated-qr',html:'<form method="post"></form>',url:'https://sandbox.example/link'},linkId:route==='link'?'saved-link':undefined};},
    async lookup(attempt){return {identity:attempt.attemptId,status:proofStatus,amount:3,currency:'USD'};}
  };
  let app=createMerchant(gateway,file), server;
  async function request(method,endpoint,body,user='alice'){
    if(framework==='next'){
      const req=new Request('http://localhost'+endpoint,{method,headers:{'content-type':'application/json','x-demo-session':user,...(body?{'x-payway-hmac-sha512':signCallbackBody(body,'synthetic-trial-key')}:{})},...(body?{body:JSON.stringify(body)}:{})});
      let res;
      if(endpoint==='/payments/callback')res=await app.next.callbackPOST(req);
      else if(method==='GET')res=await app.next.statusGET(req,endpoint.split('/').pop());
      else res=await app.next[route+'POST'](req);
      return {status:res.status,body:await res.json()};
    }
    if(!server)server=await new Promise(resolve=>{const s=app.expressApp.listen(0,'127.0.0.1',()=>resolve(s));});
    const res=await fetch('http://127.0.0.1:'+server.address().port+endpoint,{method,headers:{'content-type':'application/json','x-demo-session':user,...(body?{'x-payway-hmac-sha512':signCallbackBody(body,'synthetic-trial-key')}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:res.status,body:await res.json()};
  }
  const created=await request('POST','/payments/create/'+route,{orderId:'order-1',amount:0.01,currency:'KHR',ownerId:'mallory'});
  assert.equal(created.status,201); const id=created.body.attemptId; assert.ok(id); assert.equal(created.body.artifact.kind,route);
  assert.equal((await request('GET','/payments/status/'+id,undefined,'mallory')).status,404);
  assert.equal((await request('POST','/payments/create/'+route,{orderId:'order-1'},'')).status,401);
  proofStatus='PENDING';
  const callback=route==='link'?{merchant_ref_no:id,tran_id:'untrusted-transaction',status:0}:{tran_id:id,payment_status:'APPROVED'};
  assert.equal((await request('POST','/payments/callback',callback)).status,202);
  await request('GET','/payments/status/'+id); assert.equal(app.store.jobs().length,0);
  proofStatus='APPROVED';
  await Promise.all([request('GET','/payments/status/'+id),request('GET','/payments/status/'+id)]);
  assert.equal(app.store.jobs().length,1); assert.equal(submissions,1);
  if(server){await new Promise(resolve=>server.close(resolve));server=undefined;} app.store.close();
  app=createMerchant(gateway,file); assert.equal(app.store.jobs().length,1); app.store.close();checks++;
}
// Existing-project recovery: a response can be lost after provider acceptance.
let calls=0;
const app=createMerchant({async create(){calls++;throw new Error('synthetic timeout');},
 async lookup(a){return {identity:a.attemptId,status:'APPROVED',amount:3,currency:'USD'};}},path.join(area,'recovery.db'));
const req=()=>new Request('http://localhost/payments/create/qr',{method:'POST',headers:{'content-type':'application/json','x-demo-session':'alice'},body:JSON.stringify({orderId:'order-1'})});
assert.equal((await app.next.qrPOST(req())).status,502);
assert.equal((await app.next.qrPOST(req())).status,409);assert.equal(calls,1);
const id=app.store.pending()[0];assert.ok(id);
await app.next.statusGET(new Request('http://localhost/status',{headers:{'x-demo-session':'alice'}}),id);
assert.equal(app.store.jobs().length,1);app.store.close();
const diagnosis=readFileSync('DIAGNOSIS.md','utf8');assert.ok(diagnosis.length>200);
rmSync(area,{recursive:true,force:true});
console.log(JSON.stringify({passed:true,frameworkRouteCases:checks,recovery:true}));
`);
}
writeFileSync(path.join(trialRoot, 'TRIALS.json'), JSON.stringify({ root: trialRoot, archive, agents: ['codex','claude'] }, null, 2));
console.log(JSON.stringify({ root: trialRoot, archive }));
