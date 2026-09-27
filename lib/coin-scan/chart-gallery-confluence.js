'use strict';

const VERSION='CHART_GALLERY_CONFLUENCE_v1';
const EVIDENCE_KEYS=['trend','location','compression','volume','momentum','liquidity','derivatives','risk'];

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,Number(v)||0))}
function rowsOf(frames,tf){return Array.isArray(frames?.[tf])?frames[tf].filter(Array.isArray):[]}
function closed(rows,now=Date.now()){
  const a=(Array.isArray(rows)?rows:[]).filter(Array.isArray);
  const hasClose=a.some(r=>finite(r?.[6])!=null);
  return hasClose?a.filter(r=>finite(r?.[6])!=null&&finite(r[6])<now):a.slice(0,-1);
}
function close(r){return Array.isArray(r)?finite(r[4]):null}
function high(r){return Array.isArray(r)?finite(r[2]):null}
function low(r){return Array.isArray(r)?finite(r[3]):null}
function open(r){return Array.isArray(r)?finite(r[1]):null}
function volume(r){return Array.isArray(r)?finite(r[5]):null}
function avg(a){const x=a.filter(Number.isFinite);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null}
function median(a){const x=a.filter(Number.isFinite).sort((p,q)=>p-q);if(!x.length)return null;const m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2}
function pct(a,b){return Number.isFinite(a)&&Number.isFinite(b)&&b!==0?((a/b)-1)*100:null}
function ema(values,period){
  const src=values.filter(Number.isFinite);if(!src.length)return[];
  const alpha=2/(period+1),out=[src[0]];
  for(let i=1;i<src.length;i++)out.push(src[i]*alpha+out[i-1]*(1-alpha));
  return out;
}
function atr(rows,period=14){
  const a=closed(rows);if(a.length<period+2)return null;const tr=[];
  for(let i=1;i<a.length;i++){
    const h=high(a[i]),l=low(a[i]),pc=close(a[i-1]);if(![h,l,pc].every(Number.isFinite))continue;
    tr.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)));
  }
  return avg(tr.slice(-period));
}
function rvol(rows,lookback=20){
  const a=closed(rows);if(a.length<lookback+1)return null;
  const last=volume(a.at(-1)),base=avg(a.slice(-lookback-1,-1).map(volume));
  return Number.isFinite(last)&&Number.isFinite(base)&&base>0?last/base:null;
}
function rangePct(rows,lookback=40){
  const a=closed(rows).slice(-lookback);if(a.length<8)return null;
  const hs=a.map(high).filter(Number.isFinite),ls=a.map(low).filter(Number.isFinite),c=close(a.at(-1));
  if(!hs.length||!ls.length||!Number.isFinite(c))return null;
  const hi=Math.max(...hs),lo=Math.min(...ls);return hi>lo?((c-lo)/(hi-lo))*100:null;
}
function bandWidthPct(rows,lookback=20){
  const a=closed(rows).slice(-lookback);if(a.length<8)return null;
  const hs=a.map(high).filter(Number.isFinite),ls=a.map(low).filter(Number.isFinite),c=close(a.at(-1));
  if(!hs.length||!ls.length||!Number.isFinite(c)||c===0)return null;
  return ((Math.max(...hs)-Math.min(...ls))/c)*100;
}
function candleShape(rows){
  const a=closed(rows);if(!a.length)return{bodyPct:null,upperWickPct:null,lowerWickPct:null,closeLocation:null};
  const r=a.at(-1),o=open(r),h=high(r),l=low(r),c=close(r);
  if(![o,h,l,c].every(Number.isFinite)||h<=l)return{bodyPct:null,upperWickPct:null,lowerWickPct:null,closeLocation:null};
  const span=h-l;
  return{
    bodyPct:Math.abs(c-o)/span*100,
    upperWickPct:(h-Math.max(o,c))/span*100,
    lowerWickPct:(Math.min(o,c)-l)/span*100,
    closeLocation:(c-l)/span*100
  };
}
function maState(rows){
  const a=closed(rows),c=a.map(close).filter(Number.isFinite);if(c.length<60)return{available:false};
  const e20=ema(c,20).at(-1),e60=ema(c,60).at(-1),last=c.at(-1);
  const bullish=[last,e20,e60].every(Number.isFinite)&&last>e20&&e20>e60;
  const bearish=[last,e20,e60].every(Number.isFinite)&&last<e20&&e20<e60;
  const spread=Number.isFinite(e20)&&Number.isFinite(e60)&&last?Math.abs(e20-e60)/last*100:null;
  return{available:true,last,e20,e60,bullish,bearish,spreadPct:spread};
}
function compression(frames){
  const h1=rowsOf(frames,'1h'),m15=rowsOf(frames,'15m');
  const w1=bandWidthPct(h1,20),w2=bandWidthPct(h1,40),w15=bandWidthPct(m15,20);
  const rv=rvol(h1),m=maState(h1);
  let score=0;const reasons=[];
  if(Number.isFinite(w1)&&Number.isFinite(w2)&&w1<=w2*.65){score+=35;reasons.push('1H 가격폭 압축')}
  if(Number.isFinite(w15)&&w15<=3){score+=20;reasons.push('15m 좁은 변동폭')}
  if(Number.isFinite(rv)&&rv<.9){score+=20;reasons.push('거래량 수축')}
  if(Number.isFinite(m.spreadPct)&&m.spreadPct<=1.2){score+=25;reasons.push('MA20·60 밀집')}
  return{score:clamp(score),active:score>=45,width1hPct:w1,width40hPct:w2,width15mPct:w15,rvol1h:rv,maSpreadPct:m.spreadPct,reasons};
}
function volumeEfficiency(frames,priceChange1h,priceChange15m){
  const rv1=rvol(rowsOf(frames,'1h')),rv15=rvol(rowsOf(frames,'15m'));
  const p1=finite(priceChange1h),p15=finite(priceChange15m);
  const rv=median([rv1,rv15]),move=median([Math.abs(p1??NaN),Math.abs(p15??NaN)]);
  const response=Number.isFinite(rv)&&rv>0&&Number.isFinite(move)?move/rv:null;
  const sh1=candleShape(rowsOf(frames,'1h')),sh15=candleShape(rowsOf(frames,'15m'));
  const absorption=Number.isFinite(rv)&&rv>=1.5&&Number.isFinite(move)&&move<=.8;
  const expansion=Number.isFinite(rv)&&rv>=1.5&&Number.isFinite(move)&&move>=1.2;
  const distributionRisk=Number.isFinite(rv)&&rv>=1.8&&((p1??0)>0||(p15??0)>0)&&Math.max(sh1.upperWickPct||0,sh15.upperWickPct||0)>=38&&Math.min(sh1.closeLocation??100,sh15.closeLocation??100)<65;
  let score=0;const reasons=[];
  if(absorption){score+=45;reasons.push('거래량 대비 가격 반응 작음 · 흡수 후보')}
  if(expansion){score+=35;reasons.push('거래량과 가격 동시 확장')}
  if(Number.isFinite(rv)&&rv>=2){score+=20;reasons.push('RVOL 확장')}
  if(distributionRisk){score-=30;reasons.push('윗꼬리·대량거래 · 분배 위험')}
  return{score:clamp(score),rvol:rv,responsePerRvol:response,priceMovePct:move,absorption,expansion,distributionRisk,reasons,shape1h:sh1,shape15m:sh15};
}
function structureLocation(frames,structure){
  const r4=rangePct(rowsOf(frames,'4h'),60),r1d=rangePct(rowsOf(frames,'1d'),60);
  const m1=maState(rowsOf(frames,'1h'));
  let score=0;const reasons=[];
  if(structure==='bullish'){score+=25;reasons.push('상위 구조 상승')}
  if(structure==='bearish'){score-=25;reasons.push('상위 구조 하락')}
  if(Number.isFinite(r4)&&r4>=20&&r4<=65){score+=30;reasons.push('4H 중하단 위치')}
  else if(Number.isFinite(r4)&&r4>88){score-=15;reasons.push('4H 상단 과밀')}
  if(Number.isFinite(r1d)&&r1d<=70){score+=20;reasons.push('1D 과도한 프리미엄 아님')}
  if(m1.bullish){score+=25;reasons.push('1H EMA20>EMA60')}
  return{score:clamp(score),range4hPct:r4,range1dPct:r1d,ma1h:m1,reasons};
}
function breakoutQuality(frames){
  const a=closed(rowsOf(frames,'1h'));if(a.length<15)return{score:0,available:false,reasons:[]};
  const last=a.at(-1),prev=a.slice(-12,-1),ph=Math.max(...prev.map(high).filter(Number.isFinite)),pl=Math.min(...prev.map(low).filter(Number.isFinite));
  const c=close(last),h=high(last),l=low(last),rv=rvol(rowsOf(frames,'1h')),shape=candleShape(rowsOf(frames,'1h'));
  const breakout=Number.isFinite(c)&&Number.isFinite(ph)&&c>ph;
  const fakeout=Number.isFinite(h)&&Number.isFinite(ph)&&h>ph&&Number.isFinite(c)&&c<ph;
  const sslSweep=Number.isFinite(l)&&Number.isFinite(pl)&&l<pl&&Number.isFinite(c)&&c>pl;
  let score=0;const reasons=[];
  if(breakout){score+=35;reasons.push('1H 저항 종가 돌파')}
  if(breakout&&Number.isFinite(rv)&&rv>=1.5){score+=25;reasons.push('돌파 거래량 확인')}
  if(breakout&&(shape.closeLocation??0)>=70){score+=20;reasons.push('돌파봉 종가 강함')}
  if(sslSweep){score+=20;reasons.push('하단 유동성 스윕 후 회복')}
  if(fakeout){score-=55;reasons.push('상단 가짜 돌파')}
  return{score:clamp(score),available:true,breakout,fakeout,sslSweep,rvol1h:rv,priorHigh:ph,priorLow:pl,reasons};
}
function momentumEvidence(momentumSignals={}){
  const rsi=finite(momentumSignals.rsi1h),rsi15=finite(momentumSignals.rsi15m),m1=finite(momentumSignals.macd1h),m15=finite(momentumSignals.macd15m);
  let score=0;const reasons=[];
  if((rsi??0)>=45&&(rsi??100)<=68){score+=25;reasons.push('1H RSI 중립 이상·비과열')}
  if((rsi15??0)>=40&&(rsi15??100)<=72){score+=20;reasons.push('15m RSI 점화 여지')}
  if((m1??0)>0){score+=25;reasons.push('1H MACD 양수')}
  if((m15??0)>0){score+=15;reasons.push('15m MACD 양수')}
  if(momentumSignals.aligned){score+=15;reasons.push('모멘텀 정렬')}
  const overheated=Boolean(momentumSignals.overheated)||(rsi!=null&&rsi>=75)||(rsi15!=null&&rsi15>=82);
  if(overheated){score-=25;reasons.push('단기 과열')}
  return{score:clamp(score),overheated,rsi1h:rsi,rsi15m:rsi15,reasons};
}
function derivativesEvidence({oiChangePct,takerRatio,fundingPct}={}){
  const oi=finite(oiChangePct),tk=finite(takerRatio),fr=finite(fundingPct);
  let score=0;const reasons=[];
  if(oi!=null&&oi>=3){score+=35;reasons.push('OI 4H 강한 증가')}
  else if(oi!=null&&oi>=1){score+=22;reasons.push('OI 4H 증가')}
  else if(oi!=null&&oi<=-3){score-=20;reasons.push('OI 감소')}
  if(tk!=null&&tk>=1.5){score+=30;reasons.push('taker 강한 매수 우위')}
  else if(tk!=null&&tk>=1.2){score+=20;reasons.push('taker 매수 우위')}
  else if(tk!=null&&tk<.8){score-=25;reasons.push('taker 매도 우위')}
  if(fr!=null&&Math.abs(fr)<=.03){score+=10;reasons.push('펀딩 과열 아님')}
  return{score:clamp(score),oiChangePct:oi,takerRatio:tk,fundingPct:fr,reasons};
}
function riskReward(frames){
  const a=closed(rowsOf(frames,'4h'));if(a.length<25)return{score:0,available:false,rrProxy:null,reasons:[]};
  const c=close(a.at(-1)),at=atr(a,14),prev=a.slice(-24,-1),res=Math.max(...prev.map(high).filter(Number.isFinite)),sup=Math.min(...prev.map(low).filter(Number.isFinite));
  if(![c,at,res,sup].every(Number.isFinite)||at<=0)return{score:0,available:false,rrProxy:null,reasons:[]};
  const stop=Math.max(sup,c-1.5*at),risk=Math.max(c-stop,at*.5),reward=Math.max(res-c,0);
  const rr=reward/risk;
  const score=rr>=3?100:rr>=2?75:rr>=1.5?55:rr>=1?35:15;
  const reasons=[rr>=2?'상단까지 손익비 여유':'상단 저항까지 공간 제한'];
  return{score,available:true,rrProxy:rr,entry:c,stopProxy:stop,targetProxy:res,reasons};
}
function evidenceDiversity(parts){
  const active={
    trend:(parts.location?.score||0)>=55,
    location:Number.isFinite(parts.location?.range4hPct)&&parts.location.range4hPct<=70,
    compression:Boolean(parts.compression?.active),
    volume:(parts.volume?.score||0)>=45,
    momentum:(parts.momentum?.score||0)>=50&&!parts.momentum?.overheated,
    liquidity:Boolean(parts.breakout?.sslSweep||parts.breakout?.breakout)&&!parts.breakout?.fakeout,
    derivatives:(parts.derivatives?.score||0)>=45,
    risk:(parts.risk?.score||0)>=55
  };
  const count=EVIDENCE_KEYS.filter(k=>active[k]).length;
  return{count,total:EVIDENCE_KEYS.length,pct:Math.round(count/EVIDENCE_KEYS.length*1000)/10,active};
}
function stage(parts,diversity){
  if(parts.volume?.distributionRisk||parts.breakout?.fakeout)return'DISTRIBUTION';
  if(parts.momentum?.overheated&&parts.volume?.expansion)return'EXHAUSTION';
  if(parts.breakout?.breakout&&(parts.derivatives?.score||0)>=45)return'IGNITION';
  if(diversity.count>=5&&((parts.compression?.active)||(parts.volume?.absorption)))return'IGNITION_READY';
  if(diversity.count>=3)return'PRE-SURGE';
  return'WATCH';
}
function analyze(input={}){
  const frames=input.frames||{};
  const parts={
    location:structureLocation(frames,String(input.structure||'neutral')),
    compression:compression(frames),
    volume:volumeEfficiency(frames,input.priceChange1h,input.priceChange15m),
    breakout:breakoutQuality(frames),
    momentum:momentumEvidence(input.momentumSignals||{}),
    derivatives:derivativesEvidence(input),
    risk:riskReward(frames)
  };
  const diversity=evidenceDiversity(parts);
  const s=stage(parts,diversity);
  const score=clamp(
    (parts.location.score*.16)+(parts.compression.score*.12)+(parts.volume.score*.18)+(parts.breakout.score*.14)+
    (parts.momentum.score*.12)+(parts.derivatives.score*.18)+(parts.risk.score*.10)
  );
  const reasons=[...parts.location.reasons,...parts.compression.reasons,...parts.volume.reasons,...parts.breakout.reasons,...parts.derivatives.reasons]
    .filter((x,i,a)=>x&&a.indexOf(x)===i).slice(0,8);
  return{
    version:VERSION,stage:s,score:Math.round(score*10)/10,evidenceDiversity:diversity,
    volumeEfficiency:parts.volume,compression:parts.compression,location:parts.location,breakout:parts.breakout,
    momentum:parts.momentum,derivatives:parts.derivatives,risk:parts.risk,reasons,
    shadow:true,rankingAssist:true
  };
}

module.exports={VERSION,EVIDENCE_KEYS,analyze,compression,volumeEfficiency,breakoutQuality,evidenceDiversity};
