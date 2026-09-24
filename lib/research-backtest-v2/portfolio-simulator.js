'use strict';

function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}
function positionSize({equity,entryPrice,stopPrice,riskPct=.25,maxWeightPct=10}={}){
 const eq=finite(equity),entry=finite(entryPrice),stop=finite(stopPrice),risk=finite(riskPct),cap=finite(maxWeightPct);
 if(!(eq>0)||!(entry>0)||!(stop>0)||!(entry>stop)||!(risk>0)||!(cap>0))return{valid:false,quantity:0,notional:0,riskBudget:null,reason:'invalid-input'};
 const riskBudget=eq*(risk/100),perUnit=entry-stop,byRisk=riskBudget/perUnit,byWeight=eq*(cap/100)/entry,quantity=Math.max(0,Math.min(byRisk,byWeight));
 return{valid:quantity>0,quantity,notional:quantity*entry,riskBudget,perUnitRisk:perUnit,maxWeightPct:cap,riskPct:risk};
}
function simulatePortfolio(trades=[],opts={}){
 const initial=finite(opts.initialEquity)??10000,maxOpen=Math.max(1,Math.trunc(Number(opts.maxOpenPositions)||4)),riskPct=finite(opts.riskPct)??.25,maxWeightPct=finite(opts.maxWeightPct)??10;
 let equity=initial;const accepted=[],rejected=[],open=[];
 const rows=(trades||[]).filter(x=>x?.status==='filled').slice().sort((a,b)=>(a.entryTime||0)-(b.entryTime||0));
 for(const t of rows){
   for(let i=open.length-1;i>=0;i--)if(Number(open[i].exitTime)<=Number(t.entryTime)){equity+=open[i].pnl;open.splice(i,1)}
   if(open.length>=maxOpen){rejected.push({...t,rejectReason:'max-open-positions'});continue}
   const stop=finite(t.stopPrice);if(!(stop>0&&stop<t.entryPrice)){rejected.push({...t,rejectReason:'invalid-stop'});continue}
   const size=positionSize({equity,entryPrice:t.entryPrice,stopPrice:stop,riskPct,maxWeightPct});if(!size.valid){rejected.push({...t,rejectReason:size.reason});continue}
   const pnl=size.notional*(Number(t.netReturnPct)||0)/100,rec={...t,quantity:size.quantity,notional:size.notional,riskBudget:size.riskBudget,pnl,equityAtEntry:equity};
   accepted.push(rec);open.push(rec);
 }
 open.sort((a,b)=>Number(a.exitTime)-Number(b.exitTime));for(const t of open)equity+=t.pnl;
 return{initialEquity:initial,endingEquity:equity,acceptedCount:accepted.length,rejectedCount:rejected.length,accepted,rejected,maxOpenPositions:maxOpen,riskPct,maxWeightPct,totalReturnPct:(equity/initial-1)*100};
}
module.exports={positionSize,simulatePortfolio};
