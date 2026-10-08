'use strict';
const assert=require('assert');
const fs=require('fs');
const {alignedFlow,oiAsOf,fundingAsOf,preIgnition,createFlowIgnitionService}=require('../lib/chart-v1/flow-ignition.js');
const STEP=4*3600000,NOW=2000000000000,rows=[];
for(let i=0;i<130;i++){
 const time=NOW-(130-i)*STEP,price=100+Math.sin(i/5)*.4,volume=8000,quote=volume*price;
 rows.push([time,price-.05,price+.2,price-.2,price,volume,time+STEP-1,quote,100,0,quote*.60]);
}
function copy(src,venue){const result=src.map(r=>r.slice());if(venue)Object.defineProperty(result,'_source',{value:venue});return result}
const spot=copy(rows,'BINANCE_SPOT'),fut=copy(rows,'BINANCE_FUTURES');
const live=[NOW,1,999999,0,999999,999999,NOW+STEP-1,999999999,300,0,999999999];
spot.push(live.slice());fut.push(live.slice());
const aligned=alignedFlow(spot,fut,{tf:'4h',nowMs:NOW});
assert.equal(aligned.status,'available');assert.equal(aligned.matched_closed_candles,130);assert.equal(aligned.spot_buy_confirmation,'confirmed');
assert.equal(aligned.latest_common_closed_at,NOW-1);assert.equal(aligned.quote_volume_last_3.spot_to_futures_ratio,1);
const futureOnly=alignedFlow(null,fut,{tf:'4h',nowMs:NOW});
assert.equal(futureOnly.status,'unavailable');assert.equal(futureOnly.spot_buy_confirmation,'unknown');assert.equal(futureOnly.quote_volume_last_3.spot_to_futures_ratio,null);
const stale=alignedFlow(spot,fut,{tf:'4h',nowMs:NOW+STEP*8});assert.equal(stale.status,'stale');
const cross=alignedFlow(spot,copy(rows,'BYBIT_LINEAR'),{tf:'4h',nowMs:NOW});
assert.equal(cross.status,'available');assert.equal(cross.venue_comparability,'cross_venue');assert.equal(cross.spot_buy_confirmation,'not_confirmed');
const sparse=copy(rows,'BINANCE_FUTURES');sparse.at(-1)[7]=null;sparse.at(-2)[7]=null;
const incomplete=alignedFlow(spot,sparse,{tf:'4h',nowMs:NOW});assert.equal(incomplete.status,'partial');assert.equal(incomplete.quote_volume_last_3.spot_to_futures_ratio,null);
const disjoint=copy(rows,'BINANCE_FUTURES').map(r=>{const x=r.slice();x[0]+=3600000;x[6]+=3600000;return x});
assert.equal(alignedFlow(spot,disjoint,{tf:'4h',nowMs:NOW}).matched_closed_candles,0);
const oiRows=Array.from({length:6},(_,i)=>({timestamp:NOW-1-(5-i)*3600000,sumOpenInterest:String(100+i*2),_fallbackSource:'BYBIT_LINEAR'}));
oiRows.push({timestamp:NOW+3600000,sumOpenInterest:'1000000',_fallbackSource:'BYBIT_LINEAR'});
const oi=oiAsOf(oiRows,NOW-1);assert.equal(oi.status,'available');assert(oi.delta_pct>0&&oi.delta_pct<10);assert(oi.as_of<=NOW-1);
assert.equal(oiAsOf(oiRows,NOW+STEP*10).status,'stale');
assert.equal(oiAsOf([{timestamp:NOW-1,sumOpenInterest:'20',_fallbackSource:'BYBIT_LINEAR'}],NOW-1).status,'partial');
const fundingRows=[{time:NOW-3600000,ratePct:.005,source:'BYBIT'},{time:NOW+3600000,ratePct:99,source:'BYBIT'}];
assert.equal(fundingAsOf(fundingRows,NOW-1).rate_pct,.005);
assert.equal(fundingAsOf(fundingRows,NOW+48*3600000).status,'stale');
let cand=preIgnition(fut,{tf:'4h',nowMs:NOW,flow:aligned,oi,funding:fundingAsOf(fundingRows,NOW-1)});
assert.notEqual(cand.stage,'early_ignition');assert.equal(cand.confirmed,false);
const pumped=copy(rows,'BINANCE_FUTURES');for(let i=pumped.length-5;i<pumped.length;i++){pumped[i][1]=pumped[i][4]=150;pumped[i][2]=151;pumped[i][3]=149}
const extended=preIgnition(pumped,{tf:'4h',nowMs:NOW});assert.equal(extended.stage,'extended');
const invalid=preIgnition(fut.slice(-10),{tf:'4h',nowMs:NOW});assert.equal(invalid.stage,'insufficient_data');
const provider={
 async getSpotKlines(){throw new Error('Binance spot HTTP 418')},
 async getFuturesKlines(){return copy(rows,'BYBIT_LINEAR')},
 async getV2OiProfile(){return{rows:oiRows}},
 async getFundingHistory(){return fundingRows}
};
(async()=>{
 const svc=createFlowIgnitionService({provider,now:()=>NOW});
 const r=await svc.get('DOGEUSDT',{timeframe:'4h'});
 assert.equal(r.spot_futures.spot_buy_confirmation,'unknown');
 assert.equal(r.candidate.features.spot_buy_confirmation,'unknown');
 assert(r.candidate.missing_data.includes('verified_time_aligned_spot_futures_flow'));
 assert.equal(r.quality.spot_status,'unavailable');
 assert.strictEqual(await svc.get('DOGEUSDT',{timeframe:'4h'}),r);
 const html=fs.readFileSync('unified-chart.html','utf8'),ui=fs.readFileSync('ui/chart/unified-chart-v5.js','utf8'),css=fs.readFileSync('ui/chart/unified-chart.css','utf8');
 assert(html.includes('id="flowGrid"')&&html.includes('id="flowStatus"'));
 assert(ui.includes('loadFlow(symbol,tf,mtfRunToken)')&&ui.includes('function renderFlow('));
 assert(css.includes('.flowGrid')&&css.includes('content-visibility:auto'));
 console.log('flow ignition: strict spot/futures alignment, no-lookahead, null, stale, cross-venue, extended, mobile wiring PASS');
})().catch(e=>{console.error(e);process.exit(1)});
