'use strict';
// Typed-decision output validation. A System One score is NOT P(future return).
const VALID_MARKET_MODES=new Set(['risk_on','selective','defensive','insufficient']);
const SUPPORT_FIELDS=['priceChange24h','priceChange1h','volumeAcceleration','takerRatio','fundingPct','oiChangePct','candidateScore','preIgnitionScore'];
function finite(value){
  if(value===null||value===undefined||value===''||typeof value==='boolean')return null;
  const n=Number(value);return Number.isFinite(n)?n:null;
}
function bounded(value,lo,hi){const n=finite(value);return n!==null&&n>=lo&&n<=hi?n:null}
function symbol(value){return String(value||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,30)}
function hasEvidence(item){
  const fields=SUPPORT_FIELDS.filter(k=>finite(item?.[k])!==null);
  return {fields,missing:SUPPORT_FIELDS.filter(k=>!fields.includes(k)),sufficient:fields.length>=2};
}
function safeDistribution(raw,keys){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const out={};let sum=0;
  for(const k of keys){const n=bounded(raw[k],0,1);if(n===null)return null;out[k]=n;sum+=n}
  if(Object.keys(raw).length!==keys.length||Math.abs(sum-1)>0.03)return null;
  return out;
}
function normalizeSystemOne(result,candidates=[],{provider='typesafe'}={}){
  const rows=[];const issues=[];
  const failure=(reason)=>({
    status:'invalid',shadowOnly:true,provider,model:null,market:null,candidates:[],
    issues:[reason],usage:null,probabilityMeaning:'classifier-output-not-market-event-probability'
  });
  if(!result||typeof result!=='object'||Array.isArray(result))return failure('empty-or-nonobject-response');
  if(result.truncated===true)return failure('provider-truncated-input');
  if(!result.answers||typeof result.answers!=='object'||Array.isArray(result.answers))return failure('missing-typed-answers');
  const answers=result.answers;
  const mk=answers.marketMode;
  const mode=VALID_MARKET_MODES.has(mk?.choice)?mk.choice:null;
  const mp=safeDistribution(mk?.probabilities,[...VALID_MARKET_MODES]);
  const market=mk?{mode,confidence:bounded(mk.confidence,0,1),probabilities:mp}:null;
  if(!mode)issues.push('market-choice-missing-or-invalid');
  // Model confidence and raw class probabilities are not calibrated market-return probabilities.
  for(const item of candidates){
    const s=symbol(item?.symbol);if(!s)continue;
    const evidence=hasEvidence(item);
    const ready=answers['ready_'+s],chase=answers['chase_'+s];
    const score=bounded(ready?.score,0,4),conf=bounded(ready?.confidence,0,1),risk=bounded(chase?.noul,0,1);
    const reasons=[];
    if(!evidence.sufficient)reasons.push('insufficient-input-evidence');
    if(score===null)reasons.push('missing-or-invalid-readiness-score');
    if(risk===null)reasons.push('missing-or-invalid-chase-risk');
    if(reasons.length)issues.push(s+':'+reasons.join(','));
    rows.push({
      symbol:s,readinessScore:evidence.sufficient?score:null,
      readinessConfidence:evidence.sufficient?conf:null,
      chaseRisk:evidence.sufficient?risk:null,
      readinessLevel:null, // Expected ordinal score must not be rounded into an argmax label.
      evidenceCount:evidence.fields.length,evidenceFields:evidence.fields,
      missingFields:evidence.missing,valid:reasons.length===0,
      disposition:reasons.length?'ABSTAIN':risk>=0.7?'CHASE_RISK_REVIEW':'RESEARCH_ONLY',
      missingReasons:reasons,shadowOnly:true
    });
  }
  return{
    status:rows.length===0?'empty':issues.length?'partial':'ok',
    shadowOnly:true,provider,model:typeof result.model==='string'?result.model.slice(0,100):null,
    market,candidates:rows,issues:issues.slice(0,24),usage:result.usage&&typeof result.usage==='object'?result.usage:null,
    probabilityMeaning:'classifier-output-not-market-event-probability'
  };
}
module.exports={finite,bounded,symbol,hasEvidence,safeDistribution,normalizeSystemOne};
