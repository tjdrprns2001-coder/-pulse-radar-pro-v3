(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseLiquidityEventJournal=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';

const VERSION='LIQUIDITY_EVENT_JOURNAL_v1.1';
const EVENT_VERSION=1;
const STORAGE_KEY='pulse-liquidity-event-journal-v1-1';
const MAX_ENTRIES=200;
const HORIZONS=Object.freeze({h4:4,h12:12,h24:24,h48:48});
const TERMINAL=new Set(['REACHED','INVALIDATED_BEFORE_REACH','AMBIGUOUS','EXPIRED','NO_SIGNAL']);
const finite=v=>Number.isFinite(Number(v));
const n=(v,d=null)=>finite(v)?Number(v):d;
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const ms=t=>{const x=n(t,0);return x>0&&x<1e12?x*1000:x};

function stableStringify(obj){
  if(obj==null||typeof obj!=='object')return JSON.stringify(obj);
  if(Array.isArray(obj))return '['+obj.map(stableStringify).join(',')+']';
  return '{'+Object.keys(obj).sort().map(k=>JSON.stringify(k)+':'+stableStringify(obj[k])).join(',')+'}';
}
function fnv1a(s){let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)}return(h>>>0).toString(16).padStart(8,'0')}
function normalizeCandles(rows=[]){
  return (Array.isArray(rows)?rows:[]).filter(Boolean).filter(x=>x.partial!==true).map((x,i)=>({
    index:i,time:ms(x.time??x.openTime??i),open:n(x.open),high:n(x.high),low:n(x.low),close:n(x.close),volume:n(x.volume,0)
  })).filter(x=>[x.open,x.high,x.low,x.close].every(finite)).sort((a,b)=>a.time-b.time);
}
function modelCandle(model,index){return model?.candles?.[Number(index)]||null}
function eventTime(model,index,fallback=null){return ms(modelCandle(model,index)?.time??fallback??0)||null}
function eventPrice(model,index,fallback=null){return n(modelCandle(model,index)?.close,fallback)}
function rawEvents({model,trendRetest}={}){
  const out=[],s=model?.scenario||{},sw=s.sweep||{},tl=trendRetest?.primary,smc=model?.smc||{};
  if(sw.last){
    const i=n(sw.index,sw.last.index??sw.last.sweepIndex??sw.last.confirmedAt??null),t=eventTime(model,i,sw.last.time),p=n(sw.last.level??sw.last.price,eventPrice(model,i));
    out.push({eventType:'LIQ_SWEEP',candleIndex:i,candleTime:t,confirmedAt:t,price:p,direction:sw.dir||null,status:'CONFIRMED',sourceEngine:model?.version||null});
    if(sw.confirmed)out.push({eventType:'RECLAIM',candleIndex:i,candleTime:t,confirmedAt:t,price:eventPrice(model,i,p),direction:sw.dir||null,status:'CONFIRMED',sourceEngine:model?.version||null,linkHint:'LIQ_SWEEP'});
  }
  if(tl?.breakout){
    out.push({eventType:'TL_BREAK',candleIndex:n(tl.breakout.barIndex),candleTime:ms(tl.breakout.time),confirmedAt:ms(tl.breakout.time),price:n(tl.breakout.close),linePrice:n(tl.breakout.linePrice),atrFrozen:n(tl.breakout.frozenAtr),paramsHash:tl.paramsHash||null,lineId:tl.line?.lineId||null,direction:tl.breakout.direction||null,status:'CONFIRMED',sourceEngine:trendRetest?.version||null});
  }
  if(tl?.retest?.firstTouchBarIndex!=null){
    out.push({eventType:'TL_RETEST_TOUCH',candleIndex:n(tl.retest.firstTouchBarIndex),candleTime:ms(tl.retest.firstTouchTime),confirmedAt:ms(tl.retest.firstTouchTime),price:eventPrice(model,tl.retest.firstTouchBarIndex),linePrice:n(tl.current?.linePrice),atrFrozen:n(tl.breakout?.frozenAtr),paramsHash:tl.paramsHash||null,lineId:tl.line?.lineId||null,status:'DETECTED',sourceEngine:trendRetest?.version||null,linkHint:'TL_BREAK'});
  }
  if(tl?.state==='CONFIRMED'){
    out.push({eventType:'TL_RETEST_CONFIRMED',candleIndex:n(tl.retest?.confirmedBarIndex),candleTime:ms(tl.retest?.confirmedTime),confirmedAt:ms(tl.retest?.confirmedTime),price:eventPrice(model,tl.retest?.confirmedBarIndex),linePrice:n(tl.current?.linePrice),atrFrozen:n(tl.breakout?.frozenAtr),paramsHash:tl.paramsHash||null,lineId:tl.line?.lineId||null,status:'CONFIRMED',sourceEngine:trendRetest?.version||null,linkHint:'TL_RETEST_TOUCH'});
  }
  if(tl?.state==='FAILED'){
    out.push({eventType:'TL_RETEST_FAILED',candleIndex:n(tl.failedAt?.barIndex),candleTime:ms(tl.failedAt?.time),confirmedAt:ms(tl.failedAt?.time),price:n(tl.failedAt?.close),linePrice:n(tl.failedAt?.linePrice),atrFrozen:n(tl.breakout?.frozenAtr),paramsHash:tl.paramsHash||null,lineId:tl.line?.lineId||null,status:'CONFIRMED',sourceEngine:trendRetest?.version||null,linkHint:'TL_RETEST_TOUCH'});
  }
  const mss=Array.isArray(smc.mss)?smc.mss.at(-1):null;
  if(mss){
    const i=n(mss.index,mss.i??mss.confirmedAt??null),t=eventTime(model,i,mss.time);
    out.push({eventType:'MSS',candleIndex:i,candleTime:t,confirmedAt:t,price:n(mss.level,eventPrice(model,i)),direction:mss.dir||null,status:'CONFIRMED',sourceEngine:'smc'});
  }
  const disp=Array.isArray(smc.displacements)?smc.displacements.at(-1):null;
  if(disp){
    const i=n(disp.index,disp.i??disp.confirmedAt??null),t=eventTime(model,i,disp.time);
    out.push({eventType:'DISPLACEMENT',candleIndex:i,candleTime:t,confirmedAt:t,price:eventPrice(model,i),direction:disp.dir||null,status:'CONFIRMED',sourceEngine:'smc'});
  }
  const seen=new Set();
  return out.filter(x=>{const k=[x.eventType,x.candleIndex,x.candleTime,x.lineId||''].join('|');if(seen.has(k))return false;seen.add(k);return true})
    .sort((a,b)=>(n(a.candleTime,0)-n(b.candleTime,0))||(n(a.candleIndex,0)-n(b.candleIndex,0)));
}
function scenarioKey({symbol,timeframe,model,trendRetest}={}){
  const s=model?.scenario||{},sw=s.sweep||{},tl=trendRetest?.primary;
  const payload={symbol:String(symbol||'').toUpperCase(),timeframe:String(timeframe||''),direction:s.direction||null,targetType:s.target?.label||null,targetPrice:n(s.target?.price),sweepIndex:n(sw.index,sw.last?.index??sw.last?.sweepIndex??null),tlLineId:tl?.line?.lineId||null,tlParamsHash:tl?.paramsHash||null,liquidityVersion:model?.version||null};
  return 'LQS-'+fnv1a(stableStringify(payload));
}
function sequenceIdFor({symbol,timeframe,model,trendRetest}={}){
  const raw=rawEvents({model,trendRetest});
  const origin=raw.find(x=>['LIQ_SWEEP','TL_BREAK','MSS','DISPLACEMENT'].includes(x.eventType))||raw[0]||null;
  return 'LQSEQ-'+fnv1a(stableStringify({symbol:String(symbol||'').toUpperCase(),timeframe:String(timeframe||''),originType:origin?.eventType||'NO_EVENT',originTime:origin?.candleTime||model?.candles?.at(-1)?.time||null,lineId:origin?.lineId||null}));
}
function buildEvents({snapshotId,sequenceId,symbol,timeframe,model,trendRetest}={}){
  const rows=rawEvents({model,trendRetest}),decorated=[];
  for(const x of rows){
    const fingerprint=fnv1a(stableStringify({eventVersion:EVENT_VERSION,symbol,timeframe,eventType:x.eventType,candleIndex:x.candleIndex,candleTime:x.candleTime,lineId:x.lineId||null,paramsHash:x.paramsHash||null,price:x.price,linePrice:x.linePrice}));
    decorated.push({...x,eventId:'LQE-'+fingerprint,eventFingerprint:fingerprint,eventVersion:EVENT_VERSION,snapshotId,sequenceId,symbol,timeframe,parentEventId:null,invalidatedAt:null,invalidationReason:null,source:'liquidity_snapshot'});
  }
  const last=(type,predicate=()=>true)=>[...decorated].reverse().find(x=>x.eventType===type&&predicate(x))||null;
  for(const x of decorated){
    if(x.eventType==='RECLAIM')x.parentEventId=last('LIQ_SWEEP',y=>n(y.candleTime,0)<=n(x.candleTime,0))?.eventId||null;
    if(x.eventType==='TL_RETEST_TOUCH')x.parentEventId=last('TL_BREAK',y=>(!x.lineId||!y.lineId||x.lineId===y.lineId)&&n(y.candleTime,0)<=n(x.candleTime,0))?.eventId||null;
    if(x.eventType==='TL_RETEST_CONFIRMED'||x.eventType==='TL_RETEST_FAILED')x.parentEventId=(last('TL_RETEST_TOUCH',y=>(!x.lineId||!y.lineId||x.lineId===y.lineId)&&n(y.candleTime,0)<=n(x.candleTime,0))||last('TL_BREAK',y=>(!x.lineId||!y.lineId||x.lineId===y.lineId)&&n(y.candleTime,0)<=n(x.candleTime,0)))?.eventId||null;
  }
  return decorated;
}
function buildSnapshot({symbol,timeframe,model,trendRetest,now=Date.now()}={}){
  if(!model?.ok||!Array.isArray(model.candles)||!model.candles.length)throw new Error('liquidity model required');
  const last=model.candles.at(-1),capturedBarTime=ms(last.time),s=model.scenario||{},target=n(s.target?.price),invalidation=n(s.invalidation),params={liquidityEngineVersion:model.version||null,trendlineEngineVersion:trendRetest?.version||null,trendlineParamsHash:trendRetest?.paramsHash||trendRetest?.primary?.paramsHash||null};
  const sk=scenarioKey({symbol,timeframe,model,trendRetest}),sequenceId=sequenceIdFor({symbol,timeframe,model,trendRetest});
  const base={symbol:String(symbol||'').toUpperCase(),timeframe:String(timeframe||''),capturedBarTime,params,scenarioKey:sk,sequenceId};
  const id='LQJ-'+base.symbol+'-'+base.timeframe+'-'+String(capturedBarTime)+'-'+fnv1a(stableStringify(base)),events=buildEvents({snapshotId:id,sequenceId,symbol:base.symbol,timeframe:base.timeframe,model,trendRetest});
  return{
    id,version:VERSION,schemaVersion:1,scenarioKey:sk,sequenceId,symbol:base.symbol,timeframe:base.timeframe,capturedAt:n(now,Date.now()),capturedBarTime,capturedBarIndex:model.candles.length-1,
    referenceOnly:Boolean(model.referenceOnly),direction:s.direction||'none',bias:s.bias||null,stage:s.phase||null,signalState:events.length?'SIGNAL':'NO_SIGNAL',
    target:target==null?null:{type:s.target?.label||'DOL',price:target,side:s.target?.side||null,external:Boolean(s.target?.external),score:n(s.target?.score)},
    invalidation:invalidation==null?null:{price:invalidation},
    range:{low:n(model.range?.low),high:n(model.range?.high),mid:n(model.range?.mid),position:model.summary?.position||model.range?.position||null,positionPct:n(model.summary?.rangePositionPct)},
    params,trendline:trendRetest?.primary?{state:trendRetest.primary.state,stateLabel:trendRetest.primary.stateLabel,lineId:trendRetest.primary.line?.lineId||null,paramsHash:trendRetest.primary.paramsHash||null,quality:n(trendRetest.primary.quality?.score),transitionPath:clone(trendRetest.primary.transitionPath||[]),telemetry:clone(trendRetest.primary.telemetry||null)}:null,
    eventIds:events.map(x=>x.eventId)
  };
}
function newOutcome(snapshot){
  const horizons={};for(const [k,hours] of Object.entries(HORIZONS))horizons[k]={status:'PENDING',hours,mfePct:null,maePct:null,mfeAtr:null,maeAtr:null,reachedDol:null,failed:null,ambiguous:false,result:null};
  return{outcomeId:'LQO-'+fnv1a(snapshot.id),snapshotId:snapshot.id,sequenceId:snapshot.sequenceId,symbol:snapshot.symbol,timeframe:snapshot.timeframe,status:snapshot.signalState==='NO_SIGNAL'||snapshot.direction==='none'?'NO_SIGNAL':'PENDING_REFERENCE',referencePrice:null,referenceCandleIndex:null,referenceCandleTime:null,referenceBasis:'NEXT_CONFIRMED_CANDLE_OPEN',resolvedAt:null,resolvedCandleTime:null,resolvedCandleIndex:null,dol:{targetPrice:n(snapshot.target?.price),reachedAt:null,reachedCandleIndex:null,distancePct:null},invalidation:{price:n(snapshot.invalidation?.price),hitAt:null,hitCandleIndex:null},path:{mfePct:null,maePct:null,mfeAtr:null,maeAtr:null,barsObserved:0},horizons,coverage:'NONE',updatedAt:snapshot.capturedAt};
}
function directionalMove(reference,high,low,direction){
  if(!(reference>0))return{fav:0,adv:0};
  return direction==='down'?{fav:reference-low,adv:high-reference}:{fav:high-reference,adv:reference-low};
}
function hitState(snapshot,candle){
  const target=n(snapshot.target?.price),inv=n(snapshot.invalidation?.price),direction=String(snapshot.direction||'none');
  if(direction==='none')return{targetHit:false,invalidHit:false};
  return{
    targetHit:target!=null&&(direction==='down'?candle.low<=target:candle.high>=target),
    invalidHit:inv!=null&&(direction==='down'?candle.high>=inv:candle.low<=inv)
  };
}
function horizonMetrics(snapshot,outcome,rows,key,hours,latestTime){
  const refTime=n(outcome.referenceCandleTime),ref=n(outcome.referencePrice),atr=n(snapshot.referenceAtr??snapshot.entryAtr??snapshot.atrFrozen),end=refTime+hours*3600000;
  if(!refTime||!(ref>0))return{...outcome.horizons?.[key],status:'PENDING'};
  const window=rows.filter(x=>x.time>=refTime&&x.time<end);let maxFav=0,maxAdv=0,result='EXPIRED',reachedDol=false,failed=false,ambiguous=false;
  for(const c of window){
    const m=directionalMove(ref,c.high,c.low,snapshot.direction);maxFav=Math.max(maxFav,m.fav);maxAdv=Math.max(maxAdv,m.adv);
    const hit=hitState(snapshot,c);
    if(hit.targetHit&&hit.invalidHit){result='AMBIGUOUS';ambiguous=true;break}
    if(hit.targetHit){result='REACHED';reachedDol=true;break}
    if(hit.invalidHit){result='INVALIDATED_BEFORE_REACH';failed=true;break}
  }
  const finalized=latestTime>=end;
  return{status:finalized?'FINALIZED':'PENDING',hours,endTime:end,mfePct:maxFav/ref*100,maePct:maxAdv/ref*100,mfeAtr:atr>0?maxFav/atr:null,maeAtr:atr>0?maxAdv/atr:null,reachedDol:finalized?reachedDol:null,failed:finalized?failed:null,ambiguous:finalized?ambiguous:false,result:finalized?result:null};
}
function resolveOutcome(snapshot,priorOutcome=null,{referenceCandles=[],outcomeCandles=[]}={},now=Date.now()){
  const prior=priorOutcome?clone(priorOutcome):newOutcome(snapshot);
  if(snapshot.signalState==='NO_SIGNAL'||snapshot.direction==='none')return{...prior,status:'NO_SIGNAL',coverage:'FULL',updatedAt:now};
  const refRows=normalizeCandles(referenceCandles),outRows=normalizeCandles(outcomeCandles.length?outcomeCandles:referenceCandles);
  const reference=refRows.find(x=>x.time>snapshot.capturedBarTime);
  if(!reference)return{...prior,status:TERMINAL.has(prior.status)?prior.status:'PENDING_REFERENCE',coverage:refRows.some(x=>x.time===snapshot.capturedBarTime)?'FULL':'PARTIAL',updatedAt:now};
  const refPrice=reference.open,refIndex=reference.index,refTime=reference.time,rows=outRows.filter(x=>x.time>=refTime),latestTime=outRows.at(-1)?.time||0,coverage=refRows.some(x=>x.time===snapshot.capturedBarTime)?'FULL':'PARTIAL';
  let status=TERMINAL.has(prior.status)?prior.status:'PENDING',resolvedAt=prior.resolvedAt||null,resolvedCandleTime=prior.resolvedCandleTime||null,resolvedCandleIndex=prior.resolvedCandleIndex??null,targetAt=prior.dol?.reachedAt||null,targetIdx=prior.dol?.reachedCandleIndex??null,invalidAt=prior.invalidation?.hitAt||null,invalidIdx=prior.invalidation?.hitCandleIndex??null,maxFav=0,maxAdv=0,barsObserved=0;
  for(const c of rows){
    barsObserved++;const m=directionalMove(refPrice,c.high,c.low,snapshot.direction);maxFav=Math.max(maxFav,m.fav);maxAdv=Math.max(maxAdv,m.adv);
    if(!TERMINAL.has(status)){
      const hit=hitState(snapshot,c);
      if(hit.targetHit&&hit.invalidHit){status='AMBIGUOUS';resolvedAt=now;resolvedCandleTime=c.time;resolvedCandleIndex=c.index;targetAt=c.time;targetIdx=c.index;invalidAt=c.time;invalidIdx=c.index;continue}
      if(hit.targetHit){status='REACHED';resolvedAt=now;resolvedCandleTime=c.time;resolvedCandleIndex=c.index;targetAt=c.time;targetIdx=c.index;continue}
      if(hit.invalidHit){status='INVALIDATED_BEFORE_REACH';resolvedAt=now;resolvedCandleTime=c.time;resolvedCandleIndex=c.index;invalidAt=c.time;invalidIdx=c.index;continue}
    }
  }
  if(!TERMINAL.has(status)&&latestTime>=refTime+HORIZONS.h48*3600000){status='EXPIRED';resolvedAt=now;resolvedCandleTime=latestTime;resolvedCandleIndex=outRows.at(-1)?.index??null}
  const referenceAtr=n(snapshot.entryAtr??snapshot.referenceAtr),horizons={};
  const base={...prior,referencePrice:refPrice,referenceCandleIndex:refIndex,referenceCandleTime:refTime,referenceBasis:'NEXT_CONFIRMED_CANDLE_OPEN',coverage};
  for(const [k,hours] of Object.entries(HORIZONS))horizons[k]=horizonMetrics({...snapshot,entryAtr:referenceAtr},base,rows,k,hours,latestTime);
  const target=n(snapshot.target?.price),inv=n(snapshot.invalidation?.price);
  return{
    ...base,status,resolvedAt,resolvedCandleTime,resolvedCandleIndex,
    dol:{targetPrice:target,reachedAt:targetAt,reachedCandleIndex:targetIdx,distancePct:target!=null?(snapshot.direction==='down'?(refPrice-target):(target-refPrice))/refPrice*100:null},
    invalidation:{price:inv,hitAt:invalidAt,hitCandleIndex:invalidIdx,distancePct:inv!=null?(snapshot.direction==='down'?(inv-refPrice):(refPrice-inv))/refPrice*100:null},
    path:{mfePct:maxFav/refPrice*100,maePct:maxAdv/refPrice*100,mfeAtr:referenceAtr>0?maxFav/referenceAtr:null,maeAtr:referenceAtr>0?maxAdv/referenceAtr:null,barsObserved},
    horizons,updatedAt:now
  };
}
function emptyDb(){return{schemaVersion:1,version:VERSION,snapshots:[],events:[],outcomes:[]}}
function normalizeDb(v){return v&&Array.isArray(v.snapshots)&&Array.isArray(v.events)&&Array.isArray(v.outcomes)?v:emptyDb()}
function createMemoryStore(initial=emptyDb()){
  let db=clone(normalizeDb(initial));
  return{read(){return clone(db)},write(next){db=clone(normalizeDb(next));return true},clear(){db=emptyDb();return true},listSnapshots(){return clone(db.snapshots)},listEvents(){return clone(db.events)},listOutcomes(){return clone(db.outcomes)},export(){return clone(db)}};
}
function createLocalStorageStore(storage,key=STORAGE_KEY){
  if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function')throw new Error('localStorage adapter required');
  const read=()=>{try{return normalizeDb(JSON.parse(storage.getItem(key)||'null'))}catch{return emptyDb()}};
  return{read(){return clone(read())},write(next){storage.setItem(key,JSON.stringify(normalizeDb(next)));return true},clear(){storage.removeItem(key);return true},listSnapshots(){return clone(read().snapshots)},listEvents(){return clone(read().events)},listOutcomes(){return clone(read().outcomes)},export(){return clone(read())}};
}
function summarize(snapshots=[],outcomes=[]){
  const map=new Map(outcomes.map(x=>[x.snapshotId,x])),s={total:snapshots.length,pending:0,reached:0,invalidated:0,ambiguous:0,expired:0,noSignal:0,partial:0};
  for(const x of snapshots){const o=map.get(x.id)||{};if(o.status==='REACHED')s.reached++;else if(o.status==='INVALIDATED_BEFORE_REACH')s.invalidated++;else if(o.status==='AMBIGUOUS')s.ambiguous++;else if(o.status==='EXPIRED')s.expired++;else if(o.status==='NO_SIGNAL')s.noSignal++;else s.pending++;if(o.coverage==='PARTIAL')s.partial++}return s;
}
function recordAndResolve({store,snapshot,events=[],referenceCandles=[],outcomeCandles=[],now=Date.now(),maxEntries=MAX_ENTRIES}={}){
  if(!store||typeof store.read!=='function'||typeof store.write!=='function')throw new Error('journal store required');
  const db=store.read(),snapshotMap=new Map(db.snapshots.map(x=>[x.id,x])),eventMap=new Map(db.events.map(x=>[x.eventFingerprint,x])),outcomeMap=new Map(db.outcomes.map(x=>[x.snapshotId,x]));
  snapshotMap.set(snapshot.id,snapshot);for(const e of events)if(!eventMap.has(e.eventFingerprint))eventMap.set(e.eventFingerprint,e);
  const candidates=[...snapshotMap.values()].filter(x=>x.symbol===snapshot.symbol&&x.timeframe===snapshot.timeframe);
  for(const s of candidates){const prior=outcomeMap.get(s.id)||newOutcome(s);outcomeMap.set(s.id,resolveOutcome(s,prior,{referenceCandles,outcomeCandles},now))}
  let snapshots=[...snapshotMap.values()].sort((a,b)=>n(b.capturedBarTime,b.capturedAt)-n(a.capturedBarTime,a.capturedAt)).slice(0,Math.max(10,Math.min(1000,Number(maxEntries)||MAX_ENTRIES)));
  const keep=new Set(snapshots.map(x=>x.id)),keepEventIds=new Set(snapshots.flatMap(x=>Array.isArray(x.eventIds)?x.eventIds:[])),eventsOut=[...eventMap.values()].filter(x=>keepEventIds.has(x.eventId)),outcomes=[...outcomeMap.values()].filter(x=>keep.has(x.snapshotId));
  store.write({schemaVersion:1,version:VERSION,snapshots,events:eventsOut,outcomes});
  const outcomeById=new Map(outcomes.map(x=>[x.snapshotId,x])),eventById=new Map(eventsOut.map(x=>[x.eventId,x])),recent=snapshots.filter(x=>x.symbol===snapshot.symbol&&x.timeframe===snapshot.timeframe).slice(0,8).map(x=>({...x,outcome:outcomeById.get(x.id)||newOutcome(x),events:(x.eventIds||[]).map(id=>eventById.get(id)).filter(Boolean)}));
  return{current:recent.find(x=>x.id===snapshot.id)||{...snapshot,outcome:outcomeById.get(snapshot.id)||newOutcome(snapshot),events:(snapshot.eventIds||[]).map(id=>eventById.get(id)).filter(Boolean)},recent,stats:summarize(snapshots.filter(x=>x.symbol===snapshot.symbol&&x.timeframe===snapshot.timeframe),outcomes),allCount:snapshots.length,eventCount:eventsOut.length};
}
function createBundle({symbol,timeframe,model,trendRetest,now=Date.now()}={}){
  const snapshot=buildSnapshot({symbol,timeframe,model,trendRetest,now}),events=buildEvents({snapshotId:snapshot.id,sequenceId:snapshot.sequenceId,symbol:snapshot.symbol,timeframe:snapshot.timeframe,model,trendRetest});
  return{snapshot,events,outcome:newOutcome(snapshot)};
}
return{VERSION,EVENT_VERSION,STORAGE_KEY,MAX_ENTRIES,HORIZONS,TERMINAL,stableStringify,rawEvents,buildEvents,scenarioKey,sequenceIdFor,buildSnapshot,newOutcome,resolveOutcome,createBundle,createMemoryStore,createLocalStorageStore,recordAndResolve,summarize};
});