'use strict';

const STAGES=Object.freeze({
  NONE:'NONE',
  BOTTOM_CANDIDATE:'BOTTOM_CANDIDATE',
  EARLY_REVERSAL:'EARLY_REVERSAL',
  STRUCTURE_CONFIRMED:'STRUCTURE_CONFIRMED',
  RETEST_COMPLETE:'RETEST_COMPLETE'
});

const LABELS=Object.freeze({
  NONE:'바닥 아님',
  BOTTOM_CANDIDATE:'바닥 후보',
  EARLY_REVERSAL:'초기 반전',
  STRUCTURE_CONFIRMED:'구조 전환 확인',
  RETEST_COMPLETE:'리테스트 완료'
});

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function close(r){return Array.isArray(r)?finite(r[4]):finite(r?.close)}
function high(r){return Array.isArray(r)?finite(r[2]):finite(r?.high)}
function low(r){return Array.isArray(r)?finite(r[3]):finite(r?.low)}
function volume(r){return Array.isArray(r)?finite(r[5]):finite(r?.volume)}
function completed(rows=[],now=Date.now()){
  const src=Array.isArray(rows)?rows:[];
  return src.filter(r=>{
    if(Array.isArray(r)){const ct=finite(r[6]);return r.length>=6&&close(r)!=null&&(ct==null||ct<now)}
    return r&&r.partial!==true&&close(r)!=null;
  });
}
function avg(a=[]){const x=a.filter(Number.isFinite);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null}
function sma(values=[],n=20){const x=values.slice(-n).filter(Number.isFinite);return x.length?avg(x):null}
function ema(values=[],n=20){const x=values.filter(Number.isFinite);if(!x.length)return null;const k=2/(n+1);let e=x[0];for(const v of x.slice(1))e=v*k+e*(1-k);return e}
function rsi(values=[],n=14){
  const x=values.filter(Number.isFinite);if(x.length<n+1)return null;
  let g=0,l=0;for(let i=x.length-n;i<x.length;i++){const d=x[i]-x[i-1];if(d>0)g+=d;else l-=d}
  const ag=g/n,al=l/n;return al===0?100:100-(100/(1+ag/al));
}
function macdHist(values=[]){
  const x=values.filter(Number.isFinite);if(x.length<35)return null;
  const m=[];
  let e12=x[0],e26=x[0],sig=0;const k12=2/13,k26=2/27,k9=2/10;
  for(let i=0;i<x.length;i++){
    e12=x[i]*k12+e12*(1-k12);e26=x[i]*k26+e26*(1-k26);
    const macd=e12-e26;sig=i?macd*k9+sig*(1-k9):macd;m.push(macd-sig);
  }
  return m.at(-1);
}
function rangePosition(rows=[],lookback=60){
  const a=completed(rows).slice(-lookback);if(a.length<10)return null;
  const hs=a.map(high).filter(Number.isFinite),ls=a.map(low).filter(Number.isFinite),p=close(a.at(-1));
  const hi=Math.max(...hs),lo=Math.min(...ls);return hi>lo&&p!=null?((p-lo)/(hi-lo))*100:null;
}
function shortMaState(rows=[]){
  const a=completed(rows),c=a.map(close).filter(Number.isFinite);if(c.length<60)return{available:false};
  const p=c.at(-1),m5=sma(c,5),m10=sma(c,10),m20=sma(c,20),m60=sma(c,60);
  return{
    available:true,p,m5,m10,m20,m60,
    above5:p>m5,above10:p>m10,above20:p>m20,above60:p>m60,
    bullishStack:p>m5&&m5>m10&&m10>m20,
    reclaim20:p>m20,reclaim60:p>m60
  };
}
function sslSweepReclaim(rows=[]){
  const a=completed(rows);if(a.length<14)return false;
  const last=a.at(-1),prev=a.slice(-13,-1),pl=Math.min(...prev.map(low).filter(Number.isFinite));
  return low(last)<pl&&close(last)>pl;
}
function bosUp(rows=[]){
  const a=completed(rows);if(a.length<14)return false;
  const last=a.at(-1),prev=a.slice(-13,-1),ph=Math.max(...prev.map(high).filter(Number.isFinite));
  return close(last)>ph;
}
function volumeProfile(rows=[]){
  const a=completed(rows);if(a.length<25)return{rvol:null,climaxSeen:false,dryUp:false};
  const vols=a.map(volume).filter(Number.isFinite),last=vols.at(-1),base=avg(vols.slice(-21,-1));
  const maxRecent=Math.max(...vols.slice(-12,-1)),rvol=base>0?last/base:null;
  return{rvol,climaxSeen:base>0&&maxRecent/base>=2.5,dryUp:rvol!=null&&rvol<=0.8};
}
function bullishDivergence(rows=[]){
  const a=completed(rows);if(a.length<40)return false;
  const c=a.map(close).filter(Number.isFinite);if(c.length<40)return false;
  const left=c.slice(-28,-14),right=c.slice(-14);
  const li=left.indexOf(Math.min(...left)),ri=right.indexOf(Math.min(...right));
  if(li<0||ri<0)return false;
  const p1=left[li],p2=right[ri];
  const r1=rsi(c.slice(0,c.length-14+li+1),14),r2=rsi(c.slice(0,c.length-14+ri+1),14);
  return Number.isFinite(r1)&&Number.isFinite(r2)&&p2<=p1*1.01&&r2>r1+3;
}
function retestHold(rows=[]){
  const a=completed(rows);if(a.length<20)return false;
  const closes=a.map(close),prior=Math.max(...closes.slice(-16,-6).filter(Number.isFinite));
  const recent=a.slice(-6),broke=recent.some(r=>high(r)>prior*1.003&&close(r)>prior);
  const held=recent.slice(-3).every(r=>low(r)>=prior*0.985)&&close(recent.at(-1))>=prior;
  return broke&&held;
}

function evaluate({frames={},derivativesProfile=null,v2Profile=null}={}){
  const oneDay=frames['1d']||[],h4=frames['4h']||[],h1=frames['1h']||[],m15=frames['15m']||[],m5=frames['5m']||[];
  const dPos=rangePosition(oneDay,60),h4Pos=rangePosition(h4,60);
  const h1Ma=shortMaState(h1),m15Ma=shortMaState(m15),m5Ma=shortMaState(m5);
  const h1Closes=completed(h1).map(close).filter(Number.isFinite),m15Closes=completed(m15).map(close).filter(Number.isFinite);
  const rsi1h=rsi(h1Closes),rsi15m=rsi(m15Closes),macd1h=macdHist(h1Closes),macd15m=macdHist(m15Closes);
  const sweep=sslSweepReclaim(h1)||sslSweepReclaim(m15),bos=bosUp(h1)||bosUp(m15);
  const div=bullishDivergence(h1)||bullishDivergence(m15);
  const vp1=volumeProfile(h1),vp15=volumeProfile(m15);
  const profile=v2Profile||derivativesProfile?.v2Profile||derivativesProfile||{};
  const oi4=finite(profile.oi4hPct),oi8=finite(profile.oi8hPct);
  const takers=[...(Array.isArray(profile.taker1h)?profile.taker1h:[]),...(Array.isArray(profile.taker15m)?profile.taker15m:[])]
    .map(x=>finite(x?.ratio??x)).filter(Number.isFinite);
  const taker=takers.length?takers.at(-1):finite(profile.takerRatio);
  const oiBuilding=(oi4!=null&&oi4>0)||(oi8!=null&&oi8>0);
  const takerRecovered=taker!=null&&taker>=1.0;

  let score=0;const reasons=[];
  if(dPos!=null&&dPos<=35){score+=14;reasons.push('1D 디스카운트 구간')}
  if(h4Pos!=null&&h4Pos<=35){score+=10;reasons.push('4H 저가권')}
  if(rsi15m!=null&&rsi15m<=35){score+=8;reasons.push('15m 과매도/리셋')}
  if(rsi1h!=null&&rsi1h<=45){score+=6;reasons.push('1H 모멘텀 저점권')}
  if(sweep){score+=16;reasons.push('SSL 스윕 후 회복')}
  if(div){score+=12;reasons.push('상승 다이버전스')}
  if(vp1.climaxSeen||vp15.climaxSeen){score+=7;reasons.push('매도 클라이맥스 기억')}
  if(vp1.dryUp||vp15.dryUp){score+=5;reasons.push('거래량 소진')}
  if(macd15m!=null&&macd15m>0){score+=6;reasons.push('15m MACD 반전')}
  if(h1Ma.reclaim20||m15Ma.bullishStack){score+=8;reasons.push('단기 이평 재탈환')}
  if(bos){score+=12;reasons.push('BOS 상방')}
  if(h1Ma.reclaim60){score+=8;reasons.push('1H 60선 회복')}
  if(oiBuilding){score+=5;reasons.push('OI 재유입')}
  if(takerRecovered){score+=5;reasons.push('taker 매수 회복')}
  const retest=retestHold(h1)||retestHold(m15);
  if(retest){score+=10;reasons.push('돌파 리테스트 지지')}

  let stage=STAGES.NONE;
  if(score>=72&&bos&&retest)stage=STAGES.RETEST_COMPLETE;
  else if(score>=58&&(bos||h1Ma.reclaim60))stage=STAGES.STRUCTURE_CONFIRMED;
  else if(score>=42&&(sweep||div||m15Ma.bullishStack||(macd15m!=null&&macd15m>0)))stage=STAGES.EARLY_REVERSAL;
  else if(score>=28&&(dPos==null||dPos<=45)&&(h4Pos==null||h4Pos<=45))stage=STAGES.BOTTOM_CANDIDATE;

  const invalidations=[];
  if(h1Ma.available&&h1Ma.p<h1Ma.m20&&rsi1h!=null&&rsi1h<30)invalidations.push('1H 20선 아래 + RSI 약세');
  if(oi8!=null&&oi8<-8&&!takerRecovered)invalidations.push('OI 급감 + taker 회복 없음');

  return{
    version:'BOTTOM_DETECTOR_v1',
    stage,label:LABELS[stage],score:Math.min(100,Math.round(score)),
    ready:stage===STAGES.STRUCTURE_CONFIRMED||stage===STAGES.RETEST_COMPLETE,
    watch:stage!==STAGES.NONE,
    components:{
      discount:{oneDayPct:dPos,fourHourPct:h4Pos},
      momentum:{rsi1h,rsi15m,macd1h,macd15m,bullishDivergence:div},
      liquidity:{sslSweepReclaim:sweep,bosUp:bos,retestHold:retest},
      ma:{h1:h1Ma,m15:m15Ma,m5:m5Ma},
      volume:{h1:vp1,m15:vp15},
      derivatives:{oi4hPct:oi4,oi8hPct:oi8,takerRatio:taker,oiBuilding,takerRecovered}
    },
    reasons:reasons.slice(0,8),invalidations
  };
}

module.exports={STAGES,LABELS,evaluate,rangePosition,shortMaState,bullishDivergence,retestHold};
