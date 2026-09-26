'use strict';

const Perplexity=require('./perplexity-scan-mode.js');
const Grok=require('./grok-scan-mode.js');
const Gemini=require('./gemini-scan-mode.js');
const Claude=require('./claude-scan-mode.js');
const SampleSimilarityV2=require('./sample-similarity-v2.js');
const VERSION='ASTRA_AUTO_SCAN_v5';
const METHODS=Object.freeze({ASTRA:'astra',MANUS:'manus',PERPLEXITY:'perplexity',GROK:'grok',GEMINI:'gemini',CLAUDE:'claude'});
const ASTRA_TIMEFRAMES=Object.freeze(['1w','3d','1d','12h','4h','2h','1h','15m','5m']);
const MANUS_TIMEFRAMES=Object.freeze(['1w','1d','4h','1h','15m','5m']);
const PERPLEXITY_TIMEFRAMES=Perplexity.TIMEFRAMES;
const GROK_TIMEFRAMES=Grok.TIMEFRAMES;
const GEMINI_TIMEFRAMES=Gemini.TIMEFRAMES;
const CLAUDE_TIMEFRAMES=Claude.TIMEFRAMES;
const CONFIG=Object.freeze({
  maxAbs24hPct:10,
  minQuoteVolume:10_000_000,
  minOi4hPct:1,
  ignitionRvol:3,
  ignitionTaker:1.2,
  watchScore:60,
  waitScore:40,
  maxOiSymbols:24,
  maxDeepSymbols:4
});
const MANUS_CONFIG=Object.freeze({
  riskOnBreadth:0.60,
  riskOffBreadth:0.40,
  shockBreadth:0.30,
  shockBtcPct:-5,
  takerCrossMaxDiff:0.20,
  fundingCrowdedLongPct:0.08,
  minSetupRr:1.5,
  sweepWickThreshold:0.35,
  scoreA:80,
  scoreB:65,
  scoreC:50
});

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function clamp(v,a=0,b=100){return Math.max(a,Math.min(b,Number(v)||0))}
function avg(a=[]){const xs=a.map(finite).filter(Number.isFinite);return xs.length?xs.reduce((s,x)=>s+x,0)/xs.length:null}
function median(a=[]){const xs=a.map(finite).filter(Number.isFinite).sort((x,y)=>x-y);if(!xs.length)return null;const m=Math.floor(xs.length/2);return xs.length%2?xs[m]:(xs[m-1]+xs[m])/2}
function sma(values=[],period=20){if(values.length<period)return null;return avg(values.slice(-period))}
function emaSeries(values=[],period=12){if(!values.length)return[];const alpha=2/(period+1);let e=finite(values[0]);if(e==null)return[];const out=[e];for(let i=1;i<values.length;i++){const v=finite(values[i]);if(v==null){out.push(e);continue}e=v*alpha+e*(1-alpha);out.push(e)}return out}
function rsiWilder(values=[],period=14){const a=values.map(finite).filter(Number.isFinite);if(a.length<=period)return null;let g=0,l=0;for(let i=1;i<=period;i++){const d=a[i]-a[i-1];if(d>0)g+=d;else l-=d}g/=period;l/=period;for(let i=period+1;i<a.length;i++){const d=a[i]-a[i-1];g=(g*(period-1)+Math.max(d,0))/period;l=(l*(period-1)+Math.max(-d,0))/period}return l===0?100:100-(100/(1+g/l))}
function intervalMs(tf){return({'5m':300000,'15m':900000,'1h':3600000,'2h':7200000,'4h':14400000,'12h':43200000,'1d':86400000,'3d':259200000,'1w':604800000})[tf]||0}
function confirmed(rows=[],asOf=Date.now()){return(Array.isArray(rows)?rows:[]).filter(x=>Array.isArray(x)&&x.length>=7&&finite(x[4])!=null&&(finite(x[6])==null||finite(x[6])<asOf))}
function klineTaker(row){if(!Array.isArray(row))return null;const total=finite(row[5]),buy=finite(row[9]);if(total==null||buy==null)return null;const sell=total-buy;return sell>0?buy/sell:null}
function sweepFor(row,support,resistance,wickThreshold=MANUS_CONFIG.sweepWickThreshold){
  if(!Array.isArray(row))return{sellSide:false,buySide:false};
  const o=finite(row[1]),h=finite(row[2]),l=finite(row[3]),c=finite(row[4]),range=h!=null&&l!=null?h-l:null;
  if(o==null||h==null||l==null||c==null||!range)return{sellSide:false,buySide:false};
  const lower=Math.min(o,c)-l,upper=h-Math.max(o,c);
  return{
    sellSide:support!=null&&l<support&&c>support&&lower/range>=wickThreshold,
    buySide:resistance!=null&&h>resistance&&c<resistance&&upper/range>=wickThreshold
  };
}
function candleMetrics(rows=[],asOf=Date.now(),wickThreshold=MANUS_CONFIG.sweepWickThreshold){
  const a=confirmed(rows,asOf),c=a.map(x=>Number(x[4])),v=a.map(x=>Number(x[5]||0));
  if(c.length<25)return{available:false,bars:c.length,confirmedBars:c.length};
  const last=a.at(-1),prior=a.at(-2),previous=a.slice(-21,-1),older=a.slice(-22,-2),baseVol=avg(v.slice(-21,-1)),rv=baseVol>0?Number(last[5]||0)/baseVol:null;
  const e12=emaSeries(c,12),e26=emaSeries(c,26),mac=c.map((_,i)=>e12[i]-e26[i]),sig=emaSeries(mac,9),hist=mac.map((x,i)=>x-sig[i]);
  const mas={};for(const n of [5,10,20,60,120])mas[n]=sma(c,n);
  const low=previous.length?Math.min(...previous.map(x=>Number(x[3]))):null,high=previous.length?Math.max(...previous.map(x=>Number(x[2]))):null,close=Number(last[4]);
  const olderLow=older.length?Math.min(...older.map(x=>Number(x[3]))):null,olderHigh=older.length?Math.max(...older.map(x=>Number(x[2]))):null;
  const currentSweep=sweepFor(last,low,high,wickThreshold),priorSweep=sweepFor(prior,olderLow,olderHigh,wickThreshold);
  const priorHigh=Array.isArray(prior)?finite(prior[2]):null,priorLow=Array.isArray(prior)?finite(prior[3]):null;
  return{
    available:true,bars:c.length,confirmedBars:c.length,openTime:finite(last[0]),closeTime:finite(last[6]),close,
    rsi14:rsiWilder(c,14),rvol:rv,rvolMethod:'mean_previous_20_closed',
    sma:mas,above20:mas[20]!=null?close>mas[20]:null,above60:mas[60]!=null?close>mas[60]:null,
    stack:mas[5]!=null&&mas[10]!=null&&mas[20]!=null?mas[5]>mas[10]&&mas[10]>mas[20]:null,
    macd:mac.at(-1),macdSignal:sig.at(-1),macdHist:hist.at(-1),macdUp:hist.length>1?hist.at(-1)>hist.at(-2):null,
    support:low,resistance:high,
    sweepCandidate:currentSweep,
    sweepConfirmed:{
      sellSide:Boolean(priorSweep.sellSide&&priorHigh!=null&&close>priorHigh),
      buySide:Boolean(priorSweep.buySide&&priorLow!=null&&close<priorLow)
    },
    quoteVolume:finite(last[7]),numberOfTrades:finite(last[8]),takerBuyBaseVolume:finite(last[9]),takerBuyQuoteVolume:finite(last[10]),
    klineTakerRatio:klineTaker(last)
  };
}
function lastConfirmedTaker(rows=[],period='15m',asOf=Date.now()){
  const ms=intervalMs(period),src=(Array.isArray(rows)?rows:[]).filter(x=>{const ts=finite(x?.timestamp);return ts!=null&&(!ms||ts+ms<=asOf)});
  const row=src.at(-1)||null;if(!row)return null;
  const buy=finite(row.buyVol),sell=finite(row.sellVol),ratio=buy!=null&&sell>0?buy/sell:finite(row.ratio??row.buySellRatio);
  return ratio==null?null:{timestamp:finite(row.timestamp),ratio,buyVol:buy,sellVol:sell};
}
function takerCross(metric={},endpoint=null,period='15m',config=MANUS_CONFIG){
  const k=finite(metric?.klineTakerRatio),e=finite(endpoint?.ratio),kts=finite(metric?.openTime),ets=finite(endpoint?.timestamp),ms=intervalMs(period),aligned=kts!=null&&ets!=null&&(!ms||Math.abs(kts-ets)<=ms);
  const diff=k!=null&&e!=null?Math.abs(k-e):null;
  const status=k==null||e==null?'MISSING':!aligned?'TIME_MISMATCH':diff<=config.takerCrossMaxDiff?'PASS':'CONFLICT';
  return{klineRatio:k,endpointRatio:e,difference:diff,timeAligned:aligned,status,threshold:config.takerCrossMaxDiff};
}
function buildUniverse(exchangeInfo={},tickers=[]){
  const tickerMap=new Map((Array.isArray(tickers)?tickers:[]).map(x=>[String(x?.symbol||'').toUpperCase(),x])),rows=[];
  for(const s of Array.isArray(exchangeInfo?.symbols)?exchangeInfo.symbols:[]){
    if(String(s?.status)!=='TRADING'||String(s?.contractType)!=='PERPETUAL'||String(s?.quoteAsset)!=='USDT')continue;
    const symbol=String(s.symbol||'').toUpperCase(),t=tickerMap.get(symbol);if(!t)continue;
    rows.push({symbol,baseAsset:String(s.baseAsset||''),lastPrice:finite(t.lastPrice),priceChange24h:finite(t.priceChangePercent),quoteVolume24h:finite(t.quoteVolume),closeTime:finite(t.closeTime),ticker:t});
  }
  return rows;
}
function initialFilter(rows=[],config=CONFIG){return rows.filter(x=>x.priceChange24h!=null&&Math.abs(x.priceChange24h)<=config.maxAbs24hPct&&x.quoteVolume24h!=null&&x.quoteVolume24h>=config.minQuoteVolume)}
function marketState(rows=[],config=MANUS_CONFIG){
  const valid=rows.filter(x=>finite(x.priceChange24h)!=null),total=valid.length,up=valid.filter(x=>x.priceChange24h>0).length,down=valid.filter(x=>x.priceChange24h<0).length,flat=total-up-down,breadthRatio=total?up/total:null;
  const totalVolume=valid.reduce((s,x)=>s+(finite(x.quoteVolume24h)||0),0),positiveVolume=valid.filter(x=>x.priceChange24h>0).reduce((s,x)=>s+(finite(x.quoteVolume24h)||0),0),positiveVolumeRatio=totalVolume>0?positiveVolume/totalVolume:null;
  const btc=valid.find(x=>x.symbol==='BTCUSDT')||null,eth=valid.find(x=>x.symbol==='ETHUSDT')||null,btcPct=finite(btc?.priceChange24h),ethPct=finite(eth?.priceChange24h);
  let regime='NEUTRAL';
  if(breadthRatio!=null&&breadthRatio<config.shockBreadth&&btcPct!=null&&btcPct<=config.shockBtcPct)regime='SHOCK';
  else if(breadthRatio!=null&&breadthRatio>=config.riskOnBreadth&&btcPct!=null&&btcPct>0)regime='RISK_ON';
  else if(breadthRatio!=null&&breadthRatio<config.riskOffBreadth)regime='RISK_OFF';
  return{total,up,down,flat,breadthRatio,median24hChange:median(valid.map(x=>x.priceChange24h)),positiveVolumeRatio,volumeWeightedBreadth:positiveVolumeRatio,topMoverRatio:total?valid.filter(x=>Math.abs(x.priceChange24h)>=10).length/total:null,btc24hChange:btcPct,eth24hChange:ethPct,regime};
}
function oiFromProfile(profile={}){
  const rows=Array.isArray(profile?.rows)?profile.rows:[],last=rows.at(-1)||{},ref=rows.length>=5?rows.at(-5):null;
  return{oi1hPct:finite(profile.oi1hPct),oi4hPct:finite(profile.oi4hPct),oi8hPct:finite(profile.oi8hPct),oi12hPct:finite(profile.oi12hPct),oi24hPct:finite(profile.oi24hPct),oiDrawdownPct:finite(profile.oiDrawdownPct),oiRawContracts:finite(last?.sumOpenInterest),oiValueUsdt:finite(last?.sumOpenInterestValue),oiObservationTime:finite(last?.timestamp),oiReferenceTime:finite(ref?.timestamp),oiSource:'Binance futures/data/openInterestHist'};
}
function structureScore(tf={}){
  let s=0;for(const k of ['1d','4h','1h']){const m=tf[k];if(!m?.available)continue;if(m.above20)s+=3;if(m.above60)s+=2;if(m.stack)s+=2;if(m.macdUp)s+=1}return Math.min(20,s);
}
function scoreCandidate(row={}){
  const oi4=finite(row.oi4hPct),oi8=finite(row.oi8hPct),t15=finite(row.taker15m),t5=finite(row.taker5m),r15=finite(row.tf?.['15m']?.rvol),r5=finite(row.tf?.['5m']?.rvol),ch=finite(row.priceChange24h),rsi4=finite(row.tf?.['4h']?.rsi14),rsi1=finite(row.tf?.['1h']?.rsi14);
  let s=0;if(oi4!=null)s+=Math.min(24,Math.max(0,oi4)*8);if(oi8>0)s+=Math.min(8,oi8*3);
  if(t15!=null)s+=t15>=1.5?12:t15>=1.2?9:t15>=1?4:t15<.8?-8:0;if(t5!=null)s+=t5>=1.5?12:t5>=1.2?9:t5>=1?4:t5<.8?-8:0;
  if(r15!=null)s+=r15>=3?10:r15>=1.5?6:r15>=1?2:0;if(r5!=null)s+=r5>=3?10:r5>=1.5?6:r5>=1?2:0;s+=structureScore(row.tf);
  if(ch!=null){const a=Math.abs(ch);if(a<=3)s+=8;else if(a<=6)s+=5;else if(ch>=9)s-=10}if(rsi4>=75||rsi1>=78)s-=10;if(finite(row.fundingRatePct)>=.08)s-=4;return Math.round(clamp(s));
}
function classifyAstra(row={}){
  const oi4=finite(row.oi4hPct),r15=finite(row.tf?.['15m']?.rvol),r5=finite(row.tf?.['5m']?.rvol),t15=finite(row.taker15m),t5=finite(row.taker5m),ch=finite(row.priceChange24h),rsi4=finite(row.tf?.['4h']?.rsi14),rsi1=finite(row.tf?.['1h']?.rsi14),h4=row.tf?.['4h']||{},h1=row.tf?.['1h']||{},reasons=[];
  if(oi4!=null)reasons.push(`4H OI ${oi4>=0?'+':''}${oi4.toFixed(2)}%`);if(r15!=null)reasons.push(`15m RVOL ${r15.toFixed(2)}x`);if(r5!=null)reasons.push(`5m RVOL ${r5.toFixed(2)}x`);if(t15!=null)reasons.push(`15m taker ${t15.toFixed(2)}`);if(t5!=null)reasons.push(`5m taker ${t5.toFixed(2)}`);
  const ignition=oi4>=CONFIG.minOi4hPct&&r15>=CONFIG.ignitionRvol&&r5>=CONFIG.ignitionRvol&&t15>=CONFIG.ignitionTaker&&t5>=CONFIG.ignitionTaker&&h4.above20!==false&&h1.above20!==false,progressed=ch>=9&&(rsi4>=70||rsi1>=75),score=scoreCandidate(row);
  if(ignition)return{key:'IGNITION_CONFIRMED',label:'🔥 점화 확정',score,reasons};if(progressed)return{key:'PROGRESSED',label:'🔵 이미 진행',score,reasons:[...reasons,'24H 과진행/단기 과열']};if(score>=CONFIG.watchScore)return{key:'WATCH_PRIORITY',label:'🟡 관찰 우선',score,reasons};if(score>=CONFIG.waitScore)return{key:'WAIT',label:'⚪ 점화 대기',score,reasons};return{key:'HOLD',label:'⏸ 보류',score,reasons};
}
function priceOiQuadrant(priceChange,oiChange){
  const p=finite(priceChange),o=finite(oiChange);if(p==null||o==null)return{key:'UNKNOWN',label:'데이터 부족',score:0};
  if(p>=0&&o>0)return{key:'PRICE_UP_OI_UP',label:'가격↑ + OI↑',score:15};
  if(p<0&&o>0)return{key:'PRICE_DOWN_OI_UP',label:'가격↓ + OI↑',score:5};
  if(p>=0&&o<=0)return{key:'PRICE_UP_OI_DOWN',label:'가격↑ + OI↓',score:3};
  return{key:'PRICE_DOWN_OI_DOWN',label:'가격↓ + OI↓',score:0};
}
function scoreTf(m={},max=10){if(!m?.available)return 0;let s=0;if(m.above20)s+=3;if(m.above60)s+=2;if(m.stack)s+=2;if(m.macdUp)s+=2;const r=finite(m.rsi14);if(r!=null&&r>=45&&r<=70)s+=1;return Math.min(max,s)}
function spotFuturesCheck(row={}){
  const spot=finite(row.spotPriceChange24h),fut=finite(row.priceChange24h),gap=spot!=null&&fut!=null?fut-spot:null;
  const aligned=spot!=null&&fut!=null&&((spot>=0&&fut>=0)||(spot<0&&fut<0)),severeDivergence=gap!=null&&Math.abs(gap)>5;
  return{spotChange24h:spot,futuresChange24h:fut,gapPct:gap,aligned,severeDivergence,score:spot==null||fut==null?0:aligned?(Math.abs(gap)<=2?10:8):2};
}
function fundingScore(v,config=MANUS_CONFIG){const x=finite(v);if(x==null)return{score:0,state:'MISSING'};if(x>config.fundingCrowdedLongPct)return{score:0,state:'CROWDED_LONG'};if(x>=-.03&&x<=.03)return{score:5,state:'NEUTRAL'};if(x<-.03)return{score:4,state:'NEGATIVE'};return{score:3,state:'POSITIVE'};}
function marketScore(state={}){return state.regime==='RISK_ON'?10:state.regime==='NEUTRAL'?6:state.regime==='RISK_OFF'?2:0}
function ignitionScore(row={}){
  const r15=finite(row.tf?.['15m']?.rvol),r5=finite(row.tf?.['5m']?.rvol),c15=row.takerCross?.['15m'],c5=row.takerCross?.['5m'];let s=0;
  if(r15>=CONFIG.ignitionRvol)s+=4;else if(r15>=1.5)s+=2;if(r5>=CONFIG.ignitionRvol)s+=4;else if(r5>=1.5)s+=2;
  if(c15?.status==='PASS'&&finite(c15.endpointRatio)>=1)s+=3;if(c5?.status==='PASS'&&finite(c5.endpointRatio)>=1)s+=3;
  if(row.tf?.['15m']?.sweepConfirmed?.sellSide||row.tf?.['5m']?.sweepConfirmed?.sellSide)s+=1;return Math.min(15,s);
}
function buildTradeSetup(row={},config=MANUS_CONFIG){
  const entry=finite(row.lastPrice),supports=[row.tf?.['1h']?.support,row.tf?.['4h']?.support].map(finite).filter(x=>x!=null&&entry!=null&&x<entry).sort((a,b)=>b-a),resistances=[row.tf?.['1h']?.resistance,row.tf?.['4h']?.resistance].map(finite).filter(x=>x!=null&&entry!=null&&x>entry).sort((a,b)=>a-b),stop=supports[0]??null,target=resistances[0]??null;
  const risk=entry!=null&&stop!=null?entry-stop:null,reward=entry!=null&&target!=null?target-entry:null,rr=risk>0&&reward>0?reward/risk:null;
  return{defined:entry!=null&&stop!=null&&target!=null,entry,stop,invalidation:stop,target,riskReward:rr,rrPass:rr!=null&&rr>=config.minSetupRr,minRr:config.minSetupRr};
}
function dataQuality(row={},requiredTfs=MANUS_TIMEFRAMES){
  const missing=[];for(const tf of requiredTfs)if(!row.tf?.[tf]?.available)missing.push(`tf:${tf}`);if(finite(row.oi4hPct)==null)missing.push('oi4h');if(!row.takerCross?.['15m']||row.takerCross['15m'].status==='MISSING')missing.push('taker15m');if(!row.takerCross?.['5m']||row.takerCross['5m'].status==='MISSING')missing.push('taker5m');if(finite(row.priceChange24h)==null)missing.push('futuresTicker');if(finite(row.spotPriceChange24h)==null)missing.push('spotTicker');
  const conflicts=['15m','5m'].filter(tf=>['CONFLICT','TIME_MISMATCH'].includes(row.takerCross?.[tf]?.status)),status=missing.length?'FAIL':conflicts.length?'CONFLICTED':'PASS';
  return{status,missingFields:missing,conflicts,score:status==='PASS'?5:status==='CONFLICTED'?2:0};
}
function classifyManus(row={},market={},config=MANUS_CONFIG){
  const quadrant=priceOiQuadrant(row.priceChange24h,row.oi4hPct),spot=spotFuturesCheck(row),fund=fundingScore(row.fundingRatePct,config),quality=dataQuality(row),setup=buildTradeSetup(row,config),ign=ignitionScore(row),htf=scoreTf(row.tf?.['1w'])+scoreTf(row.tf?.['1d']),mid=scoreTf(row.tf?.['4h'])+scoreTf(row.tf?.['1h']),marketPts=marketScore(market),score=Math.round(clamp(marketPts+quadrant.score+htf+mid+ign+spot.score+fund.score+quality.score));
  const ignitionConfirmed=finite(row.oi4hPct)>=CONFIG.minOi4hPct&&finite(row.tf?.['15m']?.rvol)>=CONFIG.ignitionRvol&&finite(row.tf?.['5m']?.rvol)>=CONFIG.ignitionRvol&&row.takerCross?.['15m']?.status==='PASS'&&row.takerCross?.['5m']?.status==='PASS'&&finite(row.takerCross['15m'].endpointRatio)>1&&finite(row.takerCross['5m'].endpointRatio)>1;
  const htfGood=(row.tf?.['1d']?.above20!==false)&&(row.tf?.['4h']?.above20!==false),blocks=[];
  if(quality.status==='FAIL')blocks.push('DATA_QUALITY_FAIL');if(Math.abs(finite(row.priceChange24h)||0)>CONFIG.maxAbs24hPct)blocks.push('PRICE_EXTENDED');if(finite(row.quoteVolume24h)<CONFIG.minQuoteVolume)blocks.push('LOW_LIQUIDITY');if(finite(row.oi4hPct)<CONFIG.minOi4hPct)blocks.push('OI_GATE_FAIL');if(row.tf?.['1d']?.above20===false&&row.tf?.['4h']?.above20===false)blocks.push('STRUCTURE_BREAKDOWN');if(spot.severeDivergence&&!spot.aligned)blocks.push('SPOT_FUTURES_DIVERGENCE');if(fund.state==='CROWDED_LONG')blocks.push('FUNDING_CROWDED_LONG');if(market.regime==='SHOCK')blocks.push('MARKET_SHOCK');
  const reasons=[quadrant.label,`시장 ${market.regime||'UNKNOWN'} ${market.breadthRatio!=null?(market.breadthRatio*100).toFixed(1)+'%':''}`,`15m RVOL ${finite(row.tf?.['15m']?.rvol)?.toFixed?.(2)??'-'}x / 5m ${finite(row.tf?.['5m']?.rvol)?.toFixed?.(2)??'-'}x`,`Taker 교차 15m ${row.takerCross?.['15m']?.status||'N/A'} · 5m ${row.takerCross?.['5m']?.status||'N/A'}`,spot.aligned?'현물·선물 방향 동조':'현물·선물 동조 미확인'];
  let key='HOLD',label='⏸ HOLD';if(blocks.length)key='EXCLUDE',label='⛔ EXCLUDE';else if(score>=config.scoreA&&ignitionConfirmed){key='A_FIRE';label='🔥 A_FIRE 점화'}else if(score>=config.scoreB&&htfGood){key='B_PREPARE';label='🟡 B_PREPARE 준비'}else if(score>=config.scoreC){key='C_WATCH';label='⚪ C_WATCH 관찰'}
  const layer=key==='A_FIRE'&&setup.defined&&setup.rrPass?'EXECUTION_READY_SIGNAL':(['A_FIRE','B_PREPARE','C_WATCH'].includes(key)&&setup.defined?'TRADE_SETUP':'SCREENED_CANDIDATE');
  return{key,label,score,reasons,blocks,layer,ignitionConfirmed,quadrant,spotFutures:spot,funding:fund,dataQuality:quality,tradeSetup:setup,scoreBreakdown:{market:marketPts,priceOi:quadrant.score,htf1w1d:htf,mid4h1h:mid,ignition15m5m:ign,spotCross:spot.score,funding:fund.score,dataQuality:quality.score}};
}
async function safeMapLimit(provider,items,workers,worker){if(typeof provider?.mapLimitWith==='function')return provider.mapLimitWith(items,workers,worker);const src=Array.from(items||[]),out=new Array(src.length);let next=0;async function run(){while(true){const i=next++;if(i>=src.length)return;out[i]=await worker(src[i],i)}}await Promise.all(Array.from({length:Math.min(Math.max(1,workers),src.length||1)},run));return out}
function normalizeSymbols(symbols=[],max=24){const src=Array.isArray(symbols)?symbols:String(symbols||'').split(',');return[...new Set(src.map(x=>String(x||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')).filter(Boolean))].slice(0,max)}
function methodOf(v){const x=String(v||'').toLowerCase();return x===METHODS.MANUS?METHODS.MANUS:x===METHODS.PERPLEXITY?METHODS.PERPLEXITY:x===METHODS.GROK?METHODS.GROK:x===METHODS.GEMINI?METHODS.GEMINI:x===METHODS.CLAUDE?METHODS.CLAUDE:METHODS.ASTRA}
function createAstraAutoScanner({provider,now=()=>Date.now()}={}){
  if(!provider)throw new Error('provider required');
  async function universe({method=METHODS.ASTRA}={}){
    method=methodOf(method);const requestedAt=now(),serverTask=method===METHODS.PERPLEXITY&&typeof provider.getFuturesServerTime==='function'?provider.getFuturesServerTime():Promise.resolve(null),[ex,tickers,freshServerTime]=await Promise.all([provider.getFuturesUniverse(),provider.getFuturesTickers(),serverTask]),receivedAt=now(),rows=buildUniverse(ex,tickers),mkt=marketState(rows),grokFilter=method===METHODS.GROK?Grok.dynamicUniverse(rows):null,claudeFilter=method===METHODS.CLAUDE?Claude.dynamicUniverse(rows):null,filtered=method===METHODS.GROK?grokFilter.items:method===METHODS.CLAUDE?claudeFilter.items:initialFilter(rows),serverTime=finite(freshServerTime)??finite(ex?.serverTime),asOf=method===METHODS.PERPLEXITY&&serverTime!=null?serverTime:Math.max(...rows.map(x=>finite(x.closeTime)||0),requestedAt),sorted=filtered.slice().sort((a,b)=>(b.quoteVolume24h||0)-(a.quoteVolume24h||0)),config=method===METHODS.MANUS?{...CONFIG,...MANUS_CONFIG}:method===METHODS.PERPLEXITY?{...CONFIG,...Perplexity.CONFIG}:method===METHODS.GROK?{...CONFIG,...Grok.CONFIG}:method===METHODS.GEMINI?{...CONFIG,...Gemini.CONFIG}:method===METHODS.CLAUDE?{...CONFIG,...Claude.CONFIG}:CONFIG,scanId=method+'-'+asOf+'-'+VERSION;
    return{status:'ok',stage:'universe',method,version:VERSION,scanId,updatedAt:receivedAt,asOf,serverTime,closedBarPolicy:'close_time < as_of',sourceState:typeof provider.getSourceState==='function'?provider.getSourceState():null,config,dynamicFilter:method===METHODS.GROK?{quoteVolumeThreshold:grokFilter.threshold,volumePercentile:grokFilter.percentile}:method===METHODS.CLAUDE?{quoteVolumeThreshold:claudeFilter.threshold,volumePercentile:claudeFilter.percentile}:null,requestMeta:{requestedAt,receivedAt},universeCount:rows.length,filteredCount:sorted.length,pipelineCounts:{universe:rows.length,tickerPass:sorted.length},breadth:mkt,marketState:mkt,majors:Object.fromEntries(['BTCUSDT','ETHUSDT'].map(s=>[s,rows.find(x=>x.symbol===s)||null])),items:sorted.map(({ticker,...x})=>x)};
  }
  async function oi(symbols=[],{method=METHODS.ASTRA,asOf=null,market={}}={}){
    method=methodOf(method);const list=normalizeSymbols(symbols,CONFIG.maxOiSymbols),stamp=now(),snapshotAsOf=finite(asOf)||stamp,items=await safeMapLimit(provider,list,6,async symbol=>{try{const p=await provider.getV2OiProfile(symbol);if(method===METHODS.PERPLEXITY){const o=Perplexity.deriveClosedOi(p,snapshotAsOf);return{symbol,oi1hPct:finite(p.oi1hPct),oi4hPct:o.oi4hPct,oi8hPct:o.oi8hPct,oi12hPct:finite(p.oi12hPct),oi24hPct:finite(p.oi24hPct),oiRawContracts:o.oiRawContracts??null,oiValueUsdt:o.oiValueUsdt??null,oiObservationTime:o.observationTime??null,oiReferenceTime:o.referenceTime??null,oiSource:o.oiSource??'Binance futures/data/openInterestHist',pass:Boolean(o.pass),status:o.status,error:null}}const o=oiFromProfile(p),missing=o.oi4hPct==null,base={symbol,...o,status:missing?'MISSING':'SUCCESS',error:null};if(method===METHODS.GEMINI)return Gemini.oiPass(base,market);if(method===METHODS.GROK)return{...base,pass:!missing&&o.oi4hPct!=null&&o.oi4hPct>=Grok.CONFIG.oiAbsoluteGatePct,grokSelectionPending:!missing};if(method===METHODS.CLAUDE){const cp=Claude.oiPath(p);return{...base,oi4hPct:cp.oi4hPct,oiValueUsdt:cp.oiValueUsdt,claudeOiPath:cp,pass:cp.status==='SUCCESS'&&cp.eligible,status:cp.status,error:null}}return{...base,pass:!missing&&o.oi4hPct>=CONFIG.minOi4hPct}}catch(e){return{symbol,oi1hPct:null,oi4hPct:null,oi8hPct:null,oi12hPct:null,oi24hPct:null,pass:false,status:'FAILED',error:String(e?.message||e)}}});
    const failed=items.filter(x=>x.status==='FAILED'),missing=items.filter(x=>x.status==='MISSING'),mismatched=items.filter(x=>x.status==='MISMATCHED_WINDOW'),success=items.filter(x=>x.status==='SUCCESS').length,successRate=list.length?success/list.length:0,terminalRate=list.length?items.filter(x=>['SUCCESS','FAILED','MISSING','MISMATCHED_WINDOW'].includes(x.status)).length/list.length:0,degraded=method===METHODS.PERPLEXITY&&(successRate<Perplexity.CONFIG.minOiSuccessRate||terminalRate<1);
    return{status:'ok',stage:'oi',method,version:VERSION,updatedAt:stamp,asOf:snapshotAsOf,requested:list.length,success,failed:failed.length,missing:missing.length,mismatchedWindow:mismatched.length,successRate,terminalRate,degraded,dynamicOiThresholdPct:method===METHODS.GEMINI?Gemini.dynamicOiThreshold(market):null,failureSymbols:failed.map(x=>x.symbol),missingSymbols:missing.map(x=>x.symbol),mismatchedSymbols:mismatched.map(x=>x.symbol),passCount:items.filter(x=>x.pass).length,items};
  }
  async function deep(symbols=[],{method=METHODS.ASTRA,market={},asOf=null}={}){
    method=methodOf(method);const tfs=method===METHODS.MANUS?MANUS_TIMEFRAMES:method===METHODS.PERPLEXITY?PERPLEXITY_TIMEFRAMES:method===METHODS.GROK?GROK_TIMEFRAMES:method===METHODS.GEMINI?GEMINI_TIMEFRAMES:method===METHODS.CLAUDE?CLAUDE_TIMEFRAMES:ASTRA_TIMEFRAMES,list=normalizeSymbols(symbols,CONFIG.maxDeepSymbols),stamp=now(),snapshotAsOf=finite(asOf)||stamp;let fundingMap=new Map(),spotMap=new Map(),futuresMap=new Map();
    try{fundingMap=await provider.getFundingMap()}catch{}try{const rows=await provider.getSpotTickers();spotMap=new Map((Array.isArray(rows)?rows:[]).map(x=>[String(x.symbol||'').toUpperCase(),x]))}catch{}try{const rows=await provider.getFuturesTickers();futuresMap=new Map((Array.isArray(rows)?rows:[]).map(x=>[String(x.symbol||'').toUpperCase(),x]))}catch{}
    const items=await safeMapLimit(provider,list,2,async symbol=>{
      const frames={},errors=[];await safeMapLimit(provider,tfs,3,async tf=>{try{const rows=method===METHODS.CLAUDE?420:(method===METHODS.GROK||method===METHODS.GEMINI)?(tf==='5m'?1500:tf==='15m'?520:tf==='1d'?180:150):(tf==='1d'?180:150);frames[tf]=await provider.getFuturesKlines(symbol,tf,rows)}catch(e){errors.push(`${tf}:${String(e?.message||e)}`)}});
      let oiProfile={},t1=[],t15=[],t5=[],okx=null;try{[oiProfile,t1,t15,t5]=await Promise.all([provider.getV2OiProfile(symbol),provider.getV2TakerSeries(symbol,'1h',8),provider.getV2TakerSeries(symbol,'15m',8),provider.getV2TakerSeries(symbol,'5m',8)])}catch(e){errors.push(`derivatives:${String(e?.message||e)}`)}
      if(method===METHODS.PERPLEXITY){try{okx=typeof provider.getOkxFuturesExecution==='function'?await provider.getOkxFuturesExecution(symbol):null}catch(e){okx={available:false,error:String(e?.message||e)}}}
      const tf=Object.fromEntries(tfs.map(x=>[x,candleMetrics(frames[x]||[],snapshotAsOf)])),tak1=lastConfirmedTaker(t1,'1h',snapshotAsOf),tak15=lastConfirmedTaker(t15,'15m',snapshotAsOf),tak5=lastConfirmedTaker(t5,'5m',snapshotAsOf),baseOiPack=oiFromProfile(oiProfile),perpOi=method===METHODS.PERPLEXITY?Perplexity.deriveClosedOi(oiProfile,snapshotAsOf):null,claudeOi=method===METHODS.CLAUDE?Claude.oiPath(oiProfile):null,oiPack=method===METHODS.PERPLEXITY?{...baseOiPack,oi4hPct:perpOi.oi4hPct,oi8hPct:perpOi.oi8hPct,oiRawContracts:perpOi.oiRawContracts??baseOiPack.oiRawContracts,oiValueUsdt:perpOi.oiValueUsdt??baseOiPack.oiValueUsdt,oiObservationTime:perpOi.observationTime,oiReferenceTime:perpOi.referenceTime,oiStatus:perpOi.status}:method===METHODS.CLAUDE?{...baseOiPack,oi4hPct:claudeOi.oi4hPct,oiValueUsdt:claudeOi.oiValueUsdt,claudeOiPath:claudeOi}:baseOiPack,ft=futuresMap.get(symbol)||{},st=spotMap.get(symbol)||{},spotMapping={futuresSymbol:symbol,spotSymbol:st?.symbol?symbol:null,confidence:st?.symbol?'HIGH':'NONE',source:'exact_symbol_only'},okxStatus=method===METHODS.PERPLEXITY?(okx?.available?'VERIFIED':okx?.error?'FAILED':'NOT_AVAILABLE'):'NOT_REQUESTED';
      const spotLastPrice=finite(st.lastPrice),futuresLastPrice=finite(ft.lastPrice)??finite(tf['5m']?.close),row={symbol,method,asOf:snapshotAsOf,lastPrice:futuresLastPrice,priceChange24h:finite(ft.priceChangePercent),quoteVolume24h:finite(ft.quoteVolume),spotPriceChange24h:finite(st.priceChangePercent),spotQuoteVolume24h:finite(st.quoteVolume),spotLastPrice,fundingRatePct:finite(fundingMap.get(symbol)),basisPct:Grok.basisPct(futuresLastPrice,spotLastPrice),...oiPack,taker1h:finite(tak1?.ratio),taker15m:finite(tak15?.ratio),taker5m:finite(tak5?.ratio),taker1hAt:finite(tak1?.timestamp),taker15mAt:finite(tak15?.timestamp),taker5mAt:finite(tak5?.timestamp),tf,spotMapping,crossExchange:{okxStatus,okxObservedAt:finite(okx?.observedAt),okxSourceTimestamp:finite(okx?.sourceTimestamp),okxError:okx?.error||null},errors};
      row.takerCross={'1h':takerCross(tf['1h'],tak1,'1h',method===METHODS.PERPLEXITY?Perplexity.CONFIG:MANUS_CONFIG),'15m':takerCross(tf['15m'],tak15,'15m',method===METHODS.PERPLEXITY?Perplexity.CONFIG:MANUS_CONFIG),'5m':takerCross(tf['5m'],tak5,'5m',method===METHODS.PERPLEXITY?Perplexity.CONFIG:MANUS_CONFIG)};
      row.sampleSimilarityV2=SampleSimilarityV2.evaluate({
        price24hPct:row.priceChange24h,
        oi1hPct:row.oi1hPct,oi4hPct:row.oi4hPct,oi6hPct:null,oi24hPct:row.oi24hPct,
        taker1h:[row.taker1h].filter(Number.isFinite),
        taker15m:[row.taker15m].filter(Number.isFinite),
        fundingRate:row.fundingRatePct,basisPct:row.basisPct,
        rvol1h:finite(tf['1h']?.rvol),rvol15m:finite(tf['15m']?.rvol),
        rsi1h:finite(tf['1h']?.rsi14),rsi15m:finite(tf['15m']?.rsi14),
        macd1hPositive:Boolean(tf['1h']?.macdUp),maAligned1h:Boolean(tf['1h']?.stack),
        bosUp:Boolean(tf['1h']?.sweepConfirmed?.sellSide||tf['15m']?.sweepConfirmed?.sellSide),
        sslSweep:Boolean(tf['1h']?.sweepConfirmed?.sellSide||tf['15m']?.sweepConfirmed?.sellSide),
        bslSweepFail:Boolean(tf['1h']?.sweepConfirmed?.buySide||tf['15m']?.sweepConfirmed?.buySide),
        spotConfirmed:Boolean(st?.symbol)
      });
      if(method===METHODS.GROK){const cut=finite(market?.grokOiCut);row.grokOiRelativePass=cut!=null&&finite(row.oi4hPct)>=cut;row.grokOiAbsolutePass=finite(row.oi4hPct)>=Grok.CONFIG.oiAbsoluteGatePct;row.grokOiValuePass=finite(row.oiValueUsdt)>=Grok.CONFIG.minOiValueUsdt}
      row.verdict=method===METHODS.MANUS?classifyManus(row,market):method===METHODS.PERPLEXITY?Perplexity.classify(row,{market,frames,okxStatus}):method===METHODS.GROK?Grok.classify(row,{market,frames,taker15mSeries:t15}):method===METHODS.GEMINI?Gemini.classify(row,{market,frames,taker15mSeries:t15}):method===METHODS.CLAUDE?Claude.classify(row,{market,frames,taker1hSeries:t1,taker15mSeries:t15}):classifyAstra(row);
      row.verdict.sampleSimilarityV2=row.sampleSimilarityV2;
      row.verdict.sampleEvidenceScore=row.sampleSimilarityV2?.netEvidenceScore??null;
      row.verdict.reasons=[
        ...(Array.isArray(row.verdict.reasons)?row.verdict.reasons:[]),
        row.sampleSimilarityV2?.successTop5?.[0]?`성공샘플 ${row.sampleSimilarityV2.successTop5[0].symbol} ${row.sampleSimilarityV2.successTop5[0].score}점`:null,
        row.sampleSimilarityV2?.negativeTop3?.[0]?`대조군 ${row.sampleSimilarityV2.negativeTop3[0].symbol} ${row.sampleSimilarityV2.negativeTop3[0].score}점`:null
      ].filter(Boolean).slice(0,8);
      return row;
    });
    const order=method===METHODS.MANUS?{A_FIRE:0,B_PREPARE:1,C_WATCH:2,HOLD:3,EXCLUDE:4}:method===METHODS.PERPLEXITY?{IGNITION_CONFIRMED:0,TRANSITION_WATCH:1,ACCUMULATION_CANDIDATE:2,OI_BUILD:3,INCOMPLETE:4,SHORT_BUILD_RISK:5,OVERHEATED:6,DATA_DEGRADED:7}:method===METHODS.GROK?{GROK_FIRE:0,GROK_READY:1,GROK_INTEREST:2,GROK_HOLD:3,GROK_EXCLUDE:4}:method===METHODS.GEMINI?{GEMINI_ALPHA:0,GEMINI_READY:1,GEMINI_WATCH:2,GEMINI_HOLD:3,GEMINI_RISK:4}:method===METHODS.CLAUDE?{CLAUDE_A_B:0,CLAUDE_A_TO_AB:1,CLAUDE_A:2,CLAUDE_NFB_SQ:3,CLAUDE_C:4,CLAUDE_NFB:5,CLAUDE_A_PRE:6,CLAUDE_B:7,CLAUDE_NFB_SC:8,CLAUDE_INCOMPLETE:9}:{IGNITION_CONFIRMED:0,WATCH_PRIORITY:1,WAIT:2,HOLD:3,PROGRESSED:4};items.sort((a,b)=>(order[a.verdict?.key]??9)-(order[b.verdict?.key]??9)||((b.verdict?.priority??b.verdict?.score)||0)-((a.verdict?.priority??a.verdict?.score)||0));
    return{status:'ok',stage:'deep',method,version:VERSION,updatedAt:stamp,asOf:snapshotAsOf,timeframes:tfs,requested:list.length,marketState:market,items};
  }
  return{universe,oi,deep};
}

module.exports={VERSION,METHODS,ASTRA_TIMEFRAMES,MANUS_TIMEFRAMES,PERPLEXITY_TIMEFRAMES,GROK_TIMEFRAMES,GEMINI_TIMEFRAMES,CLAUDE_TIMEFRAMES,CONFIG,MANUS_CONFIG,PERPLEXITY_CONFIG:Perplexity.CONFIG,GROK_CONFIG:Grok.CONFIG,GEMINI_CONFIG:Gemini.CONFIG,CLAUDE_CONFIG:Claude.CONFIG,finite,confirmed,candleMetrics,lastConfirmedTaker,takerCross,buildUniverse,initialFilter,marketState,oiFromProfile,scoreCandidate,classifyAstra,classifyManus,classifyPerplexity:Perplexity.classify,classifyGrok:Grok.classify,classifyGemini:Gemini.classify,classifyClaude:Claude.classify,normalizeSymbols,methodOf,createAstraAutoScanner};
