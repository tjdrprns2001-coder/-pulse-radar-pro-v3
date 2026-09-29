'use strict';

const VERSION='COMMON_PREIGNITION_STAGE_v1';
const STAGE=Object.freeze({
  NO_SETUP:'NO_SETUP',
  BASE:'BASE',
  EARLY_ACTIVITY:'EARLY_ACTIVITY',
  COOLDOWN_COMPRESSION:'COOLDOWN_COMPRESSION',
  RECLAIM:'RECLAIM',
  IGNITION:'IGNITION',
  INVALIDATED:'INVALIDATED'
});
const CONFIG=Object.freeze({
  boxLookback:20,
  activityLookback15m:96,
  rvolLookback:20,
  activitySpikeRvol:3,
  ignitionRvol:1.8,
  coolMaxRvol:1.5,
  takerImprove:1.2,
  takerStrong:1.5,
  oiBuild4hPct:1,
  ribbonCompressionRatio:.80,
  macdGapAtrMax:.35,
  structureBreakAtr:.25,
  extended24hPct:10
});
const STAGE_META=Object.freeze({
  NO_SETUP:{label:'⚪ NO SETUP',progressPct:0},
  BASE:{label:'① BASE · 기반 안정',progressPct:20},
  EARLY_ACTIVITY:{label:'② EARLY ACTIVITY · 선행 변화',progressPct:40},
  COOLDOWN_COMPRESSION:{label:'③ COOLDOWN / COMPRESSION',progressPct:60},
  RECLAIM:{label:'④ RECLAIM · 가격 확인',progressPct:80},
  IGNITION:{label:'⑤ IGNITION · 점화',progressPct:100},
  INVALIDATED:{label:'⛔ INVALIDATED · 구조 무효',progressPct:0}
});

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function avg(xs=[]){const a=xs.map(finite).filter(Number.isFinite);return a.length?a.reduce((s,x)=>s+x,0)/a.length:null}
function median(xs=[]){const a=xs.map(finite).filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function clamp(v,a=0,b=100){return Math.max(a,Math.min(b,Number(v)||0))}
function confirmed(rows=[],asOf=Date.now()){
  return(Array.isArray(rows)?rows:[]).filter(x=>Array.isArray(x)&&x.length>=7&&finite(x[4])!=null&&(finite(x[6])==null||finite(x[6])<asOf));
}
function candles(rows=[],asOf=Date.now()){
  return confirmed(rows,asOf).map(x=>({time:Number(x[0]),open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4]),volume:Number(x[5]||0),closeTime:Number(x[6])}));
}
function emaSeries(values=[],period=14){
  const out=Array(values.length).fill(null);if(!values.length)return out;
  const alpha=2/(period+1);let prev=finite(values[0]);if(prev==null)return out;out[0]=prev;
  for(let i=1;i<values.length;i++){const v=finite(values[i]);if(v==null)continue;prev=v*alpha+prev*(1-alpha);out[i]=prev}
  return out;
}
function trSeries(rows=[]){
  const out=[];for(let i=0;i<rows.length;i++){const p=i?rows[i-1].close:rows[i].close;out.push(Math.max(rows[i].high-rows[i].low,Math.abs(rows[i].high-p),Math.abs(rows[i].low-p)))}return out;
}
function smaSeries(values=[],period=14){
  const out=Array(values.length).fill(null);let sum=0,count=0;
  for(let i=0;i<values.length;i++){const v=finite(values[i]);if(v!=null){sum+=v;count++}if(i>=period){const old=finite(values[i-period]);if(old!=null){sum-=old;count--}}if(i>=period-1&&count===period)out[i]=sum/period}
  return out;
}
function atrSeries(rows=[],period=14){return smaSeries(trSeries(rows),period)}
function ratio(v,base){v=finite(v);base=finite(base);return v!=null&&base>0?v/base:null}
function pct(a,b){a=finite(a);b=finite(b);return a!=null&&b!=null&&a!==0?(b/a-1)*100:null}

function structureFrame(rows=[],asOf=Date.now(),lookback=CONFIG.boxLookback){
  const a=candles(rows,asOf);if(a.length<lookback+2)return{available:false,bars:a.length};
  const current=a.at(-1),prior=a.slice(-(lookback+1),-1),atr=atrSeries(a,14).at(-1);
  const support=Math.min(...prior.map(x=>x.low)),resistance=Math.max(...prior.map(x=>x.high));
  const closeBreak=atr>0&&current.close<support-CONFIG.structureBreakAtr*atr;
  const breakout=current.close>resistance;
  const sellSweep=current.low<support&&current.close>support;
  const buySweep=current.high>resistance&&current.close<resistance;
  const range=resistance-support,position=range>0?(current.close-support)/range:null;
  return{
    available:true,bars:a.length,close:current.close,open:current.open,atr,support,resistance,
    closeBreak,breakout,sellSweep,buySweep,position,
    bullishBody:current.close>current.open
  };
}

function compressionFrame(rows=[],asOf=Date.now()){
  const a=candles(rows,asOf),closes=a.map(x=>x.close);if(a.length<100)return{available:false,bars:a.length};
  const periods=[14,28,57,92],ema=Object.fromEntries(periods.map(p=>[p,emaSeries(closes,p)])),atr=atrSeries(a,14),e12=emaSeries(closes,12),e26=emaSeries(closes,26);
  const macd=closes.map((_,i)=>finite(e12[i])!=null&&finite(e26[i])!=null?e12[i]-e26[i]:null),signal=emaSeries(macd.map(x=>finite(x)??0),9);
  const widths=[];
  for(let i=Math.max(92,a.length-30);i<a.length;i++){
    const vals=periods.map(p=>finite(ema[p][i])),at=finite(atr[i]);if(vals.every(Number.isFinite)&&at>0)widths.push((Math.max(...vals)-Math.min(...vals))/at);
  }
  const current=widths.at(-1)??null,baseline=median(widths.slice(-21,-1)),ribbonRatio=current!=null&&baseline>0?current/baseline:null,idx=a.length-1,at=finite(atr[idx]),gap=finite(macd[idx])!=null&&finite(signal[idx])!=null&&at>0?Math.abs(macd[idx]-signal[idx])/at:null;
  const compressed=ribbonRatio!=null&&ribbonRatio<=CONFIG.ribbonCompressionRatio&&gap!=null&&gap<=CONFIG.macdGapAtrMax;
  const recent=widths.slice(-4),expanding=recent.length>=3&&recent.at(-1)>recent[0]*1.12;
  return{available:true,bars:a.length,ribbonWidthAtr:current,ribbonBaseline20:baseline,ribbonRatio,macdGapAtr:gap,compressed,expanding};
}

function volumeActivity(rows=[],asOf=Date.now()){
  const a=candles(rows,asOf);if(a.length<CONFIG.rvolLookback+6)return{available:false,bars:a.length};
  const rv=[];
  for(let i=CONFIG.rvolLookback;i<a.length;i++){
    const base=median(a.slice(i-CONFIG.rvolLookback,i).map(x=>x.volume)),v=ratio(a[i].volume,base);rv.push({index:i,value:v,time:a[i].time});
  }
  const current=rv.at(-1)?.value??null,recent=rv.slice(-4).map(x=>x.value).filter(Number.isFinite),prior=rv.slice(-CONFIG.activityLookback15m,-4),maxPrior=prior.length?Math.max(...prior.map(x=>finite(x.value)).filter(Number.isFinite)):null;
  const recentAvg=avg(recent),hadSpike=maxPrior!=null&&maxPrior>=CONFIG.activitySpikeRvol;
  const cooled=Boolean(hadSpike&&recentAvg!=null&&recentAvg<=CONFIG.coolMaxRvol&&recentAvg<=maxPrior*.5);
  const reexpanding=current!=null&&current>=CONFIG.ignitionRvol&&(recentAvg==null||current>=recentAvg*1.15);
  return{available:true,bars:a.length,currentRvol:current,recentAvgRvol:recentAvg,maxPriorRvol:maxPrior,hadSpike,cooled,reexpanding};
}

function takerRatios(rows=[]){
  return(Array.isArray(rows)?rows:[]).map(x=>{
    const b=finite(x?.buyVol),s=finite(x?.sellVol),r=b!=null&&s>0?b/s:finite(x?.ratio??x?.buySellRatio);
    return r;
  }).filter(Number.isFinite);
}
function takerActivity(rows=[]){
  const x=takerRatios(rows),last=x.at(-1)??null,prev=avg(x.slice(-4,-1)),recent=avg(x.slice(-3)),improving=last!=null&&((prev!=null&&last>prev*.08)||(last>=CONFIG.takerImprove&&prev!=null&&prev<CONFIG.takerImprove));
  return{available:x.length>0,last,previousAvg3:prev,recentAvg3:recent,improving,strong:last!=null&&last>=CONFIG.takerStrong,sellDominantHold:recent!=null&&recent<.95};
}
function oiActivity(row={}){
  const oi4=finite(row.oi4hPct),oi8=finite(row.oi8hPct),oi12=finite(row.oi12hPct),draw=finite(row.oiDrawdownPct);
  return{
    oi4hPct:oi4,oi8hPct:oi8,oi12hPct:oi12,oiDrawdownPct:draw,
    build:oi4!=null&&oi4>=CONFIG.oiBuild4hPct,
    positive:oi4!=null&&oi4>0,
    cleanRebuildCandidate:draw!=null&&draw<=-2&&oi4!=null&&oi4>0.5
  };
}
function subtypePack({row={},baseStable=false,volume={},taker={},oi={},compression={},reclaim=false}={}){
  const tags=[];
  if(oi.build)tags.push('A · OI_BUILD');
  if(volume.hadSpike||taker.improving)tags.push('B · FLOW_LEAD');
  if(oi.cleanRebuildCandidate)tags.push('C · CLEAN_REBUILD_CANDIDATE');
  if(compression.compressed)tags.push('COMP · MA/MACD_COMPRESSION');
  if(baseStable&&taker.sellDominantHold)tags.push('ABS · SELL_ABSORPTION_CANDIDATE');
  if(finite(row.priceChange24h)!=null&&row.priceChange24h>2&&baseStable&&reclaim)tags.push('CONT · CONTINUATION');
  return tags;
}
function evaluate({frames={},row={},asOf=Date.now(),taker15mSeries=[]}={}){
  const h4=structureFrame(frames['4h']||[],asOf),h1=structureFrame(frames['1h']||[],asOf),m15=structureFrame(frames['15m']||[],asOf);
  const c4=compressionFrame(frames['4h']||[],asOf),c1=compressionFrame(frames['1h']||[],asOf);
  const volume=volumeActivity(frames['15m']||[],asOf),taker=takerActivity(taker15mSeries),oi=oiActivity(row);
  const structuralAvailable=h4.available||h1.available,baseStable=structuralAvailable&&h4.closeBreak!==true&&h1.closeBreak!==true;
  const hardBreak=h4.closeBreak===true||h1.closeBreak===true;
  const compression={
    available:c4.available||c1.available,
    fourHour:c4,oneHour:c1,
    compressed:Boolean(c4.compressed||c1.compressed),
    expanding:Boolean(c4.expanding||c1.expanding)
  };
  const reclaim=Boolean(h1.breakout||m15.breakout||h1.sellSweep||m15.sellSweep);
  const priceConfirm=Boolean(h1.breakout||m15.breakout);
  const flowLead=Boolean(volume.hadSpike||taker.improving||oi.positive);
  const cooldown=Boolean(volume.cooled||compression.compressed);
  const ignitionFlow=Boolean(volume.currentRvol!=null&&volume.currentRvol>=CONFIG.ignitionRvol&&(taker.last==null||taker.last>=1||taker.improving));
  const ignition=Boolean(baseStable&&priceConfirm&&ignitionFlow);

  let stage=STAGE.NO_SETUP;
  if(hardBreak)stage=STAGE.INVALIDATED;
  else if(ignition)stage=STAGE.IGNITION;
  else if(baseStable&&reclaim)stage=STAGE.RECLAIM;
  else if(baseStable&&flowLead&&cooldown)stage=STAGE.COOLDOWN_COMPRESSION;
  else if(baseStable&&flowLead)stage=STAGE.EARLY_ACTIVITY;
  else if(baseStable)stage=STAGE.BASE;

  const evidence=[],counterEvidence=[];
  if(baseStable)evidence.push('4H/1H 구조 기반 유지');
  if(volume.hadSpike)evidence.push('최근 24H 안 15m 거래량 선행 스파이크');
  if(volume.cooled)evidence.push('거래량 선행 신호 후 냉각');
  if(compression.compressed)evidence.push('EMA14/28/57/92 + MACD ATR 정규화 압축');
  if(oi.build)evidence.push('4H OI +1% 이상 선행');
  else if(oi.positive)evidence.push('4H OI 양(+) 변화');
  if(taker.improving)evidence.push('15m taker 최근 흐름 개선');
  if(reclaim)evidence.push('1H/15m 저항 돌파 또는 하단 스윕 회복');
  if(ignitionFlow)evidence.push('15m RVOL 재확대 + 체결 흐름 확인');

  if(hardBreak)counterEvidence.push('4H/1H 기반 종가 이탈');
  if(h1.buySweep||m15.buySweep)counterEvidence.push('상단 유동성 스윕 후 종가 복귀');
  if(finite(row.fundingRatePct)!=null&&row.fundingRatePct>=.08)counterEvidence.push('Funding 롱 과열 경고');
  if(finite(row.priceChange24h)!=null&&row.priceChange24h>=CONFIG.extended24hPct)counterEvidence.push('24H 가격 이미 +10% 이상 진행');
  if(!volume.available)counterEvidence.push('15m 거래량 이력 부족');
  if(!taker.available)counterEvidence.push('15m taker 미확인');
  if(finite(row.oi4hPct)==null)counterEvidence.push('4H OI 미확인');

  let evidenceScore=0;
  if(baseStable)evidenceScore+=20;
  if(volume.hadSpike)evidenceScore+=15;
  if(volume.cooled)evidenceScore+=10;
  if(compression.compressed)evidenceScore+=15;
  if(oi.build)evidenceScore+=15;else if(oi.positive)evidenceScore+=7;
  if(taker.improving)evidenceScore+=10;
  if(reclaim)evidenceScore+=10;
  if(ignitionFlow)evidenceScore+=15;
  if(hardBreak)evidenceScore-=40;
  if(h1.buySweep||m15.buySweep)evidenceScore-=10;
  evidenceScore=Math.round(clamp(evidenceScore));

  const meta=STAGE_META[stage]||STAGE_META.NO_SETUP,subtypes=subtypePack({row,baseStable,volume,taker,oi,compression,reclaim});
  return{
    version:VERSION,shadowOnly:true,rankingEffect:0,
    stage,label:meta.label,progressPct:meta.progressPct,evidenceScore,
    baseStable,priceConfirm,reclaim,ignition,
    subtypes,evidence,counterEvidence,
    structure:{fourHour:h4,oneHour:h1,fifteenMinute:m15},
    compression,volume,taker,oi,
    policy:{
      directionAuthority:'price structure first; volume/OI/taker are supporting evidence',
      noSingleIndicatorEntry:true,
      oiRequired:false,
      priceBreakRequiredForIgnition:true,
      validatedWinRate:false
    }
  };
}

module.exports={VERSION,STAGE,CONFIG,STAGE_META,finite,confirmed,candles,structureFrame,compressionFrame,volumeActivity,takerActivity,oiActivity,subtypePack,evaluate};
