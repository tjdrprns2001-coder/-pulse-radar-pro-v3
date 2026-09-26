'use strict';

const Dataset=require('./master-sample-dataset-v2.js');
const Similarity=require('./sample-similarity-v2.js');
const Approval=require('../../data/samples/SAMPLE_RANKING_POLICY_APPROVED.json');

const POLICY=Object.freeze({
  version:'SAMPLE_RANKING_POLICY_v1',
  negativePenalty:.55,
  minCoverage:.35,
  strongSuccessScore:72,
  strongNegativeScore:70,
  positiveNetThreshold:34,
  maxBonus:8,
  maxPenalty:8
});

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,v))}
function eventMatches(features,labels,excludeId,count){
  const allowed=new Set(labels);
  return Dataset.buildMasterSampleDatasetV2().events
    .filter(e=>allowed.has(e.label)&&e.id!==excludeId)
    .map(event=>({event,...Similarity.compare(features,event)}))
    .filter(x=>x.coverage>=.18)
    .sort((a,b)=>b.score-a.score||b.coverage-a.coverage)
    .slice(0,count);
}
function evaluateEvent(event){
  const success=eventMatches(event.features,['SURGE','REIGNITION'],event.id,5);
  const negative=eventMatches(event.features,['FAILED_BOS','CONTROL','NO_TRIGGER','PRE_OUTCOME'],event.id,3);
  const successScore=success[0]?.score||0,negativeScore=negative[0]?.score||0;
  const comparisonCoverage=Math.max(success[0]?.coverage||0,negative[0]?.coverage||0);
  const netEvidenceScore=Math.round(clamp(successScore-negativeScore*POLICY.negativePenalty));
  return{successScore,negativeScore,comparisonCoverage,netEvidenceScore};
}
function rankingAdjustment(similarity={}){
  const coverage=finite(similarity.comparisonCoverage)??Math.max(finite(similarity.successTop5?.[0]?.coverage)||0,finite(similarity.negativeTop3?.[0]?.coverage)||0);
  const success=finite(similarity.successScore)??0,negative=finite(similarity.negativeScore)??0;
  const net=finite(similarity.netEvidenceScore)??Math.round(clamp(success-negative*POLICY.negativePenalty));
  if(coverage<POLICY.minCoverage)return{points:0,eligible:false,reason:'LOW_COVERAGE',coverage,policy:POLICY.version};
  if(negative>=POLICY.strongNegativeScore&&negative>=success){
    const points=-Math.min(POLICY.maxPenalty,Math.max(3,Math.round((negative-success)/5)+3));
    return{points,eligible:true,reason:'NEGATIVE_CONTROL_DOMINANT',coverage,successScore:success,negativeScore:negative,netEvidenceScore:net,policy:POLICY.version};
  }
  if(success>=POLICY.strongSuccessScore&&net>=POLICY.positiveNetThreshold){
    const points=Math.min(POLICY.maxBonus,Math.max(2,Math.round((net-POLICY.positiveNetThreshold)/6)+2));
    return{points,eligible:true,reason:'SUCCESS_DNA_DOMINANT',coverage,successScore:success,negativeScore:negative,netEvidenceScore:net,policy:POLICY.version};
  }
  if(negative>=POLICY.strongNegativeScore)return{points:-2,eligible:true,reason:'NEGATIVE_CONTROL_WARNING',coverage,successScore:success,negativeScore:negative,netEvidenceScore:net,policy:POLICY.version};
  return{points:0,eligible:true,reason:'MIXED',coverage,successScore:success,negativeScore:negative,netEvidenceScore:net,policy:POLICY.version};
}
function blindValidation(){
  const labels=new Set(['SURGE','REIGNITION','FAILED_BOS','CONTROL']);
  const events=Dataset.buildMasterSampleDatasetV2().events.filter(e=>labels.has(e.label));
  const rows=events.map(event=>{
    const similarity=evaluateEvent(event),adjustment=rankingAdjustment(similarity),actualPositive=['SURGE','REIGNITION'].includes(event.label);
    return{eventId:event.id,symbol:event.symbol,label:event.label,actualPositive,similarity,adjustment};
  });
  const decided=rows.filter(r=>r.adjustment.points!==0);
  const tp=decided.filter(r=>r.actualPositive&&r.adjustment.points>0).length;
  const fn=decided.filter(r=>r.actualPositive&&r.adjustment.points<0).length;
  const tn=decided.filter(r=>!r.actualPositive&&r.adjustment.points<0).length;
  const fp=decided.filter(r=>!r.actualPositive&&r.adjustment.points>0).length;
  const harmful=fn+fp;
  const harmfulRate=decided.length?harmful/decided.length:0;
  const precision=tp+fp?tp/(tp+fp):null,recall=tp+fn?tp/(tp+fn):null,specificity=tn+fp?tn/(tn+fp):null;
  const balancedAccuracy=recall!=null&&specificity!=null?(recall+specificity)/2:null;
  const gate={minEvents:12,minDecisions:4,maxHarmfulRate:.25,passed:events.length>=12&&decided.length>=4&&harmfulRate<=.25};
  return{version:'SAMPLE_LOO_VALIDATION_v1',leakageControl:'exact event id excluded',policy:POLICY,total:events.length,decisions:decided.length,decisionCoverage:events.length?decided.length/events.length:0,confusion:{tp,fn,tn,fp,harmful,harmfulRate},metrics:{precision,recall,specificity,balancedAccuracy},gate,rows};
}
function productionApproval(){
  const samePolicy=Boolean(Approval&&Approval.approved&&Approval.policy&&Approval.policy.version===POLICY.version);
  return{approved:samePolicy,approval:Approval,policy:POLICY,reason:samePolicy?'APPROVED_BLIND_VALIDATION':'APPROVAL_MISSING_OR_POLICY_MISMATCH'};
}
module.exports={POLICY,evaluateEvent,rankingAdjustment,blindValidation,productionApproval};
