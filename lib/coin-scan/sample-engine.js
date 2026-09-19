'use strict';

const ARCHETYPE_LABELS=Object.freeze({
  A:'A형 · OI 선행축적',
  B:'B형 · OI 잠복+taker 이상왕복',
  'A+B':'A+B형 · OI축적+taker 왕복',
  C:'C형 · 디레버리징 후 반전 대기',
  X:'X형 · 타 거래소 OI 선행',
  'X+B':'X+B형 · 타 거래소 OI+taker 선행',
  'X+A':'X+A형 · 타 거래소 OI→Binance OI 확산',
  'X+A+B':'X+A+B형 · XOI→taker→Binance OI 확산',
  NEUTRAL:'중립 · 샘플 불충분'
});
const PHASE_LABELS=Object.freeze({
  LATENT:'잠복',
  'IGNITION-WAIT':'점화대기',
  'IGNITION-EARLY':'점화초기',
  REIGNITION:'재점화',
  PROGRESSED:'이미진행',
  DELEVERAGING:'디레버리징',
  BROKEN:'패턴깨짐',
  OBSERVE:'관찰'
});
const LIQUIDITY_LABELS=Object.freeze({
  'DOUBLE-SWEEP':'SSL+BSL 양방향 청소',
  'BSL-EXPANSION':'SSL 보존 · BSL 연쇄확장',
  'SSL-SWEEP':'SSL 스윕/리클레임 관찰',
  'SSL-HOLD':'하단 유동성 보존',
  'RANGE-HOLD':'박스권 유동성 유지',
  UNKNOWN:'유동성 판정 보류'
});

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,Number.isFinite(Number(v))?Number(v):0))}
function avg(values){const a=(values||[]).map(finite).filter(v=>v!=null);return a.length?a.reduce((s,v)=>s+v,0)/a.length:null}
function val(row,index){return Array.isArray(row)?finite(row[index]):null}

function deriveOiProfile(rows=[]){
  const values=(rows||[]).map(x=>finite(x?.sumOpenInterest??x?.openInterest??x?.value??x)).filter(v=>v!=null&&v>0);
  if(values.length<2)return{changePct:null,drawdownPct:null,min:null,max:null,samples:values.length};
  const first=values[0],last=values[values.length-1],min=Math.min(...values),max=Math.max(...values);
  return{
    changePct:first?((last/first)-1)*100:null,
    drawdownPct:first?((min/first)-1)*100:null,
    min,max,samples:values.length
  };
}

function deriveTakerProfile(rows=[]){
  const ratios=(rows||[]).map(x=>finite(x?.buySellRatio??x?.takerBuySellRatio??x?.ratio??x)).filter(v=>v!=null&&v>0);
  if(!ratios.length)return{min:null,max:null,range:null,last:null,spikes15:0,spikes20:0,samples:0};
  const min=Math.min(...ratios),max=Math.max(...ratios);
  return{min,max,range:max-min,last:ratios[ratios.length-1],spikes15:ratios.filter(v=>v>=1.5).length,spikes20:ratios.filter(v=>v>=2).length,samples:ratios.length};
}

function normalizeXoiProfile(raw={}){
  const exchanges=raw&&typeof raw.exchanges==='object'?raw.exchanges:{};
  const active=Object.entries(exchanges).map(([exchange,p])=>({exchange,...p})).filter(x=>finite(x.changePct)!=null);
  const leader=active.slice().sort((a,b)=>finite(b.changePct)-finite(a.changePct))[0]||null;
  const leaderChangePct=finite(raw.leaderChangePct??leader?.changePct);
  const aggregateChangePct=finite(raw.aggregateChangePct??avg(active.map(x=>x.changePct)));
  const breadth=Number.isFinite(Number(raw.breadth))?Number(raw.breadth):active.length;
  const positiveBreadth=Number.isFinite(Number(raw.positiveBreadth))?Number(raw.positiveBreadth):active.filter(x=>finite(x.changePct)>=1.2).length;
  const strongBreadth=Number.isFinite(Number(raw.strongBreadth))?Number(raw.strongBreadth):active.filter(x=>finite(x.changePct)>=2.5).length;
  return{
    available:Boolean(raw.available||active.length),
    exchanges,breadth,positiveBreadth,strongBreadth,
    leaderExchange:raw.leaderExchange||leader?.exchange||null,
    leaderChangePct,aggregateChangePct,samples:Number(raw.samples)||active.reduce((s,x)=>s+(Number(x.samples)||0),0)
  };
}

function deriveSequenceTag({oiProfile={},takerProfile={},xoiProfile={}}={}){
  const oi=finite(oiProfile.changePct),tmin=finite(takerProfile.min),tmax=finite(takerProfile.max);
  const x=normalizeXoiProfile(xoiProfile);
  const xBuild=x.available&&((x.leaderChangePct!=null&&x.leaderChangePct>=1.2)||x.positiveBreadth>=1);
  if(!xBuild)return null;
  const takerExtreme=tmax!=null&&tmin!=null&&tmax>=1.8&&tmin<=.8;
  const binanceBuild=oi!=null&&oi>=1.2;
  if(takerExtreme&&binanceBuild)return'XOI-A+B';
  if(takerExtreme&&!binanceBuild)return'XOI-B2+';
  if(binanceBuild)return'XOI-A';
  return'XOI';
}

function derivePriceProfile(rows=[]){
  const a=(Array.isArray(rows)?rows:[]).filter(Array.isArray).slice(-32);
  if(a.length<8)return{priceChange8hPct:null,range8hPct:null,volumeRatio:null,lastPrice:null};
  const firstOpen=val(a[0],1),lastClose=val(a[a.length-1],4);
  const highs=a.map(x=>val(x,2)).filter(v=>v!=null),lows=a.map(x=>val(x,3)).filter(v=>v!=null),vols=a.map(x=>val(x,5)).filter(v=>v!=null);
  const recent=avg(vols.slice(-8)),prior=avg(vols.slice(-16,-8));
  return{
    priceChange8hPct:firstOpen&&lastClose!=null?((lastClose/firstOpen)-1)*100:null,
    range8hPct:highs.length&&lows.length&&Math.min(...lows)>0?((Math.max(...highs)/Math.min(...lows))-1)*100:null,
    volumeRatio:recent!=null&&prior>0?recent/prior:null,
    lastPrice:lastClose
  };
}

function deriveLiquidityPattern(rows15m=[]){
  const rows=(Array.isArray(rows15m)?rows15m:[]).filter(Array.isArray).slice(-48);
  if(rows.length<32)return{key:'UNKNOWN',label:LIQUIDITY_LABELS.UNKNOWN,earlyLow:null,lateLow:null,earlyHigh:null,lateHigh:null,lowSweep:false,highSweep:false};
  const split=Math.floor(rows.length/2),early=rows.slice(0,split),late=rows.slice(split);
  const earlyLow=Math.min(...early.map(x=>val(x,3)).filter(v=>v!=null));
  const lateLow=Math.min(...late.map(x=>val(x,3)).filter(v=>v!=null));
  const earlyHigh=Math.max(...early.map(x=>val(x,2)).filter(v=>v!=null));
  const lateHigh=Math.max(...late.map(x=>val(x,2)).filter(v=>v!=null));
  const lowSweep=lateLow<earlyLow*.9995,highSweep=lateHigh>earlyHigh*1.0005,lowHeld=lateLow>earlyLow*1.001;
  let key='RANGE-HOLD';
  if(lowSweep&&highSweep)key='DOUBLE-SWEEP';
  else if(highSweep&&!lowSweep)key='BSL-EXPANSION';
  else if(lowSweep&&!highSweep)key='SSL-SWEEP';
  else if(lowHeld)key='SSL-HOLD';
  return{key,label:LIQUIDITY_LABELS[key],earlyLow,lateLow,earlyHigh,lateHigh,lowSweep,highSweep};
}

function classifyArchetype({priceProfile={},oiProfile={},takerProfile={},xoiProfile={}}={}){
  const price=finite(priceProfile.priceChange8hPct),oi=finite(oiProfile.changePct),dd=finite(oiProfile.drawdownPct),tmin=finite(takerProfile.min),tmax=finite(takerProfile.max),trange=finite(takerProfile.range);
  const x=normalizeXoiProfile(xoiProfile),xoi=finite(x.leaderChangePct),xoiBuild=x.available&&((xoi!=null&&xoi>=1.2)||x.positiveBreadth>=1),xoiStrong=x.available&&((xoi!=null&&xoi>=2.5)||x.strongBreadth>=1);
  const deleveraging=(dd!=null&&dd<=-3)||(oi!=null&&oi<=-2);
  const oiStableBuild=oi!=null&&oi>=1.2&&(dd==null||dd>=-1.5);
  const oiStrongBuild=oi!=null&&oi>=2.5&&(dd==null||dd>=-1.5);
  const takerExtreme=(tmax!=null&&tmax>=1.8&&tmin!=null&&tmin<=.8)||(trange!=null&&trange>=1.15);
  let archetype='NEUTRAL';
  if(xoiBuild&&oiStableBuild&&takerExtreme)archetype='X+A+B';
  else if(xoiBuild&&oiStableBuild)archetype='X+A';
  else if(xoiBuild&&takerExtreme)archetype='X+B';
  else if(xoiBuild)archetype='X';
  else if(oiStableBuild&&takerExtreme)archetype='A+B';
  else if(oiStableBuild)archetype='A';
  else if(oi!=null&&Math.abs(oi)<=1.5&&takerExtreme)archetype='B';
  else if(deleveraging)archetype='C';
  const reasons=[];
  if(price!=null&&Math.abs(price)<=3)reasons.push('가격 8H 압축');
  if(oiStrongBuild)reasons.push(`OI 선행축적 ${oi>=0?'+':''}${oi.toFixed(2)}%`);
  else if(oiStableBuild)reasons.push(`OI 완만축적 ${oi>=0?'+':''}${oi.toFixed(2)}%`);
  if(dd!=null&&dd>=-1)reasons.push(`OI DD ${dd.toFixed(2)}%로 안정`);
  if(xoiBuild)reasons.push(`XOI ${x.leaderExchange||'외부거래소'} ${xoi==null?'선행':`${xoi>=0?'+':''}${xoi.toFixed(2)}%`} · ${x.positiveBreadth}/${x.breadth} 확산`);
  if(xoiStrong&&x.strongBreadth>=2)reasons.push(`XOI 다거래소 강확산 ${x.strongBreadth}곳`);
  if(takerExtreme)reasons.push(`taker ${tmin==null?'-':tmin.toFixed(2)}↔${tmax==null?'-':tmax.toFixed(2)} 이상왕복`);
  if(deleveraging)reasons.push(`파생 유동성 청소 ${dd==null?oi.toFixed(2):dd.toFixed(2)}%`);
  return{archetype,label:ARCHETYPE_LABELS[archetype],reasons};
}

function classifyPhase({priceProfile={},oiProfile={},takerProfile={},xoiProfile={},liquidity={}}={}){
  const price=finite(priceProfile.priceChange8hPct),vol=finite(priceProfile.volumeRatio),oi=finite(oiProfile.changePct),dd=finite(oiProfile.drawdownPct),tmax=finite(takerProfile.max),x=normalizeXoiProfile(xoiProfile),xoi=finite(x.leaderChangePct);
  const xoiBuild=x.available&&((xoi!=null&&xoi>=1.2)||x.positiveBreadth>=1);
  if(price!=null&&price<=-5&&oi!=null&&oi<=-2)return'BROKEN';
  if(dd!=null&&dd<=-3&&(oi==null||oi<1))return'DELEVERAGING';
  if(price!=null&&price>=10){
    if(oi!=null&&oi>=1&&vol!=null&&vol>=1.4)return'REIGNITION';
    return'PROGRESSED';
  }
  if(price!=null&&price>=5&&oi!=null&&oi>=1&&vol!=null&&vol>=1.2)return'IGNITION-EARLY';
  if(price!=null&&Math.abs(price)<=5&&oi!=null&&oi>=1){
    if(vol!=null&&vol>=1.5)return'IGNITION-EARLY';
    return'IGNITION-WAIT';
  }
  if(price!=null&&Math.abs(price)<=5&&xoiBuild&&vol!=null&&vol>=1.5)return'IGNITION-EARLY';
  if(price!=null&&Math.abs(price)<=3&&xoiBuild)return'LATENT';
  if(price!=null&&Math.abs(price)<=3&&tmax!=null&&tmax>=1.8)return'LATENT';
  if(liquidity?.key==='DOUBLE-SWEEP'&&price!=null&&Math.abs(price)<=5)return'IGNITION-WAIT';
  return'OBSERVE';
}

function scorePattern({archetype='NEUTRAL',phase='OBSERVE',priceProfile={},oiProfile={},takerProfile={},xoiProfile={},liquidity={}}={}){
  const price=finite(priceProfile.priceChange8hPct),vol=finite(priceProfile.volumeRatio),oi=finite(oiProfile.changePct),dd=finite(oiProfile.drawdownPct),tmax=finite(takerProfile.max),tmin=finite(takerProfile.min),x=normalizeXoiProfile(xoiProfile),xoi=finite(x.leaderChangePct);
  let score=0;
  if(price!=null&&Math.abs(price)<=3)score+=18;else if(price!=null&&Math.abs(price)<=5)score+=10;
  if(oi!=null&&oi>=2.5&&(dd==null||dd>=-1.5))score+=32;else if(oi!=null&&oi>=1&&(dd==null||dd>=-1.5))score+=22;
  if(x.available&&xoi!=null&&xoi>=2.5)score+=28;else if(x.available&&xoi!=null&&xoi>=1.2)score+=20;
  if(x.positiveBreadth>=2)score+=8;if(x.strongBreadth>=2)score+=6;
  if(tmax!=null&&tmin!=null&&tmax>=1.8&&tmin<=.8)score+=20;
  if(vol!=null&&vol>=1.8)score+=18;else if(vol!=null&&vol>=1.2)score+=10;
  if(liquidity?.key==='DOUBLE-SWEEP')score+=12;else if(liquidity?.key==='BSL-EXPANSION'||liquidity?.key==='SSL-HOLD')score+=7;
  if(archetype==='X+A+B')score+=12;else if(archetype==='X+B'||archetype==='X+A')score+=9;else if(archetype==='X')score+=6;else if(archetype==='A+B')score+=8;else if(archetype==='A'||archetype==='B')score+=5;else if(archetype==='C'&&phase==='DELEVERAGING')score+=5;
  if(price!=null&&price>=10)score-=15;if(price!=null&&price>=20)score-=15;
  if(dd!=null&&dd<=-5&&archetype!=='C')score-=12;
  return Math.round(clamp(score));
}

function analyzeSamplePattern({frames={},derivativesProfile={}}={}){
  const priceProfile=derivePriceProfile(frames['15m']||[]);
  const liquidity=deriveLiquidityPattern(frames['15m']||[]);
  const oiProfile=derivativesProfile.oiProfile||deriveOiProfile(derivativesProfile.oiRows||[]);
  const takerProfile=derivativesProfile.takerProfile||deriveTakerProfile(derivativesProfile.takerRows||[]);
  const xoiProfile=normalizeXoiProfile(derivativesProfile.xoiProfile||{});
  const sequenceTag=deriveSequenceTag({oiProfile,takerProfile,xoiProfile});
  const archetypeInfo=classifyArchetype({priceProfile,oiProfile,takerProfile,xoiProfile});
  const phase=classifyPhase({priceProfile,oiProfile,takerProfile,xoiProfile,liquidity});
  const score=scorePattern({archetype:archetypeInfo.archetype,phase,priceProfile,oiProfile,takerProfile,xoiProfile,liquidity});
  const reasons=[...archetypeInfo.reasons];
  if(priceProfile.volumeRatio!=null&&priceProfile.volumeRatio>=1.2)reasons.push(`최근 거래량 ${priceProfile.volumeRatio.toFixed(2)}x`);
  if(liquidity?.label&&liquidity.key!=='UNKNOWN')reasons.push(liquidity.label);
  return{
    archetype:archetypeInfo.archetype,
    archetypeLabel:archetypeInfo.label,
    phase,
    phaseLabel:PHASE_LABELS[phase]||phase,
    score,
    priceProfile,
    oiProfile,
    takerProfile,
    xoiProfile,
    sequenceTag,
    liquidity,
    reasons:reasons.slice(0,6)
  };
}

module.exports={
  ARCHETYPE_LABELS,PHASE_LABELS,LIQUIDITY_LABELS,
  deriveOiProfile,deriveTakerProfile,normalizeXoiProfile,deriveSequenceTag,derivePriceProfile,deriveLiquidityPattern,
  classifyArchetype,classifyPhase,scorePattern,analyzeSamplePattern
};
