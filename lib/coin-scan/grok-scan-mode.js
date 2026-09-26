'use strict';

const TIMEFRAMES=Object.freeze(['1w','1d','4h','1h','15m','5m']);
const CONFIG=Object.freeze({
  maxAbs24hPct:10,
  volumePercentile:0.70,
  minDynamicQuoteVolume:5_000_000,
  maxDynamicQuoteVolume:20_000_000,
  oiRelativeTopPct:0.20,
  oiAbsoluteGatePct:1.5,
  minOiValueUsdt:5_000_000,
  minSessionRvol:1.8,
  minTakerBuyShare:0.48,
  fundingCrowdedLongPct:0.08,
  basisCrowdedPct:0.35,
  scoreFire:80,
  scoreReady:65,
  scoreInterest:50,
  sameSlotDays:5,
  provisionalParams:['volumePercentile','minDynamicQuoteVolume','maxDynamicQuoteVolume','oiRelativeTopPct','oiAbsoluteGatePct','minOiValueUsdt','minSessionRvol','basisCrowdedPct']
});
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function avg(a=[]){const x=a.map(finite).filter(Number.isFinite);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null}
function percentile(a=[],p=.5){const x=a.map(finite).filter(Number.isFinite).sort((m,n)=>m-n);if(!x.length)return null;const i=(x.length-1)*Math.max(0,Math.min(1,p)),lo=Math.floor(i),hi=Math.ceil(i);return lo===hi?x[lo]:x[lo]+(x[hi]-x[lo])*(i-lo)}
function trimmedMean(a=[],trim=.10){const x=a.map(finite).filter(Number.isFinite).sort((m,n)=>m-n);if(!x.length)return null;const k=Math.floor(x.length*trim),y=x.slice(k,Math.max(k+1,x.length-k));return avg(y)}
function dynamicUniverse(rows=[],config=CONFIG){
  const liquid=rows.map(x=>finite(x.quoteVolume24h)).filter(x=>x>0),raw=percentile(liquid,config.volumePercentile),threshold=Math.max(config.minDynamicQuoteVolume,Math.min(config.maxDynamicQuoteVolume,raw??10_000_000));
  const items=rows.filter(x=>finite(x.priceChange24h)!=null&&Math.abs(x.priceChange24h)<=config.maxAbs24hPct&&finite(x.quoteVolume24h)>=threshold);
  return{items,threshold,percentile:config.volumePercentile};
}
function relativeOiCut(items=[],config=CONFIG){
  const vals=items.filter(x=>x.status==='SUCCESS'&&finite(x.oi4hPct)!=null).map(x=>finite(x.oi4hPct));
  const cut=percentile(vals,1-config.oiRelativeTopPct);
  return{relativeCutPct:cut,topPct:config.oiRelativeTopPct};
}
function selectOi(items=[],config=CONFIG){
  const rank=relativeOiCut(items,config);
  return items.map(x=>{const oi=finite(x.oi4hPct),val=finite(x.oiValueUsdt),relative=rank.relativeCutPct!=null&&oi!=null&&oi>=rank.relativeCutPct,absolute=oi!=null&&oi>=config.oiAbsoluteGatePct,liquid=val==null?false:val>=config.minOiValueUsdt;return{...x,grokOiRelativeCutPct:rank.relativeCutPct,grokOiRelativePass:relative,grokOiAbsolutePass:absolute,grokOiValuePass:liquid,pass:x.status==='SUCCESS'&&liquid&&(relative||absolute)}})}
function confirmed(rows=[],asOf=Date.now()){return(Array.isArray(rows)?rows:[]).filter(x=>Array.isArray(x)&&x.length>=7&&finite(x[4])!=null&&(finite(x[6])==null||finite(x[6])<asOf))}
function sameSlotRvol(rows=[],asOf=Date.now(),days=CONFIG.sameSlotDays){
  const a=confirmed(rows,asOf);if(a.length<3)return null;const last=a.at(-1),open=finite(last[0]),vol=finite(last[5]);if(open==null||vol==null)return null;
  const day=86400000,slot=((open%day)+day)%day,candidates=a.slice(0,-1).filter(x=>{const t=finite(x[0]);if(t==null)return false;const s=((t%day)+day)%day;return s===slot&&open-t<=day*(days+1)}).map(x=>finite(x[5])).filter(Number.isFinite).slice(-days);
  const base=trimmedMean(candidates,.10);return base>0?vol/base:null;
}
function takerContinuity(series=[],periodMs=900000,asOf=Date.now(),n=5){
  const x=(Array.isArray(series)?series:[]).filter(r=>finite(r?.timestamp)!=null&&finite(r.timestamp)+periodMs<=asOf).slice(-n),ratios=x.map(r=>finite(r.ratio??r.buySellRatio)).filter(Number.isFinite);
  if(!ratios.length)return{count:0,avg:null,last:null,buyShare:null,trend:'MISSING',strongCount:0};
  const last=ratios.at(-1),first=ratios[0],share=last/(1+last),strongCount=ratios.filter(v=>v>=1.2).length;
  return{count:ratios.length,avg:avg(ratios),last,buyShare:share,trend:last>first?'IMPROVING':last<first?'WEAKENING':'FLAT',strongCount};
}
function basisPct(futuresPrice,spotPrice){const f=finite(futuresPrice),s=finite(spotPrice);return f!=null&&s>0?((f/s)-1)*100:null}
function score(row={},context={},config=CONFIG){
  const r15=finite(context.sessionRvol15m),r5=finite(context.sessionRvol5m),oi=finite(row.oi4hPct),fund=finite(row.fundingRatePct),basis=finite(row.basisPct),h4=row.tf?.['4h']||{},h1=row.tf?.['1h']||{},d1=row.tf?.['1d']||{},tc=context.takerContinuity15m||{},spotVol=finite(row.spotQuoteVolume24h),futVol=finite(row.quoteVolume24h);
  let s=0;
  if(oi!=null)s+=Math.min(18,Math.max(0,oi)*6);
  if(r15>=3)s+=12;else if(r15>=config.minSessionRvol)s+=8;else if(r15>=1.2)s+=4;
  if(r5>=3)s+=8;else if(r5>=config.minSessionRvol)s+=5;
  if(d1.above20)s+=8;if(h4.above20)s+=8;if(h1.above20)s+=5;if(h4.macdUp)s+=4;if(h1.macdUp)s+=4;
  if(finite(tc.buyShare)>=.55)s+=10;else if(finite(tc.buyShare)>=config.minTakerBuyShare)s+=6;else s-=8;
  if(tc.strongCount>=3)s+=5;if(tc.trend==='IMPROVING')s+=4;
  if(fund!=null&&fund>config.fundingCrowdedLongPct)s-=8;else s+=3;
  if(basis!=null&&basis>config.basisCrowdedPct)s-=6;else if(basis!=null)s+=3;
  if(spotVol!=null&&futVol!=null&&spotVol>0){const ratio=futVol/spotVol;if(ratio>8)s-=6;else if(ratio<4)s+=4}
  return Math.max(0,Math.min(100,Math.round(s)));
}
function classify(row={},context={},config=CONFIG){
  const sessionRvol15m=sameSlotRvol(context.frames?.['15m']||[],row.asOf,config.sameSlotDays),sessionRvol5m=sameSlotRvol(context.frames?.['5m']||[],row.asOf,config.sameSlotDays),tc=takerContinuity(context.taker15mSeries||[],900000,row.asOf,5),h4=row.tf?.['4h']||{},h1=row.tf?.['1h']||{},d1=row.tf?.['1d']||{},buyShare=finite(tc.buyShare),fund=finite(row.fundingRatePct),basis=finite(row.basisPct),htfAligned=d1.above20!==false&&h4.above20!==false,gateRvol=(sessionRvol15m??finite(row.tf?.['15m']?.rvol))>=config.minSessionRvol&&(sessionRvol5m??finite(row.tf?.['5m']?.rvol))>=config.minSessionRvol,gateTaker=buyShare!=null&&buyShare>=config.minTakerBuyShare,gateFunding=!(fund>config.fundingCrowdedLongPct),gateBasis=!(basis>config.basisCrowdedPct),ctx={sessionRvol15m,sessionRvol5m,takerContinuity15m:tc},points=score(row,ctx,config),reasons=[],risks=[];
  if(row.grokOiRelativePass)reasons.push('OI_RELATIVE_TOP20');if(row.grokOiAbsolutePass)reasons.push('OI_ABSOLUTE_GATE');if(sessionRvol15m!=null)reasons.push(`SESSION_RVOL15_${sessionRvol15m.toFixed(2)}X`);if(tc.strongCount>=3)reasons.push(`TAKER_CONTINUITY_${tc.strongCount}/5`);if(htfAligned)reasons.push('HTF_ALIGNED');
  if(!gateRvol)risks.push('RVOL_GATE_FAIL');if(!gateTaker)risks.push('TAKER_GATE_FAIL');if(!htfAligned)risks.push('HTF_MISALIGNED');if(!gateFunding)risks.push('FUNDING_CROWDED');if(!gateBasis)risks.push('BASIS_CROWDED');if(finite(h1.rsi14)>=70)risks.push('1H_OVERHEATED');
  let key='GROK_HOLD',label='⏸ GROK_HOLD';if(points>=config.scoreFire&&gateRvol&&gateTaker&&htfAligned&&gateFunding&&gateBasis){key='GROK_FIRE';label='🔥 GROK_FIRE'}else if(points>=config.scoreReady&&gateTaker&&htfAligned){key='GROK_READY';label='🟡 GROK_READY'}else if(points>=config.scoreInterest){key='GROK_INTEREST';label='⚪ GROK_INTEREST'}else if(risks.includes('HTF_MISALIGNED')&&risks.includes('TAKER_GATE_FAIL')){key='GROK_EXCLUDE';label='⛔ GROK_EXCLUDE'}
  return{key,label,score:points,reasons,risks,sessionRvol:{'15m':sessionRvol15m,'5m':sessionRvol5m},takerContinuity:tc,gate:{rvol:gateRvol,taker:gateTaker,htf:htfAligned,funding:gateFunding,basis:gateBasis},dynamic:{basisPct:basis,spotFuturesVolumeRatio:finite(row.spotQuoteVolume24h)>0?finite(row.quoteVolume24h)/finite(row.spotQuoteVolume24h):null}};
}
module.exports={TIMEFRAMES,CONFIG,dynamicUniverse,relativeOiCut,selectOi,sameSlotRvol,takerContinuity,basisPct,score,classify};
