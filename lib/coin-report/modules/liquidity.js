'use strict';
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function atr(bars,n=14){if(!bars?.length)return null;const xs=[];for(let i=1;i<bars.length;i++)xs.push(Math.max(bars[i].h-bars[i].l,Math.abs(bars[i].h-bars[i-1].c),Math.abs(bars[i].l-bars[i-1].c)));const a=xs.slice(-n);return a.length?a.reduce((s,v)=>s+v,0)/a.length:null}
function clusterSwings(swings,{tolerance=null,currentPrice=null}={}){
 const p=finite(currentPrice),A=finite(tolerance)??(p?p*.003:null)??0,groups=[];for(const s of swings||[]){let g=groups.find(x=>x.side===s.type&&Math.abs(x.mid-s.price)<=A);if(!g){g={side:s.type,points:[],mid:s.price};groups.push(g)}g.points.push(s);g.mid=g.points.reduce((sum,x)=>sum+x.price,0)/g.points.length}
 return groups.filter(g=>g.points.length>=2).map(g=>({type:g.side==='high'?'liquidity_high':'liquidity_low',from:g.mid-A*.35,to:g.mid+A*.35,price:g.mid,touches:g.points.length,sourceSwings:g.points.map(x=>x.eventAt),evidenceType:'price_structure_inference',actualOrdersConfirmed:false,status:'unswept'}))
}
function detectSweeps(bars,zones){
 const out=[];for(const z of zones||[]){const level=z.price;let swept=null;for(let i=0;i<bars.length;i++){const b=bars[i],high=z.type==='liquidity_high';const pierce=high?b.h>z.to:b.l<z.from,reclaim=high?b.c<level:b.c>level;if(pierce&&reclaim){swept={type:high?'high_sweep':'low_sweep',zoneType:z.type,level,extreme:high?b.h:b.l,eventAt:b.ct??b.t,knownAt:b.ct??b.t,barIndex:i,confirmedByStructure:false};break}}if(swept)out.push(swept)}
 return out
}
function orderbookMetrics(execution={}){
 const candidates=[execution?.spot,execution?.futures].filter(x=>x?.available),x=candidates[0];if(!x)return{available:false,mode:'unavailable',reason:'orderbook_not_available',actualOrdersConfirmed:false};
 const bid10=finite(x.depthUsd?.bid10bps),ask10=finite(x.depthUsd?.ask10bps),bid25=finite(x.depthUsd?.bid25bps),ask25=finite(x.depthUsd?.ask25bps),den10=(bid10??0)+(ask10??0),den25=(bid25??0)+(ask25??0);
 return{available:true,mode:'l2_snapshot',venue:x.venue||x.marketType||'unknown',bid:finite(x.bid),ask:finite(x.ask),mid:finite(x.mid),spreadBps:finite(x.spreadBps),depthUsd:{bid10bps:bid10,ask10bps:ask10,bid25bps:bid25,ask25bps:ask25},imbalance10bps:bid10!=null&&ask10!=null&&den10>0?(bid10-ask10)/den10:null,imbalance25bps:bid25!=null&&ask25!=null&&den25>0?(bid25-ask25)/den25:null,slippage:x.slippage||null,actualOrdersConfirmed:true,wallPersistence:'unavailable_without_stream_history',spoofingStatus:'cannot_determine_from_single_snapshot'}
}
function analyze({bars=[],structure=null,execution=null,currentPrice=null}={}){
 const p=finite(currentPrice)??bars.at(-1)?.c??null,A=atr(bars),tol=Math.max(finite(A)?.valueOf?.()??0,p?Math.abs(p*.0025):0),zones=clusterSwings(structure?.swings||[],{tolerance:tol,currentPrice:p}),sweeps=detectSweeps(bars,zones),book=orderbookMetrics(execution||{});
 for(const z of zones){const hit=sweeps.find(s=>s.level===z.price);if(hit)z.status='swept'}
 return{available:zones.length>0||book.available,priceBased:{available:zones.length>0,mode:'inferred_stop_liquidity',zones,sweeps,warning:'가격 구조 기반 잠재 유동성으로 실제 주문 존재를 의미하지 않음'},orderbook:book,atr:A,tolerance:tol}
}
module.exports={atr,clusterSwings,detectSweeps,orderbookMetrics,analyze};
