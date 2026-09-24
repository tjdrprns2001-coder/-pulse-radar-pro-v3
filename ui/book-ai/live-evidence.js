(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PulseBookAiLiveEvidence=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';

const VERSION='BOOK_AI_LIVE_EVIDENCE_v1';
const PROVENANCE='LIVE_EPHEMERAL';
const PREFIX='LIVE-';
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const n=v=>finite(v)?Number(v):null;
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const ms=v=>{const x=n(v);return x!=null&&x>0&&x<1e12?x*1000:x};

function assertClosedOnlyModel(model,analysisAsOf){
  if(!model?.ok||!Array.isArray(model.candles)||!model.candles.length)throw new Error('live evidence requires liquidity map model');
  const asOf=n(analysisAsOf);if(asOf==null)throw new Error('analysisAsOf required');
  for(const c of model.candles){
    if(c?.partial===true||c?.isClosed===false||c?.confirmed===false)throw new Error('LIVE_EPHEMERAL requires CLOSED_ONLY candles');
    const t=ms(c?.closeTime??c?.closedAt??c?.time);
    if(t!=null&&t>asOf)throw new Error('live evidence candle after analysisAsOf');
  }
  return true;
}
function prefixId(id){const s=String(id||'');return s.startsWith(PREFIX)?s:PREFIX+s}
function namespaceBundle(bundle={},analysisAsOf){
  const snapshot=clone(bundle.snapshot||{}),events=clone(bundle.events||[]);
  if(!snapshot.id)throw new Error('live bundle snapshot id required');
  const asOf=n(analysisAsOf);if(asOf==null)throw new Error('analysisAsOf required');
  const liveSnapshotId=prefixId(snapshot.id);
  const idMap=new Map(events.filter(x=>x?.eventId).map(x=>[String(x.eventId),prefixId(x.eventId)]));
  const mappedEvents=events.map(e=>{
    const confirmedAt=ms(e.confirmedAt??e.candleTime);
    if(confirmedAt!=null&&confirmedAt>asOf)throw new Error('live event after analysisAsOf');
    if(!e.eventId)throw new Error('live eventId required');
    const originalEventId=String(e.eventId);
    return{
      ...e,
      eventId:idMap.get(originalEventId),
      canonicalEventId:originalEventId,
      snapshotId:liveSnapshotId,
      parentEventId:e.parentEventId?(idMap.get(String(e.parentEventId))||prefixId(e.parentEventId)):null,
      provenance:PROVENANCE,
      closedOnly:true
    };
  });
  const capturedBarTime=ms(snapshot.capturedBarTime??snapshot.capturedAt);
  if(capturedBarTime!=null&&capturedBarTime>asOf)throw new Error('live snapshot after analysisAsOf');
  const liveSnapshot={
    ...snapshot,
    id:liveSnapshotId,
    canonicalSnapshotId:String(snapshot.id),
    provenance:PROVENANCE,
    closedOnly:true,
    eventIds:mappedEvents.map(x=>x.eventId)
  };
  const observedTimes=[capturedBarTime,...mappedEvents.map(x=>ms(x.confirmedAt??x.candleTime))].filter(Number.isFinite);
  return{
    version:VERSION,
    provenance:PROVENANCE,
    observedAt:observedTimes.length?Math.max(...observedTimes):null,
    snapshot:liveSnapshot,
    events:mappedEvents
  };
}
function createLiveEvidence({journal,symbol,timeframe='4h',model,trendRetest,now=Date.now(),analysisAsOf=now}={}){
  if(!journal||typeof journal.createBundle!=='function')throw new Error('Liquidity Event Journal createBundle required');
  assertClosedOnlyModel(model,analysisAsOf);
  const bundle=journal.createBundle({symbol,timeframe,model,trendRetest,now});
  return namespaceBundle(bundle,analysisAsOf);
}
return{VERSION,PROVENANCE,PREFIX,assertClosedOnlyModel,prefixId,namespaceBundle,createLiveEvidence};
});