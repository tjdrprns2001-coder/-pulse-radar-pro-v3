'use strict';
const assert=require('assert');
const handler=require('../api/bowl224-research.js');
const {selectFormalSymbols,createBowl224Runner}=require('../lib/research-backtest-v2/bowl224/runner.js');
const {createMemoryBowl224Store}=require('../lib/research-backtest-v2/bowl224/store.js');
const {buildBowlStats}=require('../lib/research-backtest-v2/bowl224/stats.js');

const symbols=['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','LINKUSDT','LTCUSDT','AVAXUSDT','DOTUSDT','ATOMUSDT','UNIUSDT'];
const sel=selectFormalSymbols({symbols,hypothesisRegistry:['BTCUSDT','ETHUSDT']});
assert.equal(sel.selected.length,10);
assert(!sel.selected.includes('BTCUSDT'));assert(!sel.selected.includes('ETHUSDT'));
assert.equal(selectFormalSymbols({symbols,hypothesisRegistry:['BTCUSDT','ETHUSDT']}).selected.join(','),sel.selected.join(','));
assert(sel.orderedCandidates.length===10);

(async()=>{
 const store=createMemoryBowl224Store();
 let rangeCalls=0;
 const DAY=86400000,H=3600000;
 const daily=Array.from({length:360},(_,i)=>{const px=i<=228?100:90;return[i*DAY,px,px+1,px-1,px,1,(i+1)*DAY-1,100,1,1,1,0]});
 // Force a strict 3A at index 349 after exactly 120 prior daily closes below contemporaneous SMA224, then 3B.
 daily[349][1]=101;daily[349][2]=102;daily[349][3]=100;daily[349][4]=101;
 daily[350][1]=102;daily[350][2]=103;daily[350][3]=101;daily[350][4]=102;
 daily[351][1]=103;daily[351][2]=104;daily[351][3]=102;daily[351][4]=103;
 daily[352][1]=99;daily[352][2]=100;daily[352][3]=98;daily[352][4]=99;
 const hourly=Array.from({length:700},(_,i)=>[i*H,100,101,99,100,i===510?300:100,(i+1)*H-1,100,1,1,1,0]);
 const h4=Array.from({length:300},(_,i)=>[i*4*H,100,101,99,100,100,(i+1)*4*H-1,100,1,1,1,0]);
 const provider={async getKlinesRange(symbol,tf){rangeCalls++;const rows=tf==='1d'?daily:tf==='4h'?h4:hourly;return{rows,coverage:{complete:true,rowCount:rows.length,requestCount:2}}}};
 const runner=createBowl224Runner({provider,store,now:()=>123});
 const r=await runner.runBatch({runId:'r1',startTs:349*DAY,endTs:349*DAY+DAY-1,symbols:['AAAUSDT'],hypothesisRegistry:[]});
 assert(rangeCalls>0);assert.equal(r.selectedSymbols.length,1);assert((await store.listEvents()).length>=1);
 const event=(await store.listEvents())[0];assert.equal(event.source,'bowl224-formal');
 const ann=(await store.listAnnotations())[0];assert(ann&&ann.b3);
 const run=await store.getRun('r1');assert(run.orderedCandidates.length===1&&run.selectedSymbols.length===1);
 
 await store.putOutcome(event.eventId,{eventId:event.eventId,cohort:'3A',group:'B',labels:{Hit_72H_10pct:true,Hit_7D_10pct:true,Hit_7D_15pct:false,Hit_7D_20pct:false},horizons:{h72:{mfe_pct:12,mae_pct:-2,rr:6},d7:{mfe_pct:13,mae_pct:-2,rr:6.5}},hits:{Hit_72H_10pct:{mae_before_hit_pct:-2,time_to_hit_ms:10}}});
 const stats=buildBowlStats({events:await store.listEvents(),annotations:await store.listAnnotations(),outcomes:await store.listOutcomes(),hypothesisEvidence:[{cohort:'3B',fake:true}]});
 assert.equal(stats.hypothesisEvidenceExcluded,true);
 assert.equal(stats.cohorts['3A'].sampleCount,1);
 assert.equal(stats.cohorts['3A'].labels.Hit_72H_10pct.hitRate,1);
 assert.equal(stats.cohorts['3A'].clean10pctMae3Share,1);

 const runtime={
  async status(){return{initialized:true}},
  async stats(){return stats},
  async events(){return await store.listEvents()},
  async run(){return{status:'partial'}},
  async evaluate(){return{evaluated:1}}
 };
 function call(method,query={},body={},headers={},ctx={}){return new Promise(resolve=>{let code=200,payload;const res={setHeader(){},status(n){code=n;return this},json(v){payload=v;resolve({code,payload});return v}};handler({method,query,body,headers},res,ctx)})}
 let x=await call('GET',{action:'status'},{},{},{runtime});assert.equal(x.code,200);
 x=await call('GET',{action:'stats'},{},{},{runtime});assert.equal(x.code,200);
 x=await call('POST',{action:'run'},{},{},{runtime,adminToken:''});assert.equal(x.code,503);
 x=await call('POST',{action:'run'},{},{'x-bowl224-admin-token':'secret'},{runtime,adminToken:'secret'});assert.equal(x.code,200);
 console.log('bowl224 runner api PASS');
})().catch(e=>{console.error(e);process.exit(1)});