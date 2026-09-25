const assert=require('assert');const crypto=require('crypto');
const W=require('../lib/coin-scan/alchemy-webhook.js');
const body=JSON.stringify({webhookId:'wh1',id:'evt1',createdAt:'2026-09-25T02:00:00Z',type:'ADDRESS_ACTIVITY',event:{activity:[]}});
const key='secret',sig=crypto.createHmac('sha256',key).update(body,'utf8').digest('hex');
assert.equal(W.verify(body,sig,key),true);assert.equal(W.verify(body,'bad',key),false);
const ok=W.normalizeAlchemy(body,{signatureHeader:sig,signingKey:key,receivedAt:1234});assert.equal(ok.ok,true);assert.equal(ok.event.ingest_status,'RPC_PENDING');assert.equal(ok.event.delivery_id,'evt1');
const bad=W.normalizeAlchemy(body,{signatureHeader:'bad',signingKey:key});assert.equal(bad.status,401);
console.log('alchemy webhook verification PASS');
