'use strict';
const {executionCostModel}=require('./crypto-data-engine.js');

function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function clean(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')}
function idFor({symbol,presetId,signalTime}={}){const s=clean(symbol),p=String(presetId||'').trim(),t=n(signalTime);if(!s||!p||t==null)throw new Error('symbol presetId signalTime required');return[s,p,Math.trunc(t)].join(':')}
function createPaperTradingService({store,now=()=>Date.now()}={}){
  if(!store||typeof store.putPaperTrade!=='function')throw new Error('paper trade store required');
  async function open(input={}){
    const symbol=clean(input.symbol),presetId=String(input.presetId||''),signalTime=n(input.signalTime),entryPrice=n(input.entryPrice);
    if(!symbol||!presetId||signalTime==null||!(entryPrice>0))throw new Error('paper trade fields required');
    const id=idFor({symbol,presetId,signalTime});
    const prior=await store.getPaperTrade(id);if(prior)return prior;
    const costs=executionCostModel({marketType:input.marketType||'spot',notional:n(input.notional)??1000,...(input.costAssumptions||{}),fundingRatePct:n(input.fundingRatePct)??0});
    const trade={
      id,symbol,presetId,ruleVersion:String(input.ruleVersion||''),state:'OPEN',signalTime,
      nextEligibleExecutionTime:n(input.nextEligibleExecutionTime),entryTime:n(input.entryTime)??now(),entryPrice,
      quantity:n(input.quantity),notional:n(input.notional)??1000,marketType:String(input.marketType||'spot'),
      costs,featureSnapshot:input.featureSnapshot||{},invalidation:input.invalidation||null,target:input.target||null,
      lastMarkPrice:entryPrice,lastMarkTime:n(input.entryTime)??now(),unrealizedReturnPct:0,realizedReturnPct:null,
      createdAt:now(),updatedAt:now(),notes:Array.isArray(input.notes)?input.notes.slice(0,10):[]
    };
    await store.putPaperTrade(id,trade);return trade;
  }
  async function mark({id,price,time,fundingRatePct=null}={}){
    const prior=await store.getPaperTrade(id);if(!prior)throw new Error('paper trade not found');
    if(prior.state!=='OPEN')return prior;
    const p=n(price),t=n(time)??now();if(!(p>0))throw new Error('mark price required');
    const gross=((p/prior.entryPrice)-1)*100,costPct=Number(prior.costs?.oneWayPct||0)+(n(fundingRatePct)!=null?Math.abs(n(fundingRatePct)):0);
    const next={...prior,lastMarkPrice:p,lastMarkTime:t,unrealizedReturnPct:gross-costPct,updatedAt:now()};
    await store.putPaperTrade(id,next);return next;
  }
  async function close({id,price,time,reason='manual',fundingRatePct=null}={}){
    const prior=await store.getPaperTrade(id);if(!prior)throw new Error('paper trade not found');
    if(prior.state==='CLOSED')return prior;
    const p=n(price),t=n(time)??now();if(!(p>0))throw new Error('close price required');
    const funding=n(fundingRatePct)??0;
    const totalCosts=executionCostModel({marketType:prior.marketType,notional:prior.notional,feeBps:prior.costs?.assumptions?.feeBps,spreadBps:prior.costs?.assumptions?.spreadBps,slippageBps:prior.costs?.assumptions?.slippageBps,fundingRatePct:funding});
    const gross=((p/prior.entryPrice)-1)*100;
    const next={...prior,state:'CLOSED',exitPrice:p,exitTime:t,exitReason:String(reason||'manual'),grossReturnPct:gross,realizedReturnPct:gross-totalCosts.roundTripPct,unrealizedReturnPct:null,lastMarkPrice:p,lastMarkTime:t,totalCosts,updatedAt:now()};
    await store.putPaperTrade(id,next);return next;
  }
  async function list({state=null,symbol=null,limit=200}={}){
    let rows=await store.listPaperTrades();const st=state?String(state).toUpperCase():null,sym=symbol?clean(symbol):null;
    rows=rows.filter(x=>(!st||x.state===st)&&(!sym||x.symbol===sym)).sort((a,b)=>Number(b.signalTime)-Number(a.signalTime));
    return rows.slice(0,Math.max(1,Math.min(1000,Number(limit)||200)));
  }
  async function stats(){
    const rows=await store.listPaperTrades(),closed=rows.filter(x=>x.state==='CLOSED'&&Number.isFinite(Number(x.realizedReturnPct))),openRows=rows.filter(x=>x.state==='OPEN');
    const vals=closed.map(x=>Number(x.realizedReturnPct)),wins=vals.filter(x=>x>0);
    return{total:rows.length,open:openRows.length,closed:closed.length,winRate:vals.length?wins.length/vals.length:null,meanReturnPct:vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null};
  }
  return{open,mark,close,list,stats};
}
module.exports={idFor,createPaperTradingService};
