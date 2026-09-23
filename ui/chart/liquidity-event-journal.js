(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseLiquidityEventJournal=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';

const VERSION='LIQUIDITY_EVENT_JOURNAL_v1';
const STORAGE_KEY='pulse-liquidity-event-journal-v1';
const MAX_ENTRIES=200;
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
function eventTime(model,index,fallback=null){
  const c=model?.candles?.[Number(index)];return ms(c?.time??fallback??0)||null;
}
function buildEventChain({model,trendRetest}={}){
  const out=[],s=model?.scenario||{},sw=s.sweep||{},tl=trendRetest?.primary,smc=model?.smc||{};
  if(sw.last){
    const i=n(sw.index,sw.last.index??sw.last.sweepIndex??sw.last.confirmedAt??null);
    out.push({type:'LIQ_SWEEP',barIndex:i,time:eventTime(model,i,sw.last.time),direction:sw.dir||null,confirmed:Boolean(sw.confirmed)});
    if(sw.confirmed)out.push({type:'RECLAIM',barIndex:i,time:eventTime(model,i,sw.last.time),direction:sw.dir||null});
  }
  if(tl?.breakout)out.push({type:'TL_BREAK',barIndex:n(tl.breakout.barIndex),time:ms(tl.breakout.time),direction:tl.breakout.direction||null,lineId:tl.line?.lineId||null,paramsHash:tl.paramsHash||null});
  if(tl?.retest?.firstTouchBarIndex!=null)out.push({type:'TL_RETEST_TOUCH',barIndex:n(tl.retest.firstTouchBarIndex),time:ms(tl.retest.firstTouchTime),lineId:tl.line?.lineId||null,paramsHash:tl.paramsHash||null});
  if(tl?.state==='CONFIRMED')out.push({type:'TL_RETEST_CONFIRMED',barIndex:n(tl.retest?.confirmedBarIndex),time:ms(tl.retest?.confirmedTime),lineId:tl.line?.lineId||null,paramsHash:tl.paramsHash||null});
  if(tl?.state==='FAILED')out.push({type:'TL_RETEST_FAILED',barIndex:n(tl.failedAt?.barIndex),time:ms(tl.failedAt?.time),lineId:tl.line?.lineId||null,paramsHash:tl.paramsHash||null});
  const mss=Array.isArray(smc.mss)?smc.mss.at(-1):null;if(mss)out.push({type:'MSS',barIndex:n(mss.index,mss.i??mss.confirmedAt??null),time:eventTime(model,n(mss.index,mss.i??mss.confirmedAt??null),mss.time),direction:mss.dir||null});
  const disp=Array.isArray(smc.displacements)?smc.displacements.at(-1):null;if(disp)out.push({type:'DISPLACEMENT',barIndex:n(disp.index,disp.i??disp.confirmedAt??null),time:eventTime(model,n(disp.index,disp.i??disp.confirmedAt??null),disp.time),direction:disp.dir||null});
  const seen=new Set();return out.filter(x=>{const k=[x.type,x.barIndex,x.time,x.lineId].join('|');if(seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>(n(a.time,0)-n(b.time,0))||(n(a.barIndex,0)-n(b.barIndex,0)));
}
function scenarioKey({symbol,timeframe,model,trendRetest}={}){
  const s=model?.scenario||{},sw=s.sweep||{},tl=trendRetest?.primary;
  const payload={symbol:String(symbol||'').toUpperCase(),timeframe:String(timeframe||''),direction:s.direction||null,targetType:s.target?.label||null,targetPrice:n(s.target?.price),sweepIndex:n(sw.index,sw.last?.index??sw.last?.sweepIndex??null),tlLineId:tl?.line?.lineId||null,tlParamsHash:tl?.paramsHash||null,liquidityVersion:model?.version||null};
  return 'LQS-'+fnv1a(stableStringify(payload));
}
function buildSnapshot({symbol,timeframe,model,trendRetest,now=Date.now()}={}){
  if(!model?.ok||!Array.isArray(model.candles)||!model.candles.length)throw new Error('liquidity model required');
  const last=model.candles.at(-1),capturedBarTime=ms(last.time),events=buildEventChain({model,trendRetest}),s=model.scenario||{},target=n(s.target?.price),invalidation=n(s.invalidation),entryPrice=n(model.current),entryAtr=n(model.atr);
  const params={liquidityEngineVersion:model.version||null,trendlineEngineVersion:trendRetest?.version||null,trendlineParamsHash:trendRetest?.paramsHash||trendRetest?.primary?.paramsHash||null};
  const base={symbol:String(symbol||'').toUpperCase(),timeframe:String(timeframe||''),capturedBarTime,params,scenarioKey:scenarioKey({symbol,timeframe,model,trendRetest})};
  const id='LQJ-'+base.symbol+'-'+base.timeframe+'-'+String(capturedBarTime)+'-'+fnv1a(stableStringify(base));
  return{
    id,version:VERSION,scenarioKey:base.scenarioKey,symbol:base.symbol,timeframe:base.timeframe,capturedAt:n(now,Date.now()),capturedBarTime,capturedBarIndex:model.candles.length-1,
    referenceOnly:Boolean(model.referenceOnly),entryPrice,entryAtr,direction:s.direction||null,bias:s.bias||null,stage:s.phase||null,
    target:target==null?null:{type:s.target?.label||'DOL',price:target,side:s.target?.side||null,external:Boolean(s.target?.external),score:n(s.target?.score)},
    invalidation:invalidation==null?null:{price:invalidation},
    range:{low:n(model.range?.low),high:n(model.range?.high),mid:n(model.range?.mid),position:model.summary?.position||model.range?.position||null,positionPct:n(model.summary?.rangePositionPct)},
    events,params,trendline:trendRetest?.primary?{state:trendRetest.primary.state,stateLabel:trendRetest.primary.stateLabel,lineId:trendRetest.primary.line?.lineId||null,paramsHash:trendRetest.primary.paramsHash||null,quality:n(trendRetest.primary.quality?.score)}:null,
    outcome:{status:'OPEN',coverage:'FULL',resolvedAt:null,resolvedBarTime:null,barsObserved:0,mfePct:0,maePct:0,mfeAtr:0,maeAtr:0,h24:{status:'pending'},h72:{status:'pending'}}
  };
}
function directionalReturn(entry,exit,direction){if(!(entry>0)||!finite(exit))return null;return(direction==='down'?(entry-exit):(exit-entry))/entry*100}
function horizonResult(snapshot,rows,hours){
  const target=snapshot.capturedBarTime+hours*3600000,row=rows.find(x=>x.time>=target);
  return row?{status:'evaluated',targetTime:target,marketTime:row.time,price:row.close,returnPct:directionalReturn(snapshot.entryPrice,row.close,snapshot.direction)}:{status:'pending',targetTime:target};
}
function resolveOutcome(snapshot,candles=[],now=Date.now()){
  const rows=normalizeCandles(candles),entry=n(snapshot?.entryPrice),target=n(snapshot?.target?.price),inv=n(snapshot?.invalidation?.price),direction=String(snapshot?.direction||'up'),captured=n(snapshot?.capturedBarTime);
  if(!(entry>0)||!captured)return{...(snapshot?.outcome||{}),status:'UNAVAILABLE',coverage:'NONE',updatedAt:now};
  const capturePresent=rows.some(x=>x.time===captured),future=rows.filter(x=>x.time>captured);
  let status='OPEN',resolvedAt=null,resolvedBarTime=null,barsObserved=0,maxFav=0,maxAdv=0;
  for(const c of future){
    barsObserved++;
    const fav=direction==='down'?entry-c.low:c.high-entry,adv=direction==='down'?c.high-entry:entry-c.low;
    maxFav=Math.max(maxFav,fav);maxAdv=Math.max(maxAdv,adv);
    const targetHit=target!=null&&(direction==='down'?c.low<=target:c.high>=target);
    const invalidHit=inv!=null&&(direction==='down'?c.high>=inv:c.low<=inv);
    if(targetHit&&invalidHit){status='BOTH_SAME_BAR';resolvedAt=now;resolvedBarTime=c.time;break}
    if(targetHit){status='DOL_REACHED';resolvedAt=now;resolvedBarTime=c.time;break}
    if(invalidHit){status='INVALIDATED';resolvedAt=now;resolvedBarTime=c.time;break}
  }
  const entryAtr=n(snapshot?.entryAtr);
  return{
    status,coverage:capturePresent?'FULL':'PARTIAL',resolvedAt,resolvedBarTime,barsObserved,
    mfePct:entry?maxFav/entry*100:null,maePct:entry?maxAdv/entry*100:null,
    mfeAtr:entryAtr>0?maxFav/entryAtr:null,maeAtr:entryAtr>0?maxAdv/entryAtr:null,
    h24:horizonResult(snapshot,rows,24),h72:horizonResult(snapshot,rows,72),updatedAt:now
  };
}
function createMemoryStore(initial=[]){
  let rows=clone(Array.isArray(initial)?initial:[]);
  return{list(){return clone(rows)},replace(next){rows=clone(Array.isArray(next)?next:[]);return true},clear(){rows=[];return true}};
}
function createLocalStorageStore(storage,key=STORAGE_KEY){
  if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function')throw new Error('localStorage adapter required');
  return{
    list(){try{const raw=storage.getItem(key);const v=raw?JSON.parse(raw):[];return Array.isArray(v)?v:[]}catch{return[]}},
    replace(next){const rows=Array.isArray(next)?next:[];storage.setItem(key,JSON.stringify(rows));return true},
    clear(){storage.removeItem(key);return true}
  };
}
function summarize(rows=[]){
  const s={total:rows.length,open:0,dolReached:0,invalidated:0,ambiguous:0,partial:0};
  for(const x of rows){const st=x?.outcome?.status;if(st==='OPEN')s.open++;else if(st==='DOL_REACHED')s.dolReached++;else if(st==='INVALIDATED')s.invalidated++;else if(st==='BOTH_SAME_BAR')s.ambiguous++;if(x?.outcome?.coverage==='PARTIAL')s.partial++}return s;
}
function recordAndResolve({store,snapshot,candles=[],now=Date.now(),maxEntries=MAX_ENTRIES}={}){
  if(!store||typeof store.list!=='function'||typeof store.replace!=='function')throw new Error('journal store required');
  const rows=store.list(),updated=rows.map(x=>x.symbol===snapshot.symbol&&x.timeframe===snapshot.timeframe?{...x,outcome:resolveOutcome(x,candles,now)}:x);
  const current={...snapshot,outcome:resolveOutcome(snapshot,candles,now)};
  const idx=updated.findIndex(x=>x.id===current.id);if(idx>=0)updated[idx]={...updated[idx],...current};else updated.push(current);
  updated.sort((a,b)=>n(b.capturedBarTime,b.capturedAt)-n(a.capturedBarTime,a.capturedAt));
  const trimmed=updated.slice(0,Math.max(10,Math.min(1000,Number(maxEntries)||MAX_ENTRIES)));store.replace(trimmed);
  const recent=trimmed.filter(x=>x.symbol===current.symbol&&x.timeframe===current.timeframe).slice(0,8);
  return{current:recent.find(x=>x.id===current.id)||current,recent,stats:summarize(trimmed.filter(x=>x.symbol===current.symbol&&x.timeframe===current.timeframe)),allCount:trimmed.length};
}
return{VERSION,STORAGE_KEY,MAX_ENTRIES,stableStringify,buildEventChain,scenarioKey,buildSnapshot,resolveOutcome,createMemoryStore,createLocalStorageStore,recordAndResolve,summarize};
});