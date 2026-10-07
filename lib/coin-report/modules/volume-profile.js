'use strict';
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function mean(a){const x=a.filter(Number.isFinite);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null}
function stdev(a,m){const x=a.filter(Number.isFinite);if(x.length<2||m==null)return 0;return Math.sqrt(x.reduce((s,v)=>s+(v-m)**2,0)/x.length)}
function profileCore(bars,{bins=48,valueAreaPct=.70}={}){
 const xs=(bars||[]).filter(x=>[x.h,x.l].every(Number.isFinite)&&finite(x.v)!=null&&x.v>=0);if(xs.length<5)return{available:false,reason:'insufficient_bars'};
 const low=Math.min(...xs.map(x=>x.l)),high=Math.max(...xs.map(x=>x.h)),range=high-low;if(!(range>0))return{available:false,reason:'zero_price_range'};
 const n=Math.max(12,Math.min(160,Math.floor(Number(bins)||48))),step=range/n,vol=Array(n).fill(0);
 for(const x of xs){
  const v=finite(x.v)||0,lo=Math.max(0,Math.min(n-1,Math.floor((x.l-low)/step))),hi=Math.max(0,Math.min(n-1,Math.floor((x.h-low)/step)));
  const width=Math.max(step,x.h-x.l),parts=[];
  for(let i=lo;i<=hi;i++){const a=low+i*step,b=a+step,overlap=Math.max(0,Math.min(x.h,b)-Math.max(x.l,a));parts.push([i,overlap/width])}
  const weight=parts.reduce((s,p)=>s+p[1],0);
  if(weight>0)for(const [i,w] of parts)vol[i]+=v*w/weight;else vol[Math.max(0,Math.min(n-1,Math.floor((((x.h+x.l)/2)-low)/step)))] += v;
 }
 const nodes=vol.map((v,i)=>({index:i,low:low+i*step,high:low+(i+1)*step,mid:low+(i+.5)*step,volume:v}));
 const total=vol.reduce((s,v)=>s+v,0),pocIndex=vol.indexOf(Math.max(...vol)),poc=nodes[pocIndex];
 let selected=new Set([pocIndex]),acc=poc.volume,left=pocIndex-1,right=pocIndex+1,target=total*Math.max(.5,Math.min(.9,Number(valueAreaPct)||.7));
 while(acc<target&&(left>=0||right<n)){const lv=left>=0?vol[left]:-1,rv=right<n?vol[right]:-1;if(rv>lv){selected.add(right);acc+=Math.max(0,rv);right++}else{selected.add(left);acc+=Math.max(0,lv);left--}}
 const idx=[...selected].sort((a,b)=>a-b),val=nodes[idx[0]]?.low??null,vah=nodes[idx.at(-1)]?.high??null,m=mean(vol),sd=stdev(vol,m);
 const hvn=nodes.filter(x=>x.volume>=(m??0)+sd*.6).sort((a,b)=>b.volume-a.volume).slice(0,6);
 const positive=nodes.filter(x=>x.volume>0),lvn=positive.filter(x=>x.volume<=Math.max(0,(m??0)-sd*.45)).sort((a,b)=>a.volume-b.volume).slice(0,6);
 return{available:true,method:'ohlcv_range_weighted',approximation:true,bins:n,range:{low,high},totalVolume:total,poc:{price:poc.mid,from:poc.low,to:poc.high,volume:poc.volume},vah,val,valueAreaPct:target&&total?acc/total:null,hvn:hvn.map(x=>({price:x.mid,from:x.low,to:x.high,volume:x.volume})),lvn:lvn.map(x=>({price:x.mid,from:x.low,to:x.high,volume:x.volume})),nodes}
}
function analyze(bars,opts={}){
 const full=profileCore(bars,opts);if(!full.available)return full;
 const xs=(bars||[]).filter(x=>[x.h,x.l].every(Number.isFinite));const cut=Math.floor(xs.length/2),a=profileCore(xs.slice(0,cut),opts),b=profileCore(xs.slice(cut),opts),pocSlope=a.available&&b.available?b.poc.price-a.poc.price:null,current=xs.at(-1)?.c??null;
 return{...full,pocSlope,currentPrice:current,distanceFromPocPct:current&&full.poc?.price?((current/full.poc.price)-1)*100:null,valueAreaPosition:current==null?'unknown':current>full.vah?'above':current<full.val?'below':'inside',sourcePrecision:'candle_approximation'}
}
module.exports={profileCore,analyze};
