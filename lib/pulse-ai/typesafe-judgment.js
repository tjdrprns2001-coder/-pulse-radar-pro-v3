'use strict';

const VERSION='PULSE_AI_TYPESAFE_v1';
const DEFAULT_BASE_URL='https://api.typesafe.ai';
const DEFAULT_MODEL='jev-latest';

function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}
function cleanSymbol(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')}
function clamp(v,min=0,max=1){return Math.max(min,Math.min(max,Number(v)||0))}
function safeText(v,max=160){const s=String(v??'');return s.length>max?s.slice(0,max):s}
function candidateState(row={}){
  return{
    symbol:cleanSymbol(row.symbol),
    category:safeText(row.category,48),
    sector:safeText(row.sector,48),
    candidateScore:finite(row.candidateScore),
    preIgnitionScore:finite(row.preIgnitionScore),
    priceChange24h:finite(row.priceChange24h),
    priceChange1h:finite(row.priceChange1h),
    priceChange15m:finite(row.priceChange15m),
    quoteVolume24h:finite(row.quoteVolume24h),
    volumeAcceleration:finite(row.volumeAcceleration),
    takerRatio:finite(row.takerRatio),
    fundingPct:finite(row.fundingPct),
    oiChangePct:finite(row.oiChangePct),
    structure:safeText(row.structure,24),
    momentum:safeText(row.momentum,24),
    dataState:safeText(row.dataState,24),
    reasons:(Array.isArray(row.reasons)?row.reasons:[]).slice(0,4).map(x=>safeText(x,120)),
    scanClass:row.scanClass?{key:safeText(row.scanClass.key,40),label:safeText(row.scanClass.label,80)}:null,
    tradeSignal:row.tradeSignal?{
      level:safeText(row.tradeSignal.level,30),
      confidence:finite(row.tradeSignal.confidence),
      invalidations:(row.tradeSignal.invalidations||[]).slice(0,3).map(x=>safeText(x,120))
    }:null,
    samplePattern:row.samplePattern?{
      archetype:safeText(row.samplePattern.archetype,40),
      phase:safeText(row.samplePattern.phase,40),
      score:finite(row.samplePattern.score)
    }:null
  };
}
function marketState(context={}){
  return{
    breadth:context.breadth||null,
    dataHealth:context.dataHealth||null,
    coverage:context.universe?.coverage||null,
    sourceWarning:context.sourceWarning||null,
    events:(context.events||[]).slice(0,8),
    sectorClusters:(context.sectorClusters||[]).slice(0,6)
  };
}
function buildQuestions(candidates=[]){
  const questions={
    marketMode:{
      type:'choice',
      instructions:'현재 시장 상태를 롱 후보 탐색 관점에서 하나의 운영 모드로 분류하라. 수치가 누락되면 확신을 낮추고 과장하지 마라.',
      criteria:{
        risk_on:'시장 폭과 메이저가 대체로 우호적이며 롱 후보 확장이 가능한 상태',
        selective:'시장 전체보다 개별 종목/섹터 선별이 중요한 혼조 또는 순환 상태',
        defensive:'하락 폭 확대, 메이저 약세, 데이터 리스크 등으로 롱 후보를 보수적으로 봐야 하는 상태',
        insufficient:'판단에 필요한 데이터가 부족하거나 서로 충돌하는 상태'
      }
    }
  };
  for(const row of candidates){
    const k=cleanSymbol(row.symbol);
    if(!k)continue;
    questions['ready_'+k]={
      type:'score',
      instructions:'해당 종목이 이미 급등한 추격 구간이 아니라 점화 전 또는 재축적 롱 관찰 후보로 얼마나 준비됐는지 평가하라. 가격 미진행, 구조, OI, taker, 거래량 가속, 데이터 품질을 함께 보되 누락값을 임의 추정하지 마라.',
      criteria:[
        '근거 부족 또는 롱 관찰 부적합',
        '초기 관찰만 가능',
        '준비 신호가 일부 있으나 확인 필요',
        '점화 직전 후보에 가까움',
        '여러 독립 근거가 동시에 확인된 강한 준비 상태'
      ]
    };
    questions['chase_'+k]={
      type:'noul',
      instructions:'이 종목을 지금 점화 전 후보보다 이미 진행되었거나 추격 위험이 큰 상태로 보는 것이 타당한가?',
      criteria:{
        true:'가격 과진행, 거래량 과열, 구조 훼손 또는 롱 crowding 등 추격 위험 근거가 분명함',
        false:'가격이 아직 과진행되지 않았고 점화 전/재축적 관찰로 볼 여지가 큼'
      }
    };
  }
  return questions;
}
function normalizeAnswers(result={},candidates=[]){
  const answers=result?.answers||{},rows=[];
  for(const row of candidates){
    const symbol=cleanSymbol(row.symbol);if(!symbol)continue;
    const ready=answers['ready_'+symbol]||null,chase=answers['chase_'+symbol]||null;
    rows.push({
      symbol,
      readinessScore:finite(ready?.score),
      readinessConfidence:finite(ready?.confidence),
      chaseRisk:finite(chase?.noul),
      readinessLevel:finite(ready?.score)==null?null:Math.round(finite(ready.score)),
      shadowOnly:true
    });
  }
  const market=answers.marketMode||null;
  return{
    version:VERSION,
    status:'ok',
    shadowOnly:true,
    provider:'typesafe',
    model:result?.model||null,
    market:{
      mode:market?.choice||null,
      confidence:finite(market?.confidence),
      probabilities:market?.probabilities||null
    },
    candidates:rows,
    usage:result?.usage||null
  };
}
function createTypeSafeJudgment({
  apiKey=process.env.TYPESAFE_API_KEY||'',
  baseURL=process.env.TYPESAFE_BASE_URL||DEFAULT_BASE_URL,
  model=process.env.TYPESAFE_DEFAULT_MODEL||DEFAULT_MODEL,
  fetchImpl=globalThis.fetch,
  timeoutMs=2500,
  maxCandidates=5
}={}){
  const key=String(apiKey||'').trim();
  const available=Boolean(key&&typeof fetchImpl==='function');
  const endpoint=String(baseURL||DEFAULT_BASE_URL).replace(/\/+$/,'')+'/v1/systemone';
  async function evaluate(context={}){
    if(!available)return{version:VERSION,status:'disabled',shadowOnly:true,provider:'typesafe',available:false,model:null,market:null,candidates:[]};
    const candidates=(Array.isArray(context.symbols)?context.symbols:[])
      .filter(x=>x&&x.dataState!=='failed'&&x.dataState!=='stale')
      .slice(0,Math.max(1,Math.min(8,Number(maxCandidates)||5)))
      .map(candidateState);
    if(!candidates.length)return{version:VERSION,status:'empty',shadowOnly:true,provider:'typesafe',available:true,model:null,market:null,candidates:[]};
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(500,Number(timeoutMs)||2500));
    try{
      const response=await fetchImpl(endpoint,{
        method:'POST',
        headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
        body:JSON.stringify({
          model,
          state:{market:marketState(context),candidates},
          questions:buildQuestions(candidates)
        }),
        signal:controller.signal
      });
      let body=null;try{body=await response.json()}catch{body=null}
      if(!response.ok){
        const err=new Error('TypeSafe HTTP '+response.status);err.statusCode=response.status;err.body=body;throw err;
      }
      return{...normalizeAnswers(body,candidates),available:true};
    }finally{clearTimeout(timer)}
  }
  function health(){
    return{version:VERSION,available,shadowOnly:true,provider:'typesafe',model:available?model:null,endpoint:available?endpoint:null};
  }
  return{version:VERSION,available,model,evaluate,health};
}
module.exports={VERSION,DEFAULT_BASE_URL,DEFAULT_MODEL,candidateState,marketState,buildQuestions,normalizeAnswers,createTypeSafeJudgment};
