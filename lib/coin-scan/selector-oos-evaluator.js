'use strict';
function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function mean(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:null}
function maxDrawdown(returns=[]){let eq=1,peak=1,dd=0;for(const r of returns){eq*=1+r;peak=Math.max(peak,eq);dd=Math.min(dd,eq/peak-1)}return dd}
function metrics(rows=[]){
  const rets=rows.map(x=>n(x.net_return??x.return)).filter(v=>v!=null),wins=rets.filter(x=>x>0).length;
  return{sampleCount:rets.length,expectancy:mean(rets),hitRate:rets.length?wins/rets.length:null,maxDrawdown:maxDrawdown(rets),coverage:rows.length?rows.filter(x=>x.selected).length/rows.length:null,falseRejectionRate:(()=>{const r=rows.filter(x=>!x.selected&&n(x.net_return??x.return)>0);const d=rows.filter(x=>!x.selected);return d.length?r.length/d.length:null})()};
}
function applyCost(row,cost={feeBps:0,slippageBps:0,fundingBps:0}){const gross=n(row.return)??0,c=(Number(cost.feeBps||0)+Number(cost.slippageBps||0)+Number(cost.fundingBps||0))/10000;return{...row,net_return:gross-c}}
function modelSelect(row,model){
  if(model==='A')return Boolean(row.market_ok&&row.ict_ok&&row.execution_ok&&row.data_ok);
  if(model==='B')return Boolean(modelSelect(row,'A')&&row.onchain_ok!==false);
  if(model==='C')return Boolean(modelSelect(row,'A')&&row.catalyst_ok!==false);
  if(model==='D')return Boolean(modelSelect(row,'A')&&row.onchain_ok!==false&&row.catalyst_ok!==false);
  throw new Error('unknown model');
}
function evaluateAblation(rows=[],cost={}){
  const out={};for(const model of ['A','B','C','D']){const mapped=rows.map(r=>applyCost({...r,selected:modelSelect(r,model)},cost));out[model]=metrics(mapped)}
  out.lift={B_minus_A:(out.B.expectancy??0)-(out.A.expectancy??0),C_minus_A:(out.C.expectancy??0)-(out.A.expectancy??0),D_minus_A:(out.D.expectancy??0)-(out.A.expectancy??0)};
  return out;
}
function splitChronological(rows=[]){const sorted=rows.slice().sort((a,b)=>Number(a.decision_time)-Number(b.decision_time)),n=sorted.length,a=Math.floor(n*.5),b=Math.floor(n*.75);return{train:sorted.slice(0,a),validation:sorted.slice(a,b),lockedOos:sorted.slice(b)}}
function walkForward(rows=[],{train=50,validation=25,test=25}={}){
  const sorted=rows.slice().sort((a,b)=>Number(a.decision_time)-Number(b.decision_time)),out=[];
  for(let i=0;i+train+validation+test<=sorted.length;i+=test)out.push({train:sorted.slice(i,i+train),validation:sorted.slice(i+train,i+train+validation),test:sorted.slice(i+train+validation,i+train+validation+test)});
  return out;
}
function lockedOosReport(rows=[],cost={}){
  const s=splitChronological(rows);return{split:{train:s.train.length,validation:s.validation.length,lockedOos:s.lockedOos.length},train:evaluateAblation(s.train,cost),validation:evaluateAblation(s.validation,cost),lockedOos:evaluateAblation(s.lockedOos,cost),locked:true};
}
module.exports={metrics,applyCost,modelSelect,evaluateAblation,splitChronological,walkForward,lockedOosReport};
