(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PulseDanteContract=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';

const VERSION='DANTE_RULESET_v1';
const EVIDENCE_VERSION='DANTE_EVIDENCE_v1';
const RICE_VERSION='DANTE_RICE_BOWL_STATE_v1';
const GONGGURI_VERSION='DANTE_GONGGURI_PARAMS_v1';
const EMA_STRIKE_VERSION='DANTE_EMA_STRIKE_v1';
const MODE='SHADOW_ONLY';
const RICE_STATES=Object.freeze([
  'NO_PATTERN','PHASE_1_DUMP','PHASE_2_ACCUMULATION','PHASE_3_BREAKOUT','PHASE_3_RETEST',
  'PHASE_3_CONFIRMED','PHASE_4_EXPANSION','FAILED_BREAKOUT','FAILED_RETEST','RESET'
]);
const EMA_STRIKE_STATES=Object.freeze([
  'NO_STRIKE','EMA112_APPROACH','EMA112_BREAK','EMA112_HOLD','EMA224_TARGET','EMA224_BREAK','EMA448_TARGET','FAILED'
]);
const DEFAULT_PARAMS=Object.freeze({
  sourceProfile:'REPORT_PROXY_2026_09_24',
  ema:Object.freeze({fast:112,pivot:224,long:448}),
  emaSeed:Object.freeze({method:'SMA_FIXED',seedBars:224}),
  atrPeriod:20,
  pivot:Object.freeze({left:3,right:3}),
  dump:Object.freeze({lookbackBars:120,minDrawdownPct:25,minAtrExpansion:1.5,requireBearishLongMaHistory:true}),
  base:Object.freeze({minBars:20,preferredDurationRatioMin:1.5,preferredDurationRatioMax:2,maxRangeAtr:8,maxEma224SlopeAbsAtrPerBar:.05,requireLongerThanDecline:true,minConfirmedPivotCount:3}),
  breakout:Object.freeze({level:'EMA224_OR_GONGGURI',breakoutBufferAtr:.20,minRvol:1.5,ignitionRvol:3,requireConfirmedClose:true,minPriorClosesBelowPivot:80}),
  retest:Object.freeze({variant:'RETEST_5D_RECLAIM',toleranceAtr:.30,reclaimBufferAtr:.10,minHoldBars:1,maxRetestBars:5}),
  expansion:Object.freeze({minDistanceAtrAboveTrigger:1.5,requireHigherLow:true}),
  reset:Object.freeze({newStructuralLow:true,emaSeparationReexpansion:true})
});
const GONGGURI_DEFAULTS=Object.freeze({
  boxLookback:20,minPriorTouches:2,maxBoxAtrWidth:6,breakoutBufferAtr:.20,
  retestToleranceAtr:.25,reclaimBufferAtr:.10,minHoldBars:2,maxRetestBars:15
});

function finite(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))}
function num(v,name){if(!finite(v))throw new Error(name+' must be finite');return Number(v)}
function text(v,name){const s=String(v??'').trim();if(!s)throw new Error(name+' required');return s}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function freeze(v){if(!v||typeof v!=='object'||Object.isFrozen(v))return v;Object.freeze(v);for(const x of Object.values(v))freeze(x);return v}
function stable(v){if(v==null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return'['+v.map(stable).join(',')+']';return'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}'}
function hash(s){let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)}return(h>>>0).toString(16).padStart(8,'0')}
function paramsHash(params){return'dante-v1-'+hash(stable(params))}
function mergeParams(base,override){const out=clone(base);for(const [k,v] of Object.entries(override||{})){if(v&&typeof v==='object'&&!Array.isArray(v)&&out[k]&&typeof out[k]==='object')out[k]={...out[k],...clone(v)};else out[k]=clone(v)}return out}
function normalizeParams(input={}){const p=mergeParams(DEFAULT_PARAMS,input);for(const k of ['fast','pivot','long'])num(p.ema[k],'ema.'+k);if(!(p.ema.fast<p.ema.pivot&&p.ema.pivot<p.ema.long))throw new Error('Dante EMA periods must be ascending');num(p.emaSeed.seedBars,'emaSeed.seedBars');if(p.emaSeed.method!=='SMA_FIXED')throw new Error('Dante emaSeed.method must be SMA_FIXED');return freeze(p)}
function normalizeGongguriParams(input={}){const p={...GONGGURI_DEFAULTS,...clone(input)};for(const k of Object.keys(GONGGURI_DEFAULTS))num(p[k],'gongguri.'+k);if(p.minPriorTouches<2)throw new Error('gongguri.minPriorTouches must be >= 2');return freeze(p)}
function seededEma(values=[],period,seedBars=224){
  const out=Array(values.length).fill(null);period=num(period,'ema period');seedBars=num(seedBars,'ema seedBars');
  if(values.length<seedBars)return out;
  const seed=values.slice(0,seedBars).reduce((s,v)=>s+Number(v),0)/seedBars,alpha=2/(period+1);let prev=seed;out[seedBars-1]=seed;
  for(let i=seedBars;i<values.length;i++){prev=Number(values[i])*alpha+prev*(1-alpha);out[i]=prev}
  return out;
}
function assertClosedCandles(candles=[],analysisAsOf){
  const asOf=num(analysisAsOf,'analysisAsOf');
  for(const c of candles){
    if(!c||c.partial===true||c.isClosed===false||c.confirmed===false)throw new Error('Dante requires CLOSED_ONLY candles');
    const t=finite(c.closeTime)?Number(c.closeTime):finite(c.closedAt)?Number(c.closedAt):finite(c.time)?Number(c.time):null;
    if(t!=null&&t>asOf)throw new Error('Dante candle after analysisAsOf');
  }
  return true;
}
function createEvidence({sequenceId,riceBowlState='NO_PATTERN',stateReason='INITIAL',stateEnteredAt=null,params=DEFAULT_PARAMS,evidenceFacts=[],counterEvidence=[],transitionPath=[],gongguri=null,emaStrike=null,analysisAsOf}={}){
  if(!RICE_STATES.includes(riceBowlState))throw new Error('invalid Rice Bowl state');
  const p=normalizeParams(params);
  const out={
    version:EVIDENCE_VERSION,mode:MODE,rulesetVersion:VERSION,sequenceId:sequenceId||null,
    riceBowlState,stateReason:String(stateReason),stateEnteredAt:stateEnteredAt==null?null:num(stateEnteredAt,'stateEnteredAt'),
    analysisAsOf:num(analysisAsOf,'analysisAsOf'),paramsHash:paramsHash(p),params:p,
    evidenceFacts:clone(evidenceFacts),counterEvidence:clone(counterEvidence),transitionPath:clone(transitionPath),
    gongguri:clone(gongguri||{status:'NOT_EVALUATED',level:null,evidenceFactIds:[]}),
    emaStrike:clone(emaStrike||{status:'NOT_EVALUATED',evidenceFactIds:[]}),
    rankingContribution:0,scannerStageContribution:0,bookEvidenceContribution:0
  };
  return freeze(out);
}
function assertShadowOnly(result={}){
  if(result.mode!==MODE)throw new Error('Dante must remain SHADOW_ONLY');
  for(const k of ['rankingContribution','scannerStageContribution','bookEvidenceContribution'])if(Number(result[k]||0)!==0)throw new Error(k+' must be 0');
  return true;
}
return{VERSION,EVIDENCE_VERSION,RICE_VERSION,GONGGURI_VERSION,EMA_STRIKE_VERSION,MODE,RICE_STATES,EMA_STRIKE_STATES,DEFAULT_PARAMS,GONGGURI_DEFAULTS,finite,num,text,clone,freeze,stable,hash,paramsHash,mergeParams,normalizeParams,normalizeGongguriParams,seededEma,assertClosedCandles,createEvidence,assertShadowOnly};
});