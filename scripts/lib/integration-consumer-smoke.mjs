import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Compile and execute only the installed skill's assets. No source-checkout imports.
export function integrationConsumerSmoke(root, skill, env) {
  const assets = path.join(root, 'integration/assets');
  mkdirSync(assets, { recursive: true });
  cpSync(path.join(skill, 'assets'), assets, { recursive: true });
  execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'),
    '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
    '--skipLibCheck', '--outDir', 'integration/build', ...['service', 'sqlite-store', 'payway-gateway', 'express', 'next']
      .map(name => 'integration/assets/' + name + '.ts')], { cwd: root, env, encoding: 'utf8', timeout: 30_000 });
  writeFileSync(path.join(root, 'integration-smoke.mjs'), `
import assert from 'node:assert/strict';
import express from 'express';
import { signCallbackBody } from 'aba-payway-ts';
import { createIntegration } from './integration/build/service.js';
import { SqliteStore } from './integration/build/sqlite-store.js';
import { integrationRouter } from './integration/build/express.js';
import { nextIntegration } from './integration/build/next.js';
for (const framework of ['express','next']) for (const route of ['qr','hosted','link']) {
  const store = new SqliteStore(':memory:');
  store.seed({id:'order',ownerId:'alice',amountMinor:300,currency:'USD'});
  let creates=0, proofStatus='PENDING';
  const gateway = {
    async create(a) { creates++; assert.equal(a.amountMinor,300); assert.equal(store.get(a.attemptId).state,'creating');
      return {artifact:{kind:route,qrString:'simulated-qr',html:'<form method="POST"></form>',url:'https://example.invalid/pay',privateKey:'must-not-leak'},linkId:'saved-link'}; },
    async lookup(a) { return {identity:a.attemptId,status:proofStatus,amount:3,currency:'USD'}; }
  };
  const service=createIntegration(store,gateway,'synthetic-smoke-key');
  const next=nextIntegration(service,async r=>r.headers.get('x-demo-user')||undefined);
  const app=express(); app.use(express.json({limit:'64kb'}));
  app.use(integrationRouter(service,r=>r.get('x-demo-user')));
  let server;
  try {
    if(framework==='express') server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const call=async (method, endpoint, body, owner='alice',signature) => {
      const init={method,headers:{'content-type':'application/json','x-demo-user':owner,...(signature?{'x-payway-hmac-sha512':signature}:{})},...(body?{body:JSON.stringify(body)}:{})};
      if(server) return fetch('http://127.0.0.1:'+server.address().port+endpoint,init);
      const req=new Request('http://localhost'+endpoint,init);
      if(endpoint==='/payments/callback') return next.callback(req);
      if(method==='GET') return next.status(req,endpoint.split('/').pop());
      return next.create(route)(req);
    };
    assert.equal((await call('POST','/payments/create/'+route,{orderId:'order'},'')).status,401);
    const result=await call('POST','/payments/create/'+route,{orderId:'order',amount:0.01,ownerId:'mallory'});
    assert.equal(result.status,201); const created=await result.json();
    assert.equal(Object.keys(created.artifact).length,2); assert.equal(created.artifact.privateKey,undefined);
    const id=created.attemptId;
    assert.equal((await call('GET','/payments/status/'+id,undefined,'mallory')).status,404);
    assert.ok(service.pending().includes(id)); // Missing callback is already queued.
    const body=route==='link'?{merchant_ref_no:id,tran_id:'unsigned-hint',status:0}:{tran_id:id,payment_status:'APPROVED'};
    if(route!=='link') assert.equal((await call('POST','/payments/callback',body,'','invalid')).status,401);
    assert.equal((await call('POST','/payments/callback',body,'',signCallbackBody(body,'synthetic-smoke-key'))).status,202);
    await call('GET','/payments/status/'+id); assert.equal(store.jobs().length,0);
    proofStatus='APPROVED'; await Promise.all([call('GET','/payments/status/'+id),call('GET','/payments/status/'+id)]);
    assert.equal(store.jobs().length,1); assert.equal(creates,1);
  } finally { if(server) await new Promise(resolve=>server.close(resolve)); store.close(); }
}
console.log('Installed integration recipes: six Express/Next handler route cases passed (simulated).');
`);
  return execFileSync(process.execPath, ['--experimental-sqlite', '--no-warnings', 'integration-smoke.mjs'],
    { cwd: root, env, encoding: 'utf8', timeout: 30_000 }).trim();
}
