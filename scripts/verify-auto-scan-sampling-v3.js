'use strict';
const assert=require('assert');
const {createScanService,AUTO_SAMPLING_RESEARCH_LIMIT}=require('../lib/coin-scan/scan-service.js');

const NOW=Date.parse('2026-09-27T02:00:00Z');
const TF_MS={'1w':604800000,'3d':259200000,'1d':86400000,'12h':43200000,'4h':14400000,'1h':3600000,'15m':900000,'5m':300000,'1m':60000};
function klines(tf,count=120){
  const ms=TF_MS[tf],start=NOW-ms*(count+2),out=[];let p=100;
  for(let i=0;i<count;i++){
    const o=p,c=p*(1+.0005),h=Math.max(o,c)*1.002,l=Math.min(o,c)*.998,v=i>count-5?3500:1000,buy=v*.62;
    out.push([start+i*ms,String(o),String(h),String(l),String(c),String(v),start+(i+1)*ms-1,String(v*c),100,String(buy),String(buy*c),'0']);p=c;
  }
  return out;
}
function trades(n=240){
  return Array.from({length:n},(_,i)=>({a:i,p:String(100+i*.001),q:'10',T:NOW-n*1000+i*1000,m:i%5===0}));
}
const symbols=['AAAUSDT','BBBUSDT','CCCUSDT','DDDUSDT','EEEUSDT','FFFUSDT'];
const exchange={symbols:symbols.map(s=>({symbol:s,baseAsset:s.replace('USDT',''),quoteAsset:'USDT',status:'TRADING',contractType:'PERPETUAL',isSpotTradingAllowed:true}))};
const tickers=symbols.map((s,i)=>({symbol:s,lastPrice:String(100+i),priceChangePercent:String(1+i*.1),quoteVolume:'25000000',closeTime:NOW-1}));
let researchCalls=[],samplingObserveCalls=[];
const samplingOosHistory={
  async observe(items,context){samplingObserveCalls.push({count:items.length,context});return{observed:items.length,recorded:items.filter(x=>x.dataState==='live'&&x.samplingV3).length,duplicates:0,skipped:0,errors:[]}},
  async list(){return[]},async stats(){return{snapshotCount:0,evaluated24hCount:0,promotionReady:false}},async evaluateDue(){return{eventsChecked:0,evaluated:0}}
};
const provider={
  async getSpotUniverse(){return exchange},
  async getFuturesUniverse(){return exchange},
  async getSpotTickers(){return tickers},
  async getFuturesTickers(){return tickers},
  async scanDeepCandidates(targets,intervals){
    const results={},contexts={};
    for(const s of targets){
      results[s]=Object.fromEntries(intervals.map(tf=>[tf,klines(tf,tf==='5m'?300:160)]));
      contexts[s]={
        oiChangePct:1.2,fundingPct:.01,
        v2Profile:{rows:[],oi1hPct:1,oi4hPct:3,oi8hPct:4,oi12hPct:5,oi24hPct:7,oiDrawdownPct:0,taker1h:[{ratio:1.3}],taker15m:[{ratio:1.35}],fundingRate:.01},
        derivativesProfile:{v2Profile:{rows:[],oi1hPct:1,oi4hPct:3,oi8hPct:4,oi12hPct:5,oi24hPct:7,oiDrawdownPct:0,taker1h:[{ratio:1.3}],taker15m:[{ratio:1.35}],fundingRate:.01}}
      };
    }
    return{results,contexts,errors:[]};
  },
  async getSamplingResearchContext(symbol){
    researchCalls.push(symbol);
    return{version:'SAMPLING_RESEARCH_CONTEXT_v1',symbol,asOf:NOW,status:'READY',rows1m:klines('1m',360),aggTrades:trades(),source:{oneMinute:'TEST',aggTrades:'TEST'}};
  },
  async mapLimitWith(items,maxWorkers,fn){
    const src=[...items],out=new Array(src.length);let next=0,active=0,max=0;
    async function run(){while(true){const i=next++;if(i>=src.length)return;active++;max=Math.max(max,active);out[i]=await fn(src[i],i);active--}}
    await Promise.all(Array.from({length:Math.min(maxWorkers,src.length||1)},run));provider._maxResearchConcurrency=Math.max(provider._maxResearchConcurrency||0,max);return out;
  },
  async mapLimit(items,fn){return this.mapLimitWith(items,2,fn)},
  resetSourceState(){},
  getSourceState(){return{marketSource:'binance-futures'}}
};

(async()=>{
  assert.equal(AUTO_SAMPLING_RESEARCH_LIMIT,4,'automatic scanner microstructure budget must stay capped at four symbols per validated deep chunk');
  const service=createScanService({provider,now:()=>NOW,samplingOosHistory});
  const light=await service.run({mode:'deep',symbols,limit:6,validation:'light',persistObservations:false});
  assert.equal(light.items.length,6);
  assert.equal(light.samplingOosRecording.recorded,6,'Sampling v3.1 samples must persist even when persistObservations=false');
  assert.equal(samplingObserveCalls.length,1);
  assert.equal(samplingObserveCalls[0].count,6);
  assert.equal(light.samplingResearch.requested,4,'light automatic deep scan must micro-enrich only top four symbols');
  assert.equal(light.samplingResearch.ready,4);
  assert.equal(researchCalls.length,4);
  assert((provider._maxResearchConcurrency||0)<=2,'microstructure requests must stay bounded at two workers');
  const enriched=light.items.filter(x=>x.samplingV3?.microstructure?.status==='READY');
  const shadow=light.items.filter(x=>x.samplingV3?.microstructure?.status==='NOT_REQUESTED');
  assert.equal(enriched.length,4);
  assert.equal(shadow.length,2);
  assert(enriched.every(x=>x.samplingV3.version==='ASTRA_SAMPLING_V3'));
  assert(enriched.every(x=>x.samplingV3.rankingEffect===0),'Sampling v3.1 must remain shadow in automatic scanner');
  assert(enriched.every(x=>x.samplingV3.alternativeBars?.version==='SAMPLING_V3_ALT_BARS_v1'));
  assert(enriched.every(x=>x.samplingV3.integrity),'integrity audit required on auto-scan deep items');

  researchCalls=[];
  const fast=await service.run({mode:'deep',symbols,limit:6,validation:'off',persistObservations:false});
  assert.equal(fast.samplingResearch.requested,0,'validation-off chunks must make zero 1m/aggTrades research calls');
  assert.equal(fast.samplingOosRecording.recorded,6,'validation-off chunk must still capture core forward samples');
  assert.equal(samplingObserveCalls.length,2);
  assert.equal(researchCalls.length,0);
  assert(fast.items.every(x=>x.samplingV3?.microstructure?.status==='NOT_REQUESTED'));
  assert(fast.items.every(x=>x.samplingV3?.rankingEffect===0));

  // A microstructure failure must not poison the core deep result.
  let failedOnce=false;
  provider.getSamplingResearchContext=async symbol=>{
    if(!failedOnce){failedOnce=true;throw new Error('micro unavailable')}
    return{version:'SAMPLING_RESEARCH_CONTEXT_v1',symbol,asOf:NOW,status:'READY',rows1m:klines('1m',360),aggTrades:trades(),source:{}};
  };
  const degraded=await service.run({mode:'deep',symbols:symbols.slice(0,2),limit:2,validation:'light',persistObservations:false});
  assert(degraded.items.every(x=>x.dataState==='live'),'microstructure failure must remain non-blocking');
  assert(degraded.samplingResearch.errors.length===1);
  assert(degraded.items.some(x=>x.samplingV3?.microstructure?.status==='UNAVAILABLE'));

  console.log('auto scan Sampling v3.1 PASS');
})().catch(e=>{console.error(e);process.exit(1)});
