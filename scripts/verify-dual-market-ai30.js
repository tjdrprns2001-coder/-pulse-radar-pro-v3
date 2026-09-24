'use strict';
const assert=require('assert');
const {createScanService,DEEP_REQUEST_LIMIT,mergeDualUniverse}=require('../lib/coin-scan/scan-service.js');

function frame(base=100){return Array.from({length:80},(_,i)=>[Date.now()-((80-i)*60000),String(base+i*.02),String(base+i*.02+1),String(base+i*.02-1),String(base+i*.02+.1),String(1000+i),Date.now()-1000,String((1000+i)*(base+i*.02)),10,'550',String((1000+i)*(base+i*.02)*.56),0])}
function exchange(prefix,start,end,spot){return{symbols:Array.from({length:end-start},(_,j)=>{const i=start+j;return{symbol:`C${i}USDT`,baseAsset:`C${i}`,quoteAsset:'USDT',status:'TRADING',...(spot?{isSpotTradingAllowed:true}:{contractType:'PERPETUAL'})}})}}
function tickers(ex){return ex.symbols.map((s,i)=>({symbol:s.symbol,lastPrice:String(1+i*.01),quoteVolume:String(20_000_000+i*1000),priceChangePercent:String((i%7)-3)}))}

assert.equal(DEEP_REQUEST_LIMIT,30,'AI deep request limit must be 30');
const spotRows=[{symbol:'AAAUSDT',baseAsset:'AAA',ticker:{lastPrice:'1'}},{symbol:'BOTHUSDT',baseAsset:'BOTH',ticker:{lastPrice:'2'}}];
const futRows=[{symbol:'BOTHUSDT',baseAsset:'BOTH',ticker:{lastPrice:'2.01'}},{symbol:'FUTUSDT',baseAsset:'FUT',ticker:{lastPrice:'3'}}];
const merged=mergeDualUniverse(spotRows,futRows);
assert.equal(merged.length,3);
assert.equal(merged.find(x=>x.symbol==='AAAUSDT').marketScope,'spot');
assert.equal(merged.find(x=>x.symbol==='FUTUSDT').marketScope,'futures');
assert.equal(merged.find(x=>x.symbol==='BOTHUSDT').marketScope,'spot+futures');

const spotEx=exchange('C',0,20,true),futEx=exchange('C',10,35,false),spotTk=tickers(spotEx),futTk=tickers(futEx);
let captured=[];
const provider={
 async getSpotUniverse(){return spotEx},async getSpotTickers(){return spotTk},
 async getFuturesUniverse(){return futEx},async getFuturesTickers(){return futTk},
 async getUniverse(){return futEx},async getTickers(){return futTk},
 async scanDeepCandidates(symbols,intervals,marketBySymbol){captured.push({symbols:[...symbols],marketBySymbol:{...marketBySymbol}});const results={},contexts={};for(const s of symbols){results[s]=Object.fromEntries(intervals.map(tf=>[tf,frame()]));contexts[s]={marketScope:marketBySymbol[s],oiChangePct:marketBySymbol[s]==='spot'?null:1.2,fundingPct:null,derivativesProfile:null,v2Profile:null}}return{results,errors:[],contexts}},
 resetSourceState(){},getSourceState(){return{marketSource:'futures'}}
};

(async()=>{
 const service=createScanService({provider,now:()=>Date.now()});
 const summary=await service.run({mode:'summary',limit:100});
 assert.equal(summary.scanCount,35,'union must contain 35 unique symbols');
 assert.deepEqual(summary.marketCoverage,{spot:20,futures:25,both:10,total:35});
 assert.equal(summary.marketSource,'dual-market');
 assert.equal(summary.universeMeta.spotCount,20);
 assert.equal(summary.universeMeta.futuresCount,25);
 assert.equal(summary.universeMeta.bothCount,10);
 assert(summary.items.some(x=>x.marketScope==='spot'));
 assert(summary.items.some(x=>x.marketScope==='futures'));
 assert(summary.items.some(x=>x.marketScope==='spot+futures'));

 const deep=await service.run({mode:'deep',limit:30});
 assert.equal(deep.deepScanCount,30,'automatic deep scan must inspect 30 candidates');
 assert.equal(captured.length,1);
 assert.equal(captured[0].symbols.length,30);
 assert(deep.items.length<=30);
 assert(deep.items.every(x=>['spot','futures','spot+futures'].includes(x.marketScope)));
 const spotOnly=deep.items.find(x=>x.marketScope==='spot');
 if(spotOnly)assert.equal(captured[0].marketBySymbol[spotOnly.symbol],'spot','spot-only symbol must use spot klines');
 console.log('dual market AI 30 PASS');
})().catch(e=>{console.error(e);process.exit(1)});
