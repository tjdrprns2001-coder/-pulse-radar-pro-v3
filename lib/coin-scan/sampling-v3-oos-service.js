'use strict';

const Oos=require('./sampling-v3-oos.js');

const VERSION='SAMPLING_V3_OOS_SERVICE_v1';
const HORIZONS=Object.freeze({h6:6*3600000,h24:24*3600000});
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function clean(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')}
function initialOutcome(snapshot){
  const horizons={};for(const [k,ms] of Object.entries(HORIZONS))horizons[k]={status:'pending',targetTs:snapshot.capturedAt+ms};
  return{id:snapshot.id,symbol:snapshot.symbol,capturedAt:snapshot.capturedAt,horizons,finalLabel:null,updatedAt:snapshot.capturedAt};
}
function snapshotFromItem(item={},context={}){
  const symbol=clean(item.symbol),capturedAt=finite(context.capturedAt)??Date.now(),hourBucket=Math.floor(capturedAt/3600000)*3600000;
  const s=item.samplingV3||{},probe=s.latestOutcomeProbe||{},seq=s.sequence||{},alt=s.alternativeBars||{},sim=item.sampleSimilarityV2||{};
  const entryPrice=finite(item.lastPrice);
  const upperPct=Math.max(.01,finite(probe.upperPct)??2),lowerPct=Math.max(.01,finite(probe.lowerPct)??1);
  return{
    id:['sampling-v3.1',symbol,hourBucket].join(':'),version:VERSION,samplingRevision:String(alt.revision||'3.2'),source:'AUTO_SCAN_PRE_OUTCOME',symbol,capturedAt,hourBucket,
    sourceScanId:context.sourceScanId||null,entryPrice,upperPct,lowerPct,
    marketScope:String(item.marketScope||''),spotListed:Boolean(item.spotListed),futuresListed:Boolean(item.futuresListed),
    dataState:String(item.dataState||'unknown'),scanClass:String(item.scanClass?.key||''),v2Type:String(item.v2Type||''),
    samplingStage:String(seq.stage||'QUIET'),eventTypes:Array.isArray(seq.eventTypes)?seq.eventTypes.slice(0,32):[],
    eventCount:finite(seq.eventCount)??0,bullishEventCount:finite(seq.bullishEventCount)??0,compressionHours:finite(seq.compressionHours),
    score:finite(s.evidenceScore)??0,rankingEffect:finite(s.rankingEffect)??0,
    integrityStatus:String(s.integrity?.status||'N/A'),nativeSyntheticStatus:String(s.nativeSyntheticAudit?.status||'NOT_REQUESTED'),
    microstructureStatus:String(s.microstructure?.status||'NOT_REQUESTED'),
    alternativeBars:{
      version:String(alt.version||''),revision:String(alt.revision||''),status:String(alt.status||'NOT_REQUESTED'),
      tradeCount:finite(alt.tradeCount)??0,evaluationTradeCount:finite(alt.evaluationTradeCount)??0,
      tickCount:finite(alt.bars?.tickCount)??0,volumeCount:finite(alt.bars?.volumeCount)??0,
      dollarCount:finite(alt.bars?.dollarCount)??0,imbalanceCount:finite(alt.bars?.imbalanceCount)??0,runCount:finite(alt.bars?.runCount)??0,
      thresholdMode:String(alt.policy?.thresholdMode||''),overshootPolicy:String(alt.policy?.overshootPolicy||''),
      calibration:alt.calibration?{
        status:alt.calibration.status||null,calibrationTradeCount:finite(alt.calibration.calibrationTradeCount),
        evaluationTradeCount:finite(alt.calibration.evaluationTradeCount),calibrationEndTime:finite(alt.calibration.calibrationEndTime),
        evaluationStartTime:finite(alt.calibration.evaluationStartTime),thresholds:alt.calibration.thresholds||null
      }:null,
      latest:alt.latest||null
    },
    similarity:{
      successScore:finite(sim.successScore),negativeScore:finite(sim.negativeScore),netEvidenceScore:finite(sim.netEvidenceScore),
      ignitionPath:sim.ignitionPath||null,successTop5:Array.isArray(sim.successTop5)?sim.successTop5.slice(0,5):[],negativeTop3:Array.isArray(sim.negativeTop3)?sim.negativeTop3.slice(0,3):[]
    },
    priceChange24h:finite(item.priceChange24h),oi4hChangePct:finite(item.oi4hChangePct),oi8hChangePct:finite(item.oi8hChangePct),
    takerRatio:finite(item.trueTakerRatio??item.takerRatio),rvol1h:finite(item.v3Rvol?.main1h?.value??item.volumeAcceleration1h??item.volumeAcceleration),
    rvol15m:finite(item.v3Rvol?.ignition15m?.value??item.volumeAcceleration15m),
    createdAt:capturedAt
  };
}
function labelCounts(rows=[]){const out={SURGE:0,FAILED_BOS:0,NO_TRIGGER:0,UNRESOLVED:0};for(const x of rows){const k=String(x.label||'UNRESOLVED');out[k]=(out[k]||0)+1}return out}
function toValidationEvents(snapshots=[],outcomes=[]){
  const om=new Map((outcomes||[]).map(x=>[x.id,x])),out=[];
  for(const s of snapshots||[]){
    const h=om.get(s.id)?.horizons?.h24;if(!h||h.status!=='evaluated')continue;
    out.push({id:s.id,symbol:s.symbol,startTime:s.capturedAt,endTime:h.targetTs,label:h.label||'UNRESOLVED',score:finite(s.score)??0,weight:1,samplingStage:s.samplingStage,eventTypes:s.eventTypes});
  }
  return out;
}
function createSamplingV3OosService({store,resolver=null,now=()=>Date.now(),maxEventsPerEvaluation=16,evaluationConcurrency=3}={}){
  if(!store||typeof store.putSamplingV3Snapshot!=='function'||typeof store.listSamplingV3Snapshots!=='function')throw new Error('Sampling v3 OOS store required');
  async function observe(items=[],context={}){
    const ts=finite(context.capturedAt)??now(),result={observed:0,recorded:0,duplicates:0,skipped:0,errors:[],stages:{}};
    for(const item of Array.isArray(items)?items:[]){
      if(!item?.samplingV3||String(item.dataState||'').toLowerCase()!=='live'){result.skipped++;continue}
      const snap=snapshotFromItem(item,{...context,capturedAt:ts});
      result.observed++;result.stages[snap.samplingStage]=(result.stages[snap.samplingStage]||0)+1;
      if(!snap.symbol||!(snap.entryPrice>0)){result.skipped++;continue}
      try{
        const wrote=await store.putSamplingV3Snapshot(snap.id,snap);
        if(wrote){result.recorded++;if(typeof store.putSamplingV3Outcome==='function')await store.putSamplingV3Outcome(snap.id,initialOutcome(snap))}
        else result.duplicates++;
      }catch(e){result.errors.push(snap.symbol+':'+String(e?.message||e))}
    }
    return result;
  }
  async function evaluateDue(){
    const result={eventsChecked:0,attempted:0,evaluated:0,unavailable:0,pending:0,errors:[],labels:{}};
    if(!resolver||typeof resolver.resolve!=='function'||typeof store.listSamplingV3Outcomes!=='function'||typeof store.putSamplingV3Outcome!=='function')return result;
    const ts=now(),snaps=(await store.listSamplingV3Snapshots()).slice().sort((a,b)=>a.capturedAt-b.capturedAt);
    const outcomes=new Map((await store.listSamplingV3Outcomes()).map(x=>[x.id,x]));
    const due=snaps.filter(s=>Object.values((outcomes.get(s.id)||initialOutcome(s)).horizons||{}).some(h=>h.status==='pending'&&ts>=h.targetTs)).slice(0,Math.max(1,Number(maxEventsPerEvaluation)||16));
    let next=0;
    async function worker(){
      while(true){
        const idx=next++;if(idx>=due.length)return;const snap=due[idx],outcome=outcomes.get(snap.id)||initialOutcome(snap);result.eventsChecked++;let changed=false;
        for(const key of Object.keys(HORIZONS)){
          const h=outcome.horizons[key]||{status:'pending',targetTs:snap.capturedAt+HORIZONS[key]};
          if(h.status!=='pending')continue;
          if(ts<h.targetTs){result.pending++;continue}
          result.attempted++;
          try{
            const resolved=await resolver.resolve(snap,h.targetTs,ts);
            if(resolved?.status==='evaluated'){
              outcome.horizons[key]={status:'evaluated',targetTs:h.targetTs,label:resolved.label||'UNRESOLVED',reason:resolved.reason||null,market:resolved.market||null,triggerTs:resolved.triggerTs??null,exitTs:resolved.exitTs??null,exitPrice:resolved.exitPrice??null,returnPct:resolved.returnPct??null,mfePct:resolved.mfePct??null,maePct:resolved.maePct??null,rowCount:resolved.rowCount??null};
              result.evaluated++;result.labels[resolved.label||'UNRESOLVED']=(result.labels[resolved.label||'UNRESOLVED']||0)+1;changed=true;
            }else if(resolved?.status==='unavailable'){
              outcome.horizons[key]={status:'unavailable',targetTs:h.targetTs,label:'UNRESOLVED',reason:resolved.reason||'MARKET_DATA_UNAVAILABLE'};result.unavailable++;changed=true;
            }else result.pending++;
          }catch(e){result.errors.push(snap.id+':'+key+':'+String(e?.message||e))}
        }
        const h24=outcome.horizons.h24;
        outcome.finalLabel=h24?.status==='evaluated'?h24.label:(outcome.horizons.h6?.status==='evaluated'?outcome.horizons.h6.label:null);
        if(changed){outcome.updatedAt=ts;await store.putSamplingV3Outcome(snap.id,outcome)}
      }
    }
    await Promise.all(Array.from({length:Math.min(Math.max(1,Number(evaluationConcurrency)||3),due.length||1)},worker));
    return result;
  }
  async function list({symbol=null,stage=null,limit=200,includeOutcomes=true,since=null}={}){
    const sym=symbol?clean(symbol):null,st=stage?String(stage):null,minTs=finite(since);
    let rows=await store.listSamplingV3Snapshots();
    rows=rows.filter(x=>(!sym||x.symbol===sym)&&(!st||x.samplingStage===st)&&(minTs==null||x.capturedAt>=minTs)).sort((a,b)=>b.capturedAt-a.capturedAt).slice(0,Math.max(1,Math.min(5000,Number(limit)||200)));
    if(!includeOutcomes||typeof store.listSamplingV3Outcomes!=='function')return rows;
    const om=new Map((await store.listSamplingV3Outcomes()).map(x=>[x.id,x]));return rows.map(x=>({...x,outcome:om.get(x.id)||null}));
  }
  async function stats(){
    const snapshots=await store.listSamplingV3Snapshots(),outcomes=typeof store.listSamplingV3Outcomes==='function'?await store.listSamplingV3Outcomes():[];
    const events=toValidationEvents(snapshots,outcomes),validation=Oos.validate(events,{folds:4,minTrain:20,embargoMs:3600000,bootstrapSize:80,seed:31});
    const labels=labelCounts(events),byStage={};
    for(const s of snapshots){const st=s.samplingStage||'QUIET';byStage[st]=(byStage[st]||0)+1}
    const out={version:'SAMPLING_V3_FORWARD_STATS_v1',updatedAt:now(),snapshotCount:snapshots.length,evaluated24hCount:events.length,pendingCount:Math.max(0,snapshots.length-events.length),labels,byStage,validation,promotionReady:Boolean(validation.promotionGate?.passed)};
    if(typeof store.putSamplingV3Stats==='function')await store.putSamplingV3Stats('latest',out);
    return out;
  }
  return{VERSION,HORIZONS,observe,evaluateDue,list,stats,snapshotFromItem,initialOutcome,toValidationEvents};
}
module.exports={VERSION,HORIZONS,snapshotFromItem,initialOutcome,toValidationEvents,createSamplingV3OosService};
