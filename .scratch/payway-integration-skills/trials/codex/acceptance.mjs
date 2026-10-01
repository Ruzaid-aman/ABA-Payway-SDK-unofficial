import assert from 'node:assert/strict';
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
