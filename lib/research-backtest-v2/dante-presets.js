'use strict';

const VERSION='DANTE_CRYPTO_RESEARCH_v1';
function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function val(r,k,i){const x=Array.isArray(r)?r[i]:r?.[k];return n(x)}
function close(r){return val(r,'close',4)} function high(r){return val(r,'high',2)} function low(r){return val(r,'low',3)}
function ema(values,p){const a=values.filter(Number.isFinite);if(a.length<p)return null;let e=a.slice(0,p).reduce((s,v)=>s+v,0)/p,k=2/(p+1);for(let i=p;i<a.length;i++)e=a[i]*k+e*(1-k);return e}
function emaSeries(values,p){const out=Array(values.length).fill(null);if(values.length<p)return out;let e=values.slice(0,p).reduce((s,v)=>s+v,0)/p;out[p-1]=e;const k=2/(p+1);for(let i=p;i<values.length;i++){e=values[i]*k+e*(1-k);out[i]=e}return out}
function atr(rows,p=20){if(rows.length<p+1)return null;const tr=[];for(let i=1;i<rows.length;i++){const h=high(rows[i]),l=low(rows[i]),pc=close(rows[i-1]);if([h,l,pc].some(x=>x==null))continue;tr.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)))}return tr.length>=p?tr.slice(-p).reduce((a,b)=>a+b,0)/p:null}
function pivots(rows,left=3,right=3){const out=[];for(let i=left;i<rows.length-right;i++){const h=high(rows[i]),l=low(rows[i]);let hi=true,lo=true;for(let j=i-left;j<=i+right;j++){if(j===i)continue;if(high(rows[j])>=h)hi=false;if(low(rows[j])<=l)lo=false}if(hi)out.push({index:i,type:'H',price:h});if(lo)out.push({index:i,type:'L',price:l})}return out.sort((a,b)=>a.index-b.index)}
function featureSet(rows){
  const closes=rows.map(close),e5=emaSeries(closes,5),e20=emaSeries(closes,20),e60=emaSeries(closes,60),e112=emaSeries(closes,112),e224=emaSeries(closes,224),e448=emaSeries(closes,448);
  return{closes,e5,e20,e60,e112,e224,e448,atr20:atr(rows,20),pivots:pivots(rows)};
}
function last(a){return a[a.length-1]} function prev(a){return a[a.length-2]}
function result(id,pass,score,evidence,missing,params){return{id,version:VERSION,pass:Boolean(pass),score:Math.max(0,Math.min(100,Math.round(score))),evidence,missing,params,semantics:'research proxy; not an original-author exact rule or win probability'}}

function dante256(rows,params={}){
 const p={emaDistanceAtrMax:params.emaDistanceAtrMax??2.5,minBars:params.minBars??80},m=[];
 if(rows.length<Math.max(61,p.minBars))return result('DANTE_256_PROXY_v1',false,0,[],['history'],p);
 const f=featureSet(rows),c=last(f.closes),c5=last(f.e5),p5=prev(f.e5),c20=last(f.e20),p20=prev(f.e20),c60=last(f.e60),a=f.atr20;
 const cross=[p5,p20,c5,c20].every(Number.isFinite)&&p5<=p20&&c5>c20;
 const above20=Number.isFinite(c)&&Number.isFinite(c20)&&c>c20;
 const under60=Number.isFinite(c60)&&Number.isFinite(c)&&c60>c;
 const dist=Number.isFinite(a)&&a>0&&Number.isFinite(c60)&&Number.isFinite(c)?(c60-c)/a:null;
 const near=dist!=null&&dist>=0&&dist<=p.emaDistanceAtrMax;
 const ev=[['EMA5 상향교차 EMA20',cross],['종가 > EMA20',above20],['EMA60 > 종가',under60],['EMA60 ATR 이격 제한',near]];
 const ok=ev.every(x=>x[1]);return result('DANTE_256_PROXY_v1',ok,ev.filter(x=>x[1]).length*25,ev.map(x=>({rule:x[0],pass:x[1],value:x[0].includes('이격')?dist:null})),[],p);
}
function bowl224(rows,params={}){
 const p={minBelowCloses:params.minBelowCloses??80,pivotMin:params.pivotMin??3,baseLookback:params.baseLookback??120,declineLookback:params.declineLookback??60},m=[];
 if(rows.length<226)return result('DANTE_BOWL224_BREAKOUT_v1',false,0,[],['history'],p);
 const f=featureSet(rows),i=rows.length-1,c=last(f.closes),pc=f.closes[i-1],e=last(f.e224),pe=f.e224[i-1];
 let below=0;for(let j=i-1;j>=0&&below<p.minBelowCloses;j--){if(Number.isFinite(f.e224[j])&&f.closes[j]<f.e224[j])below++;else if(Number.isFinite(f.e224[j]))break}
 const recent=f.pivots.filter(x=>x.index>=Math.max(0,i-p.baseLookback));const pivotCount=recent.length;
 const baseStart=Math.max(0,i-p.baseLookback),declStart=Math.max(0,baseStart-p.declineLookback);
 const base=rows.slice(baseStart,i),decl=rows.slice(declStart,baseStart);
 const range=x=>{const hs=x.map(high).filter(Number.isFinite),ls=x.map(low).filter(Number.isFinite);return hs.length&&ls.length?Math.max(...hs)-Math.min(...ls):null};
 const baseRange=range(base),declRange=range(decl);const baseLonger=base.length>decl.length||p.baseLookback>p.declineLookback;
 const cross=[pc,pe,c,e].every(Number.isFinite)&&pc<=pe&&c>e;
 const ev=[['EMA224 아래 장기 체류',below>=p.minBelowCloses],['바닥구간 > 하락구간 길이',baseLonger],['확정 피벗 ≥ '+p.pivotMin,pivotCount>=p.pivotMin],['종가 EMA224 상향 돌파',cross]];
 const score=ev.filter(x=>x[1]).length*25;return result('DANTE_BOWL224_BREAKOUT_v1',ev.every(x=>x[1]),score,ev.map(x=>({rule:x[0],pass:x[1]})),[],{...p,belowCloses:below,pivotCount,baseRange,declRange});
}
function maHit(rows,params={}){
 const p={dropLookback:params.dropLookback??30,minDropPct:params.minDropPct??12,atrDistanceMax:params.atrDistanceMax??2.0,volatilityContractRatio:params.volatilityContractRatio??0.75};
 if(rows.length<226)return result('DANTE_MA_HIT_PROXY_v1',false,0,[],['history'],p);
 const f=featureSet(rows),c=last(f.closes),e224=last(f.e224),a=last(f.e112),b=last(f.e224),d=last(f.e448),atrNow=f.atr20;
 const recent=f.closes.slice(-p.dropLookback).filter(Number.isFinite),peak=recent.length?Math.max(...recent):null,drop=peak&&c?((peak-c)/peak)*100:null;
 const dist=atrNow&&e224!=null?Math.abs(e224-c)/atrNow:null;
 const atrRecent=atr(rows.slice(0,-10),20),contract=atrRecent&&atrNow?atrNow/atrRecent:null;
 const reverse=[a,b,d].every(Number.isFinite)&&a<b&&b<d;
 const ev=[['장기 역배열 112<224<448',reverse],['최근 급락',drop!=null&&drop>=p.minDropPct],['EMA224 ATR 이격 축소',dist!=null&&dist<=p.atrDistanceMax],['변동성 축소',contract!=null&&contract<=p.volatilityContractRatio]];
 return result('DANTE_MA_HIT_PROXY_v1',ev.every(x=>x[1]),ev.filter(x=>x[1]).length*25,ev.map(x=>({rule:x[0],pass:x[1]})),[],{...p,dropPct:drop,atrDistance:dist,volatilityContract:contract});
}
function evaluatePreset(id,rows,params){if(id==='256')return dante256(rows,params);if(id==='bowl224')return bowl224(rows,params);if(id==='ma-hit')return maHit(rows,params);throw new Error('unknown Dante research preset')}
const PRESETS=Object.freeze({
 '256':{id:'256',label:'256 선행 후보',engine:'DANTE_256_PROXY_v1',sourceBoundary:'research proxy'},
 bowl224:{id:'bowl224',label:'밥그릇 3번 돌파',engine:'DANTE_BOWL224_BREAKOUT_v1',sourceBoundary:'research proxy'},
 'ma-hit':{id:'ma-hit',label:'이평때리기',engine:'DANTE_MA_HIT_PROXY_v1',sourceBoundary:'research proxy'}
});
module.exports={VERSION,PRESETS,ema,emaSeries,atr,pivots,featureSet,dante256,bowl224,maHit,evaluatePreset};
