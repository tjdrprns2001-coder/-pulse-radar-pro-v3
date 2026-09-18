'use strict';
const assert=require('assert');
const {evaluateEvent,createOutcomeEvaluator,HORIZONS}=require('../lib/research-backtest-v2/outcomes.js');
const {createMemoryResearchStore}=require('../lib/research-backtest-v2/store.js');

function bar(openTime,closeTime,o,h,l,c){return[openTime,o,h,l,c,1,closeTime,100,1,1,50,0]}
const H=3600000;
const event={eventId:'AAA:s1:0',symbol:'AAAUSDT',signalCandleCloseTs:0,entryPrice:100,outcomeSchemaVersion:'research-outcomes-v1'};
const rows=[bar(-H,0,100,999,1,100)];
for(let i=1;i<=72;i++){
  let h=101+i*.2,l=99-i*.05,c=100+i*.1;
  if(i===6)h=108;
  if(i===24)h=112;
  rows.push(bar((i-1)*H+1,i*H,100,h,l,c));
}
const out=evaluateEvent({event,futureBars:rows});
assert.equal(out.labels.Hit_6H_8pct,true,'exact +8% boundary must hit');
assert.equal(out.labels.Hit_24H_12pct,true,'exact +12% boundary must hit');
assert.equal(out.horizons.h3.status,'evaluated');
assert(Math.abs(out.horizons.h3.returnPct-0.3)<1e-9);
assert.equal(out.horizons.h6.mfePct,8);
assert(out.horizons.h6.maePct<0);
assert(Number.isFinite(out.horizons.h6.rr));
assert(out.horizons.h6.maxPrice<999,'signal candle leaked into MFE');
assert.equal(out.horizons.d3.targetEndTs,72*H);
assert.equal(Object.keys(HORIZONS).join(','),'h3,h6,h12,h24,d3');

const zeroMaeBars=[bar(1,H,100,105,100,104),bar(H+1,2*H,104,106,100,105),bar(2*H+1,3*H,105,107,100,106)];
const z=evaluateEvent({event,futureBars:zeroMaeBars});
assert.equal(z.horizons.h3.maePct,0);
assert.equal(z.horizons.h3.rr,null);
assert.equal(z.horizons.h3.noAdverseExcursion,true);
assert.equal(z.labels.Hit_6H_8pct,null,'partial 6H window must not be labeled as a miss');
assert.equal(z.labels.Hit_24H_12pct,null,'partial 24H window must not be labeled as a miss');

(async()=>{
 const store=createMemoryResearchStore();await store.putEvent(event);
 let fetched=0;
 const provider={async getKlinesAt(symbol,tf,{endTime,rows}){fetched++;assert.equal(tf,'15m');return rows?[
   bar(1,H,100,108,98,104),bar(H+1,2*H,104,112,97,106),bar(2*H+1,3*H,106,110,99,107)
 ]:[]}};
 const svc=createOutcomeEvaluator({provider,store,maxEventsPerRun:5});
 const r=await svc.run({runId:'r1',limit:5});
 assert.equal(r.evaluated,1);assert.equal(fetched,1);
 assert(await store.getOutcome(event.eventId));
 assert.deepEqual(await store.getEvent(event.eventId),event,'event must remain immutable');
 console.log('research outcomes PASS');
})().catch(e=>{console.error(e);process.exit(1)});
