'use strict';

const VERSION='ASTRA_SAMPLING_V3';
const CONFIG=Object.freeze({
  cusumVolMultiplier:1.35,
  cusumMinThresholdPct:0.35,
  priceThresholdPct:1.25,
  rangeThresholdPct:1.8,
  rvolThreshold:3,
  rvolWindow:20,
  liquidityLookback:20,
  liquidityMinWickRatio:.25,
  oiAccel1hPct:.75,
  oiBuild4hPct:1.5,
  tripleBarrier:{
    upperAtrMultiple:2.0,
    lowerAtrMultiple:1.0,
    minUpperPct:2.0,
    minLowerPct:1.0,
    horizonBars:24
  }
});

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function avg(xs=[]){const a=xs.map(finite).filter(Number.isFinite);return a.length?a.reduce((s,x)=>s+x,0)/a.length:null}
function std(xs=[]){const a=xs.map(finite).filter(Number.isFinite);if(a.length<2)return 0;const m=avg(a);return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1))}
function pct(a,b){a=finite(a);b=finite(b);return a!=null&&b?((a/b)-1)*100:null}
function intervalMs(tf){return({ '1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'2h':7200000,'4h':14400000,'6h':21600000,'8h':28800000,'12h':43200000,'1d':86400000 })[tf]||0}
function closedRows(rows=[],asOf=Date.now()){
  return (Array.isArray(rows)?rows:[]).filter(r=>Array.isArray(r)&&r.length>=7&&finite(r[4])!=null&&(finite(r[6])==null||finite(r[6])<asOf));
}
function bar(row){
  return{
    openTime:finite(row?.[0]),open:finite(row?.[1]),high:finite(row?.[2]),low:finite(row?.[3]),close:finite(row?.[4]),
    volume:finite(row?.[5]),closeTime:finite(row?.[6]),quoteVolume:finite(row?.[7]),trades:finite(row?.[8]),takerBuyBase:finite(row?.[9])
  };
}
function resampleOHLCV(rows=[],sourceTf='1m',targetTf='15m',{asOf=Date.now(),dropPartial=true}={}){
  const src=closedRows(rows,asOf).map(bar).filter(x=>x.openTime!=null&&x.close!=null);
  const bucketMs=intervalMs(targetTf),sourceMs=intervalMs(sourceTf);
  if(!bucketMs||!sourceMs||bucketMs<sourceMs||bucketMs%sourceMs!==0)return[];
  const buckets=new Map();
  for(const b of src){
    const k=Math.floor(b.openTime/bucketMs)*bucketMs;
    let x=buckets.get(k);
    if(!x)x={openTime:k,closeTime:k+bucketMs-1,open:b.open,high:b.high,low:b.low,close:b.close,volume:0,quoteVolume:0,trades:0,takerBuyBase:0,count:0};
    x.high=Math.max(x.high,b.high);x.low=Math.min(x.low,b.low);x.close=b.close;
    x.volume+=(b.volume||0);x.quoteVolume+=(b.quoteVolume||0);x.trades+=(b.trades||0);x.takerBuyBase+=(b.takerBuyBase||0);x.count++;
    buckets.set(k,x);
  }
  const expected=bucketMs/sourceMs;
  return [...buckets.values()].sort((a,b)=>a.openTime-b.openTime).filter(x=>!dropPartial||x.count===expected).map(x=>[
    x.openTime,String(x.open),String(x.high),String(x.low),String(x.close),String(x.volume),x.closeTime,String(x.quoteVolume),x.trades,String(x.takerBuyBase),'0','0'
  ]);
}
function trueRangePct(curr,prevClose){
  if(!curr||curr.close==null||prevClose==null||!curr.close)return null;
  const tr=Math.max(curr.high-curr.low,Math.abs(curr.high-prevClose),Math.abs(curr.low-prevClose));
  return tr/curr.close*100;
}
function atrPct(rows=[],period=14){
  const a=rows.map(bar).filter(x=>x.close!=null);
  if(a.length<period+1)return null;
  const trs=[];for(let i=a.length-period;i<a.length;i++)trs.push(trueRangePct(a[i],a[i-1]?.close));
  return avg(trs);
}
function logReturns(rows=[]){
  const a=rows.map(bar).filter(x=>x.close>0),out=[];
  for(let i=1;i<a.length;i++)out.push({time:a[i].closeTime,ret:Math.log(a[i].close/a[i-1].close)*100,price:a[i].close,index:i});
  return out;
}
function cusumEvents(rows=[],config=CONFIG){
  const rs=logReturns(rows);if(rs.length<10)return[];
  const recent=rs.slice(-Math.min(60,rs.length)).map(x=>x.ret);
  const threshold=Math.max(config.cusumMinThresholdPct,std(recent)*config.cusumVolMultiplier);
  let pos=0,neg=0;const out=[];
  for(const r of rs){
    pos=Math.max(0,pos+r.ret);neg=Math.min(0,neg+r.ret);
    if(pos>=threshold){out.push({type:'CUSUM_UP',time:r.time,index:r.index,price:r.price,valuePct:pos,thresholdPct:threshold});pos=0}
    if(Math.abs(neg)>=threshold){out.push({type:'CUSUM_DOWN',time:r.time,index:r.index,price:r.price,valuePct:neg,thresholdPct:threshold});neg=0}
  }
  return out;
}
function priceThresholdEvents(rows=[],config=CONFIG){
  const a=rows.map(bar).filter(x=>x.close>0);if(a.length<2)return[];
  const out=[];let anchor=a[0].close,anchorTime=a[0].closeTime;
  for(let i=1;i<a.length;i++){
    const move=pct(a[i].close,anchor);
    if(move!=null&&Math.abs(move)>=config.priceThresholdPct){
      out.push({type:move>0?'PRICE_THRESHOLD_UP':'PRICE_THRESHOLD_DOWN',time:a[i].closeTime,index:i,price:a[i].close,valuePct:move,anchorTime});
      anchor=a[i].close;anchorTime=a[i].closeTime;
    }
  }
  return out;
}
function rangeEvents(rows=[],config=CONFIG){
  return rows.map(bar).map((b,i)=>({b,i,range:b.close?((b.high-b.low)/b.close*100):null}))
    .filter(x=>x.range!=null&&x.range>=config.rangeThresholdPct)
    .map(x=>({type:'RANGE_EXPANSION',time:x.b.closeTime,index:x.i,price:x.b.close,valuePct:x.range}));
}
function rvolEvents(rows=[],config=CONFIG){
  const a=rows.map(bar),out=[];
  for(let i=config.rvolWindow;i<a.length;i++){
    const base=avg(a.slice(i-config.rvolWindow,i).map(x=>x.volume));
    const rv=base>0?(a[i].volume||0)/base:null;
    if(rv!=null&&rv>=config.rvolThreshold)out.push({type:'RVOL_IGNITION',time:a[i].closeTime,index:i,price:a[i].close,rvol:rv});
  }
  return out;
}
function liquiditySweepEvents(rows=[],config=CONFIG){
  const a=rows.map(bar),out=[];
  for(let i=config.liquidityLookback;i<a.length;i++){
    const prev=a.slice(i-config.liquidityLookback,i),b=a[i],hi=Math.max(...prev.map(x=>x.high)),lo=Math.min(...prev.map(x=>x.low));
    const range=b.high-b.low;if(!(range>0))continue;
    const lower=Math.min(b.open,b.close)-b.low,upper=b.high-Math.max(b.open,b.close);
    if(b.low<lo&&b.close>lo&&lower/range>=config.liquidityMinWickRatio)out.push({type:'SSL_SWEEP_RECLAIM',time:b.closeTime,index:i,price:b.close,level:lo,wickRatio:lower/range});
    if(b.high>hi&&b.close<hi&&upper/range>=config.liquidityMinWickRatio)out.push({type:'BSL_SWEEP_REJECT',time:b.closeTime,index:i,price:b.close,level:hi,wickRatio:upper/range});
  }
  return out;
}
function derivativeEvents(input={},time=Date.now(),config=CONFIG){
  const out=[],oi1=finite(input.oi1hPct),oi4=finite(input.oi4hPct),t15=finite(input.taker15m),t5=finite(input.taker5m);
  if(oi1!=null&&oi1>=config.oiAccel1hPct)out.push({type:'OI_ACCEL_1H',time,valuePct:oi1});
  if(oi4!=null&&oi4>=config.oiBuild4hPct)out.push({type:'OI_BUILD_4H',time,valuePct:oi4});
  if(t15!=null&&t15>=1.2)out.push({type:'TAKER_BUY_PULSE_15M',time,ratio:t15});
  if(t5!=null&&t5>=1.2)out.push({type:'TAKER_BUY_PULSE_5M',time,ratio:t5});
  return out;
}
function tripleBarrier(rows=[],event={},config=CONFIG.tripleBarrier){
  const a=rows.map(bar).filter(x=>x.close>0),idx=Number.isInteger(event.index)?event.index:a.findIndex(x=>x.closeTime>=event.time);
  if(idx<0||idx>=a.length)return{status:'NO_ENTRY'};
  const entry=a[idx].close,atr=atrPct(rows.slice(0,idx+1),14);
  const upperPct=Math.max(config.minUpperPct,(atr||0)*config.upperAtrMultiple),lowerPct=Math.max(config.minLowerPct,(atr||0)*config.lowerAtrMultiple);
  const upper=entry*(1+upperPct/100),lower=entry*(1-lowerPct/100),end=Math.min(a.length-1,idx+config.horizonBars);
  let mfe=0,mae=0;
  for(let i=idx+1;i<=end;i++){
    mfe=Math.max(mfe,pct(a[i].high,entry)||0);mae=Math.min(mae,pct(a[i].low,entry)||0);
    const hitUp=a[i].high>=upper,hitDown=a[i].low<=lower;
    if(hitUp&&hitDown)return{status:'AMBIGUOUS_SAME_BAR',entry,entryTime:a[idx].closeTime,exitTime:a[i].closeTime,upperPct,lowerPct,mfePct:mfe,maePct:mae};
    if(hitUp)return{status:'UPPER_BARRIER_HIT',label:'SURGE',entry,entryTime:a[idx].closeTime,exitTime:a[i].closeTime,upperPct,lowerPct,mfePct:mfe,maePct:mae,bars:i-idx};
    if(hitDown)return{status:'LOWER_BARRIER_HIT',label:'FAILED_BOS',entry,entryTime:a[idx].closeTime,exitTime:a[i].closeTime,upperPct,lowerPct,mfePct:mfe,maePct:mae,bars:i-idx};
  }
  const exit=a[end]?.close,ret=pct(exit,entry);
  return{status:'TIME_EXPIRED',label:'NO_TRIGGER',entry,entryTime:a[idx].closeTime,exitTime:a[end]?.closeTime,returnPct:ret,upperPct,lowerPct,mfePct:mfe,maePct:mae,bars:end-idx};
}
function dedupeEvents(events=[]){
  const map=new Map();
  for(const e of events.filter(Boolean).sort((a,b)=>(a.time||0)-(b.time||0))){
    const bucket=Math.floor((e.time||0)/60000),key=`${e.type}@${bucket}`;
    if(!map.has(key))map.set(key,e);
  }
  return [...map.values()].sort((a,b)=>(a.time||0)-(b.time||0));
}
function sequenceSummary(events=[],now=Date.now()){
  const recent=events.filter(e=>now-(e.time||0)<=24*3600000);
  const types=[...new Set(recent.map(e=>e.type))],bullishTypes=['CUSUM_UP','PRICE_THRESHOLD_UP','RVOL_IGNITION','SSL_SWEEP_RECLAIM','OI_ACCEL_1H','OI_BUILD_4H','TAKER_BUY_PULSE_15M','TAKER_BUY_PULSE_5M'];
  const bullish=recent.filter(e=>bullishTypes.includes(e.type)),first=bullish[0],last=bullish.at(-1);
  const compressionHours=first&&last?Math.max(0,(last.time-first.time)/3600000):null;
  let stage='QUIET';
  if(types.includes('SSL_SWEEP_RECLAIM')&&(types.includes('OI_BUILD_4H')||types.includes('OI_ACCEL_1H')))stage='ABSORPTION_BUILD';
  if(types.includes('RVOL_IGNITION')&&types.some(t=>t.startsWith('TAKER_BUY_PULSE')))stage='FLOW_IGNITION';
  if(types.includes('CUSUM_UP')&&types.includes('RVOL_IGNITION')&&types.includes('OI_BUILD_4H'))stage='MULTI_EVENT_IGNITION';
  return{eventCount:recent.length,eventTypes:types,bullishEventCount:bullish.length,compressionHours,stage,recent:recent.slice(-20)};
}
function buildSamplingV3({rows5m=[],rows15m=[],asOf=Date.now(),derivatives={}}={}){
  const r5=closedRows(rows5m,asOf),r15=closedRows(rows15m,asOf),base=r15.length>=25?r15:r5;
  const events=dedupeEvents([
    ...cusumEvents(base),
    ...priceThresholdEvents(base),
    ...rangeEvents(base),
    ...rvolEvents(base),
    ...liquiditySweepEvents(base),
    ...derivativeEvents(derivatives,asOf)
  ]);
  const sequence=sequenceSummary(events,asOf),lastMarketEvent=[...events].reverse().find(e=>Number.isInteger(e.index));
  const outcome=lastMarketEvent?tripleBarrier(base,lastMarketEvent):{status:'NO_EVENT'};
  const evidenceScore=Math.min(100,
    sequence.bullishEventCount*8+
    (sequence.eventTypes.includes('OI_BUILD_4H')?14:0)+
    (sequence.eventTypes.includes('RVOL_IGNITION')?14:0)+
    (sequence.eventTypes.includes('SSL_SWEEP_RECLAIM')?12:0)+
    (sequence.eventTypes.includes('TAKER_BUY_PULSE_15M')?10:0)+
    (sequence.stage==='MULTI_EVENT_IGNITION'?18:0)
  );
  return{
    version:VERSION,mode:'SHADOW',asOf,
    sampling:{cusum:'adaptive return CUSUM',priceThresholdPct:CONFIG.priceThresholdPct,rangeThresholdPct:CONFIG.rangeThresholdPct,rvolThreshold:CONFIG.rvolThreshold},
    sequence,
    latestOutcomeProbe:outcome,
    evidenceScore,
    rankingEffect:0,
    note:'Information-driven sampling research layer. No ranking effect until OOS validation.'
  };
}
module.exports={VERSION,CONFIG,closedRows,resampleOHLCV,atrPct,cusumEvents,priceThresholdEvents,rangeEvents,rvolEvents,liquiditySweepEvents,derivativeEvents,tripleBarrier,dedupeEvents,sequenceSummary,buildSamplingV3};
