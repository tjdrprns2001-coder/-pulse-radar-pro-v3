'use strict';
const SPAN_BY_TF={'5m':2,'15m':2,'1h':3,'4h':3,'1d':2,'1w':2};
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}
function swings(bars,{tf='1h',span=SPAN_BY_TF[tf]??2}={}){
 const out=[];for(let i=span;i<bars.length-span;i++){const b=bars[i],w=bars.slice(i-span,i+span+1),hi=Math.max(...w.map(x=>x.h)),lo=Math.min(...w.map(x=>x.l));if(b.h===hi&&w.findIndex(x=>x.h===hi)===span)out.push({type:'high',price:b.h,index:i,eventAt:b.ct??b.t,confirmedAt:bars[i+span]?.ct??bars[i+span]?.t,classification:null});if(b.l===lo&&w.findIndex(x=>x.l===lo)===span)out.push({type:'low',price:b.l,index:i,eventAt:b.ct??b.t,confirmedAt:bars[i+span]?.ct??bars[i+span]?.t,classification:null})}
 const hs=[],ls=[];for(const p of out){const arr=p.type==='high'?hs:ls,prev=arr.at(-1);p.classification=!prev?(p.type==='high'?'H':'L'):p.type==='high'?(p.price>prev.price?'HH':p.price<prev.price?'LH':'EQH'):(p.price>prev.price?'HL':p.price<prev.price?'LL':'EQL');arr.push(p)}
 return out
}
function trendFrom(sw){const h=sw.filter(x=>x.type==='high').slice(-2),l=sw.filter(x=>x.type==='low').slice(-2);if(h.length<2||l.length<2)return'unknown';if(h[1].price>h[0].price&&l[1].price>l[0].price)return'bullish';if(h[1].price<h[0].price&&l[1].price<l[0].price)return'bearish';return'range'}
function events(bars,sw){
 const out=[],broken=new Set();let trend='unknown';
 for(let i=1;i<bars.length;i++){const b=bars[i],prev=bars[i-1],known=sw.filter(x=>x.confirmedAt!=null&&x.confirmedAt<= (b.ct??b.t));const hi=known.filter(x=>x.type==='high'&&!broken.has('H:'+x.eventAt)).at(-1),lo=known.filter(x=>x.type==='low'&&!broken.has('L:'+x.eventAt)).at(-1);
  for(const [p,side] of [[hi,'bullish'],[lo,'bearish']]){if(!p)continue;const crossed=side==='bullish'?prev.c<=p.price&&b.c>p.price:prev.c>=p.price&&b.c<p.price;if(!crossed)continue;const opposite=trend!=='unknown'&&trend!=='range'&&trend!==side,type=opposite?'CHOCH':'BOS';out.push({type,side,level:p.price,eventAt:b.ct??b.t,knownAt:b.ct??b.t,referenceSwingAt:p.eventAt,close:b.c});broken.add((p.type==='high'?'H:':'L:')+p.eventAt);trend=side}
 }
 return out
}
function rangeBox(sw){const h=sw.filter(x=>x.type==='high').at(-1),l=sw.filter(x=>x.type==='low').at(-1);if(!h||!l||h.price<=l.price)return null;return{low:l.price,high:h.price,mid:(l.price+h.price)/2,highAt:h.eventAt,lowAt:l.eventAt,knownAt:Math.max(h.confirmedAt||0,l.confirmedAt||0)}}
function analyze(bars,{tf='1h',span}={}){
 if(!Array.isArray(bars)||bars.length<8)return{available:false,tf,trend:'unknown',swings:[],events:[],range:null};
 const sw=swings(bars,{tf,span}),ev=events(bars,sw),trend=trendFrom(sw),r=rangeBox(sw);
 return{available:true,tf,span:span??SPAN_BY_TF[tf]??2,trend,swings:sw,events:ev,lastBos:[...ev].reverse().find(x=>x.type==='BOS')||null,lastChoch:[...ev].reverse().find(x=>x.type==='CHOCH')||null,range:r,lookaheadSafe:true,confirmationPolicy:'pivot requires right-side candles; BOS/CHoCH requires close break'}
}
module.exports={SPAN_BY_TF,swings,trendFrom,events,rangeBox,analyze};
