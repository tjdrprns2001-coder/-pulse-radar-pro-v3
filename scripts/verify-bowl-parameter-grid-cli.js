'use strict';
const assert=require('node:assert/strict');
const {main}=require('./run-bowl-parameter-grid.js');
const now=()=>Date.parse('2026-10-10T00:00:00Z'),day=86400000;
const rows=[];for(let i=0;i<600;i++){const t=now()-(600-i)*day;rows.push([t,100,101,99,100,100,t+day-1])}
let asked=[],output=[];
const provider={
 async getFuturesKlines(symbol,tf,n){asked.push([symbol,tf,n]);if(symbol==='DOGEUSDT')throw Error('simulated Binance 429');
  const a=rows.map(x=>x.slice());a._source='BINANCE_FUTURES';return a;}
};
(async()=>{
 const incomplete=await main(['BTCUSDT','DOGEUSDT','--tf=1d','--limit=700'],
   {provider,now,write:s=>output.push(JSON.parse(s))});
 assert.equal(incomplete.status,'INCOMPLETE_UNIVERSE');
 assert.equal(incomplete.unavailable.length,1);
 assert.equal(output[0].status,'INCOMPLETE_UNIVERSE');
 assert.deepEqual(asked,[['BTCUSDT','1d',700],['DOGEUSDT','1d',700]]);
 const bad=await main(['BTCUSDT','ETHUSDT','--tf=1d','--limit=700'],
   {provider:{getFuturesKlines:async()=>rows},now,write:()=>{}});
 assert.equal(bad.status,'INCOMPLETE_UNIVERSE','unlabeled candles must not be silently accepted');
 let threw=false;try{await main(['BAD','--tf=1d'],{provider,now,write:()=>{}})}catch{threw=true}
 assert.equal(threw,true,'input must be validated before network calls');
 console.log('parameter grid Binance provenance and incomplete-universe protection PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
