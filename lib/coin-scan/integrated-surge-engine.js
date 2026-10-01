'use strict';

// The standalone Python worker and this web evidence layer share the same rules.
const VERSION='INTEGRATED_SURGE_v1';
const TFMS={'1d':86400000,'4h':14400000,'1h':3600000,'15m':900000,'5m':300000};
const PERIODS=[14,28,57,92];
const CONFIG=Object.freeze({
  compressionMax:.10,compressionStrong:.05,historicalRvol:2,
  oiA:1,oiPre:.20,oiCleanup:-2,oiRebuild:.30,
  flowSustain:1.15,flowIgnition:1.5,flowSpike:2.5,
  ignitionRvol:1.5,entryRvol:1.2,holdTolerance:.005,
  pullbackMin:.02,pullbackMax:.15,priorRallyMin:.05,
  echoMaxCurrentRvol:1.2,echoPriceFloor:.97,
  extended24h:20,extendedDailyEma:18,extended4hEma:10
});
function finite(x){if(x==null||x==='')return null;const v=Number(x);return Number.isFinite(v)?v:null}
function avg(xs){return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null}
function max(xs){return xs.length?Math.max(...xs):null}
function min(xs){return xs.length?Math.min(...xs):null}
function pct(now,before){return before>0?(now/before-1)*100:null}
function ema(values,period){
  if(!values.length)return[];
  const alpha=2/(period+1),out=[values[0]];
  for(let i=1;i<values.length;i++)out.push(values[i]*alpha+out[i-1]*(1-alpha));
  return out;
}
function frame(rows=[],tf,asOf){
  const unique=new Map();
  for(const x of Array.isArray(rows)?rows:[]){
    if(!Array.isArray(x)||x.length<7)continue;
    const time=finite(x[0]),closeTime=finite(x[6]),close=finite(x[4]);
    if(time==null||closeTime==null||closeTime>=asOf||close==null||close<=0)continue;
    const open=finite(x[1]),high=finite(x[2]),low=finite(x[3]),volume=finite(x[5]);
    if([open,high,low,volume].some(v=>v==null)||volume<0)continue;
    const quote=finite(x[7]),buyQuote=finite(x[10]);
    const sell=quote!=null&&buyQuote!=null?Math.max(0,quote-buyQuote):null;
    const taker=quote>0&&buyQuote!=null?buyQuote/Math.max(sell,quote*1e-9,1e-12):null;
    unique.set(time,{time,closeTime,open,high,low,close,volume,quote,taker});
  }
  const a=[...unique.values()].sort((x,y)=>x.time-y.time);
  const minimum=tf==='1d'?30:100;
  if(a.length<minimum)return{available:false,bars:a.length,error:'INSUFFICIENT_HISTORY'};
  if(asOf-a.at(-1).closeTime>TFMS[tf])return{available:false,bars:a.length,error:'STALE_FRAME'};
  if(a.some((x,i)=>i&&x.time-a[i-1].time!==TFMS[tf]))return{available:false,bars:a.length,error:'MISSING_CANDLES'};
  const closes=a.map(x=>x.close),emas=Object.fromEntries(PERIODS.map(p=>[p,ema(closes,p)]));
  const e12=ema(closes,12),e26=ema(closes,26),macd=e12.map((v,i)=>v-e26[i]),signal=ema(macd,9);
  let day=null,quoteSum=0,baseSum=0,quoteMissing=false;
  for(let i=0;i<a.length;i++){
    const x=a[i],nextDay=Math.floor(x.time/TFMS['1d']);
    if(day!==nextDay){day=nextDay;quoteSum=0;baseSum=0;quoteMissing=false}
    if(x.quote==null)quoteMissing=true;else quoteSum+=x.quote;
    baseSum+=x.volume;
    x.vwap=!quoteMissing&&baseSum>0?quoteSum/baseSum:null;
    x.emas=PERIODS.map(p=>emas[p][i]);
    x.compression=(Math.max(...x.emas)-Math.min(...x.emas))/x.close;
    x.histPct=(macd[i]-signal[i])/x.close*100;
    const baseline=i>=20?avg(a.slice(i-20,i).map(v=>v.volume)):null;
    x.rvol=baseline>0?x.volume/baseline:null;
  }
  return{available:true,bars:a.length,ema92Has92Bars:a.length>=92,
    ema92SeedDecay:(1-2/93)**(a.length-1),candles:a,last:a.at(-1)};
}
function improving(f){const a=f.candles?.slice(-3)||[];return a.length===3&&a[2].histPct>a[1].histPct&&a[2].histPct>a[0].histPct}
function hold(f,c=CONFIG){const a=f.candles||[];return a.length>=6&&min(a.slice(-3).map(x=>x.low))>=min(a.slice(-6,-3).map(x=>x.low))*(1-c.holdTolerance)}
function aboveAll(f){return Boolean(f.available&&f.last.emas.every(v=>f.last.close>v))}
function aligned(x){return x.emas.every((v,i)=>!i||x.emas[i-1]>v)}
function breakOrReclaim(f){
  if(!f.available)return{confirmed:false,level:null};
  const a=f.candles,r=a.at(-1),prev=a.at(-2),level=max(a.slice(-13,-1).map(x=>x.high));
  const breakout=prev.close<=level&&r.close>level,reclaim=r.low<=level&&r.close>level;
  return{confirmed:breakout||reclaim,breakout,reclaim,level};
}
function flowLabel(values,c=CONFIG){
  const x=values.slice(-4).map(finite);
  if(x.length<4||x.some(v=>v==null))return'UNKNOWN';
  if(max(x.slice(0,-1))>=c.flowSpike&&x[3]<1)return'FLOW-SPIKE-FAIL';
  if(x.slice(-3).every(v=>v>=c.flowSustain))return'FLOW-SUSTAIN';
  if(x[3]>=c.flowIgnition&&x[0]<=1&&x.every((v,i)=>!i||v>=x[i-1]))return'FLOW-IGNITION';
  return x[3]>=c.flowIgnition?'FLOW-SPIKE':'FLOW-WAIT';
}
function goodFlow(label){return['FLOW-SUSTAIN','FLOW-IGNITION'].includes(label)}
function setup4h(f,c=CONFIG){
  if(!f.available)return{valid:false,available:false};
  const a=f.candles,r=f.last,start=a.length-12,window=a.slice(-12,-2);
  const peakPos=start+window.findIndex(x=>x.high===max(window.map(v=>v.high)));
  const peak=a[peakPos].high,base=min(a.slice(-24,peakPos+1).map(x=>x.low));
  const trough=min(a.slice(peakPos+1).map(x=>x.low)),depth=1-trough/peak;
  const recovery=a.slice(-3).some(x=>x.close<=x.emas[0])&&r.close>r.emas[0];
  const pullback=peak/base-1>=c.priorRallyMin&&depth>=c.pullbackMin
    &&depth<=c.pullbackMax&&recovery&&hold(f,c);
  const histImproving=improving(f),prior=max(a.slice(-18).map(x=>x.rvol).filter(v=>v!=null));
  return{available:true,valid:r.close>r.emas[0]&&(histImproving||r.histPct>0)
    &&(r.compression<=c.compressionMax||pullback),
    compressionPct:r.compression*100,strongCompression:r.compression<=c.compressionStrong,
    pullbackRecovery:pullback,histPct:r.histPct,macdImproving:histImproving,
    currentRvol:r.rvol,maxRvol72h:prior,historicalRvol:prior>=c.historicalRvol};
}
function volumeContext(h4,h1,m15,c=CONFIG){
  const alive=Boolean(setup4h(h4,c).valid&&h1.available&&h1.last.close>h1.last.emas[0]&&hold(h1,c));
  let echo=null;
  if(alive){
    const a=h1.candles,r=h1.last;
    for(let i=a.length-1;i>=0;i--){
      const anchor=a[i],age=(r.time-anchor.time)/TFMS['1h'];
      if(age<3||age>72||anchor.rvol==null||anchor.rvol<c.historicalRvol)continue;
      const floor=anchor.low*c.echoPriceFloor;
      const maintained=min(a.slice(-3).map(x=>x.low))>=floor
        &&r.close>=anchor.close*c.echoPriceFloor
        &&min(a.slice(i+1).map(x=>x.close))>=floor;
      if(maintained&&r.rvol!=null&&r.rvol<=c.echoMaxCurrentRvol&&r.volume<anchor.volume*.70){
        echo={anchorTime:anchor.time,anchorRvol:anchor.rvol,currentRvol:r.rvol};break;
      }
    }
  }
  const h1Max=max((h1.candles||[]).slice(-3).map(x=>x.rvol).filter(v=>v!=null));
  const m15Max=max((m15.candles||[]).slice(-4).map(x=>x.rvol).filter(v=>v!=null));
  const preload=alive&&(h1Max>=c.historicalRvol||m15Max>=c.historicalRvol);
  return{detected:Boolean(echo),state:echo&&preload?'ECHO+RECENT-PRELOAD':
    echo?'VOLUME-ECHO':preload?'RECENT-PRELOAD':'QUIET',recentPreload:preload,
    structureAlive:alive,recent1hMaxRvol:h1Max,recent15mMaxRvol:m15Max,...(echo||{})};
}
function ready1h(f,c=CONFIG){
  if(!f.available)return{ready:false,flow:'UNKNOWN'};
  const above=f.last.close>f.last.emas[0],held=hold(f,c),improved=improving(f);
  return{ready:above&&held&&improved,aboveEma14:above,aboveAllEmas:aboveAll(f),
    holdOrHl:held,macdImproving:improved,histPct:f.last.histPct,
    flow:flowLabel(f.candles.slice(-4).map(x=>x.taker),c),break:breakOrReclaim(f)};
}
function gate15m(f,c=CONFIG){
  if(!f.available)return{passed:false,flow:'UNKNOWN'};
  const a=f.candles,r=f.last,prev=a.at(-2),brk=breakOrReclaim(f);
  const transition=r.emas[0]>r.emas[1]&&r.emas[0]>prev.emas[0]
    &&r.emas[0]-r.emas[1]>prev.emas[0]-prev.emas[1];
  const flow=flowLabel(a.slice(-4).map(x=>x.taker),c);
  const rvolUp=r.rvol!=null&&prev.rvol!=null&&r.rvol>=c.ignitionRvol&&r.rvol>prev.rvol;
  return{passed:r.close>r.emas[0]&&(aligned(r)||transition)&&brk.confirmed&&rvolUp&&goodFlow(flow),
    aboveAllEmas:aboveAll(f),aligned:aligned(r),alignmentTransition:transition,
    compressionPct:r.compression*100,break:brk,rvol:r.rvol,rvolIncreasing:rvolUp,
    flow,takerSequence:a.slice(-4).map(x=>x.taker)};
}
function gate5m(f,c=CONFIG){
  if(!f.available)return{passed:false};
  const a=f.candles,r=f.last,prev=a.at(-2),brk=breakOrReclaim(f),held=hold(f,c);
  const reclaim=prev.close<=prev.emas[0]&&r.close>r.emas[0];
  const vwap=(r.vwap!=null&&r.close>r.vwap)||reclaim;
  const rvolUp=r.rvol!=null&&prev.rvol!=null&&r.rvol>=c.entryRvol&&r.rvol>prev.rvol;
  const taker=r.taker!=null&&r.taker>=c.flowSustain
    &&((prev.taker!=null&&r.taker>prev.taker)||goodFlow(flowLabel(a.slice(-4).map(x=>x.taker),c)));
  return{passed:aboveAll(f)&&held&&vwap&&brk.confirmed&&rvolUp&&taker,
    aboveAllEmas:aboveAll(f),holdOrHl:held,vwapConfirmed:vwap,emaReclaim:reclaim,
    mssProxy:brk.confirmed&&held,break:brk,rvol:r.rvol,takerReentry:taker,
    macdHistPctInfoOnly:r.histPct};
}
function oiFeatures(rows=[],asOf,c=CONFIG){
  const unique=new Map();
  for(const r of Array.isArray(rows)?rows:[]){
    const t=finite(r.timestamp),v=finite(r.sumOpenInterest);
    if(t!=null&&t<=asOf&&v>0)unique.set(t,{t,v});
  }
  const a=[...unique.values()].sort((x,y)=>x.t-y.t),latest=a.at(-1);
  const unknown={known:false,a:false,aPre:false,cRebuild:false};
  if(!latest||asOf-latest.t>1800000)return{...unknown,error:'MISSING_OR_STALE_OI'};
  const at=t=>{const v=a.filter(x=>x.t<=t).at(-1);return v&&t-v.t<=900000?v.v:null};
  const p15=at(latest.t-900000),p30=at(latest.t-1800000);
  const p60=at(latest.t-3600000),p180=at(latest.t-10800000);
  if([p15,p30,p60,p180].some(x=>x==null))return{...unknown,error:'MISSING_OI_REFERENCE'};
  const d15=pct(latest.v,p15),d60=pct(latest.v,p60),cleanup=pct(p60,p180);
  const building=latest.v>p15&&p15>p30;
  return{known:true,timestamp:latest.t,change15mPct:d15,change1hPct:d60,
    cleanupPct:cleanup,building,a:d60>=c.oiA,
    aPre:d60>=c.oiPre&&d15>0&&building,
    cRebuild:cleanup<=c.oiCleanup&&d60>=c.oiRebuild&&d15>0,error:null};
}
function classifyStage({oi,flow,ready,gate15,gate5,extended}){
  if(oi.known&&oi.a&&flow)return ready&&gate15&&gate5&&!extended&&oi.change15mPct>0?'점화초기':'A+B';
  if(oi.known&&oi.a)return'A';
  if(flow)return'B';
  if(oi.known&&oi.aPre)return'A-pre';
  return'PRE';
}
function evaluate({frames={},oiRows=[],asOf=Date.now(),config={}}={}){
  const c={...CONFIG,...config},features=Object.fromEntries(Object.keys(TFMS).map(tf=>[tf,frame(frames[tf],tf,asOf)]));
  const h4=features['4h'],h1=features['1h'],m15=features['15m'],m5=features['5m'],daily=features['1d'];
  const setup=setup4h(h4,c),ready=ready1h(h1,c),g15=gate15m(m15,c),g5=gate5m(m5,c);
  const oi=oiFeatures(oiRows,asOf,c),volume=volumeContext(h4,h1,m15,c);
  const missing=Object.entries(features).filter(([,f])=>!f.available).map(([tf])=>tf);
  const target=asOf-86400000;
  let reference=null,referenceInterval=null;
  for(const tf of ['5m','1h']){
    const ref=(features[tf].candles||[]).filter(x=>x.closeTime<target).at(-1);
    if(ref){reference=ref;referenceInterval=tf;break}
  }
  const price=m5.available?m5.last.close:null;
  const change=reference&&price!=null?pct(price,reference.close):null;
  const dayDist=daily.available&&price!=null?pct(price,daily.last.emas[0]):null;
  const h4Dist=h4.available&&price!=null?pct(price,h4.last.emas[0]):null;
  const reasons=[];
  if(change!=null&&change>=c.extended24h)reasons.push('24H 상승폭 과대');
  if(dayDist!=null&&dayDist>=c.extendedDailyEma)reasons.push('1D EMA14 이격 과대');
  if(h4Dist!=null&&h4Dist>=c.extended4hEma)reasons.push('4H EMA14 이격 과대');
  const extended=reasons.length>0,flow=goodFlow(ready.flow)||goodFlow(g15.flow);
  const cType=oi.known&&oi.cRebuild&&ready.aboveEma14&&ready.holdOrHl;
  const type=cType?'C':oi.a&&flow?'A+B':oi.a||oi.aPre?'A':flow?'B':'PRE';
  const stage=!h4.available?'INCOMPLETE':!setup.valid?'NO_SETUP':
    classifyStage({oi,flow,ready:ready.ready,gate15:g15.passed,gate5:g5.passed,extended});
  return{version:VERSION,asOf,stage,type,extended,extendedReasons:reasons,
    setup4h:setup,ready1h:ready,gate15m:g15,gate5m:g5,oi,
    volumeEcho:volume,volume_echo:{...volume},
    change24hPct:change,change24hReference:reference?{interval:referenceInterval,closeTime:reference.closeTime}:null,
    environment1d:daily.available?{aboveEma14:daily.last.close>daily.last.emas[0],
      compressionPct:daily.last.compression*100,histPct:daily.last.histPct,
      macdImproving:improving(daily),ema14DistancePct:dayDist}:{available:false},
    coverage:{missing,frames:Object.fromEntries(Object.entries(features).map(([tf,f])=>[tf,
      {available:f.available,bars:f.bars,error:f.error||null,ema92Has92Bars:f.ema92Has92Bars??false}]))},
    policy:{validatedWinRate:false,preloadPromotesB:false,negative5mMacdVeto:false,
      rankingEffect:0,source:'closed candles and timestamped OI contracts'}};
}
module.exports={VERSION,CONFIG,TFMS,finite,ema,frame,improving,hold,aboveAll,
  flowLabel,goodFlow,setup4h,volumeContext,ready1h,gate15m,gate5m,oiFeatures,classifyStage,evaluate};
