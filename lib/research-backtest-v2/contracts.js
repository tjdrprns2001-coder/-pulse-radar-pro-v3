'use strict';

const FEATURE_SCHEMA_VERSION='research-features-v1';
const OUTCOME_SCHEMA_VERSION='research-outcomes-v1';
const TRAIN_START_TS=Date.parse('2021-01-01T00:00:00.000Z');
const VALIDATION_START_TS=Date.parse('2025-01-01T00:00:00.000Z');
const DEFAULT_VALIDATION_END_TS=Date.parse('2026-12-31T23:59:59.999Z');

function finite(v){
  if(v===null||v===undefined||v==='')return null;
  const n=Number(v);return Number.isFinite(n)?n:null;
}
function deepFreeze(v){
  if(!v||typeof v!=='object'||Object.isFrozen(v))return v;
  Object.freeze(v);
  for(const value of Object.values(v))deepFreeze(value);
  return v;
}
function splitForTimestamp(ts,validationEndTs=DEFAULT_VALIDATION_END_TS){
  const n=finite(ts),rawEnd=finite(validationEndTs),end=rawEnd==null?DEFAULT_VALIDATION_END_TS:rawEnd;
  if(n==null)return'excluded';
  if(n>=TRAIN_START_TS&&n<VALIDATION_START_TS)return'train';
  if(n>=VALIDATION_START_TS&&n<=end)return'validation';
  return'excluded';
}
function eventId({symbol,signalCandleCloseTs,screenerConfigVersion}={}){
  const s=String(symbol||'').toUpperCase().trim();
  const ts=finite(signalCandleCloseTs),ver=String(screenerConfigVersion||'').trim();
  if(!s||ts==null||!ver)throw new Error('symbol, signalCandleCloseTs and screenerConfigVersion required');
  return s+':'+ver+':'+Math.trunc(ts);
}
function createFrozenManifest(input={}){
  const createdAt=finite(input.createdAt),grid=finite(input.evaluationGridMs);
  if(!String(input.manifestVersion||'').trim())throw new Error('manifestVersion required');
  if(createdAt==null)throw new Error('createdAt required');
  if(String(input.derivedFromSplit||'')!=='train')throw new Error('manifest must be derived from train');
  if(!String(input.screenerConfigVersion||'').trim())throw new Error('screenerConfigVersion required');
  if(!String(input.signalTimeframe||'').trim())throw new Error('signalTimeframe required');
  if(grid==null||grid<=0)throw new Error('evaluationGridMs must be positive');
  const manifest={
    manifestVersion:String(input.manifestVersion),
    createdAt,
    derivedFromSplit:'train',
    featureSchemaVersion:String(input.featureSchemaVersion||FEATURE_SCHEMA_VERSION),
    screenerConfigVersion:String(input.screenerConfigVersion),
    outcomeSchemaVersion:String(input.outcomeSchemaVersion||OUTCOME_SCHEMA_VERSION),
    signalTimeframe:String(input.signalTimeframe),
    evaluationGridMs:grid,
    thresholds:input.thresholds&&typeof input.thresholds==='object'?JSON.parse(JSON.stringify(input.thresholds)):{},
    frozen:true
  };
  return deepFreeze(manifest);
}
function assertValidationManifest(manifest){
  if(!manifest||manifest.frozen!==true)throw new Error('validation requires frozen manifest');
  if(String(manifest.derivedFromSplit||'')!=='train')throw new Error('validation manifest must be derived from train');
  if(!String(manifest.manifestVersion||'')||!String(manifest.screenerConfigVersion||''))throw new Error('validation manifest version missing');
  const grid=finite(manifest.evaluationGridMs);if(grid==null||grid<=0)throw new Error('validation manifest grid missing');
  return true;
}

module.exports={
  FEATURE_SCHEMA_VERSION,OUTCOME_SCHEMA_VERSION,TRAIN_START_TS,VALIDATION_START_TS,DEFAULT_VALIDATION_END_TS,
  finite,deepFreeze,splitForTimestamp,eventId,createFrozenManifest,assertValidationManifest
};
