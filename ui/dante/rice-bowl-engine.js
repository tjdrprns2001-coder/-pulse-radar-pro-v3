(function(root,factory){
  const C=typeof module==='object'&&module.exports?require('./dante-contract.js'):root?.PulseDanteContract;
  const api=factory(C);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PulseDanteRiceBowl=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){'use strict';
if(!C)throw new Error('PulseDanteContract required');

const VERSION=C.RICE_VERSION;
function sma(values,p){const out=Array(values.length).fill(null);let s=0;for(let i=0;i<values.length;i++){s+=values[i];if(i>=p)s-=values[i-p];if(i>=p-1)out[i]=s/p}return out}
function atr(c,p=14){const tr=c.map((x,i)=>Math.max(x.high-x.low,Math.abs(x.high-(i?c[i-1].close:x.close)),Math.abs(x.low-(i?c[i-1].close:x.close))));return sma(tr,p)}
function median(a){const x=a.filter(Number.isFinite).slice().sort((a,b)=>a-b);if(!x.length)return null;const m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2}
function rvol(c,i,lookback=20){if(i<lookback)return null;const base=median(c.slice(i-lookback,i).map(x=>Number(x.volume||0)));return base>0?Number(c[i].volume||0)/base:null}
function seqId(symbol,time){return'DANTE-'+String(symbol||'UNKNOWN').toUpperCase()+'-'+String(time)}
function rowFact(type,c,i,extra={}){return{factId:'dante-'+type+'-'+i+'-'+String(c.time??c.closeTime??i),factType:type,barIndex:i,time:c.time??c.closeTime??null,...extra}}
function drawdownPct(c,i,lookback){const start=Math.max(0,i-lookback+1),hi=Math.max(...c.slice(start,i+1).map(x=>x.high));return hi>0?(1-c[i].close/hi)*100:0}
function rangeAtr(c,start,end,atrSeries){if(start<0||end<start)return null;const hi=Math.max(...c.slice(start,end+1).map(x=>x.high)),lo=Math.min(...c.slice(start,end+1).map(x=>x.low)),a=atrSeries[end];return Number.isFinite(a)&&a>0?(hi-lo)/a:null}
function priorConsecutiveBelow(closes,emaPivot,i){let n=0;for(let j=i-1;j>=0;j--){if(!Number.isFinite(emaPivot[j])||closes[j]>=emaPivot[j])break;n++}return n}
function confirmedPivotCount(c,start,end,left=3,right=3){let count=0;for(let i=Math.max(start,left);i<=end-right;i++){const x=c[i],lo=c.slice(i-left,i+right+1);if(lo.every((r,j)=>j===left||x.low<r.low))count++;if(lo.every((r,j)=>j===left||x.high>r.high))count++}return count}
function validTransition(from,to){
  const map={
    NO_PATTERN:['PHASE_1_DUMP'],PHASE_1_DUMP:['PHASE_2_ACCUMULATION','RESET'],PHASE_2_ACCUMULATION:['PHASE_3_BREAKOUT','RESET'],
    PHASE_3_BREAKOUT:['PHASE_3_RETEST','FAILED_BREAKOUT','RESET'],FAILED_BREAKOUT:['PHASE_3_BREAKOUT','RESET'],
    PHASE_3_RETEST:['PHASE_3_CONFIRMED','FAILED_RETEST','RESET'],PHASE_3_CONFIRMED:['PHASE_4_EXPANSION','FAILED_RETEST','RESET'],
    FAILED_RETEST:['PHASE_2_ACCUMULATION','RESET'],PHASE_4_EXPANSION:['RESET'],RESET:['PHASE_1_DUMP']
  };
  return Boolean(map[from]?.includes(to));
}
function analyze({symbol='UNKNOWN',candles=[],analysisAsOf,params={},previous=null,gongguriLevel=null}={}){
  C.assertClosedCandles(candles,analysisAsOf);
  const P=C.normalizeParams(params),n=candles.length;
  if(n<Math.max(P.ema.long+5,P.dump.lookbackBars))return C.createEvidence({sequenceId:previous?.sequenceId||null,riceBowlState:previous?.riceBowlState||'NO_PATTERN',stateReason:'DATA_INSUFFICIENT',params:P,analysisAsOf,evidenceFacts:[],transitionPath:previous?.transitionPath||[]});
  const closes=candles.map(x=>Number(x.close)),seed=P.emaSeed.seedBars,e112=C.seededEma(closes,P.ema.fast,seed),e224=C.seededEma(closes,P.ema.pivot,seed),e448=C.seededEma(closes,P.ema.long,seed),a=atr(candles,P.atrPeriod);
  let state=previous?.riceBowlState||'NO_PATTERN',sequenceId=previous?.sequenceId||null,transitionPath=(previous?.transitionPath||[]).slice(),facts=[],counter=[],stateEnteredAt=previous?.stateEnteredAt??null;
  let dumpStart=previous?.meta?.dumpStart??null,baseStart=previous?.meta?.baseStart??null,breakoutIndex=previous?.meta?.breakoutIndex??null,trigger=previous?.meta?.trigger??null,retestIndex=previous?.meta?.retestIndex??null;
  const transition=(to,i,reason,ids=[])=>{if(state!==to&&!validTransition(state,to))throw new Error('invalid Dante transition '+state+' -> '+to);const from=state;state=to;stateEnteredAt=candles[i]?.time??candles[i]?.closeTime??analysisAsOf;transitionPath.push({from,to,transitionAt:stateEnteredAt,transitionBarIndex:i,reason,evidenceFactIds:ids,counterEvidenceFactIds:[],paramsHash:C.paramsHash(P),sequenceId,analysisAsOf});};
  for(let i=Math.max(P.emaSeed.seedBars,P.dump.lookbackBars)-1;i<n;i++){
    const c=candles[i],av=a[i];if(!Number.isFinite(av)||av<=0)continue;
    const dd=drawdownPct(candles,i,P.dump.lookbackBars),bearish=e112[i]<e224[i]&&e224[i]<e448[i];
    const recentAtr=median(a.slice(Math.max(0,i-20),i).filter(Number.isFinite)),atrExpansion=recentAtr>0?av/recentAtr:null;
    if(state==='NO_PATTERN'||state==='RESET'){
      if(dd>=P.dump.minDrawdownPct&&(!P.dump.requireBearishLongMaHistory||bearish)&&(atrExpansion==null||atrExpansion>=1)){
        if(!sequenceId||state==='RESET')sequenceId=seqId(symbol,c.time??c.closeTime??i);
        const f=rowFact('DUMP_DETECTED',c,i,{drawdownPct:dd,bearishLongMa:bearish,atrExpansion});facts.push(f);dumpStart=i;transition('PHASE_1_DUMP',i,'MATERIAL_DRAWDOWN',[f.factId]);continue;
      }
    }
    if(state==='PHASE_1_DUMP'){
      const start=Math.max(dumpStart??0,i-P.base.minBars+1);
      if(i-start+1>=P.base.minBars){
        const ra=rangeAtr(candles,start,i,a),slope=Math.abs((e224[i]-e224[Math.max(start,i-5)])/Math.max(1,i-Math.max(start,i-5)))/av;
        const noNewLow=c.low>=Math.min(...candles.slice(start,i).map(x=>x.low));
        if(noNewLow&&ra!=null&&ra<=P.base.maxRangeAtr&&slope<=P.base.maxEma224SlopeAbsAtrPerBar){
          const f=rowFact('BASE_STABILIZED',c,i,{rangeAtr:ra,ema224SlopeAtrPerBar:slope});facts.push(f);baseStart=start;transition('PHASE_2_ACCUMULATION',i,'BASE_STABILIZED',[f.factId]);continue;
        }
      }
    }
    if(state==='PHASE_2_ACCUMULATION'||state==='FAILED_BREAKOUT'){
      const level=Number.isFinite(gongguriLevel)?Math.max(e224[i],gongguriLevel):e224[i],buf=av*P.breakout.breakoutBufferAtr,rv=rvol(candles,i);
      const crossed=c.close>level+buf&&(i===0||candles[i-1].close<=e224[i-1]+(a[i-1]||av)*P.breakout.breakoutBufferAtr);
      const priorBelow=priorConsecutiveBelow(closes,e224,i),pivots=confirmedPivotCount(candles,baseStart??0,i-1,P.pivot.left,P.pivot.right);
      const declineBars=dumpStart!=null&&baseStart!=null?Math.max(1,baseStart-dumpStart):null,baseBars=baseStart!=null?i-baseStart:null;
      const durationOk=!P.base.requireLongerThanDecline||(declineBars!=null&&baseBars>declineBars),contextOk=priorBelow>=P.breakout.minPriorClosesBelowPivot&&pivots>=P.base.minConfirmedPivotCount&&durationOk;
      if(crossed&&rv!=null&&rv>=P.breakout.minRvol&&contextOk){
        const f=rowFact('BREAKOUT_CONFIRMED',c,i,{trigger:level,rvol:rv,bufferAtr:P.breakout.breakoutBufferAtr,priorBelowPivotBars:priorBelow,confirmedPivotCount:pivots,declineBars,baseBars});facts.push(f);trigger=level;breakoutIndex=i;transition('PHASE_3_BREAKOUT',i,'CONFIRMED_CLOSE_BREAKOUT',[f.factId]);continue;
      }
      if(crossed&&!contextOk)counter.push(rowFact('BREAKOUT_CONTEXT_INCOMPLETE',c,i,{priorBelowPivotBars:priorBelow,requiredPriorBelow:P.breakout.minPriorClosesBelowPivot,confirmedPivotCount:pivots,requiredPivots:P.base.minConfirmedPivotCount,durationOk}));
    }
    if(state==='PHASE_3_BREAKOUT'){
      if(i>breakoutIndex){
        const maxBars=P.retest.maxRetestBars,below=c.close<(trigger-av*P.retest.reclaimBufferAtr);
        if(below&&i-breakoutIndex<=2){const f=rowFact('BREAKOUT_FAILED',c,i,{trigger});counter.push(f);transition('FAILED_BREAKOUT',i,'IMMEDIATE_REJECTION',[f.factId]);continue}
        const touched=c.low<=trigger+av*P.retest.toleranceAtr&&c.high>=trigger-av*P.retest.toleranceAtr;
        if(touched){const f=rowFact('RETEST_TOUCH',c,i,{trigger});facts.push(f);retestIndex=i;transition('PHASE_3_RETEST',i,'RETEST_TOUCH',[f.factId]);continue}
        if(i-breakoutIndex>maxBars){const f=rowFact('RETEST_WINDOW_EXPIRED',c,i,{trigger});counter.push(f);transition('FAILED_BREAKOUT',i,'NO_RETEST_WITHIN_WINDOW',[f.factId]);continue}
      }
    }
    if(state==='PHASE_3_RETEST'){
      const fail=c.close<trigger-av*P.retest.reclaimBufferAtr;
      if(fail){const f=rowFact('RETEST_FAILED',c,i,{trigger});counter.push(f);transition('FAILED_RETEST',i,'SUPPORT_LOST',[f.factId]);continue}
      const held=i-retestIndex>=P.retest.minHoldBars&&c.close>=trigger+av*P.retest.reclaimBufferAtr;
      if(held){const f=rowFact('RETEST_CONFIRMED',c,i,{trigger});facts.push(f);transition('PHASE_3_CONFIRMED',i,'RECLAIM_AND_HOLD',[f.factId]);continue}
    }
    if(state==='PHASE_3_CONFIRMED'){
      const higherLow=i>0&&c.low>candles[Math.max(0,retestIndex??i-1)].low,dist=(c.close-trigger)/av;
      if(dist>=P.expansion.minDistanceAtrAboveTrigger&&(!P.expansion.requireHigherLow||higherLow)){const f=rowFact('EXPANSION_CONFIRMED',c,i,{distanceAtr:dist,trigger});facts.push(f);transition('PHASE_4_EXPANSION',i,'ATR_EXPANSION',[f.factId]);continue}
      if(c.close<trigger-av*P.retest.reclaimBufferAtr){const f=rowFact('POST_CONFIRM_SUPPORT_LOST',c,i,{trigger});counter.push(f);transition('FAILED_RETEST',i,'POST_CONFIRM_SUPPORT_LOST',[f.factId]);continue}
    }
    if(['PHASE_1_DUMP','PHASE_2_ACCUMULATION','FAILED_BREAKOUT','FAILED_RETEST'].includes(state)&&dumpStart!=null){
      const structuralLow=Math.min(...candles.slice(dumpStart,i).map(x=>x.low));
      if(i>dumpStart&&c.close<structuralLow-av*.25){
        const f=rowFact('STRUCTURAL_RESET',c,i,{priorLow:structuralLow});counter.push(f);transition('RESET',i,'NEW_STRUCTURAL_LOW',[f.factId]);sequenceId=null;dumpStart=baseStart=breakoutIndex=retestIndex=trigger=null;continue;
      }
    }
  }
  const durationRatio=dumpStart!=null&&baseStart!=null&&baseStart>dumpStart?(n-1-baseStart+1)/(baseStart-dumpStart):null;
  const result=C.createEvidence({sequenceId,riceBowlState:state,stateReason:transitionPath.at(-1)?.reason||'NO_CHANGE',stateEnteredAt,params:P,analysisAsOf,evidenceFacts:facts,counterEvidence:counter,transitionPath,gongguri:{status:'NOT_EVALUATED',level:gongguriLevel??null,evidenceFactIds:[]},emaStrike:{status:'NOT_EVALUATED',evidenceFactIds:[]}});
  return C.freeze({...result,meta:{dumpStart,baseStart,breakoutIndex,retestIndex,trigger,durationRatio,emaLatest:{ema112:e112.at(-1),ema224:e224.at(-1),ema448:e448.at(-1)},atr:a.at(-1)}});
}
return{VERSION,sma,atr,median,rvol,seqId,rowFact,drawdownPct,rangeAtr,priorConsecutiveBelow,confirmedPivotCount,validTransition,analyze};
});