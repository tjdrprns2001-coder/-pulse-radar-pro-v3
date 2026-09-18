'use strict';
const {finite,assertValidationManifest}=require('./contracts.js');
const {eligibleSymbolsAt}=require('./universe.js');
function createCollector({provider,store,buildFeatures,screen,now=()=>Date.now(),maxStepsPerRun=24}={}){
  if(!provider||typeof provider.getHistoricalFrames!=='function')throw new Error('historical provider required');
  if(!store||typeof store.putEvent!=='function')throw new Error('research store required');
  if(typeof buildFeatures!=='function'||typeof screen!=='function')throw new Error('buildFeatures and screen required');
  const cap=Math.max(1,Math.min(500,Number(maxStepsPerRun)||24));
  async function run({runId,manifest,universe,startTs,endTs,validationEndTs}={}){
    const id=String(runId||'').trim();if(!id)throw new Error('runId required');
    if(!manifest?.frozen)throw new Error('frozen manifest required');
    const start=finite(startTs),end=finite(endTs),grid=finite(manifest.evaluationGridMs);
    if(start==null||end==null||end<start||grid==null||grid<=0)throw new Error('invalid collection window');
    if(end>=Date.parse('2025-01-01T00:00:00.000Z'))assertValidationManifest(manifest);
    const prior=await store.getCheckpoint(id);
    if(prior&&prior.manifestVersion!==manifest.manifestVersion)throw new Error('manifest changed during run');
    if(prior?.complete)return{status:'complete',processedSteps:0,matchedEvents:0,checkpoint:prior,errors:[]};
    const runMeta={runId:id,manifestVersion:manifest.manifestVersion,universeVersion:universe?.universeVersion,universeMode:universe?.universeMode,survivorshipSafe:Boolean(universe?.survivorshipSafe),startTs:start,endTs:end,evaluationGridMs:grid,updatedAt:now()};
    await store.putRun(id,runMeta);
    let ts=finite(prior?.nextTs)??start,processedSteps=0,matchedEvents=0;const errors=[];
    while(ts<=end&&processedSteps<cap){
      const symbols=eligibleSymbolsAt(universe,ts);
      for(const symbol of symbols){
        try{
          const frames=await provider.getHistoricalFrames(symbol,{simulatedTs:ts});
          const event=buildFeatures({symbol,frames,signalCandleCloseTs:ts,manifest,universe,validationEndTs});
          if(screen(event,manifest)===true){if(await store.putEvent(event))matchedEvents++}
        }catch(e){errors.push(symbol+':'+ts+':'+String(e?.message||e))}
      }
      processedSteps++;ts+=grid;
      await store.putCheckpoint(id,{runId:id,manifestVersion:manifest.manifestVersion,universeVersion:universe?.universeVersion,nextTs:ts,startTs:start,endTs:end,evaluationGridMs:grid,complete:ts>end,updatedAt:now()});
    }
    const checkpoint=await store.getCheckpoint(id);
    return{status:checkpoint?.complete?'complete':'partial',processedSteps,matchedEvents,checkpoint,errors};
  }
  return{run};
}
module.exports={createCollector};
