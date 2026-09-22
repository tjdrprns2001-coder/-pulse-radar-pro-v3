'use strict';

const Transition=require('../coin-scan/transition-snapshot-service.js');
const Trader=require('../../ui/trader/analysis-engine.js');
const Forex=require('../../ui/forex-book/forex-book-engine.js');
const Multi=require('../../ui/forex-book/multitf-scenario-engine.js');
const FinalState=require('../../ui/forex-book/final-state-engine.js');
const {evaluateEvent}=require('./outcomes.js');
const {finite,deepFreeze,splitForTimestamp}=require('./contracts.js');

const SCHEMA_VERSION='FOREX_BOOK_BLIND_REPLAY_v1';
const REPLAY_TFS=Object.freeze(['1w','1d','4h','1h','15m']);
const STAGE_ORDINAL=Object.freeze({
  '구조훼손':-3,'과열':-2,'눌림위험':-1,'준비중':0,'점화대기':1,'점화초기':2,'진행중':3
});

function rowOpenTs(r){return finite(Array.isArray(r)?r[0]:r?.openTime)}
function rowOpen(r){return finite(Array.isArray(r)?r[1]:r?.open)}
function rowCloseTs(r){return finite(Array.isArray(r)?r[6]:r?.closeTime)}
function maxClosedTs(frames,cutoff){
  let max=null;
  for(const rows of Object.values(frames||{})){
    for(const r of Array.isArray(rows)?rows:[]){
      const c=rowCloseTs(r);
      if(c!=null&&c<=cutoff&&(max==null||c>max))max=c;
    }
  }
  return max;
}
function nearest(levels,price,above){
  const p=finite(price);if(p==null)return null;
  const rows=(Array.isArray(levels)?levels:[]).filter(x=>{
    const v=finite(x?.price);return v!=null&&(above?v>p:v<p);
  }).sort((a,b)=>Math.abs(Number(a.price)-p)-Math.abs(Number(b.price)-p));
  return rows[0]||null;
}
function frameSnapshot(tf,rows,cutoff){
  const candles=Transition.confirmedCandles(rows,cutoff);
  if(!candles.length)return null;
  const structural=Transition.analyzeFrame(tf,candles);
  const technical=Trader.summarize({
    candles,
    analysis:structural.analysis,
    smc:structural.smc,
    liquidity:structural.liquidity,
    timeframe:tf
  });
  const book=Forex.analyze({
    candles,
    smc:structural.smc,
    liquidity:structural.liquidity,
    ictContext:structural.ict
  });
  const price=finite(candles.at(-1)?.close);
  const levels=structural.liquidity?.levels||[];
  const mss=structural.smc?.mss?.at?.(-1)||null;
  return{
    tf,
    cutoff,
    candlesCount:candles.length,
    price,
    structure:book?.confluence?.bias||technical?.state||'중립',
    technicalState:technical?.state||'중립',
    mssDir:mss?.dir||null,
    bookBias:book?.confluence?.bias||book?.professional?.bias||'중립',
    rsi:finite(book?.indicators?.rsi)??finite(technical?.rsi),
    upperLiquidity:nearest(levels,price,true),
    lowerLiquidity:nearest(levels,price,false),
    technical,book,smc:structural.smc,liquidity:structural.liquidity,ict:structural.ict
  };
}
function validateHistoricalContext(context,cutoff){
  if(!context)return{preSurge:null,dna:null,asOfTs:null,available:false};
  const asOfTs=finite(context.asOfTs);
  if(asOfTs==null)throw new Error('historicalContext.asOfTs required');
  if(asOfTs>cutoff)throw new Error('historical context leaks beyond replay cutoff');
  return{preSurge:context.preSurge||null,dna:context.dna||null,asOfTs,available:true};
}
function buildReplayDecision({
  symbol,frames,cutoff,selectedTf='1h',previousStage=null,historicalContext=null,validationEndTs
}={}){
  const ts=finite(cutoff);if(ts==null)throw new Error('cutoff required');
  const sym=String(symbol||'').trim().toUpperCase();if(!sym)throw new Error('symbol required');
  const snapshots={};
  for(const tf of REPLAY_TFS){
    const snap=frameSnapshot(tf,frames?.[tf],ts);
    if(snap)snapshots[tf]=snap;
  }
  const selected=snapshots[selectedTf]||frameSnapshot(selectedTf,frames?.[selectedTf],ts);
  if(!selected)throw new Error('selected timeframe has no confirmed candles');
  const mtf=Multi.buildScenarioPack({frames:snapshots,marketFlow:null});
  const ctx=validateHistoricalContext(historicalContext,ts);
  const final=FinalState.classify({
    mtf,preSurge:ctx.preSurge,dna:ctx.dna,
    priceChange24:ctx.dna?.item?.priceChange24h,
    book:selected.book,technical:selected.technical,smc:selected.smc,timeframe:selectedTf
  });
  const stage=String(final.state||'준비중');
  const prev=previousStage==null?null:String(previousStage);
  const direction=mtf?.consensus?.bias==='상승'?'long':mtf?.consensus?.bias==='하락'?'long-avoid':'neutral';
  const maxSourceCloseTs=maxClosedTs(frames,ts);
  const sourceLeak=maxSourceCloseTs!=null&&maxSourceCloseTs>ts;
  if(sourceLeak)throw new Error('future candle leaked into replay');
  const record={
    schemaVersion:SCHEMA_VERSION,
    event_id:[sym,selectedTf,Math.trunc(ts)].join(':'),
    symbol:sym,
    selected_tf:selectedTf,
    replay_cutoff_ts:ts,
    replay_cutoff_iso:new Date(ts).toISOString(),
    dataset_split:splitForTimestamp(ts,validationEndTs),
    stage_label:stage,
    stage_ordinal:STAGE_ORDINAL[stage]??0,
    stage_transition:prev?prev+'→'+stage:'INITIAL→'+stage,
    is_stage_transition:prev!=null&&prev!==stage,
    direction,
    outcome_entry_basis:'NEXT_OPEN',
    outcome_fields_attached:false,
    mtf:{
      score:finite(mtf?.consensus?.score),
      agreement:finite(mtf?.consensus?.agreement),
      higherScore:finite(mtf?.higherScore),
      lowerScore:finite(mtf?.lowerScore),
      regime:mtf?.regime||null
    },
    selected_tf_features:{
      price:selected.price,
      rsi:finite(selected.book?.indicators?.rsi)??finite(selected.technical?.rsi),
      rvol:finite(selected.book?.volumeBehavior?.rvol)??finite(selected.technical?.rvol),
      book_confluence_score:finite(selected.book?.confluence?.score),
      local_directional_score:finite(final?.metrics?.localDirectionalScore),
      local_quality:finite(final?.metrics?.localQuality),
      mss_dir:selected.smc?.mss?.at?.(-1)?.dir||null,
      pattern_count:(selected.book?.patterns||[]).length,
      chart_pattern_count:(selected.book?.chartPatterns||[]).length
    },
    final_state_metrics:{...final.metrics},
    final_state_score:finite(final.stageScore),
    evidence_coverage:finite(final.evidenceCompleteness),
    reasons:Array.isArray(final.reasons)?final.reasons.slice():[],
    risks:Array.isArray(final.risks)?final.risks.slice():[],
    next_check:final.next||null,
    provenance:{
      source:'historical-replay',
      max_source_candle_close_ts:maxSourceCloseTs,
      future_candle_seen:false,
      historical_context_available:ctx.available,
      historical_context_as_of_ts:ctx.asOfTs,
      context_not_after_cutoff:!ctx.available||ctx.asOfTs<=ts
    }
  };
  return deepFreeze(record);
}
function evaluateNextOpenOutcome({decision,futureBars}={}){
  if(!decision?.event_id)throw new Error('decision required');
  const cutoff=finite(decision.replay_cutoff_ts);if(cutoff==null)throw new Error('decision cutoff missing');
  const rows=(Array.isArray(futureBars)?futureBars:[]).filter(r=>{
    const o=rowOpenTs(r),c=rowCloseTs(r);return o!=null&&c!=null&&o>cutoff&&c>cutoff;
  }).sort((a,b)=>rowOpenTs(a)-rowOpenTs(b));
  const first=rows[0],nextOpenPrice=rowOpen(first),nextOpenTs=rowOpenTs(first);
  if(nextOpenPrice==null||nextOpenPrice<=0)return deepFreeze({
    event_id:decision.event_id,status:'unavailable',entry_basis:'NEXT_OPEN',
    next_open_ts:null,next_open_price:null,labels:{Hit_6H_8pct:null,Hit_24H_12pct:null},
    outcome_class:'PENDING'
  });
  const event={
    eventId:decision.event_id,symbol:decision.symbol,signalCandleCloseTs:cutoff,
    entryPrice:nextOpenPrice,outcomeSchemaVersion:'research-outcomes-v1'
  };
  const base=evaluateEvent({event,futureBars:rows});
  const l6=base.labels.Hit_6H_8pct,l24=base.labels.Hit_24H_12pct;
  const outcomeClass=(l6===true||l24===true)?'SURGE':(l6===false&&l24===false)?'CONTROL':'PENDING';
  return deepFreeze({
    ...base,event_id:decision.event_id,status:'evaluated',entry_basis:'NEXT_OPEN',
    next_open_ts:nextOpenTs,next_open_price:nextOpenPrice,outcome_class:outcomeClass
  });
}
function replaySequence({symbol,frames,cutoffs=[],selectedTf='1h',historicalContextAt=null,validationEndTs}={}){
  const out=[];let prev=null;
  for(const cutoff of cutoffs.slice().map(Number).filter(Number.isFinite).sort((a,b)=>a-b)){
    const context=typeof historicalContextAt==='function'?historicalContextAt(cutoff):null;
    const d=buildReplayDecision({symbol,frames,cutoff,selectedTf,previousStage:prev,historicalContext:context,validationEndTs});
    out.push(d);prev=d.stage_label;
  }
  return out;
}
function batchSummary({decisions=[],outcomes=[]}={}){
  const om=new Map(outcomes.map(o=>[o.event_id||o.eventId,o]));
  const rows=decisions.map(d=>({decision:d,outcome:om.get(d.event_id)||null}));
  const byStage={};
  for(const {decision,outcome} of rows){
    const key=decision.stage_label;
    if(!byStage[key])byStage[key]={count:0,evaluated:0,surge:0,control:0,pending:0,transitions:0};
    const x=byStage[key];x.count++;if(decision.is_stage_transition)x.transitions++;
    if(outcome){x.evaluated++;if(outcome.outcome_class==='SURGE')x.surge++;else if(outcome.outcome_class==='CONTROL')x.control++;else x.pending++}
  }
  for(const x of Object.values(byStage))x.surgeRate=x.evaluated?x.surge/x.evaluated:null;
  const evaluated=rows.filter(x=>x.outcome?.outcome_class&&x.outcome.outcome_class!=='PENDING');
  return deepFreeze({
    schemaVersion:SCHEMA_VERSION,
    decisionCount:rows.length,
    evaluatedCount:evaluated.length,
    surgeCount:evaluated.filter(x=>x.outcome.outcome_class==='SURGE').length,
    controlCount:evaluated.filter(x=>x.outcome.outcome_class==='CONTROL').length,
    byStage,
    performanceConclusionAllowed:evaluated.length>=50,
    note:evaluated.length>=50?'표본 수 기준 충족. 별도 train/validation 무결성 검토 필요.':'누수·상태전이 스모크 검증용. 성능 결론 금지.'
  });
}
module.exports={
  SCHEMA_VERSION,REPLAY_TFS,STAGE_ORDINAL,rowOpenTs,rowCloseTs,maxClosedTs,frameSnapshot,
  validateHistoricalContext,buildReplayDecision,evaluateNextOpenOutcome,replaySequence,batchSummary
};
