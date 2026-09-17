'use strict';
const Core=require('./core.js');
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}
function initialOutcome(snapshot){
  const horizons={};for(const [key,targetTs] of Object.entries(snapshot.targets||{}))horizons[key]={status:'pending',targetTs};
  return{id:snapshot.id,symbol:snapshot.symbol,scanClassKey:snapshot.scanClassKey,horizons,updatedAt:snapshot.capturedAt};
}
function createSignalPerformanceService({store,resolver,now=()=>Date.now(),maxEvaluationsPerRun=12}={}){
  if(!store)throw new Error('signal performance store required');if(!resolver)throw new Error('signal performance resolver required');
  async function recordItems(items=[]){
    const result={recorded:0,duplicate:0,skipped:0,errors:[]};
    for(const item of Array.isArray(items)?items:[]){
      try{
        const key=String(item?.scanClass?.key||item?.scanClassKey||'');const live=String(item?.dataState||'').toLowerCase()==='live';const price=finite(item?.lastPrice??item?.entryPrice);
        if(!live||!Core.isEligibleClass(key)||price==null||price<=0){result.skipped++;continue}
        const capturedAt=finite(item?.updatedAt)??finite(item?.capturedAt)??now();
        const snapshot=Core.buildSnapshot({...item,scanClassKey:key,capturedAt,entryPrice:price});
        const inserted=await store.putSnapshot(snapshot);
        if(!inserted){result.duplicate++;continue}
        await store.putOutcome(snapshot.id,initialOutcome(snapshot));result.recorded++;
      }catch(e){result.errors.push(String(e?.message||e))}
    }
    return result;
  }
  async function evaluateDue(){
    const result={evaluated:0,unavailable:0,attempted:0,pending:0,errors:[]};const ts=now();
    let snapshots=[];try{snapshots=await store.listSnapshots()}catch(e){result.errors.push(String(e?.message||e));return result}
    outer:for(const snapshot of snapshots){
      let outcome;try{outcome=await store.getOutcome(snapshot.id)||initialOutcome(snapshot)}catch(e){result.errors.push(String(e?.message||e));continue}
      let changed=false;
      for(const key of Object.keys(Core.HORIZONS)){
        const targetTs=finite(snapshot.targets?.[key])??finite(outcome.horizons?.[key]?.targetTs);const current=outcome.horizons?.[key]||{status:'pending',targetTs};
        if(current.status==='evaluated'||current.status==='unavailable')continue;
        if(targetTs==null||ts<targetTs){result.pending++;continue}
        if(result.attempted>=maxEvaluationsPerRun)break outer;
        result.attempted++;
        try{
          const resolved=await resolver.resolve(snapshot.symbol,targetTs,ts);
          if(resolved?.status==='evaluated'){
            outcome.horizons[key]={status:'evaluated',targetTs,marketTs:resolved.marketTs,price:resolved.price,returnPct:Core.returnPct(snapshot.entryPrice,resolved.price)};result.evaluated++;changed=true;
          }else if(resolved?.status==='unavailable'){
            outcome.horizons[key]={status:'unavailable',targetTs};result.unavailable++;changed=true;
          }else result.pending++;
        }catch(e){result.errors.push(`${snapshot.id}:${key}:${String(e?.message||e)}`);result.pending++}
      }
      if(changed){outcome.updatedAt=ts;try{await store.putOutcome(snapshot.id,outcome)}catch(e){result.errors.push(String(e?.message||e))}}
    }
    return result;
  }
  async function getPerformance({classKey=null,horizon=null,symbol=null,limit=50}={}){
    const snapshots=await store.listSnapshots(),outcomes=await store.listOutcomes();const outcomeMap=new Map(outcomes.map(x=>[x.id,x]));
    const sym=symbol?String(symbol).toUpperCase():null,cls=classKey?String(classKey):null;
    const rows=snapshots.filter(x=>(!cls||x.scanClassKey===cls)&&(!sym||x.symbol===sym)).map(snapshot=>({snapshot,outcome:outcomeMap.get(snapshot.id)||initialOutcome(snapshot)}));
    const byClass=new Map();for(const row of rows){if(!byClass.has(row.snapshot.scanClassKey))byClass.set(row.snapshot.scanClassKey,[]);byClass.get(row.snapshot.scanClassKey).push(row)}
    const classes=[];
    for(const [key,classRows] of byClass){
      const horizons={};for(const h of Object.keys(Core.HORIZONS)){const records=classRows.map(r=>r.outcome.horizons?.[h]||{status:'pending',targetTs:r.snapshot.targets?.[h]});horizons[h]=Core.aggregate(records,30)}
      classes.push({key,label:classRows[0]?.snapshot?.scanClassLabel||key,sampleCount:classRows.length,horizons});
    }
    const order=[...Core.ELIGIBLE];classes.sort((a,b)=>order.indexOf(a.key)-order.indexOf(b.key));
    let recent=rows.map(({snapshot,outcome})=>({id:snapshot.id,symbol:snapshot.symbol,scanClassKey:snapshot.scanClassKey,scanClassLabel:snapshot.scanClassLabel,capturedAt:snapshot.capturedAt,entryPrice:snapshot.entryPrice,tradeSignal:snapshot.tradeSignal,horizons:outcome.horizons})).sort((a,b)=>b.capturedAt-a.capturedAt);
    if(horizon&&Core.HORIZONS[horizon]==null)recent=[];recent=recent.slice(0,Math.max(1,Math.min(200,Number(limit)||50)));
    return{generatedAt:now(),classes,recent,filters:{classKey:cls,horizon:horizon||null,symbol:sym}};
  }
  return{recordItems,evaluateDue,getPerformance};
}
module.exports={initialOutcome,createSignalPerformanceService};
