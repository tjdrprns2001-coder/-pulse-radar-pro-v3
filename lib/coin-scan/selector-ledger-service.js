'use strict';
const Screening=require('./candidate-screening-engine.js');
const OOS=require('./selector-oos-evaluator.js');

const HORIZONS=Object.freeze({m15:15*60*1000,h1:60*60*1000,h4:4*60*60*1000,h24:24*60*60*1000});
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function clean(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')}
function safe(v){return String(v||'NA').replace(/[^A-Za-z0-9_.:-]/g,'-').slice(0,120)||'NA'}
function returnPct(a,b){a=finite(a);b=finite(b);return a!=null&&a>0&&b!=null?((b/a)-1)*100:null}
function initialOutcome(snapshot,raw){
  const capturedAt=Date.parse(snapshot.decision_time),entry=finite(raw?.row?.item?.lastPrice??raw?.row?.price??raw?.price);
  const horizons={};for(const [k,ms] of Object.entries(HORIZONS))horizons[k]={status:'pending',targetTs:capturedAt+ms};
  return{snapshotId:snapshot.snapshot_id,symbol:snapshot.symbol,classification:snapshot.classification,entryPrice:entry,capturedAt,horizons,updatedAt:capturedAt,costModelStatus:'INCOMPLETE',note:'Venue fee/funding assumptions are not frozen in selector-r0.1; gross returns only.'};
}
function transitionId(snapshot,from,to){return safe(snapshot.snapshot_id)+'__'+safe(from||'NONE')+'__'+safe(to)}
function createSelectorLedgerService({store,resolver=null,now=()=>Date.now(),maxEvaluationsPerRun=8}={}){
  if(!store||typeof store.putSelectorSnapshot!=='function'||typeof store.putSelectorRaw!=='function')throw new Error('selector ledger store required');

  async function observe({screeningBundle={},rawBySymbol=new Map(),context={}}={}){
    const rows=Array.isArray(screeningBundle?.all)?screeningBundle.all:[];
    const out={observed:0,snapshotsRecorded:0,rawRecorded:0,evidenceRecorded:0,transitionsRecorded:0,duplicates:0,errors:[]};
    for(const snapshot of rows){
      const symbol=clean(snapshot?.symbol);if(!symbol||!snapshot?.snapshot_id){continue}
      out.observed++;
      const raw=rawBySymbol instanceof Map?rawBySymbol.get(symbol):rawBySymbol?.[symbol];
      const rawEnvelope={
        schemaVersion:'SELECTOR_RAW_INPUT_v1',
        snapshotId:snapshot.snapshot_id,
        specVersion:snapshot.spec_version,
        capturedAt:context.capturedAt||now(),
        decisionTime:snapshot.decision_time,
        dataCutoff:snapshot.data_cutoff,
        symbol,
        row:raw?.row||null,
        execution:raw?.execution||null,
        intelligence:raw?.intelligence||null,
        marketSource:context.marketSource||null,
        derivativesSource:context.derivativesSource||null
      };
      try{if(await store.putSelectorSnapshot(snapshot.snapshot_id,snapshot))out.snapshotsRecorded++;else out.duplicates++}catch(e){out.errors.push(symbol+':snapshot:'+String(e?.message||e))}
      try{if(await store.putSelectorRaw(snapshot.snapshot_id,rawEnvelope))out.rawRecorded++}catch(e){out.errors.push(symbol+':raw:'+String(e?.message||e))}
      if(typeof store.putSelectorEvidence==='function'){
        const ec=snapshot.evidence_context||{},records=[];
        for(const cluster of ec?.catalysts?.news_clusters||[])records.push({kind:'NEWS_CLUSTER',id:cluster.event_cluster_id,symbol,snapshotId:snapshot.snapshot_id,decisionTime:snapshot.decision_time,payload:cluster});
        for(const event of ec?.catalysts?.calendar_events||[])records.push({kind:'CALENDAR_EVENT',id:event.event_id,symbol,snapshotId:snapshot.snapshot_id,decisionTime:snapshot.decision_time,payload:event});
        for(const id of ec?.onchain?.usable_event_ids||[])records.push({kind:'ONCHAIN_EVENT_REF',id,symbol,snapshotId:snapshot.snapshot_id,decisionTime:snapshot.decision_time,payload:{event_id:id,finality_status:'CONFIRMED_OR_FINAL'}});
        for(const rec of records){
          const evidenceId=[safe(rec.kind),safe(rec.id),safe(snapshot.input_hash||snapshot.snapshot_id)].join(':');
          try{if(await store.putSelectorEvidence(evidenceId,{schemaVersion:'SELECTOR_EVIDENCE_EVENT_v1',evidenceId,...rec,recordedAt:now()}))out.evidenceRecorded++}catch(e){out.errors.push(symbol+':evidence:'+String(e?.message||e))}
        }
      }
      const stateKey='selector-state:'+symbol;let prev=null;
      try{prev=typeof store.getState==='function'?await store.getState(stateKey):null}catch(e){out.errors.push(symbol+':state-read:'+String(e?.message||e))}
      const next=String(snapshot.classification||'WATCHLIST');
      if(prev?.classification!==next){
        const t={
          schemaVersion:'SELECTOR_TRANSITION_v1',
          transitionId:transitionId(snapshot,prev?.classification||null,next),
          snapshotId:snapshot.snapshot_id,
          symbol,
          fromStatus:prev?.classification||null,
          toStatus:next,
          reasonCode:prev?'CLASSIFICATION_CHANGED':'INITIAL_CLASSIFICATION',
          decisionTime:snapshot.decision_time,
          evidenceRefs:[snapshot.snapshot_id],
          createdAt:now()
        };
        try{if(typeof store.putSelectorTransition==='function'&&await store.putSelectorTransition(t.transitionId,t))out.transitionsRecorded++}catch(e){out.errors.push(symbol+':transition:'+String(e?.message||e))}
      }
      try{if(typeof store.putState==='function')await store.putState(stateKey,{symbol,classification:next,snapshotId:snapshot.snapshot_id,decisionTime:snapshot.decision_time,updatedAt:now()})}catch(e){out.errors.push(symbol+':state-write:'+String(e?.message||e))}
      if(typeof store.getSelectorOutcome==='function'&&typeof store.putSelectorOutcome==='function'){
        try{const existing=await store.getSelectorOutcome(snapshot.snapshot_id);if(!existing){const init=initialOutcome(snapshot,rawEnvelope);if(init.entryPrice!=null&&init.entryPrice>0)await store.putSelectorOutcome(snapshot.snapshot_id,init)}}catch(e){out.errors.push(symbol+':outcome-init:'+String(e?.message||e))}
      }
    }
    return out;
  }

  async function list({symbol=null,classification=null,limit=100}={}){
    if(typeof store.listSelectorSnapshots!=='function')return[];
    const sym=symbol?clean(symbol):null,cls=classification?String(classification).toUpperCase():null;
    let rows=await store.listSelectorSnapshots();
    rows=rows.filter(x=>(!sym||x.symbol===sym)&&(!cls||x.classification===cls)).sort((a,b)=>Date.parse(b.decision_time)-Date.parse(a.decision_time)).slice(0,Math.max(1,Math.min(1000,Number(limit)||100)));
    if(typeof store.listSelectorOutcomes!=='function')return rows;
    const outs=await store.listSelectorOutcomes(),map=new Map(outs.map(x=>[x.snapshotId,x]));
    return rows.map(x=>({...x,outcome:map.get(x.snapshot_id)||null}));
  }
  async function evidence({symbol=null,limit=300}={}){
    if(typeof store.listSelectorEvidence!=='function')return[];
    const sym=symbol?clean(symbol):null;let rows=await store.listSelectorEvidence();
    return rows.filter(x=>!sym||x.symbol===sym).sort((a,b)=>Number(b.recordedAt)-Number(a.recordedAt)).slice(0,Math.max(1,Math.min(1000,Number(limit)||300)));
  }
  async function transitions({symbol=null,limit=200}={}){
    if(typeof store.listSelectorTransitions!=='function')return[];
    const sym=symbol?clean(symbol):null;let rows=await store.listSelectorTransitions();
    return rows.filter(x=>!sym||x.symbol===sym).sort((a,b)=>Date.parse(b.decisionTime)-Date.parse(a.decisionTime)).slice(0,Math.max(1,Math.min(1000,Number(limit)||200)));
  }
  async function replay(snapshotId){
    const id=String(snapshotId||'');if(!id)return null;
    const [saved,raw]=await Promise.all([store.getSelectorSnapshot(id),store.getSelectorRaw(id)]);
    if(!saved||!raw)return null;
    const decision=Date.parse(saved.decision_time),cutoff=Date.parse(saved.data_cutoff);
    const rebuilt=Screening.screen(raw.row||{},{
      execution:raw.execution||null,intelligence:raw.intelligence||{},
      decisionTime:decision,dataCutoff:cutoff,timeframe:saved.timeframe,
      instrumentId:saved.instrument_id
    });
    return{
      snapshotId:id,
      original:saved,
      replay:rebuilt,
      invariant:{
        inputHashMatch:rebuilt.input_hash===saved.input_hash,
        classificationMatch:rebuilt.classification===saved.classification,
        scoreMatch:JSON.stringify(rebuilt.scores)===JSON.stringify(saved.scores),
        pass:rebuilt.input_hash===saved.input_hash&&rebuilt.classification===saved.classification&&JSON.stringify(rebuilt.scores)===JSON.stringify(saved.scores)
      }
    };
  }
  async function evaluateDue(){
    const result={attempted:0,evaluated:0,pending:0,unavailable:0,errors:[]};
    if(!resolver||typeof resolver.resolve!=='function'||typeof store.listSelectorSnapshots!=='function'||typeof store.getSelectorOutcome!=='function'||typeof store.putSelectorOutcome!=='function')return result;
    const ts=now(),rows=await store.listSelectorSnapshots();
    outer:for(const snapshot of rows.sort((a,b)=>Date.parse(a.decision_time)-Date.parse(b.decision_time))){
      const outcome=await store.getSelectorOutcome(snapshot.snapshot_id);if(!outcome||finite(outcome.entryPrice)==null||outcome.entryPrice<=0)continue;
      let changed=false;
      for(const [key,ms] of Object.entries(HORIZONS)){
        const h=outcome.horizons?.[key]||{status:'pending',targetTs:outcome.capturedAt+ms};
        if(['evaluated','unavailable'].includes(h.status))continue;
        if(ts<Number(h.targetTs)){result.pending++;continue}
        if(result.attempted>=Math.max(1,Number(maxEvaluationsPerRun)||8))break outer;
        result.attempted++;
        try{
          const r=await resolver.resolve(snapshot.symbol,h.targetTs,ts);
          if(r?.status==='evaluated'){
            outcome.horizons[key]={status:'evaluated',targetTs:h.targetTs,marketTs:r.marketTs,price:r.price,grossReturnPct:returnPct(outcome.entryPrice,r.price),netReturnPct:null,costModelStatus:'INCOMPLETE'};
            result.evaluated++;changed=true;
          }else if(r?.status==='unavailable'){outcome.horizons[key]={status:'unavailable',targetTs:h.targetTs};result.unavailable++;changed=true}
          else result.pending++;
        }catch(e){result.errors.push(snapshot.snapshot_id+':'+key+':'+String(e?.message||e))}
      }
      if(changed){outcome.updatedAt=ts;await store.putSelectorOutcome(snapshot.snapshot_id,outcome)}
    }
    return result;
  }
  function statsFor(rows=[]){
    const out={sampleCount:rows.length,byClassification:{},horizons:{}};
    for(const cls of ['CANDIDATE','WATCHLIST','EVENT_RISK','RISK_FILTERED','INSUFFICIENT_DATA','REJECTED'])out.byClassification[cls]=rows.filter(x=>x.classification===cls).length;
    for(const key of Object.keys(HORIZONS)){
      const vals=rows.map(x=>finite(x.outcome?.horizons?.[key]?.grossReturnPct)).filter(v=>v!=null);
      out.horizons[key]={evaluatedCount:vals.length,positiveRatio:vals.length?vals.filter(v=>v>0).length/vals.length:null,meanGrossReturnPct:vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null,bestGrossReturnPct:vals.length?Math.max(...vals):null,worstGrossReturnPct:vals.length?Math.min(...vals):null};
    }
    return out;
  }
  async function stats({lockedOosStart=null}={}){
    const rows=await list({limit:1000});
    const start=finite(lockedOosStart);
    const base=statsFor(rows),oos=start==null?null:statsFor(rows.filter(x=>Date.parse(x.decision_time)>=start));
    return{version:'SELECTOR_STATS_v1',specVersion:Screening.SPEC_VERSION,updatedAt:now(),overall:base,lockedOos:start==null?{configured:false}:{configured:true,startTs:start,startIso:new Date(start).toISOString(),...oos},costModelStatus:'INCOMPLETE',note:'Gross-return monitoring only until venue-specific fee/funding assumptions are frozen.'};
  }
  async function ablation({horizon='h24',feeBps=0,slippageBps=0,fundingBps=0}={}){
    const rows=await list({limit:1000}),dataset=[];
    for(const s of rows){
      const gross=finite(s.outcome?.horizons?.[horizon]?.grossReturnPct);if(gross==null)continue;
      const ec=s.evidence_context||{},on=ec.onchain||{},cat=ec.catalysts||{};
      dataset.push({
        snapshot_id:s.snapshot_id,decision_time:Date.parse(s.decision_time),symbol:s.symbol,return:gross/100,
        market_ok:(finite(s.scores?.market_quality)??0)>=55,
        ict_ok:(finite(s.scores?.ict_setup)??0)>=60,
        execution_ok:(finite(s.scores?.execution_quality)??0)>=55,
        data_ok:(finite(s.scores?.data_quality)??0)>=70,
        onchain_ok:on.finality_status!=='UNFINALIZED'&&(finite(on.risk_penalty)??0)<15,
        catalyst_ok:!cat.hard_event_risk&&!cat.high_impact_event
      });
    }
    const cost={feeBps:Number(feeBps)||0,slippageBps:Number(slippageBps)||0,fundingBps:Number(fundingBps)||0};
    return{version:'SELECTOR_ABLATION_r0.4',specVersion:Screening.SPEC_VERSION,horizon,cost,datasetCount:dataset.length,report:OOS.lockedOosReport(dataset,cost),walkForwardWindows:OOS.walkForward(dataset,{train:50,validation:25,test:25}).length};
  }
  function toCsv(rows=[]){
    const head=['snapshot_id','decision_time','symbol','classification','rank','final_score','market_quality','ict_setup','execution_quality','derivatives_context','onchain_context','data_quality','input_hash'];
    const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
    return [head.join(','),...rows.map(x=>[x.snapshot_id,x.decision_time,x.symbol,x.classification,x.rank,x.scores?.final_score,x.scores?.market_quality,x.scores?.ict_setup,x.scores?.execution_quality,x.scores?.derivatives_context,x.scores?.onchain_context,x.scores?.data_quality,x.input_hash].map(esc).join(','))].join('\n');
  }
  return{observe,list,evidence,transitions,replay,evaluateDue,stats,ablation,toCsv};
}
module.exports={HORIZONS,returnPct,initialOutcome,transitionId,createSelectorLedgerService};
