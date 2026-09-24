(()=>{'use strict';
const $=id=>document.getElementById(id);
const CD=window.PulseChartData,SE=window.PulseSmcEngine,LE=window.PulseLiquidityEngine,LM=window.PulseLiquidityMapEngine,TRE=window.PulseTrendlineRetestEngine,ICT=window.PulseIctTrainerEngine,BF=window.PulseForexBookEngine,TA=window.PulseTraderAnalysis;
const Journal=window.PulseLiquidityEventJournal,Gate=window.PulseSampleReadinessGate,Live=window.PulseBookAiLiveEvidence,A=window.PulseBookAiAdapter,R=window.PulseBookAiRuleEngine,F=window.PulseBookAiFusionEngine,S=window.PulseBookAiSummaryTemplate,C=window.PulseBookAiSnapshotComposer,MTF=window.PulseBookAiMtfComposer,WL=window.PulseBookAiWatchlistSelector,Store=window.PulseBookAiStorage,SR=window.PulseSnapshotRenderer,Promotion=window.PulseRecommendationPromotion,Causal=window.PulseCausalIctEngine,CausalLedger=window.PulseCausalIctLedger;
const RULE_LABEL={BREAKOUT_RETEST:'돌파 후 리테스트',SUPPORT_RESISTANCE_FLIP:'지지·저항 역할 전환',TRENDLINE_REACTION:'추세선 반응',LIQUIDITY_SWEEP_RECLAIM:'유동성 스윕 후 회복',VOLUME_CONTRACTION_BREAK:'거래량 수축 후 돌파',MOVING_AVERAGE_COMPRESSION:'이평 압축'};
const MINI_TFS=['1d','4h','1h','15m'];
const AI_DEEP_CANDIDATE_LIMIT=30;
const KO_ENGINE={scanner:'스캐너',presurge:'급등 전조',ict:'ICT 분석',causalIct:'인과성 ICT',structure:'구조 분석',forexBook:'책 데이터',journal:'이벤트 원장',gate:'표본 검증 게이트',trendline:'추세선'};
const KO_STATUS={AVAILABLE:'정상',MISSING:'누락',STALE:'오래됨',ERROR:'오류',CONFIRMED:'확정',CANDIDATE:'후보',NOT_CONFIRMED:'미확정',READY:'준비',WATCH:'관찰',WAIT:'대기',RECOMMEND:'자동 추천',EXCLUDE:'제외',EXCLUDED:'제외'};
const KO_STAGE={WAIT_RECLAIM:'재회복 대기',WAIT_MSS:'MSS 확인 대기',WAIT_FVG:'FVG 확인 대기',WAIT_REVISIT:'FVG 재방문 대기',REVISIT:'재방문 확인',INTENT:'진입 의도 확인',FILLED:'가상 체결 완료',INSUFFICIENT_BARS:'봉 부족',NO_SETUP:'조건 없음',PARTIAL:'부분 정렬',MIXED:'혼조'};
function koStatus(v){return KO_STATUS[String(v||'').toUpperCase()]||v||'-'}
function koStage(v){return KO_STAGE[String(v||'').toUpperCase()]||v||'-'}

let last=null,runSeq=0;
function clean(v){v=String(v||'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(!v)return'BTCUSDT';if(!v.endsWith('USDT')&&v.length<=12)v+='USDT';return v}
function fmtTime(ms){return Number.isFinite(Number(ms))?new Date(Number(ms)).toLocaleString('ko-KR',{hour12:false}):'-'}
function fmtPrice(v){const n=Number(v);if(!Number.isFinite(n))return'N/A';const d=n>=100?2:n>=1?4:n>=.01?5:8;return n.toLocaleString('en-US',{maximumFractionDigits:d})}
async function json(url){const r=await fetch(url,{cache:'no-store'}),d=await r.json().catch(()=>({}));if(!r.ok||d.status==='error')throw new Error(d.error||('HTTP '+r.status));return d}
function lastClosedTime(raw){const c=raw?.candles||[],x=c.at(-1);return Number(raw?.lastClosedCloseTime??raw?.lastClosedTime??x?.closeTime??x?.closedAt??x?.time)||null}
function gateReadOnly(){
  if(!Gate)return null;
  try{
    const db=Gate.createLocalStorageStore(localStorage).read(),round=db.rounds?.at(-1)||null,observations=Array.isArray(db.observations)?db.observations:[];
    const initializedAt=Number(db.updatedAt);if(!round&&!observations.length&&!Number.isFinite(initializedAt))return null;
    const times=[initializedAt,round?.decision?.decidedAt,round?.validation?.cutoffFrozenAt,round?.validationProgress?.updatedAt,round?.createdAt,...observations.flatMap(x=>[x.outcomeUpdatedAt,x.confirmedAt])].map(Number).filter(Number.isFinite);
    const observedAt=times.length?Math.max(...times):null;
    return{data:{version:Gate.VERSION,state:round?.status||db.lastState||'INSUFFICIENT',round,progress:{archiveN:observations.length,updatedAt:observedAt}},observedAt,version:Gate.VERSION};
  }catch{return null}
}
function journalReadOnly(){
  if(!Journal)return null;
  try{const data=Journal.createLocalStorageStore(localStorage).export();if(!(data.snapshots?.length||data.events?.length||data.outcomes?.length))return null;return{data,version:Journal.VERSION}}catch{return null}
}
function boundedObservedAt(value,receivedAt){const v=Number(value),r=Number(receivedAt);if(!Number.isFinite(r))return Number.isFinite(v)?v:null;if(!Number.isFinite(v))return r;return Math.min(v,r)}
function source(data,observedAt,version){return data==null?{data:null,reason:'NOT_AVAILABLE'}:{data,observedAt:observedAt||null,version:version||data.version||null}}
function derivedSource(data,computedAt,sourceBarClosedAt,version){return data==null?{data:null,reason:'NOT_AVAILABLE'}:{data,observedAt:computedAt||null,computedAt:computedAt||null,sourceBarClosedAt:sourceBarClosedAt||null,version:version||data.version||null}}
function causalSource(chart,computedAt,sourceBarClosedAt,symbol){
  if(!Causal||!chart?.candles?.length)return{data:null,reason:'CAUSAL_ICT_UNAVAILABLE'};
  const result=Causal.run(chart.candles),contract=Causal.validateCausalContracts(result);let ledger=null;
  if(CausalLedger&&symbol){try{const store=CausalLedger.createLocalStorageStore(localStorage);ledger=CausalLedger.record({store,symbol,timeframe:'4h',result:{...result,contract},now:computedAt||Date.now()})}catch(_e){}}
  return derivedSource({...result,contract,ledger},computedAt,sourceBarClosedAt,result.engine_version||Causal.VERSION);
}
const TF_MS=Object.freeze({'5m':300000,'15m':900000,'1h':3600000,'4h':14400000,'12h':43200000,'1d':86400000,'3d':259200000,'1w':604800000});
function freshnessLimit(tf){const base=TF_MS[String(tf||'').toLowerCase()]||3600000;return Math.max(30*60*1000,base+30*60*1000)}
async function fetchStructureFresh({symbol,interval,limit=560,analysisAsOf=Date.now()}={}){
  let raw=await CD.fetchStructure({symbol,interval,limit});
  const observed=lastClosedTime(raw),maxAge=freshnessLimit(interval);
  if(Number.isFinite(observed)&&analysisAsOf-observed>maxAge){
    raw=await CD.fetchStructure({symbol,interval,limit,cacheBust:analysisAsOf});
    raw.__bookAiFreshRetry=true;
  }
  return raw;
}
function persistConfirmedEvidence({symbol,chart,now}={}){
  if(!Journal||!Gate)return{journal:null,gate:null,persisted:false,reason:'ENGINE_UNAVAILABLE'};
  try{
    const bundle=Journal.createBundle({symbol,timeframe:'4h',model:chart.model,trendRetest:chart.trendRetest,now});
    const confirmed=(bundle.events||[]).filter(x=>x?.status==='CONFIRMED');
    if(!confirmed.length)return{journal:journalReadOnly(),gate:gateReadOnly(),persisted:false,reason:'NO_CONFIRMED_EVENT'};
    const journalStore=Journal.createLocalStorageStore(localStorage);
    Journal.recordAndResolve({store:journalStore,snapshot:bundle.snapshot,events:bundle.events,referenceCandles:chart.candles,outcomeCandles:chart.candles,now});
    const gateStore=Gate.createLocalStorageStore(localStorage);
    const gateResult=Gate.evaluateGate({journalDb:journalStore.export(),store:gateStore,now});
    const gateDb=gateStore.read();gateStore.write({...gateDb,updatedAt:now,lastState:gateResult?.state||gateDb.lastState||'INSUFFICIENT'});
    return{journal:journalReadOnly(),gate:gateReadOnly(),persisted:true,confirmedCount:confirmed.length,gateState:gateResult?.state||null};
  }catch(e){return{journal:journalReadOnly(),gate:gateReadOnly(),persisted:false,reason:String(e?.message||e)}}
}
function closedCandlesForAsOf(rows,analysisAsOf){
  return (Array.isArray(rows)?rows:[]).filter(c=>{
    if(!c||c.partial===true||c.isClosed===false||c.confirmed===false)return false;
    const t=Number(c.closeTime??c.closedAt);
    return !Number.isFinite(t)||t<=analysisAsOf;
  });
}
function rawBias(raw){
  const ev=Array.isArray(raw?.events)?raw.events.at(-1):null;if(ev?.dir)return ev.dir;
  const v=String(raw?.bias?.label||raw?.bias||'').toLowerCase();
  if(v.includes('up')||v.includes('bull')||v.includes('상승'))return'up';
  if(v.includes('down')||v.includes('bear')||v.includes('하락'))return'down';
  return'neutral';
}
function buildChart(raw,tf='4h',analysisAsOf=Date.now()){
  if(!LM||!TRE)throw new Error('LiquidityMap/TrendlineRetest engine unavailable');
  const sourceCandles=closedCandlesForAsOf(raw.candles||[],analysisAsOf);
  const model=LM.buildLiquidityMap({candles:sourceCandles,canonicalSwings:raw.canonicalSwings||[],canonicalEvents:raw.events||[],timeframe:tf,htfBias:rawBias(raw)});
  if(!model?.ok)throw new Error(model?.error||'Liquidity Map 생성 실패');
  const candles=model.candles,smc=model.smc,liquidity=model.liquidity;
  const trendRetest=TRE.analyzeTrendlineRetests({candles:sourceCandles,trendlines:raw.trendlines||{},timeframe:tf});
  const ict=ICT.analyzeTimeframe({candles,smc,liquidity,tf});
  const book=BF.analyze({candles,smc,liquidity,ictContext:ict});
  const technical=TA?.summarize?TA.summarize({candles,analysis:raw,smc,liquidity,timeframe:tf}):null;
  return{raw,candles,smc,liquidity,ict,book,model,trendRetest,technical};
}
const WATCH_CACHE_KEY='book-ai-watchlist-v2';
function setWatchMeta(text,state=''){const el=$('watchMeta');if(!el)return;el.textContent=text;el.className='muted '+state}
function saveWatchCache(rows,source){try{localStorage.setItem(WATCH_CACHE_KEY,JSON.stringify({ts:Date.now(),rows,source}))}catch{}}
function readWatchCache(){try{const x=JSON.parse(localStorage.getItem(WATCH_CACHE_KEY)||'null');return x&&Array.isArray(x.rows)?x:null}catch{return null}}
const AUTO_CACHE_KEY='book-ai-auto-recommend-v1';
function setAutoMeta(text,state=''){const el=$('autoMeta');if(!el)return;el.textContent=text;el.className='muted '+state}
function saveAutoCache(bundle,source){try{localStorage.setItem(AUTO_CACHE_KEY,JSON.stringify({ts:Date.now(),bundle,source}))}catch{}}
function readAutoCache(){try{return JSON.parse(localStorage.getItem(AUTO_CACHE_KEY)||'null')}catch{return null}}
const PROMOTION_CACHE_KEY='book-ai-promotion-cache-v1';
function uniqText(rows){return[...new Set((rows||[]).filter(Boolean).map(String))]}
function readPromotionCache(){try{return JSON.parse(localStorage.getItem(PROMOTION_CACHE_KEY)||'{}')||{}}catch{return{}}}
function writePromotionCache(x){try{localStorage.setItem(PROMOTION_CACHE_KEY,JSON.stringify(x||{}))}catch{}}
function cacheConfirmedBook(symbol,rules){
  if(!Promotion||!Promotion.bookConfirmed(rules))return null;
  const cache=readPromotionCache(),ids=(rules?.bookSetups||[]).filter(x=>x?.status==='CONFIRMED').map(x=>x.ruleId);
  cache[symbol]={confirmed:true,bookScore:Promotion.bookScore(rules),ruleIds:ids,updatedAt:Date.now()};writePromotionCache(cache);return cache[symbol];
}
function groupPromotionRows(rows=[]){
  const out={recommended:[],confirmed:[],ready:[],watch:[],wait:[],excluded:[]};
  for(const x of rows){const s=String(x?.state||'WAIT').toUpperCase(),k=s==='RECOMMEND'?'recommended':s==='CONFIRMED'?'confirmed':s==='READY'?'ready':s==='WATCH'?'watch':s==='WAIT'?'wait':'excluded';out[k].push(x)}
  return out;
}
function allPromotionRows(bundle={}){return[...(bundle.recommended||[]),...(bundle.confirmed||[]),...(bundle.ready||[]),...(bundle.watch||[]),...(bundle.wait||[]),...(bundle.excluded||[])]}
function applyPromotionCache(bundle={}){
  if(!Promotion)return bundle;
  const cache=readPromotionCache(),maxAge=6*3600000,rows=allPromotionRows(bundle).map(x=>{
    const b=cache[x.symbol],book=b&&Date.now()-Number(b.updatedAt||0)<=maxAge?{confirmed:b.confirmed,status:b.confirmed?'CONFIRMED':null,score:b.bookScore}:null;
    const p=Promotion.evaluate({item:x.item||{},book,priorState:x.state});
    return{...x,state:p.state,label:p.label,promotion:p,reasons:uniqText([...(x.reasons||[]),...(p.reasons||[])]).slice(0,8),missing:uniqText(p.missing||[]).slice(0,8),invalidations:uniqText([...(x.invalidations||[]),...(p.invalidations||[])]).slice(0,8)};
  });
  return groupPromotionRows(rows);
}
async function postPromotion(row,marketSource='book-ai-client'){
  if(!row?.symbol)return null;
  const item=row.item||{},payload={symbol:row.symbol,state:row.state,label:row.label,score:row.score,reasons:row.reasons||[],missing:row.missing||[],invalidations:row.invalidations||[],marketSource,item:{lastPrice:item.lastPrice,scanClass:item.scanClass,v2Type:item.v2Type,v3LongTier:item.v3LongTier,bookConfirmedRuleIds:readPromotionCache()?.[row.symbol]?.ruleIds||[]}};
  try{return await jsonTimeout('/api/coin-scan?mode=recommendation-history&action=observe',7000,{method:'POST',body:JSON.stringify(payload)})}catch{return null}
}
function renderAutoRecommendations(bundle={},source='스캐너 v3'){
  const box=$('autoRecommendations');if(!box)return;box.innerHTML='';bundle=applyPromotionCache(bundle);
  const recommended=bundle.recommended||[],confirmed=bundle.confirmed||[],ready=bundle.ready||[],watch=bundle.watch||[];
  const rows=[...recommended,...confirmed,...ready,...watch].slice(0,6);
  if(!rows.length){box.innerHTML='<div class="watchEmpty">현재 자동 추천 승격 조건을 충족한 종목이 없습니다.</div>';setAutoMeta(source+' · 승격 조건 대기','warn');return}
  for(const x of rows){
    const b=document.createElement('button');b.type='button';b.className='autoItem auto-'+String(x.state||'WATCH');b.dataset.symbol=x.symbol;
    const top=document.createElement('div');top.className='autoTop';
    const left=document.createElement('div');const sym=document.createElement('b');sym.textContent=x.symbol;const tag=document.createElement('span');tag.className='autoTag';const scope=x.item?.marketScope==='spot+futures'?'현물+선물':x.item?.marketScope==='spot'?'현물':x.item?.marketScope==='futures'?'선물':'';tag.textContent=[x.label||'관찰',scope].filter(Boolean).join(' · ');left.append(sym,tag);
    const score=document.createElement('em');score.textContent=Math.round(Number(x.score)||0)+'점';top.append(left,score);
    const p=document.createElement('p');p.textContent=(x.reasons||[]).slice(0,4).join(' · ')||'승격 조건 계산';
    const m=document.createElement('small');m.textContent=(x.missing||[]).length?'다음 관문 · '+x.missing.slice(0,3).join(' · '):'핵심 관문 통과';
    b.append(top,p,m);b.onclick=()=>{$('symbol').value=x.symbol;run()};box.append(b);
  }
  setAutoMeta(source+' · '+recommended.length+' 추천 / '+confirmed.length+' 확정 / '+ready.length+' 준비 / '+watch.length+' 관찰',recommended.length?'ok':confirmed.length||ready.length?'warn':'');
}
function renderStructureAuto(rows=[]){
  const watch=(rows||[]).slice(0,5).map(x=>({symbol:x.symbol,score:x.watchScore||0,state:'WATCH',label:'구조 관찰',reasons:x.reasons||[],missing:['스캐너 v3','OI/taker 확인'],invalidations:[]}));
  renderAutoRecommendations({recommended:[],watch},'4H 구조 fallback');
}
function historyDirectionLabel(v){const x=String(v||'');if(x==='NEW')return'NEW';if(x==='SCORE_UP')return'점수↑';if(x==='SCORE_DOWN')return'점수↓';if(x.includes('→'))return x;return'갱신'}
function renderAutoHistory(rows=[]){
  const box=$('autoHistory'),meta=$('autoHistoryMeta');if(!box)return;box.innerHTML='';
  const list=(Array.isArray(rows)?rows:[]).slice(0,8);
  if(!list.length){box.innerHTML='<div class="watchEmpty">추천 변화 이력이 없습니다.</div>';if(meta)meta.textContent='아직 기록 없음';return}
  for(const x of list){
    const d=document.createElement('button');d.type='button';d.className='autoHistoryItem';d.dataset.symbol=x.symbol;
    const left=document.createElement('div');const top=document.createElement('div');top.className='autoHistoryTop';const sym=document.createElement('b');sym.textContent=x.symbol;const tag=document.createElement('span');tag.textContent=historyDirectionLabel(x.direction);top.append(sym,tag);
    const desc=document.createElement('small');desc.textContent=[x.label||x.state,Math.round(Number(x.score)||0)+'점',x.marketSource||null].filter(Boolean).join(' · ');
    left.append(top,desc);
    const time=document.createElement('time');time.textContent=x.capturedAt?fmtTime(x.capturedAt):'-';
    d.append(left,time);d.onclick=()=>{$('symbol').value=x.symbol;run()};box.append(d);
  }
  if(meta)meta.textContent='최근 '+list.length+'건';
}
async function refreshAutoHistory(){
  try{
    const data=await jsonTimeout('/api/coin-scan?mode=recommendation-history&limit=20',7000);
    renderAutoHistory(data.items||[]);
    return data.items||[];
  }catch(e){const meta=$('autoHistoryMeta');if(meta)meta.textContent='이력 조회 제한';return[]}
}
function pctText(v){const n=Number(v);return Number.isFinite(n)?(n>=0?'+':'')+n.toFixed(2)+'%':'-'}
function renderAutoStats(stats={}){
  const meta=$('autoStatsMeta'),samples=$('statSamples');if(samples)samples.textContent=String(Number(stats.sampleCount)||0);
  const rows=[['h1','statH1','statH1Sub'],['h4','statH4','statH4Sub'],['h24','statH24','statH24Sub']];
  for(const [key,id,subId] of rows){
    const h=stats?.horizons?.[key]||{},main=$(id),sub=$(subId),n=Number(h.evaluatedCount)||0,ratio=Number(h.positiveRatio),mean=Number(h.meanReturnPct);
    if(main)main.textContent=n&&Number.isFinite(ratio)?Math.round(ratio*100)+'% · '+pctText(mean):'-';
    if(sub)sub.textContent=n?('평가 '+n+'건 · '+(h.sampleState||'표본 부족')):'평가 대기';
  }
  if(meta)meta.textContent=(Number(stats.sampleCount)||0)?'자동 추천 실적 누적':'추천 표본 대기';
}
async function refreshAutoStats(){
  try{
    const data=await jsonTimeout('/api/coin-scan?mode=recommendation-history&action=stats&state=RECOMMEND',7000);
    renderAutoStats(data.stats||{});
    return data.stats||{};
  }catch(e){const meta=$('autoStatsMeta');if(meta)meta.textContent='성과 조회 제한';return null}
}
function fmtUsd(v){const n=Number(v);if(!Number.isFinite(n))return'N/A';if(n>=1e9)return'USD '+(n/1e9).toFixed(2)+'B';if(n>=1e6)return'USD '+(n/1e6).toFixed(2)+'M';if(n>=1e3)return'USD '+(n/1e3).toFixed(1)+'K';return'USD '+n.toFixed(0)}
const VALIDATION_KO={VALIDATED:'검증됨',CONFLICTED:'충돌',STALE:'오래됨',INSUFFICIENT_DATA:'데이터 부족',INVALIDATED:'무효화'};
const STANCE_KO={supportive:'지지',neutral:'중립',contradictory:'반박',missing:'누락',stale:'오래됨'};
function renderValidationLoading(symbol){
  if(!$('validationStatus'))return;
  $('validationStatus').className='validationStatus';$('validationStatus').textContent='검증 중';
  $('validationMeta').textContent=(symbol||'코인')+' · decision timestamp 기준 검증 중…';
  $('validationDecision').textContent='-';$('validationCounts').textContent='-';$('validationExecution').textContent='-';$('validationExecutionSub').textContent='spread · depth · slippage';$('validationLayers').textContent='-';$('validationSnapshot').textContent='-';$('validationReplay').textContent='미검증';
  $('replayValidation').disabled=true;$('replayValidation').dataset.snapshotId='';
  for(const id of ['validationPerf24','validationLift24','validationFalse24','validationSamples'])if($(id))$(id).textContent='-';
  for(const id of ['validationPerf24Sub','validationLift24Sub','validationFalse24Sub'])if($(id))$(id).textContent='표본 대기';
  $('validationGates').innerHTML='<div class="watchEmpty">신선도·교차검증·시간성·체결성 gate 확인 중…</div>';
  $('validationEvidence').innerHTML='<div class="watchEmpty">증거 원장 생성 중…</div>';
}
function pctMaybe(v,d=2){const n=Number(v);return Number.isFinite(n)?((n>=0?'+':'')+n.toFixed(d)+'%'):'-'}
function renderValidationPerformance(stats={}){
  const v24=stats.byStatus?.VALIDATED?.horizons?.h24||{},lift=stats.validationLift?.h24||{},fr=stats.falseRejection?.h24||{},overall=stats.overall||{};
  $('validationPerf24').textContent=Number.isFinite(Number(v24.meanReturnPct))?pctMaybe(v24.meanReturnPct)+' · 양(+) '+Math.round((Number(v24.positiveRatio)||0)*100)+'%':'-';
  $('validationPerf24Sub').textContent='평가 '+(v24.evaluatedCount||0)+'건 · '+(v24.sampleState||'표본 부족');
  $('validationLift24').textContent=Number.isFinite(Number(lift.meanReturnLiftPct))?pctMaybe(lift.meanReturnLiftPct):'-';
  $('validationLift24Sub').textContent=Number.isFinite(Number(lift.positiveRatioLift))?'양(+) 비율 lift '+pctMaybe(Number(lift.positiveRatioLift)*100,1):'표본 부족';
  $('validationFalse24').textContent=Number.isFinite(Number(fr.gt5PctRatio))?Math.round(Number(fr.gt5PctRatio)*100)+'%':'-';
  $('validationFalse24Sub').textContent='거절 후 +5% 이상 · '+(fr.evaluatedCount||0)+'건 · '+(fr.sampleState||'표본 부족');
  $('validationSamples').textContent=String(overall.sampleCount||0);
}
async function refreshValidationPerformance(){
  try{
    await jsonTimeout('/api/coin-scan?mode=validation-performance&action=evaluate',16000);
    const data=await jsonTimeout('/api/coin-scan?mode=validation-performance&action=stats',12000);
    renderValidationPerformance(data.stats||{});return data.stats||{};
  }catch(_e){return null}
}
function renderValidation(payload,error=null){
  if(!$('validationStatus'))return;
  if(error||!payload?.validation){
    $('validationStatus').className='validationStatus INVALIDATED';$('validationStatus').textContent='검증 제한';
    $('validationMeta').textContent=String(error?.message||payload?.error||'시장검증 데이터를 불러오지 못했습니다.');
    return;
  }
  const v=payload.validation,status=String(v.validationStatus||'INSUFFICIENT_DATA'),counts=v.counts||{};
  $('validationStatus').className='validationStatus '+status;$('validationStatus').textContent=VALIDATION_KO[status]||status;
  $('validationMeta').textContent=[payload.symbol,'MARKET_VALIDATION_v2',v.reasonCodes?.length?'사유 '+v.reasonCodes.join(' · '):'gate 통과'].filter(Boolean).join(' · ');
  $('validationDecision').textContent=fmtTime(v.decisionTimestamp);
  $('validationCounts').textContent='지지 '+(counts.supportive||0)+' · 중립 '+(counts.neutral||0)+' · 반박 '+(counts.contradictory||0)+' · 누락 '+(counts.missing||0)+' · 오래됨 '+(counts.stale||0);
  const ex=(v.evidence||[]).find(x=>x.id==='execution.liquidity'),worst=ex?.value?.worst;
  $('validationExecution').textContent=worst?.available?('스프레드 '+(Number.isFinite(Number(worst.spreadBps))?Number(worst.spreadBps).toFixed(1)+'bp':'N/A')+' · '+(worst.market||'-')):'N/A';
  $('validationExecutionSub').textContent=worst?.available?('10bp 깊이 '+fmtUsd(worst.depth10Usd)+' · 최대 슬리피지 '+(Number.isFinite(Number(worst.maxSlippageBps))?Number(worst.maxSlippageBps).toFixed(1)+'bp':'N/A')):(ex?.reason||'체결 데이터 없음');
  $('validationLayers').textContent=[payload.rawPersisted?'RAW':'',payload.normalizedPersisted?'NORM':'',payload.persisted?'SNAP':''].filter(Boolean).join(' → ')||'저장 미확인';
  $('validationSnapshot').textContent=(v.snapshotId||'-')+(v.canonicalHash?' · '+String(v.canonicalHash).slice(0,12):'');
  $('validationReplay').textContent=payload.persisted?'저장됨 · 재현 대기':'저장 미확인';
  $('replayValidation').disabled=!v.snapshotId;$('replayValidation').dataset.snapshotId=v.snapshotId||'';
  const gates=$('validationGates');gates.innerHTML='';
  for(const g of v.gates||[]){
    const d=document.createElement('div');d.className='validationGate '+(g.pass===true?'pass':g.pass===false?'fail':'na');
    const b=document.createElement('b');b.textContent=g.label||g.id;const s=document.createElement('span');s.textContent=g.pass===true?'통과':g.pass===false?('실패 · '+(g.failure||'-')):(g.failure==='NOT_EVALUATED'?'평가 보류 · '+(g.note||'데이터 없음'):'평가 보류');
    d.append(b,s);gates.append(d);
  }
  if(!gates.children.length)gates.innerHTML='<div class="watchEmpty">Gate 결과 없음</div>';
  const evbox=$('validationEvidence');evbox.innerHTML='';
  for(const x of v.evidence||[]){
    const d=document.createElement('div');d.className='validationEv '+String(x.stance||'neutral');
    const top=document.createElement('div');top.className='evTop';const b=document.createElement('b');b.textContent=x.id;const st=document.createElement('span');st.className='stance';st.textContent=STANCE_KO[x.stance]||x.stance||'-';top.append(b,st);
    const sm=document.createElement('small');sm.textContent=x.reason+(x.sources?.length?' · '+x.sources.join(', '):'');d.append(top,sm);evbox.append(d);
  }
  if(!evbox.children.length)evbox.innerHTML='<div class="watchEmpty">증거 원장 없음</div>';
}
async function replayValidation(){
  const btn=$('replayValidation'),id=btn?.dataset?.snapshotId;if(!id)return;
  btn.disabled=true;$('validationReplay').textContent='재현 검증 중…';
  try{
    const data=await jsonTimeout('/api/coin-scan?mode=validation-snapshots&action=replay&id='+encodeURIComponent(id),12000),r=data.replay||{};
    $('validationReplay').textContent=r.reproducible?'재현 일치':'재현 불일치';
    $('validationReplay').className=r.reproducible?'ok':'error';
  }catch(e){$('validationReplay').textContent='재현 실패';$('validationReplay').className='error'}finally{btn.disabled=false}
}
function renderIntelLoading(symbol){
  if($('spotMeta'))$('spotMeta').textContent=(symbol||'코인')+' · 현물 데이터 확인 중…';
  if($('futuresMeta'))$('futuresMeta').textContent=(symbol||'코인')+' · 선물 데이터 확인 중…';
  if($('intelMeta'))$('intelMeta').textContent=(symbol||'코인')+' · 공통 정보 확인 중…';
  for(const id of ['spotCex','spotPrice','spotVolume','spotDex','futuresCex','futuresOi','futuresFlow','futuresBasis','intelIndicators','intelNews','intelEvents','intelWallets','intelVerify','intelCoverage'])if($(id))$(id).textContent='확인 중';
  for(const id of ['spotCexSub','spotPriceSub','spotVolumeSub','spotDexSub','futuresCexSub','futuresOiSub','futuresFlowSub','futuresBasisSub','intelIndicatorsSub','intelNewsSub','intelEventsSub','intelWalletsSub','intelVerifySub','intelCoverageSub'])if($(id))$(id).textContent='-';
  if($('spotDetails'))$('spotDetails').innerHTML='<div class="watchEmpty">현물 거래소·DEX 데이터를 확인하고 있습니다.</div>';
  if($('futuresDetails'))$('futuresDetails').innerHTML='<div class="watchEmpty">선물·스왑·파생지표를 확인하고 있습니다.</div>';
  if($('intelDetails'))$('intelDetails').innerHTML='<div class="watchEmpty">뉴스·이벤트·지갑·계약 검증 데이터를 확인하고 있습니다.</div>';
}
function addIntelRow(box,title,text,url){
  const d=document.createElement('div');d.className='intelRow';const b=document.createElement('b');b.textContent=title+' · ';d.append(b,document.createTextNode(text||'-'));
  if(url){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=' · 원문';d.append(a)}box.append(d);
}
function renderMarketIntelligence(payload,error=null,item=null){
  if(error||!payload?.intelligence){
    if($('spotMeta'))$('spotMeta').textContent='현물 정보 일부 제한';
    if($('futuresMeta'))$('futuresMeta').textContent='선물 정보 일부 제한';
    if($('intelMeta'))$('intelMeta').textContent='공통 정보 일부 제한';
    if($('intelDetails'))$('intelDetails').innerHTML='<div class="watchEmpty">'+String(error?.message||payload?.error||'시장정보를 불러오지 못했습니다.')+'</div>';
    return;
  }
  const x=payload.intelligence,cex=x.cex||{},ind=x.indicators||{},dex=x.dex||{},news=x.news||{},events=x.events||{},wallets=x.wallets||{},verify=x.walletVerification||{},cov=x.coverage||{};
  const sources=Array.isArray(cex.sources)?cex.sources:[],spot=sources.filter(s=>s.marketType==='spot'),fut=sources.filter(s=>s.marketType!=='spot');
  const spotVol=spot.map(s=>Number(s.quoteVolume24h)).filter(Number.isFinite).reduce((a,b)=>a+b,0),futVol=fut.map(s=>Number(s.quoteVolume24h)).filter(Number.isFinite).reduce((a,b)=>a+b,0);
  const updated=fmtTime(payload.updatedAt);
  if($('spotMeta'))$('spotMeta').textContent=payload.symbol+' · '+(payload.marketScope==='futures'?'Binance 현물 미상장':'Binance 현물')+' · '+updated;
  if($('futuresMeta'))$('futuresMeta').textContent=payload.symbol+' · '+(payload.marketScope==='spot'?'Binance 선물 미상장':'Binance 선물')+' · '+updated;
  if($('intelMeta'))$('intelMeta').textContent=payload.symbol+' · 뉴스/이벤트/지갑 · '+updated;

  $('spotCex').textContent=spot.length?spot.length+'개 현물 시장':'N/A';
  $('spotCexSub').textContent=spot.length?[...new Set(spot.map(s=>s.name))].join(' · '):'현물 CEX 데이터 없음';
  $('spotPrice').textContent=Number.isFinite(Number(cex.spotMedianPrice))?fmtPrice(cex.spotMedianPrice):'N/A';
  $('spotPriceSub').textContent=Number.isFinite(Number(cex.maxPriceDispersionPct))?'전체 시장 최대 가격편차 '+Number(cex.maxPriceDispersionPct).toFixed(2)+'%':'가격 교차검증 부족';
  $('spotVolume').textContent=spotVol>0?fmtUsd(spotVol):'N/A';
  $('spotVolumeSub').textContent='외부 현물 시장 24H 합산 · Binance 현물 별도 교차확인';
  $('spotDex').textContent=dex.available?(dex.pairCount+'개 페어 · '+(dex.chains?.length||0)+'체인'):'N/A';
  $('spotDexSub').textContent=dex.available?'DEX 유동성 '+fmtUsd(dex.liquidityUsd)+' · 24H '+fmtUsd(dex.volume24hUsd):'DEX 페어 미확인';

  $('futuresCex').textContent=fut.length?fut.length+'개 선물/스왑 시장':'N/A';
  $('futuresCexSub').textContent=fut.length?[...new Set(fut.map(s=>s.name))].join(' · '):'선물/스왑 데이터 없음';
  const oi4=Number(item?.oi4hChangePct),oi8=Number(item?.oi8hChangePct),tk=Number(item?.trueTakerRatio),fr=Number(item?.fundingRate);
  $('futuresOi').textContent=Number.isFinite(oi4)?((oi4>=0?'+':'')+oi4.toFixed(2)+'% · 4H'):'N/A';
  $('futuresOiSub').textContent=Number.isFinite(oi8)?'8H '+(oi8>=0?'+':'')+oi8.toFixed(2)+'% · 외부 OI 교차검증 포함':'Binance OI 또는 외부 OI 데이터 부족';
  $('futuresFlow').textContent=Number.isFinite(tk)?'Taker '+tk.toFixed(3):'Taker N/A';
  $('futuresFlowSub').textContent='Funding '+(Number.isFinite(fr)?((fr>=0?'+':'')+fr.toFixed(4)+'%'):'N/A')+' · 선물 거래량 '+(futVol>0?fmtUsd(futVol):'N/A');
  $('futuresBasis').textContent=Number.isFinite(Number(cex.spotFuturesBasisPct))?((Number(cex.spotFuturesBasisPct)>=0?'+':'')+Number(cex.spotFuturesBasisPct).toFixed(3)+'%'):'N/A';
  $('futuresBasisSub').textContent='외부 현물 중앙가격 ↔ 선물/스왑 중앙가격';

  const spotBox=$('spotDetails');spotBox.innerHTML='';
  for(const s of spot.slice(0,12))addIntelRow(spotBox,s.name+' 현물','가격 '+(Number.isFinite(Number(s.price))?fmtPrice(s.price):'N/A')+' · 24H 거래 '+fmtUsd(s.quoteVolume24h));
  if(dex.bestPair)addIntelRow(spotBox,'DEX 대표 페어',(dex.bestPair.chainId||'-')+' / '+(dex.bestPair.dexId||'-')+' · 유동성 '+fmtUsd(dex.bestPair.liquidityUsd));
  if(!spotBox.children.length)spotBox.innerHTML='<div class="watchEmpty">현물 세부 데이터가 없습니다.</div>';

  const futBox=$('futuresDetails');futBox.innerHTML='';
  for(const s of fut.slice(0,12))addIntelRow(futBox,s.name+' '+(s.marketType==='perp'?'무기한':'스왑/선물'),'가격 '+(Number.isFinite(Number(s.price))?fmtPrice(s.price):'N/A')+' · 24H 거래 '+fmtUsd(s.quoteVolume24h)+(Number.isFinite(Number(s.fundingRate))?' · Funding '+Number(s.fundingRate).toFixed(6):''));
  if(!futBox.children.length)futBox.innerHTML='<div class="watchEmpty">선물/스왑 세부 데이터가 없습니다.</div>';

  const i1=ind.timeframes?.['1h']||{};
  $('intelIndicators').textContent=ind.available?(ind.summary?.sourceCount||0)+'개 거래소 교차검증':'N/A';
  $('intelIndicatorsSub').textContent=ind.available?'1H EMA/MACD/OBV 상방 '+(ind.summary?.h1Bull??0)+'표 · 4H '+(ind.summary?.h4Bull??0)+'표 · RSI 중앙 '+(Number.isFinite(Number(i1.rsiMedian))?Number(i1.rsiMedian).toFixed(1):'N/A'):'외부 캔들 데이터 없음';
  $('intelNews').textContent=news.available?news.count+'건':'0건';$('intelNewsSub').textContent=news.items?.[0]?.title||'최근 관련 뉴스 없음';
  const scheduled=events.items||[],derived=events.newsDerived||[];
  $('intelEvents').textContent=scheduled.length?scheduled.length+'건 일정':derived.length?derived.length+'건 뉴스 이벤트':'N/A';
  $('intelEventsSub').textContent=scheduled[0]?.title||derived[0]?.title||events.reason||'확정 일정 없음';
  $('intelWallets').textContent=wallets.available?(wallets.items?.length||0)+'건':'N/A';
  $('intelWalletsSub').textContent=wallets.available?'최근 6시간 대형 이동 · '+fmtUsd(wallets.items?.[0]?.amountUsd):wallets.reason==='API_KEY_NOT_CONFIGURED'?'대형지갑 데이터 키 미연결':wallets.reason||'대형 이동 없음';
  $('intelVerify').textContent=verify.tokenContractVerified?'토큰 계약 교차확인':verify.status==='ATTRIBUTED_SOURCE'?'지갑 출처 확인':'미확정';
  $('intelVerifySub').textContent='지갑 출처 '+(verify.verifiedAttributions||0)+'건 · 계약 '+String(verify.contractStatus||'N/A');
  const keys=['cex','indicators','dex','news','scheduledEvents','wallets'],covered=keys.filter(k=>cov[k]).length;
  $('intelCoverage').textContent=covered+'/'+keys.length;$('intelCoverageSub').textContent='조회 실패·미연결 값은 추정하지 않고 N/A 처리';

  const box=$('intelDetails');box.innerHTML='';
  for(const n of (news.items||[]).slice(0,4))addIntelRow(box,'뉴스',n.title+(n.source?' · '+n.source:''),n.url);
  for(const e of scheduled.slice(0,3))addIntelRow(box,'예정 이벤트',e.title+(e.date?' · '+e.date:''),e.proof||e.source);
  for(const e of derived.slice(0,3))addIntelRow(box,'뉴스 기반 이벤트',e.title,e.url);
  for(const w of (wallets.items||[]).slice(0,4)){const from=w.from?.owner||w.from?.ownerType||w.from?.address||'미확인',to=w.to?.owner||w.to?.ownerType||w.to?.address||'미확인';addIntelRow(box,'대형 지갑',fmtUsd(w.amountUsd)+' · '+from+' → '+to)}
  if(!box.children.length)box.innerHTML='<div class="watchEmpty">공통 세부 정보가 아직 없습니다.</div>';
}
function renderWatchlist(rows=[]){
  const box=$('watchlist');if(!box)return;box.innerHTML='';
  if(!rows.length){box.innerHTML='<div class="watchEmpty">현재 조건에 맞는 관찰 후보가 없습니다.</div>';return}
  for(const x of rows){
    const b=document.createElement('button');b.className='watchItem';b.type='button';b.dataset.symbol=x.symbol;
    const top=document.createElement('div');top.className='wTop';const sym=document.createElement('b');sym.textContent=x.symbol;const score=document.createElement('em');score.textContent='관찰 '+Math.round(Number(x.watchScore)||0);top.append(sym,score);
    const p=document.createElement('p');p.textContent=(x.reasons||[]).join(' · ')||'관찰 후보';
    const s=document.createElement('small');const market=x.marketScope==='spot+futures'?'현물+선물':x.marketScope==='spot'?'현물':x.marketScope==='futures'?'선물':null;s.textContent=[market,x.scanClass,x.v2Type,x.v3Tier,Number.isFinite(Number(x.priceChange24h))?'24H '+(Number(x.priceChange24h)>=0?'+':'')+Number(x.priceChange24h).toFixed(1)+'%':null].filter(Boolean).join(' · ');
    b.append(top,p,s);b.onclick=()=>{$('symbol').value=x.symbol;run()};box.append(b);
  }
}
function presurgeFallbackRows(data){
  const rank={IGNITION:4,PRE_SURGE:3,WATCH:2,NORMAL:1,COOLDOWN:0};
  return (Array.isArray(data?.rows)?data.rows:[])
    .filter(x=>['IGNITION','PRE_SURGE','WATCH'].includes(String(x.state||'')))
    .sort((a,b)=>(rank[b.state]||0)-(rank[a.state]||0)||(Number(b.score)||0)-(Number(a.score)||0))
    .slice(0,8)
    .map(x=>({symbol:x.symbol,watchScore:Number(x.score)||0,scanClass:x.state||'SPOT',v2Type:'SPOT PRE-SURGE',v3Tier:'Spot fallback',priceChange24h:Number.isFinite(Number(x.price24))?Number(x.price24):null,reasons:(x.reasons||[]).slice(0,4)}));
}
function jsonTimeout(url,ms=8000,opts={}){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),ms),headers={...(opts.headers||{})};if(opts.body&&!headers['Content-Type'])headers['Content-Type']='application/json';
  return fetch(url,{cache:'no-store',...opts,headers,signal:ctrl.signal}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok||d.status==='error')throw new Error(d.error||('HTTP '+r.status));return d}).finally(()=>clearTimeout(timer));
}
async function verifyPromotionRow(row,marketSource='스캐너 v3'){
  if(!Promotion||!row?.item||!A||!R||!Live)return row;
  const symbol=row.symbol,started=Date.now(),raw=await fetchStructureFresh({symbol,interval:'4h',limit:560,analysisAsOf:started}),chart=buildChart(raw,'4h',started),now=Date.now(),closed=lastClosedTime(raw);
  const persisted=persistConfirmedEvidence({symbol,chart,now}),journal=persisted.journal||journalReadOnly(),gate=persisted.gate||gateReadOnly();
  const liveEvidence=Live.createLiveEvidence({journal:Journal,symbol,timeframe:'4h',model:chart.model,trendRetest:chart.trendRetest,now,analysisAsOf:now});
  const adapter=A.adaptBookAiInput({analysisAsOf:now,symbol,exchange:'BINANCE',marketType:'perpetual',liveEvidence,sources:{
    scanner:source(row.item,boundedObservedAt(row.item.updatedAt,now),'v3'),
    presurge:source(row.item.preSurge,boundedObservedAt(row.item.updatedAt,now),'PRE_SURGE_v2'),
    ict:derivedSource(chart.ict,now,closed,chart.ict?.version||'ICT'),causalIct:causalSource(chart,now,closed,symbol),structure:derivedSource(raw,now,closed,raw.version||'structure'),
    forexBook:derivedSource(chart.book,now,closed,chart.book?.version),journal:journal||{data:null,reason:'LOCAL_JOURNAL_EMPTY'},gate:gate||{data:null,reason:'LOCAL_GATE_EMPTY'},
    trendline:derivedSource(chart.trendRetest,now,closed,chart.trendRetest?.version||raw.trendlineVersion||null)
  }});
  const rules=R.evaluate(adapter),book=cacheConfirmedBook(symbol,rules),p=Promotion.evaluate({item:row.item,book:rules,priorState:row.state});
  const next={...row,state:p.state,label:p.label,promotion:p,reasons:uniqText([...(row.reasons||[]),...(p.reasons||[])]).slice(0,8),missing:p.missing||[],invalidations:uniqText([...(row.invalidations||[]),...(p.invalidations||[])]).slice(0,8)};
  if(book||p.state!==row.state)await postPromotion(next,marketSource);
  return next;
}
async function backgroundPromoteReady(bundle,source='스캐너 v3'){
  if(!Promotion)return bundle;let current=applyPromotionCache(bundle),rows=allPromotionRows(current),targets=[...(current.ready||[])].slice(0,3);
  for(const target of targets){
    try{
      const next=await verifyPromotionRow(target,source);rows=rows.map(x=>x.symbol===next.symbol?next:x);current=groupPromotionRows(rows);renderAutoRecommendations(current,source+' · Book AI 승격 확인');saveAutoCache(current,source);
      if(next.state==='RECOMMEND'||next.state==='CONFIRMED'){refreshAutoHistory();refreshAutoStats()}
    }catch(_e){}
  }
  return current;
}
async function scannerWatchRows(){
  if(!WL)throw new Error('Watchlist selector unavailable');
  const summary=await jsonTimeout('/api/coin-scan?mode=summary&limit=500',5000);
  const rows=Array.isArray(summary.items)?summary.items:[];
  const seed=rows.filter(x=>x.dataState!=='failed'&&!['POST-SURGE','DISTRIBUTION-RISK','PUMP-RISK','STALE'].includes(String(x.scanClass?.key||''))).sort((a,b)=>(Number(b.candidateScore)||0)-(Number(a.candidateScore)||0)||Math.abs(Number(a.priceChange24h)||0)-Math.abs(Number(b.priceChange24h)||0)).slice(0,AI_DEEP_CANDIDATE_LIMIT).map(x=>x.symbol);
  if(!seed.length)throw new Error('스캐너 후보 없음');
  const deep=await jsonTimeout('/api/coin-scan?mode=deep&limit='+AI_DEEP_CANDIDATE_LIMIT+'&precision=1&symbols='+encodeURIComponent(seed.join(',')),20000);
  if(deep.autoRecommendations){const sourceName=deep.marketSource==='spot-fallback'?'스캐너 v3 · 현물 대체':'스캐너 v3',promoted=applyPromotionCache(deep.autoRecommendations);renderAutoRecommendations(promoted,sourceName);saveAutoCache(promoted,deep.marketSource||'scanner');refreshAutoHistory();refreshAutoStats();backgroundPromoteReady(promoted,deep.marketSource||sourceName).catch(()=>{})}
  const selected=WL.select(deep.items||[],AI_DEEP_CANDIDATE_LIMIT);
  if(!selected.length)throw new Error('스캐너 정밀 후보 없음');
  return selected;
}
async function spotWatchRows(){
  const spot=await jsonTimeout('/api/presurge',20000);
  const selected=presurgeFallbackRows(spot);
  if(!selected.length)throw new Error('Spot PRE-SURGE 후보 없음');
  return selected;
}
function structureWatchScore(chart){
  const t=chart.technical||{},b=danteSignal(t,'bowl224'),g=danteSignal(t,'concrete'),p=Number(t.price),m=Number(t.ma?.[224]);
  let s=Math.max(Number(b.score)||0,Number(g.score)||0);
  if(rawBias(chart.raw)==='up')s+=12;else if(rawBias(chart.raw)==='neutral')s+=5;
  if(Number.isFinite(p)&&Number.isFinite(m)){const d=Math.abs((p/m-1)*100);if(d<=3)s+=12;else if(d<=6)s+=7}
  if(t?.smc?.mss?.dir==='up')s+=10;
  return Math.max(0,Math.min(100,Math.round(s)));
}
async function structureFallbackRows(){
  const symbols=['ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','DOGEUSDT','ADAUSDT','LINKUSDT','AVAXUSDT','SUIUSDT','ONDOUSDT','JTOUSDT','ZROUSDT'];
  const settled=await Promise.allSettled(symbols.map(async symbol=>{
    const raw=await jsonTimeout('/api/structure?symbol='+encodeURIComponent(symbol)+'&interval=4h&limit=320',6000);
    const chart=buildChart(raw,'4h',Date.now()),score=structureWatchScore(chart),bias=rawBias(raw),b=danteSignal(chart.technical,'bowl224'),g=danteSignal(chart.technical,'concrete');
    const reasons=[];if(b.matched||b.score)reasons.push('밥그릇 '+(b.score||0)+'점');if(g.matched||g.score)reasons.push('공구리 '+(g.score||0)+'점');if(bias!=='neutral')reasons.push('4H 구조 '+bias);const p=Number(chart.technical?.price),m=Number(chart.technical?.ma?.[224]);if(Number.isFinite(p)&&Number.isFinite(m))reasons.push('EMA224 '+(p>=m?'위':'아래')+' '+Math.abs((p/m-1)*100).toFixed(1)+'%');
    return{symbol,watchScore:score,scanClass:'STRUCTURE',v2Type:'4H 구조',v3Tier:'Fallback',priceChange24h:null,reasons:reasons.slice(0,4)};
  }));
  return settled.filter(x=>x.status==='fulfilled').map(x=>x.value).sort((a,b)=>b.watchScore-a.watchScore).slice(0,8);
}
async function refreshWatchlist(){
  const box=$('watchlist'),cached=readWatchCache(),autoCached=readAutoCache();
  if(autoCached?.bundle){renderAutoRecommendations(autoCached.bundle,'마지막 자동 추천');setAutoMeta('마지막 자동 추천 표시 중 · 새 데이터 갱신','warn')}else if($('autoRecommendations'))$('autoRecommendations').innerHTML='<div class="watchEmpty">자동 추천 계산 중…</div>';
  if(cached?.rows?.length){renderWatchlist(cached.rows);setWatchMeta('마지막 정상 후보 표시 중 · 새 데이터 갱신','warn')}
  else if(box)box.innerHTML='<div class="watchEmpty">후보 스캔 중…</div>';
  setWatchMeta(cached?.rows?.length?'마지막 정상 후보 표시 중 · 새 데이터 갱신':'구조 / 현물 / 선물 동시 확인 중…',cached?.rows?.length?'warn':'');
  let rendered=Boolean(cached?.rows?.length),bestRows=cached?.rows||[],spotError=null,scannerError=null,structureError=null;
  const structurePromise=structureFallbackRows().then(rows=>{
    if(rows.length&&!rendered){renderWatchlist(rows);renderStructureAuto(rows);setWatchMeta('4H 구조 기반 후보 · Scanner 확인 중','warn');saveWatchCache(rows,'4H structure');rendered=true;bestRows=rows}
    return rows;
  }).catch(e=>{structureError=e;return[]});
  const spotPromise=spotWatchRows().then(rows=>{
    if(rows.length&&!bestRows.some(x=>x.v3Tier==='PASS')){renderWatchlist(rows);setWatchMeta('현물 급등 전조 후보 · 선물 스캐너 교차확인 중','warn');saveWatchCache(rows,'Spot PRE-SURGE');rendered=true;bestRows=rows}
    return rows;
  }).catch(e=>{spotError=e;return[]});
  const scannerPromise=scannerWatchRows().then(rows=>{
    if(rows.length){renderWatchlist(rows);setWatchMeta('현물+선물 AI 정밀 후보 · '+rows.length+'/'+AI_DEEP_CANDIDATE_LIMIT+'개','ok');saveWatchCache(rows,'스캐너 v3');rendered=true;bestRows=rows}
    return rows;
  }).catch(e=>{scannerError=e;return[]});
  const [structureRows,spotRows,scannerRows]=await Promise.all([structurePromise,spotPromise,scannerPromise]);
  if(scannerRows.length)return scannerRows;
  if(spotRows.length)return spotRows;
  if(structureRows.length)return structureRows;
  if(rendered)return bestRows;
  if(box)box.innerHTML='<div class="watchEmpty">추천 후보를 불러오지 못했습니다. 새로고침을 눌러 다시 시도하세요.</div>';
  setWatchMeta('후보 데이터 제한 · '+String(scannerError?.message||spotError?.message||structureError?.message||'source unavailable'),'warn');
  return[];
}
function renderAggregate(symbol,charts={}){
  if(!MTF||!$('aggregateSnapshot'))return null;
  const panels={};
  for(const tf of MINI_TFS){const ch=charts[tf];if(!ch)continue;panels[tf]={...ch,analysis:ch.raw,technical:ch.technical,state:miniStage(ch),bias:rawBias(ch.raw)}}
  const r=MTF.compose({canvas:$('aggregateSnapshot'),panels,renderer:SR,symbol});
  $('mtfStatus').textContent=r.panelCount+'/4 TF';return r;
}
function sourceCards(engineSources){
  const box=$('sources');box.innerHTML='';
  for(const [name,x] of Object.entries(engineSources||{})){
    const d=document.createElement('div');d.className='source '+x.status;
    const b=document.createElement('b');b.textContent=(KO_ENGINE[name]||name)+' · '+koStatus(x.status);
    const timing=x.computedAt?['계산 '+fmtTime(x.computedAt),x.sourceBarClosedAt?'기준봉 '+fmtTime(x.sourceBarClosedAt):null].filter(Boolean).join(' · '):(x.observedAt?'관측 '+fmtTime(x.observedAt):'관측시각 N/A');const p=document.createElement('p');p.textContent=[x.version||'version N/A',x.reason||'',timing].filter(Boolean).join(' · ');
    d.append(b,p);box.append(d);
  }
}
function ruleCards(rows){
  const box=$('rules');box.innerHTML='';
  for(const x of rows||[]){
    const d=document.createElement('div');d.className='rule';
    const b=document.createElement('b');b.textContent=RULE_LABEL[x.ruleId]||x.ruleId;
    const st=document.createElement('span');st.className='status state-'+(x.status==='CONFIRMED'?'CONFIRMED':x.status==='CANDIDATE'?'WATCH':'NO_SETUP');st.textContent=koStatus(x.status);
    const p=document.createElement('p');p.textContent='facts '+(x.evidenceFactIds?.length||0)+' · persisted '+(x.trustedEvidenceEventIds?.length||0)+' · live '+(x.ephemeralEvidenceEventIds?.length||0)+(x.sequenceId?' · '+x.sequenceId:'');
    d.append(b,st,p);box.append(d);
  }
}
function summaryView(s){
  const box=$('summary');box.innerHTML='';
  for(const [k,v] of [['한 줄',s.headline],['HTF',s.htf],['Setup',s.setup],['근거',s.evidence],['데이터',s.dataQuality],['반증',s.counterEvidence],['다음 확인',s.nextConfirmation]]){
    const d=document.createElement('div');d.className='summaryLine';const strong=document.createElement('strong');strong.textContent=k+' · ';d.append(strong,document.createTextNode(v));box.append(d);
  }
}
function danteSignal(technical,id){return(technical?.dante||[]).find(x=>x.id===id)||{id,score:0,matched:false,reasons:[]}}
function liquidPrices(chart,current){
  const rows=[...(chart?.liquidity?.levels||[]),...(chart?.ict?.liquidity?.bsl||[]),...(chart?.ict?.liquidity?.ssl||[])];
  const out=[];for(const x of rows){const p=Number(x?.price??x?.level??x?.p);if(!Number.isFinite(p))continue;if(!out.some(v=>Math.abs(v-p)<=Math.max(1e-12,Math.abs(p)*1e-7)))out.push(p)}
  return out.sort((a,b)=>a-b);
}
function recentRange(candles,n=28){const c=(candles||[]).slice(-n);if(!c.length)return{high:null,low:null};return{high:Math.max(...c.map(x=>Number(x.high)).filter(Number.isFinite)),low:Math.min(...c.map(x=>Number(x.low)).filter(Number.isFinite))}}
function overviewModel(result,chart){
  const f=result?.fusion||null,t=chart.technical||{},current=Number(t.price??chart.candles?.at(-1)?.close),ma224=Number(t.ma?.[224]),levels=liquidPrices(chart,current),range=recentRange(chart.candles);
  const above=levels.find(x=>x>current)??range.high,bArr=levels.filter(x=>x<current),below=bArr.length?bArr.at(-1):range.low;
  const bowl=danteSignal(t,'bowl224'),concrete=danteSignal(t,'concrete');
  let trigger='최근 구조 돌파 + 리테스트 확인';
  if(Number.isFinite(ma224)&&Number.isFinite(current)){
    trigger=current<ma224?'4H 종가 EMA224 '+fmtPrice(ma224)+' 회복·안착':'EMA224 '+fmtPrice(ma224)+' 지지 유지 + 최근 고점 '+fmtPrice(range.high)+' 확인';
  }
  const invalid=Number.isFinite(below)?'하단 유동성/구조 '+fmtPrice(below)+' 종가 이탈':'하단 구조 저점 이탈';
  const target=Number.isFinite(above)?'상단 유동성 '+fmtPrice(above):'상단 DOL 확인';
  return{
    current,bowl,concrete,trigger,invalid,target,
    bias:f?(f.htfAlignment||f.bias?.value||'UNKNOWN'):rawBias(chart.raw),
    state:f?[f.setupState,f.stage?.code].filter(Boolean).join(' · '):'CHART ONLY · 스캐너 제한',
    score:f?(f.bookEvidence?.normalizedScore??0)+'/100':'N/A'
  };
}
function renderOverview(result,chart){
  const f=result?.fusion||null,m=overviewModel(result,chart),symbol=f?.symbol||result?.symbol||'UNKNOWN';
  $('oneLine').textContent=f?[symbol,f.setupState,result?.promotion?.label?'승격 '+result.promotion.label:null,f.bias?.value||'N/A','HTF '+(f.htfAlignment||'UNKNOWN'),'근거 '+m.score].filter(Boolean).join(' · '):[symbol,'CHART ONLY',m.bias,'Scanner N/A','Book AI 점수 N/A'].join(' · ');
  $('overviewBias').textContent=m.bias;$('overviewState').textContent=m.state||'-';$('overviewTrigger').textContent=m.trigger;$('overviewInvalid').textContent=m.invalid;$('overviewTarget').textContent=m.target;$('overviewScore').textContent=m.score;
  $('overviewBowl').textContent=(m.bowl.matched?'조건 일치':'관찰')+' · '+(m.bowl.score||0)+'점';
  $('overviewConcrete').textContent=(m.concrete.matched?'조건 일치':'관찰')+' · '+(m.concrete.score||0)+'점';
}
function ema224Event(technical,candles){
  const s=technical?.ma?.series224||[],c=candles||[],off=Math.max(0,s.length-c.length),from=Math.max(1,c.length-12);
  for(let i=c.length-1;i>=from;i--){const m=Number(s[off+i]),pm=Number(s[off+i-1]);if(!Number.isFinite(m)||!Number.isFinite(pm))continue;
    if(Number(c[i].close)>m&&Number(c[i-1].close)<=pm)return'EMA224 reclaim';
    if(Number(c[i].low)<=m*1.006&&Number(c[i].close)>m)return'EMA224 retest 유지';
  }
  const p=Number(technical?.price),m=Number(technical?.ma?.[224]);if(Number.isFinite(p)&&Number.isFinite(m))return p>=m?'EMA224 위 유지':'EMA224 아래';return'N/A';
}
function miniStage(chart){
  const t=chart.technical||{},b=danteSignal(t,'bowl224'),c=danteSignal(t,'concrete');
  if(b.matched)return'밥그릇 조건 일치';
  if(c.matched)return'공구리 조건 일치';
  if((b.score||0)>=(c.score||0)&&b.score)return'밥그릇 관찰 '+b.score+'점';
  if(c.score)return'공구리 관찰 '+c.score+'점';
  return t.state||'근거 부족';
}
function miniTrigger(chart){
  const t=chart.technical||{},m=t?.smc?.mss;if(m?.dir)return'MSS '+String(m.dir).toUpperCase();
  const b=danteSignal(t,'bowl224'),c=danteSignal(t,'concrete'),x=(b.score||0)>=(c.score||0)?b:c;
  return x.score?(x.id==='bowl224'?'밥그릇':'공구리')+' '+x.score+'점':'대기';
}
function makeMiniCard(tf){
  const d=document.createElement('div');d.className='tfMini';d.dataset.tf=tf;
  const h=document.createElement('div');h.className='tfMiniHead';const b=document.createElement('b');b.textContent=tf.toUpperCase();const st=document.createElement('span');st.textContent='불러오는 중';h.append(b,st);d.append(h);
  for(const label of['편향','단계','트리거','현재가 vs EMA224','reclaim / retest']){const r=document.createElement('div');r.className='tfMiniRow';const s=document.createElement('span');s.textContent=label;const v=document.createElement('b');v.textContent='-';r.append(s,v);d.append(r)}
  return d;
}
function fillMini(card,chart){
  const t=chart.technical||{},rows=card.querySelectorAll('.tfMiniRow b'),p=Number(t.price),m=Number(t.ma?.[224]),relation=Number.isFinite(p)&&Number.isFinite(m)?(p>=m?'위 +'+((p/m-1)*100).toFixed(2)+'%':'아래 '+((p/m-1)*100).toFixed(2)+'%'):'N/A';
  card.querySelector('.tfMiniHead span').textContent=t.state||rawBias(chart.raw);
  const vals=[rawBias(chart.raw),miniStage(chart),miniTrigger(chart),relation,ema224Event(t,chart.candles)];rows.forEach((x,i)=>x.textContent=vals[i]||'N/A');
}
function failMini(card,e){card.querySelector('.tfMiniHead span').textContent='데이터 오류';const rows=card.querySelectorAll('.tfMiniRow b');rows.forEach(x=>x.textContent='N/A');if(rows[0])rows[0].title=String(e?.message||e||'error')}
async function loadMtfBoard(symbol,chart4h,analysisAsOf,token){
  const box=$('mtfBoard');box.innerHTML='';const cards={},charts={'4h':chart4h};for(const tf of MINI_TFS){cards[tf]=makeMiniCard(tf);box.append(cards[tf])}
  const jobs=MINI_TFS.map(async tf=>{try{const chart=tf==='4h'?chart4h:buildChart(await fetchStructureFresh({symbol,interval:tf,limit:520,analysisAsOf}),tf,analysisAsOf);if(token!==runSeq)return;charts[tf]=chart;fillMini(cards[tf],chart)}catch(e){if(token===runSeq)failMini(cards[tf],e)}});
  await Promise.allSettled(jobs);if(token===runSeq)renderAggregate(symbol,charts);return charts;
}
function shortError(e){const s=String(e?.message||e||'Scanner unavailable');return s.length>120?s.slice(0,117)+'…':s}
function degradedSummary(symbol,error){const reason=shortError(error);return{symbol,headline:symbol+' · 차트 엔진 정상 · Scanner 판정 N/A',htf:'HTF 차트는 표시되지만 스캐너 v3 정렬 판정은 사용할 수 없습니다.',setup:'EMA 112/224/448 · 구조 · 유동성 · ICT/SMC 차트만 표시합니다.',evidence:'Book AI 근거 점수는 계산하지 않습니다.',dataQuality:'Scanner unavailable · '+reason,counterEvidence:'Scanner 복구 전 단계·편향·근거점수는 N/A',nextConfirmation:'Scanner 연결 복구 후 Book AI 분석을 다시 실행하세요.'}}
function renderDegraded(result,error){
  const s=result.summary,chart=result.chart,now=result.analysisAsOf||Date.now(),reason=shortError(error);
  $('setupState').textContent='DATA_LIMITED';$('setupState').className='state-DATA_LIMITED';$('transitionReason').textContent='스캐너 제한 · '+reason;
  $('stage').textContent='N/A';$('bias').textContent='N/A';$('score').textContent='N/A';$('alignment').textContent='N/A';$('dataQuality').textContent='DEGRADED';$('asOf').textContent='as-of '+fmtTime(now);$('causalState').textContent='N/A';$('causalLedger').textContent='스캐너 제한';
  for(const id of ['factCount','eventCount','sharedCount','sharedRatio'])$(id).textContent='N/A';
  renderOverview(result,chart);summaryView(s);ruleCards([]);sourceCards({Scanner:{status:'ERROR',version:'v3',reason,observedAt:now},Structure:{status:'AVAILABLE',version:result.raw?.version||'structure',observedAt:lastClosedTime(result.raw)},ICT:{status:'AVAILABLE',version:chart.ict?.version||'ICT',observedAt:lastClosedTime(result.raw)},ForexBook:{status:'AVAILABLE',version:chart.book?.version||'book',observedAt:lastClosedTime(result.raw)}});
  C.compose({canvas:$('snapshot'),symbol:result.symbol,timeframe:'4h',candles:chart.candles,analysis:result.raw,smc:chart.smc,liquidity:chart.liquidity,ict:chart.ict,technical:chart.technical,summary:s,renderer:SR});
  $('savePng').disabled=false;
}
function render(result,chart){
  const f=result.fusion,s=result.summary,a=f.evidenceAudit||{};
  $('setupState').textContent=koStatus(f.setupState);$('setupState').className='state-'+f.setupState;
  $('transitionReason').textContent=f.setupLifecycle?.transition?.reason||'-';$('stage').textContent=koStage(f.stage?.code||'N/A');$('bias').textContent=f.bias?.value||'N/A';
  $('score').textContent=(f.bookEvidence?.normalizedScore??0)+'/100';$('alignment').textContent=f.htfAlignment||'UNKNOWN';$('dataQuality').textContent=f.dataQuality?.state||'-';$('asOf').textContent='as-of '+fmtTime(f.analysisAsOf);
  const causal=result?.causal||null,causalMeta=f?.engineSources?.causalIct||{},stage=causal?.sequence?.long?.stage||'N/A',ledger=causal?.ledger;
  $('causalState').textContent=causalMeta.status==='AVAILABLE'?koStage(stage):koStatus(causalMeta.status||'N/A');$('causalLedger').textContent=ledger?(ledger.prefixInvariant?'과거 이벤트 불변 · '+String(ledger.bars||causal?.bars||'-')+'봉':'과거 이벤트 변경 감지'):(causal?.contract?.pass===false?'인과성 규칙 위반':'인과성 원장 대기');
  $('factCount').textContent=String(a.uniqueFactCount??0)+' · P '+String(a.persistedFactCount??0)+' / L '+String(a.ephemeralFactCount??0);$('eventCount').textContent=String(a.uniqueEventCount??0)+' · P '+String(a.persistedEventCount??0)+' / L '+String(a.ephemeralEventCount??0);$('sharedCount').textContent=String(a.sharedEventIds?.length??0);$('sharedRatio').textContent=Number.isFinite(Number(a.sharedEvidenceRatio))?(Number(a.sharedEvidenceRatio)*100).toFixed(1)+'%':'-';
  renderOverview(result,chart);summaryView(s);ruleCards(f.bookSetups);sourceCards(f.engineSources);
  S.assertCanonicalSummaryGrounded(s,f);
  C.compose({canvas:$('snapshot'),symbol:f.symbol,timeframe:'4h',candles:chart.candles,analysis:result.raw,smc:chart.smc,liquidity:chart.liquidity,ict:chart.ict,technical:chart.technical,summary:s,renderer:SR});
  $('savePng').disabled=false;
}
async function run(){
  const token=++runSeq,symbol=clean($('symbol').value);$('symbol').value=symbol;$('status').classList.remove('error','warn');$('status').textContent='분석 중…';$('run').disabled=true;$('savePng').disabled=true;
  try{
    const requestStartedAt=Date.now();renderIntelLoading(symbol);renderValidationLoading(symbol);
    const validationPromise=jsonTimeout('/api/coin-scan?mode=validation&symbol='+encodeURIComponent(symbol),30000).then(data=>({data,error:null})).catch(error=>({data:null,error}));
    const intelPromise=jsonTimeout('/api/coin-scan?mode=intelligence&symbol='+encodeURIComponent(symbol),22000).then(data=>({data,error:null})).catch(error=>({data:null,error}));
    const scanPromise=json('/api/coin-scan?mode=deep&limit=1&precision=1&symbols='+encodeURIComponent(symbol)).then(data=>({data,error:null})).catch(error=>({data:null,error}));
    const raw=await fetchStructureFresh({symbol,interval:'4h',limit:560,analysisAsOf:requestStartedAt});if(token!==runSeq)return;
    const chart=buildChart(raw,'4h',requestStartedAt);
    const scanResult=await scanPromise;if(token!==runSeq)return;
    const scan=scanResult.data,item=scan?.items?.[0]||null,now=Date.now();
    if(!item){
      const reason=scanResult.error||new Error('스캐너 정밀 분석 결과 없음');
      last={fusion:null,summary:degradedSummary(symbol,reason),raw,chart,symbol,degraded:true,analysisAsOf:now};renderDegraded(last,reason);
      $('status').classList.add('warn');$('status').textContent=symbol+' · 차트 완료 · 스캐너 제한 · 4TF 확인 중…';
      await loadMtfBoard(symbol,chart,now,token);if(token!==runSeq)return;
      $('status').textContent=symbol+' · 차트/4TF 완료 · 스캐너 제한';
      const intelResult=await intelPromise;if(token!==runSeq)return;renderMarketIntelligence(intelResult.data,intelResult.error,item);
      const validationResult=await validationPromise;if(token!==runSeq)return;renderValidation(validationResult.data,validationResult.error);refreshValidationPerformance().catch(()=>{});
      try{parent.postMessage({type:'pulse-symbol-sync',symbol},'*')}catch{}
      const u=new URL(location.href);u.searchParams.set('symbol',symbol);history.replaceState(null,'',u);return;
    }
    const closed=lastClosedTime(raw);
    const persisted=persistConfirmedEvidence({symbol,chart,now}),journal=persisted.journal||journalReadOnly(),gate=persisted.gate||gateReadOnly();
    if(!Live)throw new Error('Book AI LiveEvidence engine unavailable');
    const liveEvidence=Live.createLiveEvidence({journal:Journal,symbol,timeframe:'4h',model:chart.model,trendRetest:chart.trendRetest,now,analysisAsOf:now});
    const adapter=A.adaptBookAiInput({
      analysisAsOf:now,symbol,exchange:'BINANCE',marketType:'perpetual',liveEvidence,
      sources:{
        scanner:source(item,boundedObservedAt(item.updatedAt,now),scan.scannerVersion||'v3'),
        presurge:source(item.preSurge,boundedObservedAt(item.updatedAt,now),'PRE_SURGE_v2'),
        ict:derivedSource(chart.ict,now,closed,chart.ict?.version||'ICT'),
        causalIct:causalSource(chart,now,closed,symbol),
        structure:derivedSource(raw,now,closed,raw.version||'structure'),
        forexBook:derivedSource(chart.book,now,closed,chart.book?.version),
        journal:journal||{data:null,reason:'LOCAL_JOURNAL_EMPTY'},
        gate:gate||{data:null,reason:'LOCAL_GATE_EMPTY'},
        trendline:source(chart.trendRetest,closed,chart.trendRetest?.version||raw.trendlineVersion||null)
      }
    });
    const rules=R.evaluate(adapter),bookPromotion=Promotion?Promotion.evaluate({item,book:rules}):null;if(bookPromotion?.confirmed)cacheConfirmedBook(symbol,rules);if(bookPromotion)postPromotion({symbol,state:bookPromotion.state,label:bookPromotion.label,score:Number(rules?.bookEvidence?.normalizedScore??rules?.bookEvidence?.total??0),reasons:bookPromotion.reasons||[],missing:bookPromotion.missing||[],invalidations:bookPromotion.invalidations||[],item},scan.marketSource||'book-ai-manual').catch(()=>{});
    const storage=Store.create(localStorage),previous=storage.get(symbol)?.lifecycle||null;
    const fusion=F.fuse({adapter,ruleResult:rules,previousLifecycle:previous});
    if(!fusion.resultReady)throw new Error('스캐너 단계/편향 불완전 · '+fusion.incompleteReasons.join(', '));
    const summary=S.buildCanonicalSummary(fusion);S.assertCanonicalSummaryGrounded(summary,fusion);
    storage.set(symbol,fusion.setupLifecycle);
    last={fusion,summary,raw,chart,symbol,degraded:false,analysisAsOf:now,promotion:bookPromotion,causal:adapter.sources.causalIct};render(last,chart);
    $('status').textContent=symbol+' · 차트 완료 · 4TF 확인 중…';
    await loadMtfBoard(symbol,chart,now,token);if(token!==runSeq)return;
    const intelResult=await intelPromise;if(token!==runSeq)return;renderMarketIntelligence(intelResult.data,intelResult.error,item);
    const validationResult=await validationPromise;if(token!==runSeq)return;renderValidation(validationResult.data,validationResult.error);refreshValidationPerformance().catch(()=>{});
    $('status').textContent=symbol+' · '+fusion.setupState+(bookPromotion?' · 승격 '+bookPromotion.label:'')+' · 완료';
    try{parent.postMessage({type:'pulse-symbol-sync',symbol},'*')}catch{}
    const u=new URL(location.href);u.searchParams.set('symbol',symbol);history.replaceState(null,'',u);
  }catch(e){if(token===runSeq){$('status').textContent='오류 · '+(e.message||e);$('status').classList.add('error')}}finally{if(token===runSeq)$('run').disabled=false}
}
function save(){
  if(!last)return;
  const symbol=last.fusion?.symbol||last.symbol||'BOOK-AI',agg=$('aggregateSnapshot'),useAgg=agg?.dataset?.bookAiMtfRendered==='1';const a=document.createElement('a');a.href=useAgg?MTF.pngDataUrl(agg):C.pngDataUrl($('snapshot'));a.download=symbol+(useAgg?'-book-ai-mtf.png':'-book-ai-4h-overview.png');document.body.append(a);a.click();a.remove();
}
$('run').onclick=run;$('savePng').onclick=save;$('replayValidation').onclick=replayValidation;$('refreshCandidates').onclick=refreshWatchlist;$('symbol').addEventListener('keydown',e=>{if(e.key==='Enter')run()});
const q=new URLSearchParams(location.search);$('symbol').value=clean(q.get('symbol')||'BTCUSDT');run();refreshWatchlist();refreshAutoHistory();refreshAutoStats();
let autoRefreshTimer=setInterval(()=>{if(document.visibilityState==='visible')refreshWatchlist()},300000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&Date.now()-(readAutoCache()?.ts||0)>300000)refreshWatchlist()});
})();