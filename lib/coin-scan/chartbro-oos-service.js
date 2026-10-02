'use strict';

const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const ChartBroContext=require('./chartbro-context.js');

const VERSION='CHARTBRO_OOS_v1';
const STATE_FILE=process.env.CHARTBRO_OOS_STATE_FILE||path.join('/tmp','pulseradar-chartbro-oos.json');
const MAX_OBSERVATIONS=2400,MAX_TRANSITIONS=6000,MAX_FAILURES=2400,MAX_ALERTS=2400;
const HORIZONS=Object.freeze({h1:3600000,h4:4*3600000,h12:12*3600000,h24:24*3600000});
const READY_STATUSES=new Set(['LONG_READY','SHORT_READY','BLOCKED_REVIEW']);
const POLICY=Object.freeze({
  minEvaluated24h:30,minSessions:2,minSuccessRate:.52,maxRankingAdjustment:5,
  challengerMinSamples:30,challengerMinDeltaSuccessRate:.05,minRr:1.5
});
const CHAMPION=Object.freeze({id:'chartbro-v1.0.0',label:'현재 운영 규칙',minRr:1.5,mss:'5m_or_15m',ipdaFilter:false,rankWeight:0});
const CHALLENGERS=Object.freeze([
  {id:'rr-2.0',label:'최소 RR 2.0',predicate:o=>(Number(o.riskReward)||0)>=2},
  {id:'mss-15m-only',label:'15m MSS 전용',predicate:o=>String(o.mssTf||'')==='15m'},
  {id:'ipda-location',label:'IPDA 위치 필터',predicate:o=>o.side==='LONG'?o.ipdaPosition==='DISCOUNT':o.ipdaPosition==='PREMIUM'},
  {id:'ny-only',label:'New York 스윕 전용',predicate:o=>o.session==='NEW_YORK'},
  {id:'london-to-ny',label:'London → New York 연속',predicate:o=>o.sessionPattern==='LONDON_TO_NEW_YORK'},
  {id:'normal-derivatives',label:'OI·Funding 정상대역',predicate:o=>Math.abs(Number(o.fundingRatePct)||0)<=.03&&(Number(o.oi4hPct)||0)>=0&&(Number(o.oi4hPct)||0)<=6},
  {id:'tight-zone',label:'FVG/OB 폭 ≤ 0.5R',predicate:o=>o.zone&&Number(o.risk)>0&&Math.abs(Number(o.zone.high)-Number(o.zone.low))/Number(o.risk)<=.5}
]);

function n(v,d=null){if(v===null||v===undefined||v==='')return d;const x=Number(v);return Number.isFinite(x)?x:d}
function clean(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function hash(v){return crypto.createHash('sha256').update(String(v)).digest('hex').slice(0,24)}
function bounded(rows,max){return rows.length>max?rows.slice(-max):rows}
function bar(x){
  if(!Array.isArray(x)||x.length<7)return null;
  const b={openTime:n(x[0]),open:n(x[1]),high:n(x[2]),low:n(x[3]),close:n(x[4]),closeTime:n(x[6])};
  return Object.values(b).every(Number.isFinite)?b:null;
}
function closedRows(rows=[],asOf=Date.now()){
  return (Array.isArray(rows)?rows:[]).map(bar).filter(Boolean).filter(x=>x.closeTime<=asOf).sort((a,b)=>a.openTime-b.openTime);
}
function sideOf(plan={}){const s=String(plan.status||'');return s.includes('SHORT')||plan.side==='SHORT'?'SHORT':'LONG'}
function stageOf(plan={}){
  const s=String(plan.status||'');
  if(!s||s==='NO_ASIA_RANGE'||s==='WAIT_SWEEP'||s==='WAIT_BREAKOUT')return'ACCUMULATION';
  if(s==='WAIT_RECLAIM')return'SWEEP_DETECTED';
  if(s==='WAIT_MSS')return'RECLAIMED';
  if(s==='WAIT_DISPLACEMENT')return'MSS_CONFIRMED';
  if(s==='WAIT_ZONE')return'DISPLACEMENT_CONFIRMED';
  if(s==='WAIT_RETRACE')return'RETRACE_WAIT';
  if(s==='WAIT_REBREAK')return'RETEST_HELD';
  if(s==='LONG_READY'||s==='SHORT_READY')return'READY';
  if(s==='BLOCKED_REVIEW')return'READY_BLOCKED';
  if(s==='BLOCKED_CONFLICT')return'CONFLICT';
  if(s==='INVALID')return'INVALIDATED';
  if(/^NO_/.test(s)||/^BLOCKED_/.test(s))return'BLOCKED';
  return'OBSERVE';
}
function transitionKind(prevStage,nextStage){
  if(nextStage==='SWEEP_DETECTED')return'SWEEP_DETECTED';
  if(nextStage==='MSS_CONFIRMED')return'MSS_CONFIRMED';
  if(nextStage==='DISPLACEMENT_CONFIRMED')return'DISPLACEMENT_CONFIRMED';
  if(nextStage==='RETRACE_WAIT')return'RETRACE_WAIT';
  if(nextStage==='RETEST_HELD')return'RETEST_HELD';
  if(nextStage==='READY')return'READY';
  if(nextStage==='READY_BLOCKED')return'READY_BLOCKED';
  if(nextStage==='INVALIDATED')return'INVALIDATED';
  if(nextStage==='CONFLICT')return'TWO_SIDED_CONFLICT';
  if(prevStage!==nextStage)return'STAGE_CHANGE';
  return null;
}
function sessionOf(plan={}){return String(plan?.sweep?.session||plan?.session||'UNKNOWN')}
function priceAtOrBefore(rows,target){
  let last=null;for(const x of rows){if(x.closeTime<=target)last=x;else break}return last;
}
function pathBetween(rows,start,end){return rows.filter(x=>x.closeTime>start&&x.closeTime<=end)}
function sideReturn(side,entry,price){if(!(entry>0)||!Number.isFinite(price))return null;return side==='SHORT'?(entry/price-1)*100:(price/entry-1)*100}
function rrMove(side,entry,risk,price){if(!(risk>0)||!(entry>0)||!Number.isFinite(price))return null;return side==='SHORT'?(entry-price)/risk:(price-entry)/risk}
function firstBarrier(rows,o){
  const entry=n(o.entry),stop=n(o.stop),target=n(o.selectedTargetPrice),side=o.side;
  if(!(entry>0)||!(stop>0)||!(target>0))return{status:'NO_LEVELS',at:null};
  for(const x of rows){
    const hitStop=side==='SHORT'?x.high>=stop:x.low<=stop;
    const hitTarget=side==='SHORT'?x.low<=target:x.high>=target;
    if(hitStop&&hitTarget)return{status:'AMBIGUOUS_SAME_CANDLE',at:x.closeTime};
    if(hitTarget)return{status:'TARGET_FIRST',at:x.closeTime};
    if(hitStop)return{status:'STOP_FIRST',at:x.closeTime};
  }
  return{status:'NONE',at:null};
}
function classifyOutcome(o){
  const h=o.outcomes?.h24;if(!h||h.status!=='EVALUATED')return null;
  if(o.barrier?.status==='TARGET_FIRST')return'SUCCESS_TARGET';
  if(o.barrier?.status==='STOP_FIRST')return h.mfeR!=null&&h.mfeR<.5?'FAIL_NO_EXPANSION':'FAIL_STOP';
  if(o.barrier?.status==='AMBIGUOUS_SAME_CANDLE')return'AMBIGUOUS';
  if(h.mfeR!=null&&h.mfeR>=1.5)return'SUCCESS_MFE';
  if(h.mfeR!=null&&h.mfeR<.5)return'FAIL_NO_EXPANSION';
  if(h.maeR!=null&&h.maeR<=-1)return'FAIL_REVERSAL';
  return'TIMEOUT_PARTIAL';
}
function initialState(){
  return{version:VERSION,updatedAt:Date.now(),observations:[],transitions:[],failures:[],alerts:[],symbolStates:{},policy:POLICY,champion:CHAMPION};
}
function sanitize(raw){
  const b=initialState(),s=raw&&typeof raw==='object'?{...b,...raw}:b;
  for(const k of ['observations','transitions','failures','alerts'])if(!Array.isArray(s[k]))s[k]=[];
  if(!s.symbolStates||typeof s.symbolStates!=='object')s.symbolStates={};
  s.version=VERSION;s.policy=POLICY;s.champion=CHAMPION;return s;
}
function loadState(){
  try{return sanitize(JSON.parse(fs.readFileSync(STATE_FILE,'utf8')))}catch{return initialState()}
}
function persistState(state){
  try{fs.mkdirSync(path.dirname(STATE_FILE),{recursive:true});fs.writeFileSync(STATE_FILE,JSON.stringify(state));return true}catch{return false}
}
function observationId({symbol,side,plan,asOf}={}){
  const trigger=n(plan?.rebreakAt)??n(plan?.retestAt)??n(plan?.sweep?.at)??asOf;
  return'cb:'+hash([clean(symbol),side,String(plan?.model||'AMD'),trigger].join('|'));
}
function snapshot(row={},plan={},side='LONG',asOf=Date.now(),market={}){
  const entry=n(plan.entry,n(plan.plannedEntry,n(row.lastPrice))),stop=n(plan.stop),risk=entry!=null&&stop!=null?Math.abs(entry-stop):null;
  const selected=plan.selectedTarget||plan.nearestTarget||null,target=n(selected?.price),rr=n(plan.riskReward,n(selected?.rr));
  const context=row.chartbroContext||{},sweepSession=sessionOf(plan),continuationSession=plan.rebreakAt?ChartBroContext.sessionOf(plan.rebreakAt):plan.retestAt?ChartBroContext.sessionOf(plan.retestAt):'UNKNOWN',sessionPattern=sweepSession==='LONDON'&&continuationSession==='NEW_YORK'?'LONDON_TO_NEW_YORK':continuationSession&&continuationSession!=='UNKNOWN'&&sweepSession!=='UNKNOWN'?(sweepSession===continuationSession?sweepSession+'_INTRA':sweepSession+'_TO_'+continuationSession):sweepSession;
  return{
    id:observationId({symbol:row.symbol,side,plan,asOf}),symbol:clean(row.symbol),side,model:String(plan.model||'AMD_SESSION'),
    capturedAt:asOf,tradeDate:String(plan.tradeDate||context?.levels?.tradeDate||''),session:sweepSession,continuationSession,sessionPattern,statusAtCapture:String(plan.status||''),
    stageAtCapture:stageOf(plan),entry,stop,risk,selectedTargetPrice:target,riskReward:rr,mssTf:String(plan?.mss?.tf||''),
    sweepAt:n(plan?.sweep?.at),reclaimAt:n(plan?.reclaimAt),mssAt:n(plan?.mss?.at),displacementAt:n(plan?.displacement?.at),retestAt:n(plan?.retestAt),rebreakAt:n(plan?.rebreakAt),
    zone:clone(plan.zone||null),astraType:String(row.verdict?.key||''),astraScore:n(row.verdict?.score),commonStage:String(row.commonPreignition?.stage||''),
    regime:String(market?.regime||'UNKNOWN'),fundingRatePct:n(row.fundingRatePct),oi4hPct:n(row.oi4hPct),
    macroStatus:String(context?.reviews?.macro?.status||'UNKNOWN'),derivativesStatus:String((side==='LONG'?context?.reviews?.longDerivatives:context?.reviews?.shortDerivatives)?.status||'UNKNOWN'),
    executionStatus:String(context?.reviews?.execution?.status||'UNKNOWN'),ipdaPosition:String(context?.levels?.dealingRange?.position||'UNKNOWN'),
    sampleType:'FORWARD_CHARTBRO',label:null,outcomes:Object.fromEntries(Object.keys(HORIZONS).map(k=>[k,{status:'PENDING',targetAt:asOf+HORIZONS[k]}])),barrier:null,finalLabel:null,resolvedAt:null
  };
}
function evaluateObservation(o,frames={},asOf=Date.now()){
  if(!o||o.finalLabel)return false;
  const rows=closedRows(frames['5m']||frames['15m']||[],asOf);if(!rows.length)return false;
  let changed=false;
  for(const [key,ms] of Object.entries(HORIZONS)){
    const h=o.outcomes?.[key];if(!h||h.status!=='PENDING'||asOf<o.capturedAt+ms)continue;
    const p=pathBetween(rows,o.capturedAt,o.capturedAt+ms),last=priceAtOrBefore(rows,o.capturedAt+ms);
    if(!last||!p.length)continue;
    const maxR=Math.max(...p.map(x=>rrMove(o.side,o.entry,o.risk,o.side==='SHORT'?x.low:x.high)).filter(Number.isFinite));
    const minR=Math.min(...p.map(x=>rrMove(o.side,o.entry,o.risk,o.side==='SHORT'?x.high:x.low)).filter(Number.isFinite));
    o.outcomes[key]={status:'EVALUATED',targetAt:o.capturedAt+ms,closeAt:last.closeTime,returnPct:sideReturn(o.side,o.entry,last.close),returnR:rrMove(o.side,o.entry,o.risk,last.close),mfeR:Number.isFinite(maxR)?maxR:null,maeR:Number.isFinite(minR)?minR:null};
    changed=true;
  }
  const p24=pathBetween(rows,o.capturedAt,Math.min(asOf,o.capturedAt+HORIZONS.h24));
  if(!o.barrier&&p24.length){o.barrier=firstBarrier(p24,o);changed=true}
  if(o.outcomes?.h24?.status==='EVALUATED'){
    o.finalLabel=classifyOutcome(o);o.label=/^SUCCESS/.test(String(o.finalLabel))?1:/^FAIL/.test(String(o.finalLabel))?0:null;o.resolvedAt=asOf;changed=true;
  }
  return changed;
}
function failureType(prev={},plan={},context={}){
  const s=String(plan.status||''),prevStatus=String(prev.status||'');
  if(s==='BLOCKED_CONFLICT')return'TWO_SIDED_LIQUIDITY';
  if(s==='NO_LONG_RR'||s==='NO_SHORT_RR')return'NO_1_5R_SPACE';
  if(s==='NO_LONG_TARGET_CONSUMED'||s==='NO_SHORT_TARGET_CONSUMED')return'TARGET_ALREADY_CONSUMED';
  if(s==='BLOCKED_REVIEW'){
    const macro=context?.reviews?.macro?.status,der=prev.side==='SHORT'?context?.reviews?.shortDerivatives?.status:context?.reviews?.longDerivatives?.status,ex=context?.reviews?.execution?.status;
    if(macro==='BLOCKED'||macro==='WATCH')return'MACRO_EVENT_RISK';
    if(der==='BLOCKED')return'OI_FUNDING_CROWDING';
    if(ex==='BLOCKED')return'EXECUTION_RISK';
    return'REVIEW_INCOMPLETE';
  }
  if(s==='INVALID'){
    if(prevStatus==='WAIT_MSS')return'SWEEP_NO_MSS';
    if(prevStatus==='WAIT_DISPLACEMENT')return'MSS_NO_DISPLACEMENT';
    if(['WAIT_ZONE','WAIT_RETRACE','WAIT_REBREAK'].includes(prevStatus))return'RETEST_INVALIDATED';
    return'STRUCTURE_INVALIDATED';
  }
  return null;
}
function timeoutFailure(prev={},nextTradeDate=''){
  if(!prev.tradeDate||!nextTradeDate||prev.tradeDate===nextTradeDate)return null;
  const s=String(prev.status||'');
  if(s==='WAIT_MSS')return'SWEEP_NO_MSS_TIMEOUT';
  if(s==='WAIT_DISPLACEMENT')return'MSS_NO_DISPLACEMENT_TIMEOUT';
  if(s==='WAIT_RETRACE')return'NO_RETRACE_TIMEOUT';
  if(s==='WAIT_REBREAK')return'RETEST_NO_REBREAK_TIMEOUT';
  return null;
}
function alertFor(kind,row,side,plan,asOf){
  const map={SWEEP_DETECTED:2,MSS_CONFIRMED:3,RETRACE_WAIT:3,RETEST_HELD:4,READY:5,READY_BLOCKED:4,INVALIDATED:5,TWO_SIDED_CONFLICT:5};
  if(!(kind in map))return null;
  return{id:'cb-alert:'+hash([row.symbol,side,kind,asOf].join('|')),symbol:clean(row.symbol),side,kind,severity:map[kind],capturedAt:asOf,status:String(plan.status||''),stage:stageOf(plan),session:sessionOf(plan),entry:n(plan.entry,n(plan.plannedEntry)),stop:n(plan.stop),riskReward:n(plan.riskReward,n(plan.selectedTarget?.rr)),label:String(plan.label||'')};
}
function metrics(rows=[]){
  const evaled=rows.filter(x=>x.finalLabel),wins=evaled.filter(x=>/^SUCCESS/.test(String(x.finalLabel))),h24=evaled.map(x=>x.outcomes?.h24).filter(Boolean);
  const avg=a=>{const xs=a.filter(Number.isFinite);return xs.length?xs.reduce((s,x)=>s+x,0)/xs.length:null};
  return{count:rows.length,evaluated:evaled.length,wins:wins.length,successRate:evaled.length?wins.length/evaled.length:null,
    avgR24:avg(h24.map(x=>x.returnR)),avgReturn24Pct:avg(h24.map(x=>x.returnPct)),
    avgMfeR:avg(h24.map(x=>x.mfeR)),avgMaeR:avg(h24.map(x=>x.maeR))};
}
function groupMetrics(rows,keyFn){
  const m=new Map();for(const x of rows){const k=String(keyFn(x)||'UNKNOWN');if(!m.has(k))m.set(k,[]);m.get(k).push(x)}
  return Object.fromEntries([...m.entries()].map(([k,v])=>[k,metrics(v)]));
}
function challengeStats(rows=[]){
  const champion=metrics(rows);
  const challengers=CHALLENGERS.map(c=>{
    const eligible=rows.filter(c.predicate),m=metrics(eligible),delta=m.successRate!=null&&champion.successRate!=null?m.successRate-champion.successRate:null;
    const promotionReady=m.evaluated>=POLICY.challengerMinSamples&&delta!=null&&delta>=POLICY.challengerMinDeltaSuccessRate&&(m.avgReturn24Pct??0)>0;
    return{id:c.id,label:c.label,...m,deltaSuccessRate:delta,promotionReady,state:promotionReady?'CHALLENGER_READY':'SHADOW'};
  });
  return{champion:{...CHAMPION,...champion,state:'CHAMPION'},challengers};
}
function productionGate(rows=[]){
  const m=metrics(rows),sessions=new Set(rows.filter(x=>x.finalLabel).map(x=>x.session).filter(x=>x&&x!=='UNKNOWN'));
  const checks=[
    {key:'evaluated24h',ok:m.evaluated>=POLICY.minEvaluated24h,actual:m.evaluated,required:POLICY.minEvaluated24h},
    {key:'sessions',ok:sessions.size>=POLICY.minSessions,actual:sessions.size,required:POLICY.minSessions},
    {key:'successRate',ok:m.successRate!=null&&m.successRate>=POLICY.minSuccessRate,actual:m.successRate,required:POLICY.minSuccessRate}
  ];
  return{passed:checks.every(x=>x.ok),checks,rankWeight:checks.every(x=>x.ok)?POLICY.maxRankingAdjustment:0};
}
function rankingAdjustmentForRow(row={},stats={}){
  if(!stats?.productionGate?.passed)return 0;
  const long=String(row.longEntry?.status||''),short=String(row.shortEntry?.status||'');
  if(long==='LONG_READY'||short==='SHORT_READY')return POLICY.maxRankingAdjustment;
  if(['INVALID','BLOCKED_CONFLICT'].includes(long)||['INVALID','BLOCKED_CONFLICT'].includes(short))return-3;
  return 0;
}

class ChartBroOosService{
  constructor({store=null}={}){this.store=store;this.state=loadState();this.hydrated=false}
  async hydrate(){
    if(this.hydrated)return false;this.hydrated=true;
    if(this.store&&typeof this.store.getState==='function'){
      try{const remote=await this.store.getState('chartbro-oos:state');if(remote&&Number(remote.updatedAt||0)>=Number(this.state.updatedAt||0))this.state=sanitize(remote)}catch(_e){}
    }
    return true;
  }
  async flush(){
    persistState(this.state);
    if(this.store&&typeof this.store.putState==='function'){try{await this.store.putState('chartbro-oos:state',this.state);return true}catch{return false}}
    return true;
  }
  _stateKey(symbol,side){return clean(symbol)+':'+side}
  _appendFailure(row){if(!row?.id||this.state.failures.some(x=>x.id===row.id))return;this.state.failures=bounded([...this.state.failures,row],MAX_FAILURES)}
  _appendTransition(row){if(!row?.id||this.state.transitions.some(x=>x.id===row.id))return;this.state.transitions=bounded([...this.state.transitions,row],MAX_TRANSITIONS)}
  _appendAlert(row){if(!row?.id||this.state.alerts.some(x=>x.id===row.id))return;this.state.alerts=bounded([...this.state.alerts,row],MAX_ALERTS)}
  observe({row={},frames={},asOf=Date.now(),market={}}={}){
    let changed=false;
    for(const o of this.state.observations)if(o.symbol===clean(row.symbol)&&evaluateObservation(o,frames,asOf))changed=true;
    for(const [side,plan] of [['LONG',row.longEntry],['SHORT',row.shortEntry]]){
      if(!plan)continue;
      const key=this._stateKey(row.symbol,side),prev=this.state.symbolStates[key]||null,nextStage=stageOf(plan),kind=transitionKind(prev?.stage,nextStage),tradeDate=String(plan.tradeDate||row.chartbroContext?.levels?.tradeDate||'');
      const timeout=prev?timeoutFailure(prev,tradeDate):null;
      if(timeout){
        this._appendFailure({id:'cb-fail:'+hash([key,timeout,prev.tradeDate].join('|')),sampleType:'NEGATIVE_CHARTBRO',label:0,symbol:clean(row.symbol),side,type:timeout,capturedAt:asOf,session:prev.session||'UNKNOWN',previousStatus:prev.status,currentStatus:String(plan.status||''),tradeDate:prev.tradeDate,astraType:String(row.verdict?.key||''),commonStage:String(row.commonPreignition?.stage||''),fundingRatePct:n(row.fundingRatePct),oi4hPct:n(row.oi4hPct),ipdaPosition:String(row.chartbroContext?.levels?.dealingRange?.position||'UNKNOWN')});changed=true;
      }
      if(kind&&(!prev||prev.stage!==nextStage||prev.status!==plan.status)){
        const tr={id:'cb-tr:'+hash([key,kind,asOf].join('|')),symbol:clean(row.symbol),side,kind,fromStage:prev?.stage||null,toStage:nextStage,fromStatus:prev?.status||null,toStatus:String(plan.status||''),capturedAt:asOf,tradeDate,session:sessionOf(plan),astraType:String(row.verdict?.key||''),commonStage:String(row.commonPreignition?.stage||'')};
        this._appendTransition(tr);const al=alertFor(kind,row,side,plan,asOf);if(al)this._appendAlert(al);changed=true;
      }
      const fail=failureType({...prev,side},plan,row.chartbroContext||{});
      if(fail){
        this._appendFailure({id:'cb-fail:'+hash([key,fail,tradeDate,String(plan.status||'')].join('|')),sampleType:'NEGATIVE_CHARTBRO',label:0,symbol:clean(row.symbol),side,type:fail,capturedAt:asOf,session:sessionOf(plan),stage:stageOf(plan),previousStatus:prev?.status||null,currentStatus:String(plan.status||''),tradeDate,astraType:String(row.verdict?.key||''),astraScore:n(row.verdict?.score),commonStage:String(row.commonPreignition?.stage||''),fundingRatePct:n(row.fundingRatePct),oi4hPct:n(row.oi4hPct),ipdaPosition:String(row.chartbroContext?.levels?.dealingRange?.position||'UNKNOWN'),macroStatus:row.chartbroContext?.reviews?.macro?.status||null,derivativesStatus:(side==='LONG'?row.chartbroContext?.reviews?.longDerivatives:row.chartbroContext?.reviews?.shortDerivatives)?.status||null,executionStatus:row.chartbroContext?.reviews?.execution?.status||null,reasons:Array.isArray(plan.reasons)?plan.reasons.slice(0,6):[]});changed=true;
      }
      if(READY_STATUSES.has(String(plan.status||''))){
        const o=snapshot(row,plan,side,asOf,market);
        if(!this.state.observations.some(x=>x.id===o.id)){this.state.observations=bounded([...this.state.observations,o],MAX_OBSERVATIONS);changed=true}
      }
      this.state.symbolStates[key]={symbol:clean(row.symbol),side,status:String(plan.status||''),stage:nextStage,tradeDate,session:sessionOf(plan),updatedAt:asOf};
    }
    const gate=productionGate(this.state.observations),adjustment=rankingAdjustmentForRow(row,{productionGate:gate});
    const item={version:VERSION,shadowOnly:!gate.passed,productionGate:gate,rankingAdjustment:adjustment,lastAlerts:this.state.alerts.filter(x=>x.symbol===clean(row.symbol)).slice(-3),lastFailures:this.state.failures.filter(x=>x.symbol===clean(row.symbol)).slice(-3)};
    this.state.updatedAt=asOf;if(changed)persistState(this.state);
    return{item,changed};
  }
  stats(){
    const rows=this.state.observations,gate=productionGate(rows),comp=challengeStats(rows),failureCounts={},transitionCounts={};
    for(const f of this.state.failures)failureCounts[f.type]=(failureCounts[f.type]||0)+1;
    for(const t of this.state.transitions)transitionCounts[t.kind]=(transitionCounts[t.kind]||0)+1;
    const funnel={sweep:transitionCounts.SWEEP_DETECTED||0,mss:transitionCounts.MSS_CONFIRMED||0,retrace:transitionCounts.RETRACE_WAIT||0,retest:transitionCounts.RETEST_HELD||0,ready:transitionCounts.READY||0};
    funnel.mssFromSweep=funnel.sweep?funnel.mss/funnel.sweep:null;funnel.retraceFromMss=funnel.mss?funnel.retrace/funnel.mss:null;funnel.readyFromRetest=funnel.retest?funnel.ready/funnel.retest:null;
    return{version:VERSION,updatedAt:this.state.updatedAt,observations:rows.length,evaluated24h:rows.filter(x=>x.finalLabel).length,pending24h:rows.filter(x=>!x.finalLabel).length,
      overall:metrics(rows),bySide:groupMetrics(rows,x=>x.side),bySession:groupMetrics(rows,x=>x.session),bySessionPattern:groupMetrics(rows,x=>x.sessionPattern),byAstraType:groupMetrics(rows,x=>x.astraType),byCommonStage:groupMetrics(rows,x=>x.commonStage),byAstraChartbro:groupMetrics(rows,x=>(x.astraType||'UNKNOWN')+'|'+(x.side||'UNKNOWN')+'|'+(x.sessionPattern||x.session||'UNKNOWN')),
      failureCounts,transitionCounts,funnel,productionGate:gate,competition:comp,alertCount:this.state.alerts.length,transitionCount:this.state.transitions.length,recentAlerts:this.state.alerts.slice(-8).reverse(),recentFailures:this.state.failures.slice(-8).reverse(),persistence:{file:STATE_FILE,mode:this.store?'external-store+runtime-file':'runtime-file'}};
  }

  pendingSymbols({asOf=Date.now(),limit=48}={}){
    const map=new Map();
    for(const o of this.state.observations){
      if(o.finalLabel||!o.symbol)continue;
      const due=Number(o.capturedAt||0)+HORIZONS.h1;
      if(due>asOf)continue;
      const prev=map.get(o.symbol);if(!prev||Number(o.capturedAt||0)<prev.capturedAt)map.set(o.symbol,{symbol:o.symbol,capturedAt:Number(o.capturedAt||0),nextDueAt:due});
    }
    return [...map.values()].sort((a,b)=>a.capturedAt-b.capturedAt).slice(0,Math.max(1,Math.min(200,Number(limit)||48)));
  }
  evaluateSymbol({symbol,frames={},asOf=Date.now()}={}){
    const sym=clean(symbol);let evaluated=0,changed=0;
    for(const o of this.state.observations){
      if(o.symbol!==sym||o.finalLabel)continue;
      const before24=o.outcomes?.h24?.status;
      if(evaluateObservation(o,frames,asOf)){changed++;if(before24!=='EVALUATED'&&o.outcomes?.h24?.status==='EVALUATED')evaluated++}
    }
    if(changed){this.state.updatedAt=asOf;persistState(this.state)}
    return{symbol:sym,changed,evaluated,pending:this.state.observations.filter(x=>x.symbol===sym&&!x.finalLabel).length};
  }
  list({kind='observations',symbol=null,limit=100}={}){
    const key=['observations','transitions','failures','alerts'].includes(kind)?kind:'observations',sym=symbol?clean(symbol):null;
    return this.state[key].filter(x=>!sym||x.symbol===sym).slice().sort((a,b)=>Number(b.capturedAt||0)-Number(a.capturedAt||0)).slice(0,Math.max(1,Math.min(500,Number(limit)||100)));
  }
  experiments(){return challengeStats(this.state.observations)}
  exportState(){return clone(this.state)}
}
let singleton;
function defaultChartBroOosService(opts={}){if(!singleton)singleton=new ChartBroOosService(opts);else if(opts.store&&!singleton.store)singleton.store=opts.store;return singleton}

module.exports={VERSION,HORIZONS,POLICY,CHAMPION,CHALLENGERS,stageOf,transitionKind,closedRows,snapshot,evaluateObservation,failureType,timeoutFailure,metrics,productionGate,challengeStats,rankingAdjustmentForRow,ChartBroOosService,defaultChartBroOosService};
