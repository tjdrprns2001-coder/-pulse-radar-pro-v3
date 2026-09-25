'use strict';

const VERSION='LIGHT_PRESCAN_v1';
const TF_ORDER=['4h','1h'];

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,Number(v)||0))}
function avg(a=[]){const x=a.filter(Number.isFinite);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null}
function rows(raw=[]){
  const now=Date.now();
  return(Array.isArray(raw)?raw:[]).filter(Array.isArray).filter(r=>finite(r[2])!=null&&finite(r[3])!=null&&finite(r[4])!=null&&(finite(r[6])==null||finite(r[6])<now)).map((r,i)=>({
    index:i,time:finite(r[0])??i,open:finite(r[1])??finite(r[4]),high:finite(r[2]),low:finite(r[3]),close:finite(r[4]),volume:finite(r[5])??0,closeTime:finite(r[6])??finite(r[0])??i
  }));
}
function sma(v,p){const o=Array(v.length).fill(null);let s=0;for(let i=0;i<v.length;i++){s+=v[i];if(i>=p)s-=v[i-p];if(i>=p-1)o[i]=s/p}return o}
function atr(c,p=14){const tr=c.map((x,i)=>Math.max(x.high-x.low,Math.abs(x.high-(i?c[i-1].close:x.close)),Math.abs(x.low-(i?c[i-1].close:x.close)))),o=Array(c.length).fill(null);let s=0;for(let i=0;i<tr.length;i++){s+=tr[i];if(i>=p)s-=tr[i-p];if(i>=p-1)o[i]=s/p}return o}
function rvol(c,lookback=20){if(c.length<lookback+1)return null;const last=c.at(-1).volume,base=avg(c.slice(-lookback-1,-1).map(x=>x.volume));return base>0?last/base:null}
function pivots(c,left=2,right=2){
  const highs=[],lows=[];
  for(let i=left;i<c.length-right;i++){const w=c.slice(i-left,i+right+1),x=c[i];if(w.every((z,j)=>j===left||x.high>=z.high))highs.push({i,price:x.high});if(w.every((z,j)=>j===left||x.low<=z.low))lows.push({i,price:x.low})}
  return{highs,lows};
}
function fit(points){if(points.length<2)return null;const n=points.length,sx=points.reduce((s,p)=>s+p.i,0),sy=points.reduce((s,p)=>s+p.price,0),sxx=points.reduce((s,p)=>s+p.i*p.i,0),sxy=points.reduce((s,p)=>s+p.i*p.price,0),d=n*sxx-sx*sx;if(!d)return null;const slope=(n*sxy-sx*sy)/d,intercept=(sy-slope*sx)/n;return{slope,at:i=>slope*i+intercept}}
function maState(c,tf){
  if(c.length<70)return null;const close=c.map(x=>x.close),m20=sma(close,20),m60=sma(close,60),a=atr(c),i=c.length-1,p=i-1,av=a[i];if(!(av>0))return null;
  const rising20=m20[i]>m20[Math.max(0,i-3)],rising60=m60[i]>m60[Math.max(0,i-3)],bull=close[i]>=m20[i]&&m20[i]>=m60[i],near20=Math.abs(c[i].low-m20[i])<=av*.45||Math.abs(close[i]-m20[i])<=av*.65,near60=Math.abs(c[i].low-m60[i])<=av*.45||Math.abs(close[i]-m60[i])<=av*.75,reclaim20=close[p]<m20[p]&&close[i]>m20[i],reclaim60=close[p]<m60[p]&&close[i]>m60[i];
  const active=(bull&&(near20||near60))||reclaim20||reclaim60;let score=0,stage='NONE';if(reclaim60){score=90;stage='SMA60_RECLAIM'}else if(reclaim20){score=86;stage='SMA20_RECLAIM'}else if(bull&&(near20||near60)){score=76;stage='MA_RETEST_HOLD'}else if(bull&&rising20&&rising60){score=60;stage='BULL_TREND_HOLD'}
  return{key:'MA',tf,active:active||score>=60,score,stage,reasons:[bull?'20·60 정배열':null,reclaim20?'20선 재회복':null,reclaim60?'60선 재회복':null,near20?'20선 눌림 반응':null,near60?'60선 눌림 반응':null].filter(Boolean)};
}
function liquidityState(c,tf){
  if(c.length<18)return null;let best=null;for(let i=Math.max(12,c.length-4);i<c.length;i++){const prev=c.slice(i-12,i),pl=Math.min(...prev.map(x=>x.low)),ph=Math.max(...prev.map(x=>x.high)),x=c[i];if(x.low<pl&&x.close>pl)best={key:'LIQUIDITY',tf,active:true,score:88,stage:'SSL_SWEEP_RECLAIM',reasons:['SSL 스윕','종가 레벨 회복']};else if(!best&&x.high>ph&&x.close<ph)best={key:'LIQUIDITY',tf,active:false,score:28,stage:'BSL_SWEEP_FAIL',reasons:['BSL 스윕 후 실패']}}
  return best||{key:'LIQUIDITY',tf,active:false,score:0,stage:'NONE',reasons:[]};
}
function trendlineState(c,tf){
  if(c.length<30)return null;const pv=pivots(c),hs=pv.highs.slice(-5);if(hs.length<3)return{key:'TRENDLINE',tf,active:false,score:0,stage:'NONE',reasons:[]};const f=fit(hs),i=c.length-1,a=atr(c),tol=(a[i]||c[i].close*.01)*.25;if(!f||f.slope>=0)return{key:'TRENDLINE',tf,active:false,score:0,stage:'NONE',reasons:[]};const line=f.at(i),prev=f.at(i-1),x=c[i],p=c[i-1];let stage='FORMING',score=42,active=false;if(p.close<=prev&&x.close>line+tol){stage='CLOSE_BREAK';score=90;active=true}else if(x.close>line&&Math.abs(x.low-line)<=tol*1.2){stage='RETEST';score=86;active=true}else if(Math.abs(x.close-line)<=tol*2){stage='NEAR_BREAK';score=64;active=true}return{key:'TRENDLINE',tf,active,score,stage,reasons:[stage==='CLOSE_BREAK'?'하락추세선 종가 돌파':stage==='RETEST'?'돌파 추세선 리테스트':stage==='NEAR_BREAK'?'하락추세선 돌파 임박':'하락추세선 형성중']};
}
function reversalState(c,tf){
  if(c.length<35)return null;const pv=pivots(c),ls=pv.lows.slice(-6),hs=pv.highs;if(ls.length<2)return{key:'REVERSAL',tf,active:false,score:0,stage:'NONE',reasons:[]};const a=atr(c),av=a.at(-1)||c.at(-1).close*.01,x=ls.at(-2),y=ls.at(-1);if(Math.abs(x.price-y.price)>av*1.7)return{key:'REVERSAL',tf,active:false,score:0,stage:'NONE',reasons:[]};const middle=hs.filter(h=>h.i>x.i&&h.i<y.i).sort((a,b)=>b.price-a.price)[0];if(!middle)return{key:'REVERSAL',tf,active:false,score:0,stage:'NONE',reasons:[]};const last=c.at(-1).close,near=last>=middle.price-av*.55,confirmed=last>middle.price;return{key:'REVERSAL',tf,active:near,score:confirmed?90:near?74:46,stage:confirmed?'DOUBLE_BOTTOM_BREAK':'DOUBLE_BOTTOM_NECKLINE_WAIT',reasons:['W/더블바텀 후보',confirmed?'넥라인 돌파':'넥라인 근접']};
}
function compressionState(c,tf){
  if(c.length<55)return null;const A=atr(c),recent=avg(A.slice(-5)),base=avg(A.slice(-25,-5)),vRecent=avg(c.slice(-5).map(x=>x.volume)),vBase=avg(c.slice(-25,-5).map(x=>x.volume)),close=c.map(x=>x.close),m60=sma(close,60),i=c.length-1;const atrRatio=base>0?recent/base:null,volRatio=vBase>0?vRecent/vBase:null,bull=Number.isFinite(m60[i])&&close[i]>=m60[i],compressed=atrRatio!=null&&atrRatio<=.82&&(volRatio==null||volRatio<=1.0);return{key:'COMPRESSION',tf,active:Boolean(compressed&&bull),score:compressed&&bull?72:compressed?54:0,stage:compressed&&bull?'BULL_CONTRACTION':'NONE',reasons:compressed&&bull?['상승 구조 내 ATR 압축','거래량 수축 후 방향 대기']:[]};
}
function analyze({symbol='',frames={},fast={},evidence={}}={}){
  const features=[];for(const tf of TF_ORDER){const c=rows(frames[tf]);if(!c.length)continue;for(const fn of [maState,liquidityState,trendlineState,reversalState,compressionState]){const x=fn(c,tf);if(x)features.push(x)}}
  const active=features.filter(x=>x.active).sort((a,b)=>b.score-a.score),best=active[0]||features.slice().sort((a,b)=>b.score-a.score)[0]||null;
  const strongKinds=new Set(active.filter(x=>x.score>=72).map(x=>x.key));const ch=finite(evidence.priceChange24h),qv=finite(evidence.quoteVolume24h),fastScore=finite(fast.candidateScore)||0;
  let score=best?best.score*.62:0;score+=Math.min(18,fastScore*.22);if(strongKinds.size>=2)score+=8;if(strongKinds.size>=3)score+=5;if(ch!=null&&ch>=5&&ch<=22&&strongKinds.size)score+=5;if(qv!=null&&qv>=10_000_000)score+=4;if(ch!=null&&ch>30)score-=12;
  score=Math.round(clamp(score));const continuation=Boolean(ch!=null&&ch>=5&&ch<=25&&strongKinds.size),reentryLike=Boolean(ch!=null&&ch>=8&&active.some(x=>['MA','LIQUIDITY','TRENDLINE','REVERSAL'].includes(x.key)));
  return{version:VERSION,symbol:String(symbol).toUpperCase(),score,eligible:score>=54||active.some(x=>x.score>=84),continuation,reentryLike,strongKinds:[...strongKinds],best,active:active.slice(0,6),rvol1h:rvol(rows(frames['1h'])),rvol4h:rvol(rows(frames['4h'])),priceChange24h:ch};
}
function select(rowsIn=[],limit=40){
  const rows=rowsIn.filter(x=>x&&x.symbol).sort((a,b)=>b.score-a.score||String(a.symbol).localeCompare(String(b.symbol))),out=[],seen=new Set();
  const take=(list,n)=>{let k=0;for(const x of list){if(k>=n||out.length>=limit)break;if(seen.has(x.symbol))continue;seen.add(x.symbol);out.push(x);k++}};
  for(const key of ['MA','LIQUIDITY','TRENDLINE','REVERSAL','COMPRESSION'])take(rows.filter(x=>x.strongKinds?.includes(key)),5);
  take(rows.filter(x=>x.reentryLike),8);take(rows.filter(x=>x.continuation),6);take(rows,limit-out.length);return out.slice(0,limit);
}
module.exports={VERSION,TF_ORDER,rows,sma,atr,maState,liquidityState,trendlineState,reversalState,compressionState,analyze,select};
