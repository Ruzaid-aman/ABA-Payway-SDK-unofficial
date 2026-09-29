require('tsx/cjs');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { Command } = require('commander');
const { createWebhookServer } = require('../../src/webhook/server.ts');
const { registerWebhookCommands } = require('../../src/cli/commands/webhook.ts');
const { writeLifecycleState, readLifecycleState } = require('../../src/webhook/lifecycle.ts');
(async () => {
  process.env.PAYWAY_DATA_DIR = path.join(__dirname, 'probe-data');
  process.env.PAYWAY_JOURNAL = '0';
  let realServer;
  const originalListen = http.Server.prototype.listen;
  let listenArgs;
  http.Server.prototype.listen = function (...args) {
    realServer = this; listenArgs = args.map(x => typeof x);
    return originalListen.apply(this, args);
  };
  let releaseForward;
  const forwardPromise = new Promise(resolve => { releaseForward = resolve; });
  let forwardStarted = false;
  const records = [];
  const storage = { save(r) { const v={...r,id:'wh_audit',receivedAt:new Date().toISOString()}; records.push(v); return v; }, getAll(){return records;}, count(){return records.length;}, close(){} };
  const receiver = createWebhookServer(storage, {port:0, quiet:true, forwardTo:'http://127.0.0.1:1/audit', forwardFetch:async () => { forwardStarted=true; await forwardPromise; return new Response('', {status:200}); }});
  let responseArrived=false;
  try {
    await receiver.start();
    const address=realServer.address();
    const request=fetch(`http://127.0.0.1:${address.port}/aba-payway-webhook`, {method:'POST', headers:{'Content-Type':'application/json'}, body:'{"tran_id":"synthetic-audit"}'}).then(r => {responseArrived=true;return r.json();});
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(forwardStarted,true); assert.equal(records.length,1); assert.equal(responseArrived,false);
    console.log(JSON.stringify({probe:'ack_waits_for_forward',captureSaved:true,forwardStarted,responseArrivedBeforeForwardReleased:responseArrived,listenerAddress:address.address,listenArgumentTypes:listenArgs}));
    releaseForward(); await request;
  } finally { releaseForward(); await receiver.stop(); http.Server.prototype.listen=originalListen; }
  const signals=[]; const originalKill=process.kill;
  writeLifecycleState({version:1,pid:123456,port:8443,publicBaseUrl:null,callbackUrl:null,previousCallbackUrl:null,startedAt:'2000-01-01T00:00:00Z'});
  try {
    process.kill=(pid,signal) => {signals.push({pid,signal}); return true;};
    const logs=[]; const program=new Command(); registerWebhookCommands(program,{log:line=>logs.push(JSON.parse(line))});
    await program.parseAsync(['node','probe','webhook','status','--json']);
    await program.parseAsync(['node','probe','webhook','stop','--json']);
    assert.equal(logs[0].state,'running'); assert.equal(logs[1].stopped,true);
    assert.deepEqual(signals,[{pid:123456,signal:0},{pid:123456,signal:'SIGTERM'}]);
    assert.equal(readLifecycleState(),null);
    console.log(JSON.stringify({probe:'stale_identity',signals,claimedRunning:logs[0].state,claimedStopped:logs[1].stopped,lifecycleCleared:true,realProcessesSignalled:false}));
  } finally { process.kill=originalKill; }
})().catch(e=>{console.error(e);process.exitCode=1;});
