'use strict';
const assert=require('assert');
const fs=require('fs');
const {createMtfService,analyzeFrame,FRAMES,consensusOf}=require('../lib/chart-v1/mtf.js');
const STEP={ '1w':604800000,'1d':86400000,'4h':14400000,'1h':3600000,'15m':900000,'5m':300000 };
const NOW=1900000000000;
function bars(tf){
 const step=STEP[tf],start=NOW-step*342,out=[];
 for(let i=0;i<340;i++){const t=start+i*step,o=100+i*.3+Math.sin(i/13)*2,cl=o+.2;out.push([t,o,o+1,o-1,cl,1000+i*2,t+step-1,10000,100,0,5000])}
 const live=[NOW,50000,90000,1,80000,999999,NOW+step-1,500000000,100,0,9999999];
 return [...out,live]
}
const source=bars('4h'),q=analyzeFrame(source,'4h',NOW,'fixture'),without=analyzeFrame(source.slice(0,-1),'4h',NOW,'fixture');
assert.equal(q.candle_count,340);assert.equal(q.price,without.price);assert.equal(q.ema14,without.ema14);assert.equal(q.as_of,without.as_of);
assert.equal(q.rvol20,without.rvol20);
let hits=0;
const provider={
 async getSpotKlines(symbol,tf,n){hits++;if(tf==='1w')throw Error('spot not served');if(tf==='15m')throw Error('venue unavailable');return bars(tf).slice(-n)},
 async getFuturesKlines(symbol,tf,n){hits++;if(tf==='15m')throw Error('venue unavailable');const list=bars(tf).slice(-n);Object.defineProperty(list,'_source',{value:'FUTURES_MOCK'});return list}
};
(async()=>{
 const mtf=createMtfService({provider,now:()=>NOW,ttlMs:50000});
 const a=await mtf.get('DOGEUSDT');
 assert.deepEqual(a.frames.map(x=>x.timeframe),FRAMES);
 assert.equal(a.frames.length,6);
 assert.equal(a.frames.find(x=>x.timeframe==='15m').status,'unavailable');
 assert.equal(a.frames.find(x=>x.timeframe==='1w').market_fallback,true);
 assert.equal(a.frames.find(x=>x.timeframe==='4h').price,q.price);
 assert.equal(a.confirmed_candles_only,true);
 assert.equal(a.consensus.status,'partial');
 assert(!['buy','sell','confirmed_long'].includes(a.consensus.bias));
 const n=hits,b=await mtf.get('DOGEUSDT');assert.strictEqual(a,b);assert.equal(hits,n,'cache must avoid repeat venue requests');
 assert.equal(consensusOf([]).bias,'insufficient_data');
 const html=fs.readFileSync('unified-chart.html','utf8'),js=fs.readFileSync('ui/chart/unified-chart-v5.js','utf8'),css=fs.readFileSync('ui/chart/unified-chart.css','utf8');
 assert(html.includes('id="mtfFrames"'));
 assert(html.includes('id="mtfConsensus"'));
 assert(js.includes('loadMtf(symbol,mtfRunToken)'));
 assert(js.includes("x.open_interest!==null")&&js.includes("x.funding_rate_pct!==null"),'missing OI/funding must not become zero');
 assert(css.includes('.mtfFrames'));
 console.log('chart MTF six-TF causal/data-null/mobile PASS');
})().catch(e=>{console.error(e);process.exit(1)});
