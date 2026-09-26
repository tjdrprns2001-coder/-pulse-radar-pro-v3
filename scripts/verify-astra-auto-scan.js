'use strict';
const assert=require('assert');
const Astra=require('../lib/coin-scan/astra-auto-scanner.js');

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
  async getV2OiProfile(symbol){
    if(symbol!=='AAAUSDT')return{rows:[],oi4hPct:null};
    const start=FIXED-25*3600000;
    const rows=Array.from({length:25},(_,i)=>({timestamp:start+i*3600000,sumOpenInterest:String(1000+i*4),sumOpenInterestValue:String(100000+i*400)}));
    return{rows,oi1hPct:.4,oi4hPct:1.5,oi8hPct:2.1,oi12hPct:2.4,oi24hPct:4,oiDrawdownPct:0};
  },
  async getV2TakerSeries(_symbol,period){
    const ms=period==='5m'?300000:period==='15m'?900000:3600000,start=FIXED-ms*10;
    return Array.from({length:8},(_,i)=>({timestamp:start+i*ms,buyVol:150,sellVol:100,ratio:1.5}));
  },
  async getOkxFuturesExecution(){return{available:true,observedAt:FIXED,sourceTimestamp:FIXED-1000}},
  async getFuturesKlines(_symbol,tf){
    const ms=({'5m':300000,'15m':900000,'1h':3600000,'2h':7200000,'4h':14400000,'12h':43200000,'1d':86400000,'3d':259200000,'1w':604800000})[tf];
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
  console.log('astra/manus/perplexity auto scan verification passed');
})().catch(e=>{console.error(e);process.exit(1)});
