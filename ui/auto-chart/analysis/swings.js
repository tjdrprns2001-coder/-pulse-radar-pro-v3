(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartSwings=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
function normalizeLabel(type,price,previous){if(!previous)return type;return type==='H'?(price>previous.price?'HH':price<previous.price?'LH':'EH'):(price>previous.price?'HL':price<previous.price?'LL':'EL')}
function extract(dataset){
  const candles=dataset?.candles||[],raw=dataset?.structureInput?.canonicalSwings||[],tf=dataset?.market?.interval||'';
  const out=[];let lastH=null,lastL=null;
  for(const s of [...raw].sort((a,b)=>Number(a.confirmedAt??a.pivotIndex)-Number(b.confirmedAt??b.pivotIndex)||Number(a.pivotIndex)-Number(b.pivotIndex))){
    const type=String(s.type||'').toUpperCase(),pivotIndex=Number(s.pivotIndex??s.index),confirmedAt=Number(s.confirmedAt??pivotIndex);
    if(!['H','L'].includes(type)||!Number.isInteger(pivotIndex)||!Number.isInteger(confirmedAt)||confirmedAt>=candles.length||pivotIndex>=candles.length)continue;
    const price=Number(s.price);if(!Number.isFinite(price))continue;
    const prev=type==='H'?lastH:lastL,label=String(s.label||normalizeLabel(type,price,prev));
    const item={id:String(s.swingId||s.id||('SW-'+tf+'-'+type+'-'+pivotIndex)),kind:'swing',type,label,price,pivotIndex,confirmedAt,occurredAt:candles[pivotIndex].openTime,knownAt:candles[confirmedAt].closeTime,timeframe:tf,status:'confirmed',generation:'automatic'};
    out.push(item);if(type==='H')lastH=item;else lastL=item;
  }
  return out;
}
function provisional(dataset){
  const candles=dataset?.candles||[],raw=dataset?.structureInput?.provisionalPivots||[],tf=dataset?.market?.interval||'';
  return raw.map((s,i)=>{const pivotIndex=Number(s.i??s.pivotIndex??s.index),type=String(s.type||'').toUpperCase(),price=Number(s.price);if(!['H','L'].includes(type)||!Number.isInteger(pivotIndex)||pivotIndex<0||pivotIndex>=candles.length||!Number.isFinite(price))return null;return{id:String(s.id||('P-'+tf+'-'+type+'-'+pivotIndex+'-'+i)),kind:'swing',type,label:type,price,pivotIndex,confirmedAt:null,occurredAt:candles[pivotIndex].openTime,knownAt:null,timeframe:tf,status:'provisional',generation:'automatic'}}).filter(Boolean)
}
function classify(swings){
  const hs=swings.filter(x=>x.type==='H').slice(-2),ls=swings.filter(x=>x.type==='L').slice(-2);
  if(hs.length<2||ls.length<2)return{key:'UNCONFIRMED',label:'구조 미확정',evidence:[]};
  const hUp=hs[1].price>hs[0].price,hDown=hs[1].price<hs[0].price,lUp=ls[1].price>ls[0].price,lDown=ls[1].price<ls[0].price;
  if(hUp&&lUp)return{key:'UPTREND',label:'상승 추세',evidence:[hs[1].label,ls[1].label],knownAt:Math.max(hs[1].knownAt,ls[1].knownAt)};
  if(hDown&&lDown)return{key:'DOWNTREND',label:'하락 추세',evidence:[hs[1].label,ls[1].label],knownAt:Math.max(hs[1].knownAt,ls[1].knownAt)};
  return{key:'MIXED',label:'박스/전환 시도',evidence:[hs[1].label,ls[1].label],knownAt:Math.max(hs[1].knownAt,ls[1].knownAt)};
}
return{extract,provisional,classify};
});