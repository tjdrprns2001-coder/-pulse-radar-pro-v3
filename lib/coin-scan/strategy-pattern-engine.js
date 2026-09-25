'use strict';

const ForexBook=require('../../ui/forex-book/forex-book-engine.js');
const BookConfluence=require('../../ui/book-confluence/book-confluence-engine.js');
const RiceBowl=require('../../ui/dante/rice-bowl-engine.js');
const EmaStrike=require('../../ui/dante/ema-strike-engine.js');
const Gongguri=require('../../ui/dante/gongguri-engine.js');
const Dante256=require('../../ui/dante/dante-256-engine.js');

const VERSION='MULTI_STRATEGY_SCAN_v1';
const TF_ORDER=['1d','4h','1h'];

function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,Number(v)||0))}
function avg(a=[]){const x=a.filter(Number.isFinite);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null}
function rows(raw=[]){
  const now=Date.now();return (Array.isArray(raw)?raw:[]).filter(Array.isArray).filter(r=>n(r[4])!=null&&n(r[2])!=null&&n(r[3])!=null&&(n(r[6])==null||n(r[6])<now)).map((r,i)=>({
    index:i,time:n(r[0])??i,open:n(r[1])??n(r[4]),high:n(r[2]),low:n(r[3]),close:n(r[4]),volume:n(r[5])??0,
    closeTime:n(r[6])??n(r[0])??i,isClosed:true,confirmed:true,partial:false
  }));
}
function sma(values,p){const out=Array(values.length).fill(null);let s=0;for(let i=0;i<values.length;i++){s+=values[i];if(i>=p)s-=values[i-p];if(i>=p-1)out[i]=s/p}return out}
function atr(c,p=14){if(!c.length)return[];const tr=c.map((x,i)=>Math.max(x.high-x.low,Math.abs(x.high-(i?c[i-1].close:x.close)),Math.abs(x.low-(i?c[i-1].close:x.close))));const out=Array(c.length).fill(null);let s=0;for(let i=0;i<tr.length;i++){s+=tr[i];if(i>=p)s-=tr[i-p];if(i>=p-1)out[i]=s/p}return out}
function pct(a,b){return a?((b/a)-1)*100:null}
function safe(fn,fallback=null){try{return fn()}catch{return fallback}}
function track(key,label,active,score,tf,stage,reasons=[],meta={}){return{key,label,active:Boolean(active),score:Math.round(clamp(score)),tf,stage,reasons:reasons.filter(Boolean).slice(0,6),meta}}

function maRetest(c,tf){
  if(c.length<70)return track('MA_RETEST','이평 눌림·재회복',false,0,tf,'DATA_INSUFFICIENT');
  const close=c.map(x=>x.close),m20=sma(close,20),m60=sma(close,60),a=atr(c,14),i=c.length-1,p=i-1;
  const av=a[i],last=c[i],prev=c[p];if(!(av>0))return track('MA_RETEST','이평 눌림·재회복',false,0,tf,'NO_ATR');
  const bull20=m20[i]>m60[i]&&last.close>=m20[i],near20=Math.abs(last.low-m20[i])<=av*.45||Math.abs(last.close-m20[i])<=av*.7;
  const reclaim20=prev.close<m20[p]&&last.close>m20[i];
  const near60=Math.abs(last.low-m60[i])<=av*.45||Math.abs(last.close-m60[i])<=av*.75;
  const reclaim60=prev.close<m60[p]&&last.close>m60[i];
  let stage='NONE',score=0;
  if(reclaim20||reclaim60){stage='RECLAIM';score=82}
  else if(bull20&&(near20||near60)){stage='RETEST_HOLD';score=74}
  else if(bull20){stage='TREND_HOLD';score=58}
  const reasons=[];if(bull20)reasons.push('20·60 이평 상승 구조');if(reclaim20)reasons.push('20이평 종가 재회복');if(reclaim60)reasons.push('60이평 종가 재회복');if(near20)reasons.push('20이평 눌림 반응');if(near60)reasons.push('60이평 눌림 반응');
  return track('MA_RETEST','이평 눌림·재회복',score>=58,score,tf,stage,reasons,{ma20:m20[i],ma60:m60[i],close:last.close,atr:av});
}
function liquidityReclaim(c,tf){
  if(c.length<16)return track('LIQUIDITY_RECLAIM','유동성 스윕·회복',false,0,tf,'DATA_INSUFFICIENT');
  let best=null;
  for(let i=Math.max(11,c.length-4);i<c.length;i++){
    const prev=c.slice(i-10,i),pl=Math.min(...prev.map(x=>x.low)),ph=Math.max(...prev.map(x=>x.high)),x=c[i];
    if(x.low<pl&&x.close>pl){const score=80+Math.min(10,((pl-x.low)/Math.max(pl,1e-9))*100*5);best={stage:'SSL_SWEEP_RECLAIM',score,reasons:['SSL 하단 유동성 스윕','종가가 스윕 레벨 위로 회복'],level:pl,index:i}}
    if(!best&&x.high>ph&&x.close<ph)best={stage:'BSL_SWEEP_FAIL',score:36,reasons:['BSL 상단 유동성 스윕 후 실패'],level:ph,index:i};
  }
  return best?track('LIQUIDITY_RECLAIM','유동성 스윕·회복',best.stage==='SSL_SWEEP_RECLAIM',best.score,tf,best.stage,best.reasons,{level:best.level,index:best.index}):track('LIQUIDITY_RECLAIM','유동성 스윕·회복',false,0,tf,'NONE');
}
function impulseReset(c){
  const w=c.slice(-36);if(w.length<16)return{priorSurge:false,impulsePct:null,pullbackPct:null};
  let lo=Infinity,loIndex=0;for(let i=0;i<w.length;i++)if(w[i].low<lo){lo=w[i].low;loIndex=i}
  let hi=-Infinity,hiIndex=loIndex;for(let i=loIndex;i<w.length;i++)if(w[i].high>hi){hi=w[i].high;hiIndex=i}
  const last=w.at(-1).close,impulsePct=lo>0&&Number.isFinite(hi)?((hi/lo)-1)*100:null,pullbackPct=hi>0?((last/hi)-1)*100:null;
  return{priorSurge:Number.isFinite(impulsePct)&&impulsePct>=12&&hiIndex>=loIndex,impulsePct,pullbackPct,hiIndex,loIndex};
}
function patternTrack(forex,tf,c){
  const candle=forex?.bestPattern,chart=forex?.bestChartPattern,rev=forex?.reversal,close=c.at(-1)?.close;
  const bullCandle=candle?.side==='상승',bullChart=chart?.side==='상승';
  let score=0,stage='NONE';const reasons=[];
  if(bullCandle){score=Math.max(score,Number(candle.score)||70);stage='BULLISH_CANDLE';reasons.push('캔들 '+String(candle.label||candle.id||'상승 패턴'))}
  if(bullChart){const trigger=n(chart.trigger),confirmed=trigger!=null&&close>=trigger;score=Math.max(score,(Number(chart.score)||72)+(confirmed?6:0));stage=confirmed?'CHART_TRIGGER_CONFIRMED':'CHART_FORMING';reasons.push('차트 '+String(chart.label||chart.id||'상승 패턴'));if(trigger!=null)reasons.push(confirmed?'패턴 트리거 돌파':'패턴 트리거 대기')}
  if(Number(rev?.score)>=71&&Array.isArray(rev?.evidence)&&rev.evidence.length>=2){score=Math.max(score,Math.min(88,Number(rev.score)));if(stage==='NONE')stage='REVERSAL_CONFLUENCE';reasons.push(...rev.evidence.slice(0,3))}
  return track('BOOK_PATTERN','책 패턴·반전',score>=68,score,tf,stage,reasons,{candle:candle||null,chart:chart||null,reversal:rev||null});
}
function confluenceTrack(book,forex,tf){
  const sc=book?.scenario,fx=forex?.confluence,trend=book?.trendline?.best;let score=0,stage='NONE';const reasons=[];
  if(sc?.bias==='상승'){score=Math.max(score,Number(sc.score)||0);stage=String(sc.state||'BOOK_CONFLUENCE');reasons.push(...(sc.reasons||[]).slice(0,3))}
  if(fx?.bias==='상승'){score=Math.max(score,Number(fx.score)||0);reasons.push(...(fx.reasons||[]).slice(0,2))}
  if(trend?.side==='상승'&&['CLOSE_CONFIRMED','RETEST','확인대기'].includes(String(trend.state))){const add=trend.state==='CLOSE_CONFIRMED'?86:trend.state==='RETEST'?82:64;score=Math.max(score,add);stage='TRENDLINE_'+String(trend.state);reasons.unshift(trend.kind+' · '+trend.state)}
  return track('BOOK_CONFLUENCE','책 합성·추세선',score>=62,score,tf,stage,reasons,{scenario:sc||null,trendline:trend||null});
}
function danteTrack(c1d,c4h){
  const rowsToTry=[['1D',c1d],['4H',c4h]].filter(([,c])=>c.length);
  let best=track('DANTE','단테 패턴',false,0,'1D','NONE');
  for(const [tf,c] of rowsToTry){
    const asOf=c.at(-1)?.closeTime??c.at(-1)?.time??Date.now();const reasons=[];let score=0,stage='NONE';
    const rice=safe(()=>RiceBowl.analyze({candles:c,analysisAsOf:asOf}),null);
    const ema=safe(()=>EmaStrike.analyze({candles:c,analysisAsOf:asOf}),null);
    const gg=safe(()=>Gongguri.analyze({candles:c,analysisAsOf:asOf}),null);
    const d256=safe(()=>Dante256.analyze({candles:c,analysisAsOf:asOf}),null);
    const rs=String(rice?.riceBowlState||'');
    if(/PHASE_3_(BREAKOUT|RETEST|CONFIRMED)/.test(rs)){score=Math.max(score,rs.includes('CONFIRMED')?90:84);stage='RICE_'+rs;reasons.push('밥그릇 '+rs)}
    else if(rs==='PHASE_2_ACCUMULATION'){score=Math.max(score,66);stage='RICE_ACCUMULATION';reasons.push('밥그릇 2번 매집')}
    if(['EMA112_BREAK','EMA112_HOLD','EMA224_BREAK','EMA224_TARGET'].includes(String(ema?.state||''))){score=Math.max(score,ema.state==='EMA224_BREAK'?88:74);stage='EMA_'+ema.state;reasons.push('EMA 때리기 '+ema.state)}
    if(['CONFIRMED','CANDIDATE'].includes(String(gg?.status||''))){score=Math.max(score,gg.status==='CONFIRMED'?88:72);stage='GONGGURI_'+gg.status;reasons.push('공구리 '+gg.status)}
    if(String(d256?.status)==='CANDIDATE'){score=Math.max(score,68);stage='DANTE_256';reasons.push('256 선행후보')}
    const current=track('DANTE','단테 패턴',score>=66,score,tf,stage,reasons,{riceBowl:rice,emaStrike:ema,gongguri:gg,dante256:d256});
    if(current.score>best.score)best=current;
  }
  return best;
}
function analyze({frames={},priceChange24h=null,priceChange1h=null,priceChange15m=null,structure='neutral',momentumSignals=null,takerRatio=null,oiChangePct=null}={}){
  const candles={};for(const tf of TF_ORDER)candles[tf]=rows(frames[tf]);
  const tfResults={};const tracks=[];
  for(const tf of TF_ORDER){
    const c=candles[tf];if(c.length<5)continue;
    const forex=safe(()=>ForexBook.analyze({candles:c}),null);
    const book=safe(()=>BookConfluence.analyze({candles:c,forexBook:forex}),null);
    tfResults[tf]={forexBook:forex?{bestPattern:forex.bestPattern,bestChartPattern:forex.bestChartPattern,reversal:forex.reversal,confluence:forex.confluence,marketPhase:forex.marketPhase,trendStage:forex.trendStage,fakeout:forex.fakeout}:null,book:book?{ma:book.ma,volume:book.volume,trendline:book.trendline,regime:book.regime,scenario:book.scenario,zones:(book.zones||[]).slice(0,2)}:null};
    tracks.push(maRetest(c,tf),liquidityReclaim(c,tf),patternTrack(forex,tf,c),confluenceTrack(book,forex,tf));
  }
  tracks.push(danteTrack(candles['1d'],candles['4h']));
  const active=tracks.filter(x=>x.active).sort((a,b)=>b.score-a.score);
  const structural=active.filter(x=>['MA_RETEST','LIQUIDITY_RECLAIM','BOOK_PATTERN','BOOK_CONFLUENCE','DANTE'].includes(x.key));
  const impulse=impulseReset(candles['4h'].length?candles['4h']:candles['1h']);
  const ch24=n(priceChange24h),ch1=n(priceChange1h),ch15=n(priceChange15m),tk=n(takerRatio),oi=n(oiChangePct);
  const cooled=(ch1==null||Math.abs(ch1)<=4)&&(ch15==null||Math.abs(ch15)<=2.5)&&!Boolean(momentumSignals?.overheated);
  const reset=Number.isFinite(impulse.pullbackPct)?impulse.pullbackPct<=-2.5&&impulse.pullbackPct>=-22:false;
  const priorSurge=impulse.priorSurge||(ch24!=null&&ch24>=10);
  let reentryScore=structural[0]?.score||0;
  if(structural.length>=2)reentryScore+=6;if(structure==='bullish')reentryScore+=5;if(tk!=null&&tk>=1)reentryScore+=3;if(oi!=null&&oi>=0)reentryScore+=2;
  reentryScore=Math.round(clamp(reentryScore));
  const flowOk=tk==null||tk>=.90;
  const reentryEligible=Boolean(priorSurge&&cooled&&flowOk&&(reset||structural.some(x=>['LIQUIDITY_RECLAIM','MA_RETEST'].includes(x.key)))&&reentryScore>=68&&structure!=='bearish');
  const patternEligible=Boolean(!reentryEligible&&cooled&&flowOk&&structural.length&&reentryScore>=68&&structure!=='bearish');
  const stage=reentryEligible?'REENTRY_READY':patternEligible?'PATTERN_READY':priorSurge&&cooled?'REENTRY_WATCH':active.length?'PATTERN_WATCH':'NONE';
  const reasons=[];if(priorSurge)reasons.push('최근 상승 파동 이력');if(reset)reasons.push('고점 대비 눌림·리셋 확인');if(cooled)reasons.push('1H·15m 단기 과열 해소');for(const x of structural.slice(0,3))reasons.push(x.label+' '+x.stage);
  return{version:VERSION,stage,reentryEligible,patternEligible,reentryScore,priorSurge,cooled,reset,flowOk,impulse,activeTracks:active.slice(0,8),best:active[0]||null,reasons:reasons.slice(0,8),timeframes:tfResults};
}
module.exports={VERSION,rows,maRetest,liquidityReclaim,impulseReset,analyze};
