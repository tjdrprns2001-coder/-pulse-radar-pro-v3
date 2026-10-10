'use strict';
const assert=require('assert');
const Astra=require('../lib/coin-scan/astra-auto-scanner.js');
const IntegratedSurge=require('../lib/coin-scan/integrated-surge-engine.js');

function klineSeries({base=.1,count=160,step=.00005,volume=1000,lastVolume=4500,tfMs=300000}){
  const now=Date.now()-tfMs*(count+2),out=[];let p=base;
  for(let i=0;i<count;i++){
    const o=p,h=p*1.002,l=p*.998,c=p+step,v=i===count-1?lastVolume:volume,buy=v*.6;
    out.push([now+i*tfMs,String(o),String(h),String(l),String(c),String(v),now+(i+1)*tfMs-1,String(v*c),100,String(buy),String(buy*c),'0']);p=c;
  }
  return out;
}
const FIXED=Date.now();
const universe={serverTime:FIXED,symbols:[
  {symbol:'AAAUSDT',status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT',baseAsset:'AAA'},
  {symbol:'BBBUSDT',status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT',baseAsset:'BBB'},
  {symbol:'CCCUSDT',status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT',baseAsset:'CCC'},
  {symbol:'BTCUSDT',status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT',baseAsset:'BTC'},
  {symbol:'ETHUSDT',status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT',baseAsset:'ETH'},
  {symbol:'AAABUSD',status:'TRADING',contractType:'PERPETUAL',quoteAsset:'BUSD',baseAsset:'AAA'}
]};
const tickers=[
  {symbol:'AAAUSDT',lastPrice:'0.108',priceChangePercent:'1.2',quoteVolume:'12000000',closeTime:FIXED},
  {symbol:'BBBUSDT',lastPrice:'0.2',priceChangePercent:'11.2',quoteVolume:'90000000',closeTime:FIXED},
  {symbol:'CCCUSDT',lastPrice:'0.3',priceChangePercent:'0.2',quoteVolume:'2500000',closeTime:FIXED},
  {symbol:'BTCUSDT',lastPrice:'100000',priceChangePercent:'2.0',quoteVolume:'900000000',closeTime:FIXED},
  {symbol:'ETHUSDT',lastPrice:'4000',priceChangePercent:'1.5',quoteVolume:'500000000',closeTime:FIXED}
];
const provider={
  async getFuturesUniverse(){return universe},
  async getFuturesTickers(){return tickers},
  async getSpotTickers(){return[{symbol:'AAAUSDT',priceChangePercent:'1.1',lastPrice:'0.1079'}]},
  async getFundingMap(){return new Map([['AAAUSDT',.01]])},
  async getMacroCalendar(){return{available:true,provider:'TEST',items:[]}},
  async getFuturesExecution(){return{marketType:'futures',available:true,observedAt:FIXED,spreadBps:4,depthUsd:{bid10bps:100000,ask10bps:100000},slippage:{buy:[{notional:10000,slippageBps:8}],sell:[{notional:10000,slippageBps:8}]}}},
  async getV2OiProfile(symbol){
    if(symbol!=='AAAUSDT')return{rows:[],oi4hPct:null};
    const start=FIXED-25*3600000;
    const rows=Array.from({length:25},(_,i)=>({timestamp:start+i*3600000,sumOpenInterest:String(1000+i*4),sumOpenInterestValue:String(100000+i*400)}));
    const raw15mRows=Array.from({length:97},(_,i)=>({timestamp:FIXED-(97-i)*900000,sumOpenInterest:String(1000+i*4)}));
    return{rows,raw15mRows,oi1hPct:.4,oi4hPct:1.5,oi8hPct:2.1,oi12hPct:2.4,oi24hPct:4,oiDrawdownPct:0};
  },
  async getV2TakerSeries(_symbol,period){
    const ms=period==='5m'?300000:period==='15m'?900000:3600000,start=FIXED-ms*10;
    return Array.from({length:8},(_,i)=>({timestamp:start+i*ms,buyVol:150,sellVol:100,ratio:1.5}));
  },
  async getOkxFuturesExecution(){return{available:true,observedAt:FIXED,sourceTimestamp:FIXED-1000}},
  async getFuturesAggTrades(){return Array.from({length:240},(_,i)=>({a:i,p:String(.1+i*.000001),q:'1000',T:FIXED-240000+i*1000,m:i%7===0}))},
  async getFuturesKlines(_symbol,tf){
    const ms=({'1m':60000,'5m':300000,'15m':900000,'1h':3600000,'2h':7200000,'4h':14400000,'12h':43200000,'1d':86400000,'3d':259200000,'1w':604800000})[tf];
    return klineSeries({tfMs:ms});
  },
  async mapLimitWith(items,_workers,fn){const src=[...items],out=[];for(let i=0;i<src.length;i++)out.push(await fn(src[i],i));return out}
};
(async()=>{
  const scan=Astra.createAstraAutoScanner({provider});
  const u=await scan.universe({method:'astra'});
  assert.equal(u.universeCount,5,'USDT perpetual universe count');
  assert.equal(u.filteredCount,3,'Astra price/liquidity filter includes liquid majors');
  assert.equal(u.closedBarPolicy,'close_time < as_of');

  const o=await scan.oi(['AAAUSDT'],{method:'astra'});
  assert.equal(o.items[0].pass,true,'4H OI +1 gate');
  assert.equal(o.requested,1);
  assert.equal(o.success,1);
  assert.equal(o.failed,0);
  assert.equal(o.missing,0);

  const d=await scan.deep(['AAAUSDT'],{method:'astra',asOf:u.asOf});
  assert.equal(d.items.length,1);
  assert.equal(d.items[0].verdict.key,'IGNITION_CONFIRMED','current Astra strict RVOL+taker+OI ignition gate');
  assert(d.items[0].tf['15m'].rvol>=3,'15m confirmed-candle RVOL');
  assert(d.items[0].tf['5m'].rvol>=3,'5m confirmed-candle RVOL');
  assert(d.items[0].sampleSimilarityV2&&d.items[0].sampleSimilarityV2.version==='SAMPLE_SIMILARITY_v2','Astra must attach sample similarity v2');
  assert.equal(d.items[0].sampleSimilarityV2.successTop5.length,5,'Astra success TOP5');
  assert.equal(d.items[0].sampleSimilarityV2.negativeTop3.length,3,'Astra negative/control TOP3');
  assert(Number.isFinite(d.items[0].verdict.sampleEvidenceScore),'Astra verdict must expose sample evidence score');
  assert(d.items[0].samplingV3&&d.items[0].samplingV3.version==='ASTRA_SAMPLING_V3','Astra must attach Sampling v3 shadow evidence');
  assert.equal(d.items[0].samplingV3.rankingEffect,0,'Sampling v3 must remain shadow until OOS validation');
  assert(typeof d.items[0].verdict.samplingV3Stage==='string','Sampling v3 stage required');
  assert(d.items[0].samplingV3.integrity&&['PASS','WARN','FAIL'].includes(d.items[0].samplingV3.integrity.status),'Sampling v3 integrity audit required');
  assert(d.items[0].samplingV3.nativeSyntheticAudit,'native/synthetic candle audit required');
  assert(d.items[0].samplingV3.alternativeBars&&d.items[0].samplingV3.alternativeBars.version==='SAMPLING_V3_ALT_BARS_v2','aggTrades alternative bars required');
  assert(d.items[0].samplingV3.alternativeBars.bars.tickCount>0&&d.items[0].samplingV3.alternativeBars.bars.volumeCount>0,'Astra tick/volume bars required');
  assert.equal(d.items[0].samplingV3.alternativeBars.policy.thresholdMode,'FROZEN_CALIBRATION','Astra alternative-bar thresholds must be train/eval separated');
  assert.equal(d.items[0].samplingV3.alternativeBars.diagnostics.futureDataUsedForThresholds,false,'Astra thresholds must not use evaluation/future trades');
  assert.equal(d.items[0].integratedSurge.version,IntegratedSurge.VERSION,'integrated strategy must be attached');
  assert(d.items[0].integratedSurge.conditionAudit,'integrated condition audit must be attached');
  assert.equal(d.items[0].integratedSurge.conditionAudit.validity.status,'MISSING','stale fixture candles must not get a renewed signal lifetime');
  assert.equal(d.items[0].integratedSurge.conditionAudit.executionReady,false,'stale fixture candles must block audit readiness');
  assert.equal(d.items[0].verdict.integratedSurge.stage,d.items[0].integratedSurge.stage);
  assert.equal(d.items[0].integratedSurge.policy.negative5mMacdVeto,false);
  assert.equal(d.items[0].integratedSurge.oi.known,true,'integrated OI must use raw 15m rows while legacy keeps hourly rows');
  assert(d.items[0].integratedSurge.oi.change15mPct>0);
  const noVolumeCut=await scan.universe({method:'astra',minQuoteVolume:0});
  assert.equal(noVolumeCut.volumeFilter.mode,'off');
  assert(noVolumeCut.items.some(x=>x.symbol==='CCCUSDT'),'zero volume cut must retain low-volume symbols');
  assert(d.items[0].commonPreignition&&d.items[0].commonPreignition.version==='COMMON_PREIGNITION_STAGE_v1','common pre-ignition stage must be attached');
  assert.equal(d.items[0].commonPreignition.shadowOnly,true,'common stage must stay shadow-only');
  assert.equal(d.items[0].commonPreignition.rankingEffect,0,'common stage must not change ranking before validation');
  assert.equal(d.items[0].verdict.commonStage,d.items[0].commonPreignition.stage,'verdict must expose common stage');
  assert(d.items[0].longEntry&&d.items[0].shortEntry,'Astra must attach both ChartBro directions');
  assert(d.items[0].chartbroContext&&d.items[0].chartbroContext.version==='CHARTBRO_CONTEXT_v1','Astra must attach ChartBro context');
  assert.equal(d.items[0].chartbroContext.reviews.macro.status,'CLEAR','macro calendar must reach ChartBro review');
  assert(d.items[0].chartbroContext.levels&&d.items[0].chartbroContext.levels.previousDay,'ChartBro liquidity levels required');
  assert.equal(d.items[0].verdict.chartbroContext.version,'CHARTBRO_CONTEXT_v1','verdict must expose ChartBro context');
  assert(d.items[0].chartbroResearch&&d.items[0].chartbroResearch.version==='CHARTBRO_OOS_v1','Astra must attach ChartBro OOS research state');
  assert(d.items[0].verdict.chartbroResearch&&d.items[0].verdict.chartbroResearch.version==='CHARTBRO_OOS_v1','verdict must expose ChartBro OOS research state');
  assert(d.chartbroResearch&&d.chartbroResearch.version==='CHARTBRO_OOS_v1','deep response must expose ChartBro OOS stats');
  assert.equal(d.items[0].chartbroResearch.rankingAdjustment,0,'ChartBro OOS ranking must remain zero before forward gate passes');
  assert(d.items[0].mtfAnalysis&&d.items[0].mtfAnalysis.version==='MTF_WHOLE_MARKET_v1','Astra must reuse shared MTF analyzer');
  assert.deepEqual(d.items[0].mtfAnalysis.timeframes,['1w','1d','4h','1h','15m','5m'],'shared MTF role stack required');
  assert(Number.isFinite(Number(d.items[0].preIgnitionScore)),'Astra must expose pre-ignition score');
  assert(d.items[0].preIgnitionStage&&d.items[0].entryMap,'Astra must expose beginner stage and entry map');
  assert.equal(d.items[0].mtfAnalysis.researchSample.cohort,'ASTRA_PASS','default Astra cohort provenance');
  assert(d.autoSample&&d.autoSample.shadowOnly===true,'Astra deep must feed automatic reverse-trace sample engine in shadow mode');
  const shadowDeep=await scan.deep(['AAAUSDT'],{method:'astra',asOf:u.asOf,market:{chartbroCohort:'SHADOW_EXPANSION'}});
  assert.equal(shadowDeep.items[0].mtfAnalysis.researchSample.cohort,'SHADOW_EXPANSION','shadow candidates must remain isolated in MTF provenance');



  const mkt={regime:'RISK_ON',breadthRatio:.7,btc24hChange:2,eth24hChange:1.5,median24hChange:1};
  const m=await scan.deep(['AAAUSDT'],{method:'manus',market:mkt,asOf:u.asOf});
  const item=m.items[0];
  assert.equal(m.method,'manus');
  assert.deepEqual(m.timeframes,Astra.MANUS_TIMEFRAMES);
  assert.equal(item.takerCross['15m'].status,'PASS','Manus must cross-check kline and endpoint taker');
  assert.equal(item.takerCross['5m'].status,'PASS','Manus must cross-check 5m taker');
  assert.equal(item.verdict.key,'A_FIRE','Manus 100-point model should promote fully aligned fixture');
  assert(item.verdict.score>=80);
  assert.equal(item.verdict.dataQuality.status,'PASS');
  assert.equal(item.verdict.spotFutures.aligned,true);
  assert.equal(item.tf['15m'].rvolMethod,'mean_previous_20_closed');
  assert.equal(Astra.CONFIG.minQuoteVolume,10_000_000);
  assert.equal(Astra.CONFIG.maxAbs24hPct,10);
  assert.equal(Astra.MANUS_CONFIG.scoreA,80);
  assert.equal(Astra.MANUS_CONFIG.scoreB,65);
  assert.equal(Astra.MANUS_CONFIG.scoreC,50);

  const pu=await scan.universe({method:'perplexity'});
  assert.equal(pu.method,'perplexity');
  assert.equal(pu.asOf,FIXED,'Perplexity must freeze exchangeInfo serverTime');
  assert.equal(pu.marketState.volumeWeightedBreadth,pu.marketState.positiveVolumeRatio);
  const po=await scan.oi(['AAAUSDT'],{method:'perplexity',asOf:pu.asOf});
  assert.equal(po.items[0].status,'SUCCESS','Perplexity OI must end in terminal exact-window status');
  assert.equal(po.items[0].pass,true,'Perplexity exact closed 4H OI gate');
  assert.equal(po.terminalRate,1);
  assert.equal(po.mismatchedWindow,0);
  const pd=await scan.deep(['AAAUSDT'],{method:'perplexity',market:mkt,asOf:pu.asOf});
  const pitem=pd.items[0];
  assert.equal(pd.method,'perplexity');
  assert.deepEqual(pd.timeframes,Astra.PERPLEXITY_TIMEFRAMES);
  assert.equal(pitem.takerCross['1h'].status,'PASS','Perplexity 1H taker must align kline and endpoint windows');
  assert.equal(pitem.takerCross['15m'].status,'PASS','Perplexity 15m taker must align kline and endpoint windows');
  assert.equal(pitem.crossExchange.okxStatus,'VERIFIED');
  assert.equal(pitem.verdict.dataQuality.status,'VERIFIED');
  assert(Array.isArray(pitem.verdict.counterEvidence)&&pitem.verdict.counterEvidence.length>=1,'Perplexity must always attach quantitative counter-evidence');
  assert.equal(pitem.verdict.direction==='LONG_BIAS'||pitem.verdict.direction==='NEUTRAL'||pitem.verdict.direction==='LONG_RISK',true);
  assert(['OI_BUILD','ACCUMULATION_CANDIDATE','TRANSITION_WATCH','IGNITION_CONFIRMED','SHORT_BUILD_RISK','OVERHEATED','INCOMPLETE','DATA_DEGRADED'].includes(pitem.verdict.key));
  assert.equal(Astra.PERPLEXITY_CONFIG.takerWeak,.8);
  assert.equal(Astra.PERPLEXITY_CONFIG.takerImprove,1.2);
  assert.equal(Astra.PERPLEXITY_CONFIG.takerStrong,1.5);
  assert.equal(Astra.PERPLEXITY_CONFIG.htfDiscountPct,35);
  assert.equal(Astra.PERPLEXITY_CONFIG.midTermPremiumPct,80);
  assert.equal(Astra.PERPLEXITY_CONFIG.nfbFundingPct,-1);

  const partialProvider={
    ...provider,
    async getSpotTickers(){return[]},
    async getFundingMap(){return new Map()},
    async getV2TakerSeries(){return[]}
  };
  const partialScan=Astra.createAstraAutoScanner({provider:partialProvider});
  const pm=await partialScan.deep(['AAAUSDT'],{method:'manus',market:mkt,asOf:u.asOf});
  assert.equal(pm.items[0].verdict.dataQuality.status,'PARTIAL','missing spot/taker/funding must not hard-fail an otherwise complete Manus scan');
  assert(!pm.items[0].verdict.blocks.includes('DATA_QUALITY_FAIL'),'partial optional sources must not force Manus exclusion');
  const pp=await partialScan.deep(['AAAUSDT'],{method:'perplexity',market:{...mkt,oiScanDegraded:false},asOf:u.asOf});
  assert.equal(pp.items[0].verdict.dataQuality.status,'PARTIAL','Perplexity must preserve usable structure/OI when optional cross-checks are absent');
  assert.notEqual(pp.items[0].verdict.key,'DATA_DEGRADED','missing taker/spot alone must not discard a usable Perplexity candidate');
  assert.notEqual(pp.items[0].verdict.key,'IGNITION_CONFIRMED','partial taker evidence must never promote ignition');

  console.log('astra/manus/perplexity auto scan verification passed');
})().catch(e=>{console.error(e);process.exit(1)});
