import {spawn,execFileSync} from 'node:child_process';
import {openSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
const root=process.argv[2];
const {signCallbackBody}=await import(pathToFileURL(path.join(root,'node_modules/aba-payway-ts/dist/index.js')).href);
const socket=createServer(); await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
const port=socket.address().port; await new Promise(resolve=>socket.close(resolve));
const db=path.join(root,'runtime-payments.db'),marker=path.join(root,'simulated-paid.marker');
const child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','--port',String(port)],{
  cwd:root,env:{...process.env,PAYWAY_RECIPE_DB:db,PAYWAY_RECIPE_PAID_MARKER:marker,NEXT_TELEMETRY_DISABLED:'1'},
  stdio:['ignore',openSync(path.join(root,'next-start.log'),'w'),openSync(path.join(root,'next-start-error.log'),'w')],windowsHide:true});
const base='http://127.0.0.1:'+port;
try {
  const start=Date.now();
  while(true) {try {if((await fetch(base)).ok) break;}catch{} if(Date.now()-start>40000)throw new Error('Next start timeout'); await new Promise(r=>setTimeout(r,250));}
  const call=(route,method='GET',body,user='alice',signature='')=>fetch(base+route,{method,headers:{'content-type':'application/json','x-demo-user':user,'x-payway-hmac-sha512':signature},...(body?{body:JSON.stringify(body)}:{})});
  for(const route of ['qr','hosted','link']) {
    if(existsSync(marker))unlinkSync(marker);
    const created=await call('/api/payments/'+route,'POST',{orderId:route+'-order',amount:0.01});
    assert.equal(created.status,201); const payment=await created.json();
    assert.equal(payment.artifact.kind,route);
    const status='/api/payments/status/'+payment.attemptId;
    assert.equal((await call(status,'GET',undefined,'mallory')).status,404);
    const body=route==='link'?{merchant_ref_no:payment.attemptId,tran_id:'unsigned-hint',status:0}:{tran_id:payment.attemptId,payment_status:'APPROVED'};
    if(route!=='link')assert.equal((await call('/api/payments/callback','POST',body,'','bad')).status,401);
    assert.equal((await call('/api/payments/callback','POST',body,'',signCallbackBody(body,'synthetic-key'))).status,200);
    assert.equal((await (await call(status)).json()).verified,false);
    writeFileSync(marker,'SIMULATED approved inquiry');
    const deadline=Date.now()+10000;
    while(!(await (await call(status)).json()).verified){assert.ok(Date.now()<deadline,'worker verification timeout');await new Promise(r=>setTimeout(r,100));}
    assert.equal((await (await call(status)).json()).verified,true);
    const ledger=new DatabaseSync(db);assert.equal(ledger.prepare('SELECT count(*) AS n FROM outbox').get().n,['qr','hosted','link'].indexOf(route)+1);ledger.close();
  }
  console.log(JSON.stringify({passed:true,nextHttpRoutes:3,callbackVerification:true,uniqueFulfillment:true,simulated:true}));
} finally {
  if(child.exitCode===null) {
    if(process.platform==='win32')execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'pipe',windowsHide:true});
    else child.kill();
  }
}
