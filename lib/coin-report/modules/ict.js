'use strict';
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function atrSeries(bars,n=14){const out=Array(bars.length).fill(null),tr=[];for(let i=0;i<bars.length;i++){const x=bars[i],p=bars[i-1];tr.push(i?Math.max(x.h-x.l,Math.abs(x.h-p.c),Math.abs(x.l-p.c)):x.h-x.l);if(i>=n-1)out[i]=tr.slice(i-n+1,i+1).reduce((s,v)=>s+v,0)/n}return out}
function displacementEvents(bars,{bodyAtr=1.2,bodyRatio=.65,closeLocation=.75}={}){
 const A=atrSeries(bars),out=[];for(let i=1;i<bars.length;i++){const b=bars[i],a=A[i-1];if(!(a>0))continue;const body=Math.abs(b.c-b.o),span=b.h-b.l;if(!(span>0)||body<a*bodyAtr||body/span<bodyRatio)continue;const loc=(b.c-b.l)/span,side=b.c>b.o&&loc>=closeLocation?'bullish':b.c<b.o&&loc<=1-closeLocation?'bearish':null;if(side)out.push({type:'displacement',side,index:i,eventAt:b.ct??b.t,knownAt:b.ct??b.t,bodyAtr:body/a,bodyRatio:body/span,closeLocation:loc})}return out
}
function fvgEvents(bars){
 const out=[];for(let i=2;i<bars.length;i++){const a=bars[i-2],c=bars[i],bull=c.l>a.h,bear=c.h<a.l;if(!bull&&!bear)continue;const side=bull?'bullish':'bearish',from=bull?a.h:c.h,to=bull?c.l:a.l,z={type:'fvg_'+side,side,from,to,mid:(from+to)/2,originIndex:i,eventAt:c.ct??c.t,knownAt:c.ct??c.t,status:'unfilled',firstTouchAt:null,filledAt:null,invalidatedAt:null,reactionAt:null};for(let j=i+1;j<bars.length;j++){const b=bars[j],intersects=b.l<=to&&b.h>=from;if(intersects&&!z.firstTouchAt)z.firstTouchAt=b.ct??b.t;const full=bull?b.l<=from:b.h>=to,invalid=bull?b.c<from:b.c>to;if(invalid){z.status='invalidated';z.invalidatedAt=b.ct??b.t;break}if(full){z.status='fully_filled';z.filledAt=b.ct??b.t;break}if(intersects)z.status='partially_filled';const reject=bull?b.l<=to&&b.c>to:b.h>=from&&b.c<from;if(reject)z.reactionAt=b.ct??b.t}if(z.reactionAt&&z.status!=='invalidated')z.reacted=true;out.push(z)}
 return out
}
function orderBlocks(bars,structure,displacements,{lookback=8}={}){
 const out=[];for(const e of structure?.events||[]){const idx=bars.findIndex(b=>(b.ct??b.t)===e.eventAt);if(idx<1)continue;const disp=displacements.find(d=>d.index>=idx-1&&d.index<=idx+1&&d.side===e.side);if(!disp)continue;let j=idx-1;for(;j>=Math.max(0,idx-lookback);j--){const b=bars[j],opposite=e.side==='bullish'?b.c<b.o:b.c>b.o;if(opposite)break}if(j<Math.max(0,idx-lookback))continue;const b=bars[j],z={type:e.side==='bullish'?'order_block_bullish':'order_block_bearish',side:e.side,from:b.l,to:b.h,bodyFrom:Math.min(b.o,b.c),bodyTo:Math.max(b.o,b.c),originIndex:j,originTimestamp:b.ct??b.t,knownAt:e.knownAt,eventType:e.type,eventAt:e.eventAt,status:'untested',retests:0,invalidatedAt:null,lastTestAt:null,displacement:{bodyAtr:disp.bodyAtr,bodyRatio:disp.bodyRatio}};for(let k=idx+1;k<bars.length;k++){const x=bars[k],hit=x.l<=z.to&&x.h>=z.from;if(hit){z.retests++;z.lastTestAt=x.ct??x.t;z.status='tested'}const invalid=e.side==='bullish'?x.c<z.from:x.c>z.to;if(invalid){z.status='invalidated';z.invalidatedAt=x.ct??x.t;break}}out.push(z)}
 return out
}
function premiumDiscount(structure,currentPrice){
 const r=structure?.range,p=finite(currentPrice);if(!r||p==null)return{available:false,state:'unknown'};
 return{available:true,low:r.low,high:r.high,equilibrium:r.mid,currentPrice:p,state:p>r.mid?'premium':p<r.mid?'discount':'equilibrium',note:'독립 매매 신호가 아닌 최근 확정 스윙 범위 내 위치'}
}
function confirmSweeps(liquidity,structure){
 return (liquidity?.priceBased?.sweeps||[]).map(s=>{const opposite=s.type==='low_sweep'?'bullish':'bearish',confirm=(structure?.events||[]).find(e=>e.eventAt>=s.eventAt&&e.side===opposite&&['CHOCH','BOS'].includes(e.type));return{...s,confirmedByStructure:Boolean(confirm),confirmationEvent:confirm||null}})
}
function analyze({bars=[],structure=null,liquidity=null,currentPrice=null,config={}}={}){
 if(!Array.isArray(bars)||bars.length<5)return{available:false,fvgs:[],orderBlocks:[],displacements:[],sweeps:[],premiumDiscount:{available:false,state:'unknown'}};
 const displacements=displacementEvents(bars,config),fvgs=fvgEvents(bars),orderBlocksOut=orderBlocks(bars,structure,displacements,config),sweeps=confirmSweeps(liquidity,structure),pd=premiumDiscount(structure,currentPrice??bars.at(-1)?.c);
 return{available:true,definitionVersion:'ICT_RULESET_v1',standardizedFormula:false,parameters:{bodyAtr:config.bodyAtr??1.2,bodyRatio:config.bodyRatio??.65,closeLocation:config.closeLocation??.75,orderBlockLookback:config.lookback??8},displacements,fvgs,orderBlocks:orderBlocksOut,sweeps,premiumDiscount:pd,warning:'ICT는 내부 규칙 집합이며 확정적 기관 거래 신호가 아님'}
}
module.exports={atrSeries,displacementEvents,fvgEvents,orderBlocks,premiumDiscount,confirmSweeps,analyze};
