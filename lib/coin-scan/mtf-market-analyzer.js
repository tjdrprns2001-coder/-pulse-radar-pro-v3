'use strict';

const Core=require('../../ui/auto-chart/analysis/core.js');
const Advanced=require('../../ui/auto-chart/analysis/advanced.js');
const AmdLong=require('./amd-long-entry.js');

const VERSION='MTF_WHOLE_MARKET_v1';
const TFS=Object.freeze(['1w','1d','4h','1h','15m','5m']);
const ROWS=Object.freeze({'1w':260,'1d':500,'4h':500,'1h':360,'15m':260,'5m':260});

function n(v,d=null){if(v===null||v===undefined||v==='')return d;const x=Number(v);return Number.isFinite(x)?x:d}
function clamp(v,a=0,b=100){return Math.max(a,Math.min(b,Number(v)||0))}
function confirmed(rows=[],asOf=Date.now()){
  return (Array.isArray(rows)?rows:[]).filter(x=>Array.isArray(x)&&x.length>=7&&n(x[4])!=null&&(n(x[6])==null||n(x[6])<asOf));
}
function rowsForTf(tf){return ROWS[String(tf||'').toLowerCase()]||260}
function candleObject(r){return{openTime:n(r[0]),open:n(r[1]),high:n(r[2]),low:n(r[3]),close:n(r[4]),volume:n(r[5],0),closeTime:n(r[6]),quoteVolume:n(r[7]),trades:n(r[8]),takerBuyBase:n(r[9]),takerBuyQuote:n(r[10])}}
function pivotSwings(candles=[]){
  const raw=[];
  for(let i=2;i<candles.length-2;i++){
    const x=candles[i],h=x.high,l=x.low;
    if(h>candles[i-1].high&&h>=candles[i-2].high&&h>candles[i+1].high&&h>=candles[i+2].high)raw.push({type:'H',pivotIndex:i,confirmedAt:i+2,price:h});
    if(l<candles[i-1].low&&l<=candles[i-2].low&&l<candles[i+1].low&&l<=candles[i+2].low)raw.push({type:'L',pivotIndex:i,confirmedAt:i+2,price:l});
  }
  return raw;
}
function dataset(symbol,tf,rows,asOf){
  const candles=confirmed(rows,asOf).map(candleObject).filter(x=>[x.openTime,x.open,x.high,x.low,x.close,x.closeTime].every(Number.isFinite));
  return{market:{symbol:String(symbol||'').toUpperCase(),interval:tf,marketType:'futures',exchange:'binance'},candles,structureInput:{canonicalSwings:pivotSwings(candles),provisionalPivots:[]},status:{updatedAt:candles.at(-1)?.closeTime||asOf,gaps:[]}};
}
function compactFrame(a){
  if(!a?.available)return{available:false};
  const x=a.advanced||{},last=a.candles?.at(-1),e14=x.ema?.[14]?.at?.(-1),dist14=n(last?.close)&&n(e14)?(Number(last.close)/Number(e14)-1)*100:null;
  return{available:true,timeframe:a.timeframe,structure:a.structure?.key||'UNKNOWN',setup:a.setup?.state||'NO_SETUP',close:n(a.currentPrice),rvol20:n(a.volume?.rvol20),emaTrend:x.emaTrend||'UNKNOWN',compressionState:x.compressionState||'N/A',compressionPct:n(x.compressionPct),ema14DistancePct:dist14,
    rsi:n(x.rsi?.value),rsiDivergence:x.rsi?.divergence||'NONE',macdHist:n(x.macd?.histNow),macdImproving:x.macd?.improving??null,macdDivergence:x.macd?.divergence||'NONE',obvSlope5:n(x.obv?.slope5),obvDivergence:x.obv?.divergence||'NONE',
    volumeEcho:x.volumeEcho?{active:Boolean(x.volumeEcho.active),anchorRvol:n(x.volumeEcho.anchor?.rvol),currentRvol:n(x.volumeEcho.currentRvol),retained:Boolean(x.volumeEcho.retained)}:null,
    liquidityCount:(x.liquidity||[]).length,lastSweep:(x.sweeps||[]).at(-1)||null,fvgCount:(x.fvg||[]).length,orderBlockCount:(x.orderBlocks||[]).length,
    vpvr:x.vpvr?{vah:n(x.vpvr.vah),poc:n(x.vpvr.poc),val:n(x.vpvr.val)}:null,
    specialSetups:x.specialSetups||null,longEmaDistance:x.longEmaDistance||null};
}
function takerFromKlines(rows=[],asOf=Date.now(),take=4){
  const a=confirmed(rows,asOf).slice(-take),ratios=[];
  for(const r of a){const total=n(r[5]),buy=n(r[9]);if(total==null||buy==null)continue;const sell=total-buy;if(sell>0)ratios.push(buy/sell)}
  const last=ratios.at(-1)??null,avg=ratios.length?ratios.reduce((s,x)=>s+x,0)/ratios.length:null;
  return{last,avg,count:ratios.length,improving:ratios.length>=3?ratios.at(-1)>ratios.at(-2)&&ratios.at(-2)>=ratios.at(-3):null};
}
function spotLead({spotChange24h=null,futuresChange24h=null}={}){
  const s=n(spotChange24h),f=n(futuresChange24h),gap=s!=null&&f!=null?f-s:null;
  return{spotChange24h:s,futuresChange24h:f,gapPct:gap,state:s==null||f==null?'UNKNOWN':s>f+.15?'SPOT_LEAD':f>s+.15?'FUTURES_LEAD':'ALIGNED'};
}
function beginnerStage(longEntry={},extended=false,regime='MIXED'){
  if(extended)return{key:'LATE',label:'이미 늦음'};
  if(regime==='BEAR')return{key:'HTF_CONFLICT',label:'상위봉 하락 충돌'};
  const s=String(longEntry?.status||'');
  if(['NO_ASIA_RANGE','WAIT_SWEEP','WAIT_BREAKOUT'].includes(s))return{key:'WAIT_LIQUIDITY',label:'유동성 스윕 대기'};
  if(s==='WAIT_RECLAIM')return{key:'WAIT_RECLAIM',label:'스윕 후 회복 대기'};
  if(s==='WAIT_MSS')return{key:'WAIT_MSS',label:'MSS 대기'};
  if(['WAIT_DISPLACEMENT','WAIT_ZONE'].includes(s))return{key:'BUILDING',label:'점화 구조 형성'};
  if(s==='WAIT_RETRACE')return{key:'WAIT_RETRACE',label:'되돌림 대기'};
  if(s==='WAIT_REBREAK')return{key:'PRE_IGNITION',label:'점화 직전'};
  if(s==='LONG_READY')return{key:'TRIGGER_READY',label:'점화 직전 · 트리거 충족'};
  if(['NO_LONG_RR','NO_LONG_TARGET_CONSUMED','NO_CHASE','BLOCKED_REVIEW','BLOCKED_CONFLICT','BLOCKED_PRICE'].includes(s))return{key:'BLOCKED',label:'진입 보류'};
  if(s==='INVALID')return{key:'INVALID',label:'구조 무효화'};
  return{key:'OBSERVE',label:'관찰'};
}
function entryMap(longEntry={},frames={}){
  const st=String(longEntry?.status||''),ready=st==='LONG_READY';
  const zone=longEntry.entryZone||longEntry.zone||null,selected=longEntry.selectedTarget||null;
  return{status:st,label:longEntry.label||st,steps:{
    sslSweep:Boolean(longEntry.sweep),reclaim:Boolean(longEntry.reclaimAt),mss:Boolean(longEntry.mss?.confirmed),displacement:Boolean(longEntry.displacement),zone:Boolean(zone),retest:Boolean(longEntry.retestAt),rebreak:Boolean(longEntry.rebreakAt),rrPass:Boolean(longEntry.riskReward>=1.5||selected?.rr>=1.5)
  },sweep:longEntry.sweep||null,mss:longEntry.mss||null,zone:zone?{low:n(zone.low),high:n(zone.high),mid:n(zone.mid),kind:zone.kind||null}:null,
    entryVisible:ready,entry:ready?n(longEntry.entry):null,plannedEntry:n(longEntry.plannedEntry),stop:n(longEntry.stop),invalidation:n(longEntry.invalidation),
    target:selected?{label:selected.label||null,price:n(selected.price),rr:n(selected.rr)}:null,targets:Array.isArray(longEntry.targets)?longEntry.targets.slice(0,6):[],riskReward:n(longEntry.riskReward),minRr:n(longEntry.minRr,1.5)};
}
function score({frames={},row={},mtf=null,longEntry=null}={}){
  let s=0;const ev=[],risk=[],ch=Math.abs(n(row.priceChange24h,0));
  if(ch<=3){s+=14;ev.push('24H 가격 조용')}else if(ch<=6){s+=9;ev.push('24H 상승폭 제한')}else if(ch<=10)s+=3;else{s-=25;risk.push('24H 이미 진행')}
  for(const [tf,w] of [['1d',10],['4h',14],['1h',8]]){const f=frames[tf];if(!f?.available)continue;if(f.structure==='UPTREND'||f.emaTrend==='BULL'){s+=w;ev.push(tf.toUpperCase()+' 상승 구조')}else if(f.structure==='DOWNTREND'&&f.emaTrend==='BEAR'){s-=Math.round(w*.7);risk.push(tf.toUpperCase()+' 하락 구조')}if(['STRONG','COMPRESSED'].includes(f.compressionState)){s+=tf==='4h'?10:6;ev.push(tf.toUpperCase()+' EMA 압축')}if(f.volumeEcho?.active){s+=8;ev.push(tf.toUpperCase()+' Volume Echo')}}
  if(frames['1d']?.specialSetups?.daily92142?.ready){s+=7;ev.push('1D EMA92→142 준비')}
  if(frames['4h']?.specialSetups?.fourHLongEmaSupport?.holding){s+=8;ev.push('4H 장기EMA 지지')}
  const oi=n(row.oi4hPct);if(oi>=1){s+=15;ev.push('OI 4H +1% 이상')}else if(oi>0){s+=7;ev.push('OI 양(+) 선행')}else if(oi!=null&&oi<0){s-=4;risk.push('OI 감소')}
  const t15=n(row.taker15m);if(t15>=1.2){s+=8;ev.push('15m 매수체결 우위')}else if(t15>=1){s+=4}
  if(row.taker15mImproving){s+=3;ev.push('15m Taker 개선')}
  const funding=n(row.fundingRatePct);if(funding!=null&&funding>.08){s-=8;risk.push('Funding 과열')}else if(funding!=null)s+=2;
  const lead=row.spotFutures?.state;if(lead==='SPOT_LEAD'){s+=5;ev.push('현물 선행')}else if(lead==='FUTURES_LEAD'){s-=2;risk.push('선물 선행')}
  if(mtf?.execution?.longState==='READY'){s+=12;ev.push('15m·5m 실행 READY')}else if(mtf?.execution?.longState==='WATCH'){s+=7;ev.push('15m·5m 실행 WATCH')}
  if(String(longEntry?.status)==='WAIT_REBREAK')s+=8;if(String(longEntry?.status)==='LONG_READY')s+=12;
  const dailyDist=n(frames['1d']?.ema14DistancePct),h4Dist=n(frames['4h']?.ema14DistancePct),extended=ch>=10||(dailyDist!=null&&dailyDist>=18)||(h4Dist!=null&&h4Dist>=10);
  if(extended){s-=18;risk.push('EMA/가격 과이격')}
  return{score:Math.round(clamp(s)),extended,evidence:[...new Set(ev)].slice(0,12),risks:[...new Set(risk)].slice(0,10)};
}
function analyze({symbol,rawFrames={},row={},asOf=Date.now(),longEntry=null,cohort='FULL_UNIVERSE_30M'}={}){
  const frameMap={};
  for(const tf of TFS){const ds=dataset(symbol,tf,rawFrames[tf]||[],asOf);if(ds.candles.length>=24)frameMap[tf]=Core.analyze(ds)}
  const base=frameMap['4h']||frameMap['1h']||frameMap['1d']||Object.values(frameMap)[0]||null;
  const stack=base?Core.attachTimeframeStack(base,frameMap):null;
  const compact=Object.fromEntries(TFS.map(tf=>[tf,compactFrame(frameMap[tf])]));
  const t15=takerFromKlines(rawFrames['15m']||[],asOf),t5=takerFromKlines(rawFrames['5m']||[],asOf);
  const flowRow={...row,taker15m:n(row.taker15m,t15.last),taker5m:n(row.taker5m,t5.last),taker15mImproving:row.taker15mImproving??t15.improving};
  const sf=spotLead({spotChange24h:flowRow.spotPriceChange24h,futuresChange24h:flowRow.priceChange24h});
  flowRow.spotFutures=sf;
  const rank=score({frames:compact,row:flowRow,mtf:stack?.multiTimeframe,longEntry});
  const stage=beginnerStage(longEntry,rank.extended,stack?.multiTimeframe?.regime||'MIXED');
  return{version:VERSION,asOf,timeframes:TFS,frames:compact,multiTimeframe:stack?.multiTimeframe||null,referenceLevels:stack?.referenceLevels||null,preIgnition:{...rank,stage},flow:{taker15m:t15,taker5m:t5,spotFutures:sf,oi4hPct:n(flowRow.oi4hPct),fundingRatePct:n(flowRow.fundingRatePct)},entryMap:entryMap(longEntry,compact),
    researchSample:{lookaheadSafe:true,featureCutoffAt:asOf,cohort:String(cohort||'FULL_UNIVERSE_30M'),features:{score:rank.score,stage:stage.key,regime:stack?.multiTimeframe?.regime||'MIXED',oi4hPct:n(flowRow.oi4hPct),fundingRatePct:n(flowRow.fundingRatePct),taker15m:n(t15.last),priceChange24h:n(flowRow.priceChange24h),compression4h:n(compact['4h']?.compressionPct),compression1h:n(compact['1h']?.compressionPct),rvol15m:n(compact['15m']?.rvol20),rvol5m:n(compact['5m']?.rvol20)}}};
}

module.exports={VERSION,TFS,ROWS,rowsForTf,confirmed,candleObject,pivotSwings,dataset,compactFrame,takerFromKlines,spotLead,beginnerStage,entryMap,score,analyze};
