'use strict';
const Core=require('./core.js');
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function rowOpenTs(row){return finite(Array.isArray(row)?row[0]:row?.openTime??row?.time??row?.timestamp)}
function rowCloseTs(row){return finite(Array.isArray(row)?row[6]:row?.closeTime??row?.closeTs)}
function trimFrames(frames,simulatedTs){
  const out={};
  for(const [tf,rows] of Object.entries(frames||{}))out[tf]=(Array.isArray(rows)?rows:[]).filter(row=>{
    const open=rowOpenTs(row),close=rowCloseTs(row);
    return open!=null&&close!=null&&open<=simulatedTs&&close<=simulatedTs;
  });
  return out;
}
function pendingOutcome(snapshot){const horizons={};for(const [key,targetTs] of Object.entries(snapshot.targets||{}))horizons[key]={status:'pending',targetTs};return{id:snapshot.id,source:'backfill',symbol:snapshot.symbol,scanClassKey:snapshot.scanClassKey,horizons,updatedAt:snapshot.capturedAt}}
function createBackfillService({provider,store,classifyAt,now=()=>Date.now(),maxStepsPerRun=24}={}){
  if(!provider||typeof provider.getHistoricalFrames!=='function')throw new Error('historical provider required');
  if(!store)throw new Error('backfill store required');
  if(typeof classifyAt!=='function')throw new Error('classifyAt required');
  const cap=Math.max(1,Math.min(500,Number(maxStepsPerRun)||24));
  async function run({jobId,symbols,startTs,endTs,stepMs=900000}={}){
    const id=String(jobId||'').trim();if(!id)throw new Error('jobId required');
    const list=[...new Set((Array.isArray(symbols)?symbols:[]).map(x=>String(x||'').toUpperCase()).filter(Boolean))];if(!list.length)throw new Error('symbols required');
    const start=finite(startTs),end=finite(endTs),step=finite(stepMs);if(start==null||end==null||end<start||step==null||step<=0)throw new Error('invalid backfill window');
    const prior=await store.getCheckpoint(id);if(prior?.complete)return{status:'complete',processed:0,recorded:0,checkpoint:prior,errors:[]};
    let ts=finite(prior?.nextTs)??start,processed=0,recorded=0;const errors=[];
    while(ts<=end&&processed<cap){
      for(const symbol of list){
        try{
          const raw=await provider.getHistoricalFrames(symbol,{startTs:start,endTs:end,simulatedTs:ts});
          const frames=trimFrames(raw,ts);
          const item=await classifyAt({symbol,frames,simulatedTs:ts});
          const key=String(item?.scanClass?.key||item?.scanClassKey||'');const price=finite(item?.lastPrice??item?.entryPrice);
          if(String(item?.dataState||'live').toLowerCase()==='live'&&Core.isEligibleClass(key)&&price!=null&&price>0){
            const snapshot=Core.buildSnapshot({...item,symbol,scanClassKey:key,capturedAt:ts,entryPrice:price,source:'backfill',version:'signal-backfill-v1'});
            if(await store.putSnapshot(snapshot)){await store.putOutcome(snapshot.id,pendingOutcome(snapshot));recorded++}
          }
        }catch(e){errors.push(`${symbol}:${ts}:${String(e?.message||e)}`)}
      }
      processed++;ts+=step;
      const checkpoint={jobId:id,nextTs:ts,startTs:start,endTs:end,stepMs:step,symbols:list,complete:ts>end,updatedAt:now()};await store.putCheckpoint(id,checkpoint);
    }
    const checkpoint=await store.getCheckpoint(id);return{status:checkpoint?.complete?'complete':'partial',processed,recorded,checkpoint,errors};
  }
  return{run,trimFrames};
}
module.exports={trimFrames,createBackfillService};
