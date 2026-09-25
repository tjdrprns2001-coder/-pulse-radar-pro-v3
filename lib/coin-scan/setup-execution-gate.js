'use strict';

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function avg(a=[]){const x=a.filter(Number.isFinite);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null}
function stdev(a=[]){const x=a.filter(Number.isFinite);if(x.length<2)return null;const m=avg(x);return Math.sqrt(avg(x.map(v=>(v-m)**2)))}
function zscore(v,h=[]){const m=avg(h),s=stdev(h);return v!=null&&m!=null&&s>0?(v-m)/s:null}
function kClose(r){return Array.isArray(r)?finite(r[4]):finite(r?.close)}
function kHigh(r){return Array.isArray(r)?finite(r[2]):finite(r?.high)}
function kLow(r){return Array.isArray(r)?finite(r[3]):finite(r?.low)}
function kCloseTime(r){return Array.isArray(r)?finite(r[6]):finite(r?.closeTime)}
function closedRows(rows=[],now=Date.now()){return(Array.isArray(rows)?rows:[]).filter(r=>{const ct=kCloseTime(r);return ct==null||ct<=now})}
function kQuoteVolume(r){
  if(Array.isArray(r)){const q=finite(r[7]);if(q!=null)return q;const v=finite(r[5]),c=finite(r[4]);return v!=null&&c!=null?v*c:null}
  return finite(r?.quoteVolume);
}
function executionMetrics(execution={}){
  const rows=[execution?.spot,execution?.futures].filter(x=>x?.available);
  if(!rows.length)return{available:false,spreadBps:null,depth10Usd:null,maxSlippageBps:null,hardReject:true,reasons:['execution_unavailable']};
  const spreads=rows.map(x=>finite(x.spreadBps)).filter(Number.isFinite);
  const depths=rows.flatMap(x=>[finite(x.depthUsd?.bid10bps),finite(x.depthUsd?.ask10bps)]).filter(Number.isFinite);
  const slips=rows.flatMap(x=>[...(x.slippage?.buy||[]),...(x.slippage?.sell||[])]).filter(Boolean).filter(x=>(finite(x.notional)||0)>=10000).map(x=>finite(x.slippageBps)).filter(Number.isFinite);
  const spread=spreads.length?Math.max(...spreads):null,depth=depths.length?Math.min(...depths):null,slip=slips.length?Math.max(...slips):null;
  const reasons=[];
  if(spread==null||spread>25)reasons.push('spread_limit');
  if(depth==null||depth<10000)reasons.push('depth_limit');
  if(slip!=null&&slip>50)reasons.push('slippage_limit');
  return{available:true,spreadBps:spread,depth10Usd:depth,maxSlippageBps:slip,hardReject:reasons.length>0,reasons};
}
function spotVolumeSignal(rows=[],now=Date.now()){
  const q=closedRows(rows,now).map(kQuoteVolume).filter(Number.isFinite);
  if(q.length<21)return{available:false,z:null,confirmed:false};
  const last=q.at(-1),hist=q.slice(-21,-1),z=zscore(last,hist);
  return{available:true,z,confirmed:z!=null&&z>=1.0,lastQuoteVolume:last,baseline:avg(hist)};
}
function nearestOpposingLiquidity(frames={},entry=null,now=Date.now()){
  const rows=closedRows(Array.isArray(frames?.['1h'])?frames['1h']:[],now);
  if(!rows.length||entry==null)return null;
  const highs=rows.slice(-60).map(kHigh).filter(x=>Number.isFinite(x)&&x>entry);
  return highs.length?Math.min(...highs):null;
}
function atr(rows=[],period=14,now=Date.now()){
  const a=closedRows(Array.isArray(rows)?rows:[],now);if(a.length<period+1)return null;const tr=[];
  for(let i=1;i<a.length;i++){const h=kHigh(a[i]),l=kLow(a[i]),pc=kClose(a[i-1]);if(h==null||l==null||pc==null)continue;tr.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)))}
  return avg(tr.slice(-period));
}
function costAdjustedR({entry,stop,target,feeBps=4,slippageBps=5,fundingBps=0}={}){
  entry=finite(entry);stop=finite(stop);target=finite(target);if(entry==null||stop==null||target==null||entry<=stop||target<=entry)return{available:false,netR:null};
  const risk=entry-stop,gross=target-entry;
  const totalBps=Math.max(0,finite(feeBps)||0)+Math.max(0,finite(slippageBps)||0)+Math.max(0,Math.abs(finite(fundingBps)||0));
  const cost=entry*totalBps/10000;
  const riskAfter=risk+cost,profitAfter=gross-cost;
  return{available:true,entry,stop,target,grossR:gross/risk,netR:riskAfter>0?profitAfter/riskAfter:null,cost,totalBps};
}
function bottomRisk({features,frames,execution,fundingRate,feeBps=4,now=Date.now()}={}){
  const s=features?.bottom?.evidence?.bottomStruct||{},r5=closedRows(frames?.['5m']||[],now),r15=closedRows(frames?.['15m']||[],now),entry=kClose(r5.at(-1))??kClose(r15.at(-1));
  const a=atr(r5,14,now)||atr(r15,14,now);
  const sweep=finite(s.sweepLow);const stop=sweep!=null&&a!=null?sweep-Math.max(.10*a,0):null;
  const target=nearestOpposingLiquidity(frames,entry,now);
  const ex=executionMetrics(execution);const slip=ex.maxSlippageBps??5;
  const fundingBps=Math.abs(finite(fundingRate)||0)*100;
  return costAdjustedR({entry,stop,target,feeBps,slippageBps:slip,fundingBps});
}
function breakoutRisk({features,frames,execution,fundingRate,feeBps=4,now=Date.now()}={}){
  const e=features?.breakout?.evidence?.breakout||{},r5=closedRows(frames?.['5m']||[],now),r15=closedRows(frames?.['15m']||[],now),entry=kClose(r5.at(-1))??kClose(r15.at(-1));
  const a=atr(r5,14,now)||atr(r15,14,now);
  const rl=finite(e.retestLow);const stop=rl!=null&&a!=null?rl-Math.max(.10*a,0):null;
  const target=nearestOpposingLiquidity(frames,entry,now);
  const ex=executionMetrics(execution);const slip=ex.maxSlippageBps??5;
  const fundingBps=Math.abs(finite(fundingRate)||0)*100;
  return costAdjustedR({entry,stop,target,feeBps,slippageBps:slip,fundingBps});
}
function apply({item,frames={},execution={},spot15m=[],eventRisk=null,sequenceGap=false,feeBps=4}={}){
  if(!item?.setupFeatures)return item;
  const causalNow=finite(item.updatedAt)??Date.now(),ex=executionMetrics(execution),spot=spotVolumeSignal(spot15m,causalNow),funding=finite(item.fundingRate);
  const bottomR=bottomRisk({features:item.setupFeatures,frames,execution,fundingRate:funding,feeBps,now:causalNow});
  const breakoutR=breakoutRisk({features:item.setupFeatures,frames,execution,fundingRate:funding,feeBps,now:causalNow});
  const hardReject=ex.hardReject||eventRisk?.hard===true||sequenceGap===true;
  const b=item.setupFeatures.bottom||{},p=item.setupFeatures.breakout||{};
  const fallingKnife=Boolean((b.sweepLowCloseBreak||b.zoneCloseBreak)||((item.oi4hChangePct??0)>0&&(item.priceChange1h??0)<0&&!b.mssConfirmed));
  const fakeBreakout=Boolean((p.closeAboveResistance&&!p.breakoutBodyConfirmed)||(!spot.confirmed&&p.closeAboveResistance)||(p.closeBackBelowResistance));
  item.setupExecution={execution:ex,spotVolume:spot,bottomRisk:bottomR,breakoutRisk:breakoutR,fallingKnife,fakeBreakout};
  item.setupFeatures.bottom={...b,executionPass:!hardReject&&!fallingKnife,netRPass:bottomR.netR!=null&&bottomR.netR>=1.5,hardReject:hardReject||fallingKnife,eventRiskHard:eventRisk?.hard===true,sequenceGap:Boolean(sequenceGap),evidence:{...(b.evidence||{}),execution:ex,spotVolume:spot,risk:bottomR,fallingKnife}};
  const oi4=finite(item.oi4hChangePct),crowding=oi4!=null&&oi4>2&&funding!=null&&funding>.03&&!spot.confirmed;
  item.setupFeatures.breakout={...p,spotVolumeConfirmed:spot.confirmed,volumeConfirmed:Boolean(p.futuresVolumeConfirmed)&&spot.confirmed,executionPass:!hardReject&&!fakeBreakout,netRPass:breakoutR.netR!=null&&breakoutR.netR>=1.5,hardReject:hardReject||fakeBreakout,eventRiskHard:eventRisk?.hard===true,sequenceGap:Boolean(sequenceGap),crowdingReject:crowding,evidence:{...(p.evidence||{}),execution:ex,spotVolume:spot,risk:breakoutR,fakeBreakout,crowding}};
  return item;
}
module.exports={executionMetrics,spotVolumeSignal,costAdjustedR,bottomRisk,breakoutRisk,apply,closedRows};
