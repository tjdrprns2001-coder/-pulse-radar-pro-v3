(function(root,factory){
 const deps=typeof module==='object'&&module.exports?{MathX:require('./math.js')}: {MathX:root.PulseAutoChartMath};
 const api=factory(deps);if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartAdvanced=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(dep){'use strict';
const MathX=dep.MathX;
const finite=v=>MathX.finite(v),num=v=>finite(v)?Number(v):null;
function ema(values,p){return MathX.ema(values,p)}
function sma(values,p){const out=Array(values.length).fill(null);let sum=0;for(let i=0;i<values.length;i++){const v=Number(values[i]);sum+=v;if(i>=p)sum-=Number(values[i-p]);if(i>=p-1)out[i]=sum/p}return out}
function rsi(candles,p=14){
 const c=(candles||[]).map(x=>Number(x.close)),out=Array(c.length).fill(null);if(c.length<2)return out;
 let ag=0,al=0;
 for(let i=1;i<c.length;i++){
  const d=c[i]-c[i-1],g=Math.max(0,d),l=Math.max(0,-d);
  if(i<=p){ag+=g;al+=l;if(i===p){ag/=p;al/=p;out[i]=al===0?100:100-(100/(1+ag/al))}}
  else{ag=(ag*(p-1)+g)/p;al=(al*(p-1)+l)/p;out[i]=al===0?100:100-(100/(1+ag/al))}
 }
 return out
}
function macd(candles,fast=12,slow=26,signal=9){
 const c=(candles||[]).map(x=>Number(x.close)),ef=ema(c,fast),es=ema(c,slow),line=c.map((_,i)=>ef[i]-es[i]),sig=ema(line,signal),hist=line.map((v,i)=>v-sig[i]);
 return{line,signal:sig,hist}
}
function obv(candles){
 const out=[];let v=0;for(let i=0;i<(candles||[]).length;i++){if(i){const q=Number(candles[i].volume)||0,pc=Number(candles[i-1].close),cc=Number(candles[i].close);v+=cc>pc?q:cc<pc?-q:0}out.push(v)}return out
}
function rollingMid(candles,p,fieldA='high',fieldB='low'){
 const out=Array(candles.length).fill(null);for(let i=p-1;i<candles.length;i++){const xs=candles.slice(i-p+1,i+1);out[i]=(Math.max(...xs.map(x=>Number(x[fieldA])))+Math.min(...xs.map(x=>Number(x[fieldB]))))/2}return out
}
function ichimoku(candles){
 const conv=rollingMid(candles,9),base=rollingMid(candles,26),spanB=rollingMid(candles,52),spanA=conv.map((v,i)=>finite(v)&&finite(base[i])?(v+base[i])/2:null);
 return{conversion:conv,base,spanA,spanB}
}
function emaPack(candles,periods=[14,28,57,92,142,224,268,378,448]){
 const close=(candles||[]).map(x=>Number(x.close)),out={};for(const p of periods){const raw=ema(close,p);out[p]=raw.map((v,i)=>i>=p-1?v:null)}return out
}
function compression(pack,index,periods=[14,28,57,92]){
 const xs=periods.map(p=>num(pack?.[p]?.[index])).filter(finite);if(xs.length!==periods.length)return null;
 const mid=xs.reduce((a,b)=>a+b,0)/xs.length;if(!mid)return null;return(Math.max(...xs)-Math.min(...xs))/Math.abs(mid)*100
}
function slope(series,index,lookback=5){if(!Array.isArray(series)||index<lookback||!finite(series[index])||!finite(series[index-lookback]))return null;const a=Number(series[index]),b=Number(series[index-lookback]);return b===0?null:(a/b-1)*100/lookback}
function divergence(candles,series,lookback=24){
 const n=candles.length,i=n-1;if(i<lookback||!finite(series[i]))return'NONE';
 const slice=candles.slice(i-lookback,i+1),sv=series.slice(i-lookback,i+1),half=Math.max(3,Math.floor(slice.length/2));
 const a=slice.slice(0,half),b=slice.slice(half),sa=sv.slice(0,half).filter(finite),sb=sv.slice(half).filter(finite);
 if(!a.length||!b.length||!sa.length||!sb.length)return'NONE';
 const lowA=Math.min(...a.map(x=>x.low)),lowB=Math.min(...b.map(x=>x.low)),highA=Math.max(...a.map(x=>x.high)),highB=Math.max(...b.map(x=>x.high));
 const oscA=sa.at(-1),oscB=sb.at(-1);
 if(lowB<lowA&&oscB>oscA)return'BULLISH';
 if(highB>highA&&oscB<oscA)return'BEARISH';
 return'NONE'
}
function fvg(candles,{lookback=80,minAtr=.12,atrSeries=[]}={}){
 const out=[],start=Math.max(2,candles.length-lookback);
 for(let i=start;i<candles.length;i++){
  const a=candles[i-2],c=candles[i],atr=num(atrSeries[i])||Math.abs(Number(c.high)-Number(c.low)),min=atr*minAtr;
  if(Number(c.low)-Number(a.high)>=min)out.push({kind:'BULL_FVG',side:'bull',low:Number(a.high),high:Number(c.low),createdAt:c.closeTime,index:i});
  if(Number(a.low)-Number(c.high)>=min)out.push({kind:'BEAR_FVG',side:'bear',low:Number(c.high),high:Number(a.low),createdAt:c.closeTime,index:i});
 }
 return out.filter(z=>{
  const after=candles.slice(z.index+1);if(z.side==='bull')return!after.some(x=>Number(x.low)<=z.low);return!after.some(x=>Number(x.high)>=z.high)
 }).slice(-8)
}
function orderBlocks(candles,{lookback=80,atrSeries=[]}={}){
 const out=[],start=Math.max(2,candles.length-lookback);
 for(let i=start;i<candles.length;i++){
  const c=candles[i],p=candles[i-1],atr=num(atrSeries[i])||Math.abs(c.high-c.low),body=Math.abs(c.close-c.open);
  if(body<atr*.8)continue;
  if(c.close>c.open&&p.close<p.open&&c.close>p.high)out.push({kind:'BULL_OB',side:'bull',low:Number(p.low),high:Number(p.open),createdAt:c.closeTime,index:i});
  if(c.close<c.open&&p.close>p.open&&c.close<p.low)out.push({kind:'BEAR_OB',side:'bear',low:Number(p.open),high:Number(p.high),createdAt:c.closeTime,index:i});
 }
 return out.filter(z=>{const after=candles.slice(z.index+1);return z.side==='bull'?!after.some(x=>x.close<z.low):!after.some(x=>x.close>z.high)}).slice(-6)
}
function liquidity(candles,swings,{atrNow,currentPrice}={}){
 const tol=Math.max((num(atrNow)||0)*.15,Math.abs(num(currentPrice)||1)*.0008),out=[];
 const hs=(swings||[]).filter(x=>x.type==='H').slice(-16),ls=(swings||[]).filter(x=>x.type==='L').slice(-16);
 for(const [arr,side] of [[hs,'buy-side'],[ls,'sell-side']]){
  for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){
   if(Math.abs(arr[i].price-arr[j].price)<=tol){const p=(arr[i].price+arr[j].price)/2;out.push({kind:side==='buy-side'?'EQH':'EQL',side,price:p,low:p-tol*.25,high:p+tol*.25,knownAt:Math.max(arr[i].knownAt||0,arr[j].knownAt||0)})}
  }
 }
 const ded=[];for(const x of out.sort((a,b)=>b.knownAt-a.knownAt)){if(!ded.some(y=>y.kind===x.kind&&Math.abs(y.price-x.price)<=tol))ded.push(x)}
 return ded.slice(0,8)
}
function sweeps(candles,liqs,{lookback=48}={}){
 const out=[],start=Math.max(1,candles.length-lookback);
 for(let i=start;i<candles.length;i++){const c=candles[i],prev=candles[i-1];
  for(const l of liqs){
   if(l.side==='sell-side'&&c.low<l.low&&c.close>l.price)out.push({side:'bull',kind:'SELL_SIDE_SWEEP',price:l.price,index:i,time:c.closeTime,reclaim:true});
   if(l.side==='buy-side'&&c.high>l.high&&c.close<l.price)out.push({side:'bear',kind:'BUY_SIDE_SWEEP',price:l.price,index:i,time:c.closeTime,reclaim:true});
  }
  if(prev&&c.close>prev.high&&c.close>c.open)out.push({side:'bull',kind:'MICRO_MSS_UP',price:prev.high,index:i,time:c.closeTime});
  if(prev&&c.close<prev.low&&c.close<c.open)out.push({side:'bear',kind:'MICRO_MSS_DOWN',price:prev.low,index:i,time:c.closeTime});
 }
 return out.slice(-12)
}
function fib(swings,currentPrice){
 const lastH=[...(swings||[])].reverse().find(x=>x.type==='H'),lastL=[...(swings||[])].reverse().find(x=>x.type==='L');
 if(!lastH||!lastL||lastH.id===lastL.id)return null;
 const low=Math.min(lastH.price,lastL.price),high=Math.max(lastH.price,lastL.price),range=high-low;if(!(range>0))return null;
 const bullish=lastL.occurredAt>lastH.occurredAt?false:true,from=bullish?low:high,to=bullish?high:low;
 const levels={};for(const r of[.382,.5,.618,.786])levels[r]=bullish?high-range*r:low+range*r;
 return{low,high,direction:bullish?'up':'down',levels,currentPrice:num(currentPrice)}
}
function vpvr(candles,{bins=24,lookback=180}={}){
 const rows=(candles||[]).slice(-lookback).filter(x=>finite(x.volume));if(!rows.length)return null;
 const lo=Math.min(...rows.map(x=>x.low)),hi=Math.max(...rows.map(x=>x.high));if(!(hi>lo))return null;
 const size=(hi-lo)/bins,arr=Array.from({length:bins},(_,i)=>({low:lo+i*size,high:lo+(i+1)*size,volume:0}));
 for(const c of rows){const tp=(Number(c.high)+Number(c.low)+Number(c.close))/3,idx=Math.max(0,Math.min(bins-1,Math.floor((tp-lo)/size)));arr[idx].volume+=Number(c.volume)||0}
 const total=arr.reduce((s,x)=>s+x.volume,0),poc=arr.reduce((a,b)=>b.volume>a.volume?b:a,arr[0]),rank=[...arr].sort((a,b)=>b.volume-a.volume);
 let acc=0,chosen=[];for(const x of rank){chosen.push(x);acc+=x.volume;if(acc>=total*.7)break}
 const val=Math.min(...chosen.map(x=>x.low)),vah=Math.max(...chosen.map(x=>x.high));
 return{poc:(poc.low+poc.high)/2,val,vah,bins:arr,totalVolume:total}
}

function hammerSignals(candles,{lookback=8}={}){
 const out=[],start=Math.max(1,candles.length-lookback);
 for(let i=start;i<candles.length;i++){const c=candles[i],body=Math.max(Math.abs(c.close-c.open),Math.abs(c.close)*.00005),lower=Math.min(c.open,c.close)-c.low,upper=c.high-Math.max(c.open,c.close),prior=candles.slice(Math.max(0,i-6),i);if(prior.length<3)continue;
  const down=prior.at(-1).close<prior[0].close;
  if(down&&lower>=body*2&&upper<=body*.9)out.push({kind:'HAMMER',side:'bull',index:i,time:c.closeTime,low:c.low,high:c.high,body,lowerWick:lower})
 }
 return out
}
function rvolAt(candles,index,period=20){
 if(index<period)return null;const cur=num(candles[index]?.volume),prev=candles.slice(index-period,index).map(x=>num(x?.volume));if(cur==null||prev.some(x=>x==null))return null;const a=prev.reduce((s,x)=>s+x,0)/period;return a>0?cur/a:null
}
function volumeEcho(candles,emas,{hours=72,minAgeHours=3}={}){
 if(candles.length<25)return null;const end=Number(candles.at(-1).closeTime),from=end-hours*3600000,to=end-minAgeHours*3600000;let anchor=null;
 for(let i=20;i<candles.length-1;i++){const c=candles[i];if(c.closeTime<from||c.closeTime>to)continue;const r=rvolAt(candles,i,20);if(r!=null&&r>=2)anchor={index:i,time:c.closeTime,rvol:r,close:c.close,low:c.low}}
 if(!anchor)return null;const currentRvol=rvolAt(candles,candles.length-1,20),last=candles.at(-1),e14=num(emas?.[14]?.at(-1)),retained=last.close>=anchor.close*.97&&last.low>=anchor.low*.97,emaHold=e14!=null&&last.close>=e14;
 return{anchor,currentRvol,retained,ema14Hold:emaHold,active:retained&&emaHold&&(currentRvol==null||currentRvol<=1.2)}
}
function specialSetups(candles,emas,timeframe,currentPrice){
 const tf=String(timeframe||'').toLowerCase(),i=candles.length-1,px=num(currentPrice),out={daily92142:null,fourHLongEmaSupport:null};
 if(tf==='1d'){
  const e92=num(emas?.[92]?.[i]),e142=num(emas?.[142]?.[i]);if(e92!=null&&e142!=null&&px!=null){const dist142=(px/e142-1)*100;out.daily92142={ema92:e92,ema142:e142,price:px,distanceTo142Pct:dist142,above92:px>=e92,near142:Math.abs(dist142)<=3,ready:px>=e92&&px<e142&&dist142>=-3}}
 }
 if(tf==='4h'){
  const periods=[224,268,378,448],levels=periods.map(p=>({period:p,value:num(emas?.[p]?.[i])})).filter(x=>x.value!=null);if(levels.length&&px!=null){const nearest=levels.sort((a,b)=>Math.abs(px/a.value-1)-Math.abs(px/b.value-1))[0],dist=(px/nearest.value-1)*100;out.fourHLongEmaSupport={levels,nearest,distancePct:dist,holding:dist>=-.8&&dist<=3,reclaimed:dist>=0&&dist<=3}}
 }
 return out
}

function summary(candles,swings,{atrSeries=[],currentPrice=null,timeframe=null}={}){
 const i=candles.length-1,emas=emaPack(candles),r=rsi(candles),m=macd(candles),o=obv(candles),ichi=ichimoku(candles),comp=compression(emas,i),liq=liquidity(candles,swings,{atrNow:atrSeries[i],currentPrice}),sweep=sweeps(candles,liq),fg=fvg(candles,{atrSeries}),ob=orderBlocks(candles,{atrSeries}),fibx=fib(swings,currentPrice),vp=vpvr(candles),hammers=hammerSignals(candles),echo=volumeEcho(candles,emas),special=specialSetups(candles,emas,timeframe,currentPrice);
 const e14=num(emas[14]?.[i]),e28=num(emas[28]?.[i]),e57=num(emas[57]?.[i]),e92=num(emas[92]?.[i]),px=num(currentPrice);
 const trend=e14&&e28&&e57&&e92?(e14>e28&&e28>e57&&e57>e92?'BULL':e14<e28&&e28<e57&&e57<e92?'BEAR':'MIXED'):'UNKNOWN';
 return{ema:emas,compressionPct:comp,compressionState:comp==null?'N/A':comp<=5?'STRONG':comp<=10?'COMPRESSED':'OPEN',emaTrend:trend,emaSlope14:slope(emas[14],i,5),
  rsi:{series:r,value:num(r[i]),divergence:divergence(candles,r)},macd:{...m,lineNow:num(m.line[i]),signalNow:num(m.signal[i]),histNow:num(m.hist[i]),histPrev:num(m.hist[i-1]),improving:finite(m.hist[i])&&finite(m.hist[i-1])?m.hist[i]>m.hist[i-1]:null,divergence:divergence(candles,m.line)},obv:{series:o,value:num(o[i]),slope5:slope(o,i,5),divergence:divergence(candles,o)},ichimoku:{...ichi,conversionNow:num(ichi.conversion[i]),baseNow:num(ichi.base[i]),spanANow:num(ichi.spanA[i]),spanBNow:num(ichi.spanB[i])},
  fvg:fg,orderBlocks:ob,liquidity:liq,sweeps:sweep,hammers,volumeEcho:echo,specialSetups:special,fib:fibx,vpvr:vp,longEmaDistance:{ema142:eDist(px,emas[142]?.[i]),ema224:eDist(px,emas[224]?.[i]),ema268:eDist(px,emas[268]?.[i]),ema378:eDist(px,emas[378]?.[i]),ema448:eDist(px,emas[448]?.[i])}}
}
function eDist(px,e){return finite(px)&&finite(e)&&Number(e)!==0?(Number(px)/Number(e)-1)*100:null}
return{rsi,macd,obv,ichimoku,emaPack,compression,slope,divergence,fvg,orderBlocks,liquidity,sweeps,hammerSignals,volumeEcho,specialSetups,fib,vpvr,summary};
});