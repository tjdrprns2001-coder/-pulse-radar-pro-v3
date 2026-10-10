'use strict';
// Explicit opt-in 3 Gemini role calls, inspired by TradingAgents' debate organization.
// Analysis is a research-only shadow attachment. No orders, promotions or ranking changes.
const {buildReviewBoard,reviewAnswer}=require('./multi-perspective-board.js');
const VERSION='PULSE_LLM_ROLE_DEBATE_v1';
const ROLE_ORDER=['bull','bear','risk'],ALLOWED_STANCES=new Set(['SUPPORT','CAUTION','NEUTRAL','UNKNOWN']);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const sym=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,25);
function fromRoleEvidence(review){
 const unique=new Map();
 for(const role of review.roles||[]){
  for(const e of role.evidence||[]){
   if(/^[a-zA-Z][a-zA-Z0-9.]{1,48}$/.test(e.field)&&finite(e.value)&&!unique.has(e.field))
    unique.set(e.field,{field:e.field,value:e.value,unit:e.detail});
  }
 }
 return [...unique.values()].slice(0,14);
}
function approveAnswer(payload,role,symbol,allowed){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||
  payload.role!==role||payload.symbol!==symbol||!ALLOWED_STANCES.has(payload.stance)||
  typeof payload.summary!=='string')return null;
 const summary=payload.summary.trim();
 if(summary.length<10||summary.length>460||/[<>]/.test(summary)||/무조건|확정 수익|수익 보장|매수하세요|매도하세요|비밀.?키|api.?key/i.test(summary))return null;
 if(!Array.isArray(payload.evidenceFields)||payload.evidenceFields.length<1||payload.evidenceFields.length>5||
   !payload.evidenceFields.every(x=>typeof x==='string'&&allowed.has(x)))return null;
 const fields=[...new Set(payload.evidenceFields)];
 if(!fields.length)return null;
 return{role,stance:payload.stance,summary,evidenceFields:fields,
   missingChecks:Array.isArray(payload.missingChecks)?payload.missingChecks.filter(x=>typeof x==='string').slice(0,3).map(x=>x.slice(0,100)):[]};
}
function createRoleDebateService({gateway,now=()=>Date.now(),cooldownMs=600000,maxCached=25,maxReviewsPerHour=12,maxConcurrent=2}={}){
 const cached=new Map(),inFlight=new Set(),attempts=[];let completedCalls=0,failedCalls=0,attemptedRoleCalls=0,attemptedModelRequests=0;
 const hourlyCap=Number.isInteger(maxReviewsPerHour)?Math.max(1,Math.min(30,maxReviewsPerHour)):12;
 const concurrentCap=Number.isInteger(maxConcurrent)?Math.max(1,Math.min(4,maxConcurrent)):2;
 const maxAge=typeof cooldownMs==='number'&&cooldownMs>=60000?Math.min(cooldownMs,3600000):600000;
 const available=()=>Boolean(gateway?.available&&typeof gateway.reviewRole==='function');
 function fallback(board,status,reason,modelCalls=0){
  return{version:VERSION,status,reason,shadowOnly:true,independentLLMAgents:false,
   modelCalls,board,answer:reviewAnswer(board),disposition:'NO_ACTION',
   verifiedNet:false,notTradingAdvice:true};
 }
 async function debate({context,selectedSymbol}={}){
  const ts=now(),ticker=sym(selectedSymbol||context?.selectedSymbol);
  const board=buildReviewBoard(context,{selectedSymbol:ticker,now:ts,maxSymbols:1});
  const review=board.reviews.find(x=>x.symbol===ticker);
  if(!ticker||!review)return fallback(board,'NO_EVIDENCE','선택한 종목의 스캔 자료가 없습니다');
  if(board.quality.status!=='CHECKED'||review.readiness==='DATA_OR_RISK_BLOCKED'||review.readiness==='MISSING_DERIVATIVES')
   return fallback(board,'BLOCKED','누락·노후·과열 또는 선물 수급 미확인');
  if(!available())return fallback(board,'DISABLED','Gemini 연결이 비활성 상태입니다');
  const cacheKey=ticker;
  const cachedEntry=cached.get(cacheKey);
  if(cachedEntry&&ts-cachedEntry.at<maxAge){
   // Do not mistake a new scan for the previously reviewed snapshot.
   if(cachedEntry.scanAt===board.quality.updatedAt&&cachedEntry.report.status==='READY')return{...cachedEntry.report,status:'CACHED',modelCalls:0};
   return fallback(board,'COOLDOWN','새 스캔에 대한 재호출은 과금/호출 제한으로 차단되었습니다');
  }
  const fields=fromRoleEvidence(review);
  if(fields.length<2)return fallback(board,'BLOCKED','검증 가능한 수치 근거가 부족합니다');
  if(inFlight.has(cacheKey))return fallback(board,'IN_PROGRESS','동일 종목 LLM 심의가 진행 중입니다');
  if(inFlight.size>=concurrentCap)return fallback(board,'CONCURRENCY_LIMIT','동시 분석 호출 상한에 도달했습니다');
  while(attempts.length&&ts-attempts[0]>=3600000)attempts.shift();
  if(attempts.length>=hourlyCap)return fallback(board,'BUDGET_LIMIT','서버 인스턴스 시간당 AI 심의 예산에 도달했습니다');
  attempts.push(ts);
  inFlight.add(cacheKey);
  const allowed=new Set(fields.map(x=>x.field)),decisions=[];let started=0;
  try{
   for(const role of ROLE_ORDER){
    started++;attemptedRoleCalls++;
    const draft=await gateway.reviewRole({role,symbol:ticker,asOf:board.quality.updatedAt,
     evidence:fields,previous:decisions.map(x=>({role:x.role,stance:x.stance,summary:x.summary,evidenceFields:x.evidenceFields})),
     deterministicReadiness:review.readiness});
    started+=Math.max(0,Number(draft?._attempts||1)-1);
    const checked=approveAnswer(draft,role,ticker,allowed);
    if(!checked)throw new Error('INVALID_ROLE_SCHEMA_OR_EVIDENCE');
    checked.modelUsed=typeof draft._usedModel==='string'?draft._usedModel:gateway.model||null;
    decisions.push(checked);
   }
  }catch(e){
   if(Number.isInteger(e?.attempts)&&e.attempts>1)started+=e.attempts-1;
   attemptedModelRequests+=started;
   failedCalls++;
   // Failed requests still trigger cooldown to prevent 429 storms, but never surface partial role conclusions.
   cached.set(cacheKey,{at:ts,scanAt:board.quality.updatedAt,report:fallback(board,'FAILED','LLM 분석 실패 또는 근거 검증 불합격',started)});
   inFlight.delete(cacheKey);
   return fallback(board,'FAILED','LLM 분석 실패 또는 근거 검증 불합격',started);
  }
  inFlight.delete(cacheKey);
  completedCalls+=ROLE_ORDER.length;
  attemptedModelRequests+=started;
  const risk=decisions.at(-1),opposition=decisions[0].stance!==decisions[1].stance;
  // The LLM is NEVER allowed to replace the deterministic readiness or authorize a trade.
  const report={version:VERSION,status:'READY',shadowOnly:true,independentLLMAgents:false,
   method:'THREE_SEPARATE_GEMINI_CALLS_WITH_AUTO_MODEL_FALLBACK',provider:'gemini',
   model:decisions.at(-1)?.modelUsed||gateway.model||null,
   modelsUsed:[...new Set(decisions.map(x=>x.modelUsed).filter(Boolean))],
   generatedAt:ts,sourceAsOf:board.quality.updatedAt,
   symbol:ticker,modelCalls:started,roles:decisions,
   disagreement:opposition,deterministicReadiness:review.readiness,
   disposition:risk.stance==='CAUTION'?'REVIEW_RISK':'NO_ACTION',
   verifiedNet:false,notTradingAdvice:true,
   permission:'READ_ONLY_NO_ORDER_NO_RANK_PROMOTION',
   limitations:['세 번의 독립 호출이며 장애 시 Gemini 모델이 전환될 수 있으나 독립 데이터 출처는 아닙니다',
    'LLM의 주관적 문구를 확정 사실이나 검증된 승률로 취급하지 않습니다',
    '모든 수치 근거는 스캐너가 제공한 필드 ID와 대조되었습니다']};
  cached.set(cacheKey,{at:ts,scanAt:board.quality.updatedAt,report});
  while(cached.size>maxCached)cached.delete(cached.keys().next().value);
  return report;
 }
 function health(){return{version:VERSION,available:available(),shadowOnly:true,
  provider:'gemini',independentLLMAgents:false,roleCallsPerReview:3,cooldownMs:maxAge,
  cacheEntries:cached.size,completedRoleCalls:completedCalls,attemptedRoleCalls,attemptedModelRequests,failedReviews:failedCalls,
  maxReviewsPerHour:hourlyCap,reviewsStartedLastHour:attempts.length,maxConcurrent:concurrentCap,
  modelRouting:typeof gateway?.health==='function'?gateway.health():null,
  permission:'READ_ONLY_NO_ORDER_NO_RANK_PROMOTION'};}
 return{version:VERSION,debate,health};
}
module.exports={VERSION,createRoleDebateService,approveAnswer,fromRoleEvidence};
