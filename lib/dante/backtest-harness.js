'use strict';
const C=require('../../ui/dante/dante-contract.js');
function replayPrefixes({candles=[],analysisFn,minBars=1,args={}}={}){
  if(typeof analysisFn!=='function')throw new Error('analysisFn required');
  const out=[];
  for(let end=minBars;end<=candles.length;end++){
    const slice=candles.slice(0,end),asOf=Number(slice.at(-1)?.closeTime??slice.at(-1)?.time);
    C.assertClosedCandles(slice,asOf);
    const result=analysisFn({...args,candles:slice,analysisAsOf:asOf});
    out.push({endIndex:end-1,analysisAsOf:asOf,nextEligibleExecutionIndex:end<candles.length?end:null,executionPolicy:'NEXT_ELIGIBLE_BAR',result});
  }
  return out;
}
function transitionStats(replay=[]){
  const states=replay.map(x=>x.result?.riceBowlState||x.result?.state).filter(Boolean),counts={};
  for(const s of states)counts[s]=(counts[s]||0)+1;
  return{samples:replay.length,counts,lastState:states.at(-1)||null};
}
module.exports={replayPrefixes,transitionStats};