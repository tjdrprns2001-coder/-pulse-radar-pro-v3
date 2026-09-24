'use strict';
const {executionCostModel}=require('./crypto-data-engine.js');
const {emaSeries,atr}=require('./dante-presets.js');

function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function field(r,k,i){return n(Array.isArray(r)?r[i]:r?.[k])}
function open(r){return field(r,'open',1)} function high(r){return field(r,'high',2)} function low(r){return field(r,'low',3)} function close(r){return field(r,'close',4)}
function time(r){return n(Array.isArray(r)?r[0]:r?.openTime??r?.time)}
function pct(a,b){return a>0&&Number.isFinite(b)?((b/a)-1)*100:null}
function round(v,d=10){if(!Number.isFinite(v))return null;const p=10**d;return Math.round(v*p)/p}

function buildExitSignals(rows,policy={}){
  const closes=rows.map(close),e20=emaSeries(closes,20),e112=emaSeries(closes,112);
  return rows.map((r,i)=>({
    ema20:e20[i],ema112:e112[i],close:closes[i],
    below20_2:i>=1&&Number.isFinite(e20[i])&&Number.isFinite(e20[i-1])&&closes[i]<e20[i]&&closes[i-1]<e20[i-1],
    below112_2:i>=1&&Number.isFinite(e112[i])&&Number.isFinite(e112[i-1])&&closes[i]<e112[i]&&closes[i-1]<e112[i-1]
  }));
}
function simulateTrade({rows,signalIndex,marketType='spot',costAssumptions={},exitPolicy={type:'ema20-2close',maxHoldBars:30,atrStopMultiple:1.5},fundingRatePct=0}={}){
  if(!Array.isArray(rows)||rows.length<3)throw new Error('rows required');
  const s=Math.trunc(Number(signalIndex));if(!(s>=0&&s<rows.length-1))return{status:'unfillable',reason:'no-next-bar'};
  const entryIndex=s+1,entry=open(rows[entryIndex]);if(!(entry>0))return{status:'unfillable',reason:'invalid-next-bar-open'};
  const costs=executionCostModel({marketType,notional:10000,...costAssumptions,fundingRatePct});
  const stopAtr=atr(rows.slice(0,entryIndex+1),20),stop=stopAtr&&exitPolicy.atrStopMultiple?entry-stopAtr*Number(exitPolicy.atrStopMultiple):null;
  const flags=buildExitSignals(rows,exitPolicy),maxHold=Math.max(1,Math.trunc(Number(exitPolicy.maxHoldBars)||30));
  let exitIndex=Math.min(rows.length-1,entryIndex+maxHold),reason='max-hold';
  let mfe=-Infinity,mae=Infinity;
  for(let i=entryIndex;i<=Math.min(rows.length-1,entryIndex+maxHold);i++){
    const h=high(rows[i]),l=low(rows[i]);if(Number.isFinite(h))mfe=Math.max(mfe,pct(entry,h));if(Number.isFinite(l))mae=Math.min(mae,pct(entry,l));
    if(stop!=null&&Number.isFinite(l)&&l<=stop){exitIndex=i;reason='atr-stop';break}
    if(exitPolicy.type==='ema112-2close'&&flags[i].below112_2){exitIndex=i;reason='ema112-2close';break}
    if(exitPolicy.type==='ema20-2close'&&flags[i].below20_2){exitIndex=i;reason='ema20-2close';break}
  }
  const rawExit=reason==='atr-stop'&&stop!=null?stop:close(rows[exitIndex]);
  if(!(rawExit>0))return{status:'unfillable',reason:'invalid-exit-price'};
  const gross=pct(entry,rawExit),net=gross-costs.roundTripPct;
  return{status:'filled',entryIndex,exitIndex,entryTime:time(rows[entryIndex]),exitTime:time(rows[exitIndex]),entryPrice:entry,exitPrice:rawExit,exitReason:reason,grossReturnPct:round(gross),netReturnPct:round(net),mfePct:round(mfe),maePct:round(mae),holdingBars:exitIndex-entryIndex+1,costs,stopPrice:round(stop)};
}
function simulateSignals({rows,signals,marketType='spot',costAssumptions={},exitPolicy={}}={}){
  const out=[];for(const sig of signals||[]){const t=simulateTrade({rows,signalIndex:sig.index,marketType,costAssumptions,exitPolicy,fundingRatePct:sig.fundingRatePct||0});out.push({...t,signal:sig})}return out;
}
module.exports={buildExitSignals,simulateTrade,simulateSignals};
