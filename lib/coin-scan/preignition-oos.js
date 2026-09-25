'use strict';

const HORIZONS=Object.freeze({h6:6*3600000,h24:24*3600000});
const BUCKET_ORDER=Object.freeze(['REJECTED','LT60','S60_69','S70_79','S80_PLUS']);
const BLOCKED_CLASSES=new Set(['POST-SURGE','DISTRIBUTION-RISK','PUMP-RISK','STALE']);

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function clean(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')}
function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,Number(v)||0))}
function scoreBucket(item={}){
  const key=String(item.scanClass?.key||'STALE').toUpperCase(),score=finite(item.preIgnitionScore);
  if(String(item.dataState||'').toLowerCase()!=='live'||item.autoDeepEligible===false||item.v3Invalidation||BLOCKED_CLASSES.has(key)||score==null)return'REJECTED';
  if(score<60)return'LT60';if(score<70)return'S60_69';if(score<80)return'S70_79';return'S80_PLUS';
}
function initialOutcome(snapshot){
  const horizons={};for(const [key,ms] of Object.entries(HORIZONS))horizons[key]={status:'pending',targetTs:Number(snapshot.capturedAt)+ms};
  return{id:snapshot.id,symbol:snapshot.symbol,capturedAt:snapshot.capturedAt,entryPrice:snapshot.price,horizons,updatedAt:snapshot.capturedAt};
}
function returnPct(entry,future){const a=finite(entry),b=finite(future);return a!=null&&a>0&&b!=null?((b/a)-1)*100:null}
function snapshotFromItem(item={},context={}){
  const symbol=clean(item.symbol),capturedAt=finite(context.capturedAt)??Date.now(),hourBucket=Math.floor(capturedAt/3600000)*3600000,bucket=scoreBucket(item);
  return{
    id:['preignition-oos-v1',symbol,hourBucket].join(':'),version:'PREIGNITION_OOS_v1',source:'LIVE_OOS',symbol,capturedAt,hourBucket,bucket,
    score:finite(item.preIgnitionScore),price:finite(item.lastPrice),marketScope:String(item.marketScope||''),spotListed:Boolean(item.spotListed),futuresListed:Boolean(item.futuresListed),
    autoDeepEligible:item.autoDeepEligible!==false,autoDeepReason:item.autoDeepReason||null,dataState:String(item.dataState||'unknown'),
    scanClass:String(item.scanClass?.key||''),v2Type:String(item.v2Type||''),v3Tier:String(item.v3LongTier||''),v3Invalidation:Boolean(item.v3Invalidation),
    tradeSignalLevel:String(item.tradeSignal?.level||''),tradeSignalConfidence:finite(item.tradeSignal?.confidence),candidateScore:finite(item.candidateScore),
    priceChange24h:finite(item.priceChange24h),priceChange1h:finite(item.priceChange1h),priceChange15m:finite(item.priceChange15m),
    oi4hChangePct:finite(item.oi4hChangePct),oi8hChangePct:finite(item.oi8hChangePct),takerRatio:finite(item.trueTakerRatio??item.takerRatio),
    rvol1h:finite(item.v3Rvol?.main1h?.value??item.volumeAcceleration1h??item.volumeAcceleration),rvol15m:finite(item.v3Rvol?.ignition15m?.value??item.volumeAcceleration15m),
    reaccumulating:Boolean(item.reaccumulating),bottomReady:Boolean(item.bottomReady),sector:item.sector||null,
    scannerVersion:context.scannerVersion||'v3',paramSet:context.paramSet||null,precisionMode:Boolean(context.precisionMode),
    marketSource:context.marketSource||null,derivativesSource:context.derivativesSource||null
  };
}
function median(values){const a=values.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function aggregate(rows=[],outcomes=new Map()){
  const horizons={};
  for(const key of Object.keys(HORIZONS)){
    const vals=[];for(const row of rows){const v=finite(outcomes.get(row.id)?.horizons?.[key]?.returnPct);if(v!=null)vals.push(v)}
    const hitCut=key==='h6'?8:12;
    horizons[key]={
      evaluatedCount:vals.length,positiveRatio:vals.length?vals.filter(v=>v>0).length/vals.length:null,
      hitRatio:vals.length?vals.filter(v=>v>=hitCut).length/vals.length:null,hitCutPct:hitCut,
      meanReturnPct:vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null,medianReturnPct:median(vals),
      bestReturnPct:vals.length?Math.max(...vals):null,worstReturnPct:vals.length?Math.min(...vals):null,
      sampleState:vals.length>=60?'통계 사용 가능':vals.length>=20?'참고용':'표본 부족'
    };
  }
  return{sampleCount:rows.length,horizons};
}
function statsFromRows(snapshots=[],outcomeRows=[]){
  const outcomes=new Map((outcomeRows||[]).map(x=>[x.id,x])),rows=(snapshots||[]).filter(x=>x?.source==='LIVE_OOS');
  const byBucket={};for(const key of BUCKET_ORDER)byBucket[key]=aggregate(rows.filter(x=>x.bucket===key),outcomes);
  const thresholds={};for(const cut of [60,70,80])thresholds[String(cut)]=aggregate(rows.filter(x=>x.bucket!=='REJECTED'&&finite(x.score)!=null&&x.score>=cut),outcomes);
  return{version:'PREIGNITION_OOS_STATS_v1',sampleCount:rows.length,byBucket,thresholds,rejected:byBucket.REJECTED};
}

function createPreIgnitionOosService({store,resolver=null,now=()=>Date.now(),maxEventsPerEvaluation=24,evaluationConcurrency=4}={}){
  if(!store||typeof store.putPreIgnitionSnapshot!=='function'||typeof store.listPreIgnitionSnapshots!=='function')throw new Error('pre-ignition OOS store required');
  async function observe(items=[],context={}){
    const ts=finite(context.capturedAt)??now(),result={observed:0,recorded:0,duplicates:0,skipped:0,buckets:{},errors:[]};
    for(const item of Array.isArray(items)?items:[]){
      const snap=snapshotFromItem(item,{...context,capturedAt:ts});if(!snap.symbol){result.skipped++;continue}
      result.observed++;result.buckets[snap.bucket]=(result.buckets[snap.bucket]||0)+1;
      if(snap.price==null||snap.price<=0){result.skipped++;continue}
      try{
        const wrote=await store.putPreIgnitionSnapshot(snap.id,snap);
        if(wrote){result.recorded++;if(typeof store.putPreIgnitionOutcome==='function')await store.putPreIgnitionOutcome(snap.id,initialOutcome(snap))}
        else result.duplicates++;
      }catch(e){result.errors.push(snap.symbol+':'+String(e?.message||e))}
    }
    return result;
  }
  async function evaluateDue(){
    const result={eventsChecked:0,attempted:0,evaluated:0,unavailable:0,pending:0,errors:[]};
    if(!resolver||typeof resolver.resolve!=='function'||typeof store.listPreIgnitionOutcomes!=='function'||typeof store.putPreIgnitionOutcome!=='function')return result;
    const ts=now(),snapshots=(await store.listPreIgnitionSnapshots()).slice().sort((a,b)=>Number(a.capturedAt)-Number(b.capturedAt)),outcomes=new Map((await store.listPreIgnitionOutcomes()).map(x=>[x.id,x]));
    const due=snapshots.filter(s=>Object.keys(HORIZONS).some(k=>{const h=outcomes.get(s.id)?.horizons?.[k]||initialOutcome(s).horizons[k];return h.status==='pending'&&ts>=Number(h.targetTs)})).slice(0,Math.max(1,Number(maxEventsPerEvaluation)||24));
    let next=0;
    async function worker(){
      while(true){
        const idx=next++;if(idx>=due.length)return;const snap=due[idx];result.eventsChecked++;
        const outcome=outcomes.get(snap.id)||initialOutcome(snap);let changed=false;
        for(const key of Object.keys(HORIZONS)){
          const h=outcome.horizons?.[key]||{status:'pending',targetTs:Number(snap.capturedAt)+HORIZONS[key]};
          if(h.status!=='pending'){continue}if(ts<Number(h.targetTs)){result.pending++;continue}
          result.attempted++;
          try{
            const resolved=await resolver.resolve(snap.symbol,h.targetTs,ts,{marketScope:snap.marketScope,spotListed:snap.spotListed,futuresListed:snap.futuresListed});
            if(resolved?.status==='evaluated'){
              outcome.horizons[key]={status:'evaluated',targetTs:h.targetTs,marketTs:resolved.marketTs,price:resolved.price,returnPct:returnPct(snap.price,resolved.price),market:resolved.market||null};
              result.evaluated++;changed=true;
            }else if(resolved?.status==='unavailable'){outcome.horizons[key]={status:'unavailable',targetTs:h.targetTs};result.unavailable++;changed=true}
            else result.pending++;
          }catch(e){result.errors.push(snap.id+':'+key+':'+String(e?.message||e))}
        }
        if(changed){outcome.updatedAt=ts;await store.putPreIgnitionOutcome(snap.id,outcome)}
      }
    }
    await Promise.all(Array.from({length:Math.min(Math.max(1,Number(evaluationConcurrency)||4),due.length||1)},worker));
    return result;
  }
  async function list({symbol=null,bucket=null,limit=200,includeOutcomes=true,since=null}={}){
    const sym=symbol?clean(symbol):null,b= bucket?String(bucket).toUpperCase():null,minTs=finite(since);
    let rows=await store.listPreIgnitionSnapshots();
    rows=rows.filter(x=>(!sym||x.symbol===sym)&&(!b||x.bucket===b)&&(minTs==null||Number(x.capturedAt)>=minTs)).sort((a,b)=>Number(b.capturedAt)-Number(a.capturedAt)).slice(0,Math.max(1,Math.min(2000,Number(limit)||200)));
    if(!includeOutcomes||typeof store.listPreIgnitionOutcomes!=='function')return rows;
    const outcomes=new Map((await store.listPreIgnitionOutcomes()).map(x=>[x.id,x]));return rows.map(x=>({...x,outcome:outcomes.get(x.id)||null}));
  }
  async function stats({since=null}={}){
    const minTs=finite(since),rows=(await store.listPreIgnitionSnapshots()).filter(x=>minTs==null||Number(x.capturedAt)>=minTs),outcomes=typeof store.listPreIgnitionOutcomes==='function'?await store.listPreIgnitionOutcomes():[];
    return{...statsFromRows(rows,outcomes),since:minTs,updatedAt:now()};
  }
  return{observe,evaluateDue,list,stats};
}

module.exports={HORIZONS,BUCKET_ORDER,BLOCKED_CLASSES,scoreBucket,snapshotFromItem,initialOutcome,returnPct,aggregate,statsFromRows,createPreIgnitionOosService};
