'use strict';
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function penaltyFor(snapshot={},outcomes={}){
  let points=0;const reasons=[];
  const add=(n,reason)=>{if(points>=20)return;const applied=Math.min(n,20-points);points+=applied;if(applied>0)reasons.push(reason)};
  const taker=finite(snapshot.takerRatio);if(taker!=null&&taker<1.05)add(4,`매수 체결 확인 약함 ${taker.toFixed(2)}배`);
  const vol15=finite(snapshot.volumeAcceleration15m??snapshot.volumeAcceleration);if(vol15!=null&&vol15<1.2)add(4,`15분 거래량 지속성 약함 ${vol15.toFixed(2)}배`);
  const qv=finite(snapshot.quoteVolume24h);if(qv!=null&&qv<2_000_000)add(4,'저유동성 거래대금');
  const ch=finite(snapshot.priceChange24h);if(ch!=null&&ch>=8)add(4,`후행 추격 위험 · 24시간 +${ch.toFixed(1)}%`);
  if(snapshot.breakout===false&&String(snapshot.structure||'').toLowerCase()==='bullish')add(2,'돌파 확인 전 구조 신호');
  const h4=finite(outcomes?.h4?.returnPct),h24=finite(outcomes?.h24?.returnPct);if(h4!=null&&h4<=-2)add(3,'과거 4시간 성과 음수');if(h24!=null&&h24<=-3)add(3,'과거 24시간 성과 음수');
  return{points:Math.min(20,points),reasons:reasons.slice(0,6)};
}
module.exports={penaltyFor};
