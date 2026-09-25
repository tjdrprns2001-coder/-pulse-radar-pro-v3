'use strict';
const Core=require('./scanner-core.js');
const Deep=require('./deep-scan.js');
const Themes=require('../../ui/radar-themes.js');
const Evidence=require('../signal-performance/evidence.js');
const AutoRecommend=require('./auto-recommender.js');
const MarketValidation=require('./market-validation-engine.js');
const RecommendationValidation=require('./recommendation-validation-gate.js');
const CandidateScreening=require('./candidate-screening-engine.js');

const DEEP_INTERVALS=['1w','3d','1d','12h','4h','1h','15m','5m'];
const DEEP_LIMIT=40;
const DEEP_REQUEST_LIMIT=30;
const ALLOWED_SECTORS=new Set(['AI','MEME','RWA','DeFi','L1','L2','Gaming','Infrastructure','기타']);

function num(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function sectorFor(row){
  const theme=Themes.classifyMarket({symbol:row.symbol,baseAsset:row.baseAsset}).primaryTheme;
  if(ALLOWED_SECTORS.has(theme))return theme;
  if(['DEX','Lending','Liquid Staking','Restaking','Perp DEX','Launchpad'].includes(theme))return'DeFi';
  if(['DePIN','Oracle','Storage','Payments'].includes(theme))return'Infrastructure';
  return'기타';
}
function mergeDualUniverse(spotUniverse=[],futuresUniverse=[]){
  const map=new Map();
  for(const row of spotUniverse||[])map.set(row.symbol,{...row,spotTicker:row.ticker,futuresTicker:null,marketScope:'spot',spotListed:true,futuresListed:false});
  for(const row of futuresUniverse||[]){
    const prev=map.get(row.symbol);
    if(prev)map.set(row.symbol,{...prev,futuresTicker:row.ticker,marketScope:'spot+futures',futuresListed:true,ticker:prev.spotTicker||row.ticker});
    else map.set(row.symbol,{...row,spotTicker:null,futuresTicker:row.ticker,marketScope:'futures',spotListed:false,futuresListed:true});
  }
  return [...map.values()];
}
function tickerEvidence(row){const t=row.ticker||{},st=row.spotTicker||{},ft=row.futuresTicker||{},sp=num(st.lastPrice),fp=num(ft.lastPrice);return{lastPrice:num(t.lastPrice),priceChange24h:num(t.priceChangePercent),quoteVolume24h:num(t.quoteVolume),spotPrice24h:num(st.priceChangePercent),futuresPrice24h:num(ft.priceChangePercent),spotQuoteVolume24h:num(st.quoteVolume),futuresQuoteVolume24h:num(ft.quoteVolume),spotFuturesBasisPct:sp!=null&&sp!==0&&fp!=null?((fp/sp)-1)*100:null,priceChange1h:null,priceChange15m:null,volumeAcceleration:null,takerRatio:null}}
function countBy(items,key){const out={};for(const x of items){const k=x[key]||'unknown';out[k]=(out[k]||0)+1}return out}
function countScanClasses(items){const out={};for(const x of items){const k=x.scanClass?.key||'STALE';out[k]=(out[k]||0)+1}return out}
function health(items){const h={live:0,delayed:0,blocked:0,errors:0};for(const x of items){if(x.dataState==='live')h.live++;else if(x.dataState==='delayed')h.delayed++;else{h.blocked++;if(x.dataState==='failed')h.errors++}}return h}
function buildMarketBreadth(universe=[]){
  const rows=(universe||[]).map(x=>({symbol:x.symbol,change:num(x.ticker?.priceChangePercent),quoteVolume:num(x.ticker?.quoteVolume)})).filter(x=>x.change!=null);
  const sorted=rows.map(x=>x.change).sort((a,b)=>a-b);const median=sorted.length?sorted[Math.floor(sorted.length/2)]:null;
  const majors={};for(const key of ['BTCUSDT','ETHUSDT','SOLUSDT']){const x=rows.find(r=>r.symbol===key);if(x)majors[key.replace('USDT','')]=x.change}
  return{count:rows.length,up:rows.filter(x=>x.change>0).length,down:rows.filter(x=>x.change<0).length,flat:rows.filter(x=>x.change===0).length,median,gt5:rows.filter(x=>x.change>=5).length,gt10:rows.filter(x=>x.change>=10).length,lt5:rows.filter(x=>x.change<=-5).length,majors,leaders:rows.slice().sort((a,b)=>b.change-a.change).slice(0,10)};
}
function buildCandidateSymbols(staged=[],limit=DEEP_LIMIT){
  const ranked=staged.slice().sort((a,b)=>b.fast.candidateScore-a.fast.candidateScore||a.row.symbol.localeCompare(b.row.symbol));
  const laggards=staged.filter(x=>Math.abs(Number(x.evidence.priceChange24h)||0)<=6&&(Number(x.evidence.quoteVolume24h)||0)>=5_000_000).sort((a,b)=>(Number(b.evidence.quoteVolume24h)||0)-(Number(a.evidence.quoteVolume24h)||0));
  const quiet=staged.filter(x=>Math.abs(Number(x.evidence.priceChange24h)||0)<=3&&(Number(x.evidence.quoteVolume24h)||0)>=5_000_000).sort((a,b)=>Math.abs(Number(a.evidence.priceChange24h)||0)-Math.abs(Number(b.evidence.priceChange24h)||0)||(Number(b.evidence.quoteVolume24h)||0)-(Number(a.evidence.quoteVolume24h)||0));
  const pool=[],poolSeen=new Set();for(const bucket of [ranked.slice(0,24),laggards.slice(0,20),quiet.slice(0,20)])for(const x of bucket){if(poolSeen.has(x.row.symbol))continue;poolSeen.add(x.row.symbol);pool.push(x)}
  const futures=pool.filter(x=>x.row.futuresListed||x.row.marketScope==='futures'||x.row.marketScope==='spot+futures'),spotOnly=pool.filter(x=>!futures.includes(x));
  const out=[];for(const bucket of [futures,spotOnly])for(const x of bucket){out.push(x.row.symbol);if(out.length>=limit)return out}return out;
}
function normalizeMetaEvidence(raw,ts){if(!raw)return null;try{if(Array.isArray(raw))return Evidence.rankEvidence(raw,{now:ts});if(Array.isArray(raw.items))return Evidence.rankEvidence(raw.items,{now:ts});return null}catch{return null}}
function cloneDelayed(last,now,error){
  const items=last.items.map(x=>{const category=x.category==='급등 전조 강함'?'급등 전조 관찰':x.category;const next={...x,category,priority:category==='급등 전조 관찰'&&x.category==='급등 전조 강함'?Math.min(Number(x.priority)||0,72):x.priority,dataState:'delayed',updatedAt:now};next.scanClass=Core.classifyV2({...next,dataState:'delayed'});next.tradeSignal=Core.buildTradeSignal({...next,dataState:'delayed'});next.summary=Core.beginnerSummary(next);return next});
  return{...last,updatedAt:now,partial:true,staleFallback:true,error:String(error?.message||error),dataHealth:health(items),items,categories:countBy(items,'category'),scanClasses:countScanClasses(items)};
}
function normalizeSymbols(symbols,allowed){
  const src=Array.isArray(symbols)?symbols:String(symbols||'').split(',');const seen=new Set(),out=[];
  for(const raw of src){const s=String(raw||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(!s||seen.has(s)||!allowed.has(s))continue;seen.add(s);out.push(s);if(out.length>=DEEP_REQUEST_LIMIT)break}
  return out;
}
function baseItem(staged,ts){
  const {row,evidence,fast,sector}=staged;const merged={...evidence,...fast,dataState:'live',reasons:fast.fastReasons||[]};
  const c=Core.classify(merged);const scanClass=Core.classifyV2(merged);
  const tradeSignal=Core.buildTradeSignal({...merged,scanClass,category:c.category,dataState:c.dataState,structure:'neutral',preSurge:null});
  const item={symbol:row.symbol,baseAsset:row.baseAsset,marketScope:row.marketScope||'unknown',spotListed:Boolean(row.spotListed),futuresListed:Boolean(row.futuresListed),spotPrice24h:evidence.spotPrice24h,futuresPrice24h:evidence.futuresPrice24h,spotQuoteVolume24h:evidence.spotQuoteVolume24h,futuresQuoteVolume24h:evidence.futuresQuoteVolume24h,spotFuturesBasisPct:evidence.spotFuturesBasisPct,category:c.category,scanClass,sector,priority:c.priority,dataState:c.dataState,reasons:scanClass.reasons.length?scanClass.reasons:c.reasons,structure:'neutral',momentum:'neutral',momentumSignals:null,tfState:{},preSurge:null,candidateScore:fast.candidateScore,tradeSignal,lastPrice:evidence.lastPrice,priceChange24h:evidence.priceChange24h,quoteVolume24h:evidence.quoteVolume24h,priceChange1h:null,priceChange15m:null,volumeAcceleration:null,takerRatio:null,metaEvidence:null,updatedAt:ts};
  item.summary=Core.beginnerSummary(item);return item;
}
function deepItem(staged,deepBatch,ts,precisionMode=false){
  const {row,evidence,fast,sector}=staged;let deep=null,dataState='live';const frames=deepBatch.results?.[row.symbol];const symbolErrors=(deepBatch.errors||[]).filter(e=>e.symbol===row.symbol);const complete=frames&&DEEP_INTERVALS.every(tf=>Array.isArray(frames[tf])&&frames[tf].length>0);const ctx=deepBatch.contexts?.[row.symbol]||{},marketIntelligence=ctx.marketIntelligence||null;const metaEvidence=normalizeMetaEvidence(ctx.metaEvidence,ts);
  if(symbolErrors.length||!complete)dataState='failed';
  else deep=Deep.analyzeDeep({symbol:row.symbol,frames,dataState:'live',oiChangePct:ctx.oiChangePct??null,fundingPct:ctx.fundingPct??null,priceChange24hPct:evidence.priceChange24h,derivativesProfile:ctx.derivativesProfile||null,v2Profile:ctx.v2Profile||ctx.derivativesProfile?.v2Profile||null,alertState:ctx.alertState||null,precisionMode});
  const merged={...evidence,...fast,...(deep||{}),takerRatio:deep?.v3?.taker?.latest??deep?.takerRatio??null,volumeAcceleration:deep?.v3?.rvol?.main1h?.value??deep?.volumeAcceleration??null,metaEvidence,dataState,reasons:deep?.reasons||fast.fastReasons||[]};if(dataState==='failed')merged.reasons=[`정밀 스캔 실패: ${symbolErrors[0]?.error||'필수 시간봉 데이터 누락'}`];if(marketIntelligence?.available&&Number(marketIntelligence.exchangeCount)>=3)merged.reasons=[...(merged.reasons||[]),`다중거래소 ${marketIntelligence.exchangeCount}곳 교차확인`];
  const c=Core.classify(merged);const scanClass=Core.classifyV2(merged);let tradeSignal=Core.buildTradeSignal({...merged,scanClass,category:c.category,dataState:c.dataState});
  const v3Filter=deep?.v3?.longTerm?.filter;if(deep?.v3?.invalidation){tradeSignal={...tradeSignal,level:'제외',confidence:0,invalidations:[...(tradeSignal.invalidations||[]),'v3 장기 핵심 추세 반증']}}else if(v3Filter?.mixed&&tradeSignal.level==='매수 후보'){tradeSignal={...tradeSignal,level:'관찰',confidence:Math.min(Number(tradeSignal.confidence)||0,49),invalidations:[...(tradeSignal.invalidations||[]),`v3 장기 6TF 혼조·관망 · 정렬 ${Number(v3Filter.alignmentPct||0).toFixed(1)}%`]}}
  const item={symbol:row.symbol,baseAsset:row.baseAsset,marketScope:row.marketScope||'unknown',spotListed:Boolean(row.spotListed),futuresListed:Boolean(row.futuresListed),spotPrice24h:evidence.spotPrice24h,futuresPrice24h:evidence.futuresPrice24h,spotQuoteVolume24h:evidence.spotQuoteVolume24h,futuresQuoteVolume24h:evidence.futuresQuoteVolume24h,spotFuturesBasisPct:evidence.spotFuturesBasisPct,category:c.category,scanClass,sector,priority:c.priority,dataState:c.dataState,reasons:scanClass.reasons.length?scanClass.reasons:c.reasons,structure:deep?.structure||'neutral',momentum:deep?.momentum||'neutral',momentumSignals:deep?.momentumSignals||null,tfState:deep?.tfState||{},preSurge:deep?.preSurge||null,candidateScore:fast.candidateScore,tradeSignal,lastPrice:evidence.lastPrice,
    priceChange24h:evidence.priceChange24h,quoteVolume24h:evidence.quoteVolume24h,priceChange1h:deep?.priceChange1h??null,priceChange15m:deep?.priceChange15m??null,volumeAcceleration:deep?.volumeAcceleration??null,takerRatio:deep?.takerRatio??null,
    volumeAcceleration4h:deep?.volumeAcceleration4h??null,volumeAcceleration1h:deep?.volumeAcceleration1h??null,volumeAcceleration15m:deep?.volumeAcceleration15m??null,volumeIncreasing5m:deep?.volumeIncreasing5m??0,structureShift4h:Boolean(deep?.structureShift4h),lowTrend:deep?.lowTrend||'unknown',breakout:Boolean(deep?.breakout),samplePattern:deep?.samplePattern||null,sampleArchetype:deep?.samplePattern?.archetype||null,samplePhase:deep?.samplePattern?.phase||null,sampleScore:deep?.samplePattern?.score??null,xoiSequence:deep?.samplePattern?.sequenceTag||null,xoiProfile:deep?.samplePattern?.xoiProfile||null,liquidityPattern:deep?.samplePattern?.liquidity?.key||null,v2Flow:deep?.v2Flow||null,v2Csv:deep?.v2Csv||null,v2Type:deep?.v2Flow?.type||'미완성',v2RawType:deep?.v2Flow?.rawType||'INCOMPLETE',v2Stage:deep?.v2Flow?.stageLabel||'⚪ 관찰',direction:deep?.v2Flow?.direction||'none',deadBand:Boolean(deep?.v2Flow?.deadBand),sampleSubtype:deep?.v2Flow?.sampleSubtype||null,oi4hChangePct:deep?.v2Input?.oi4hPct??null,oi8hChangePct:deep?.v2Input?.oi8hPct??null,trueTakerRatio:deep?.v3?.taker?.latest??deep?.v2Flow?.takerLatest??null,fundingRate:deep?.v2Input?.fundingRate??null,paramSet:deep?.v3?.paramSet||deep?.v2Flow?.paramSet||null,v3:deep?.v3||null,v3LongTier:deep?.v3?.longTerm?.filter?.tier||'N/A',v3AlignmentPct:deep?.v3?.longTerm?.filter?.alignmentPct??null,v3Badges:deep?.v3?.longTerm?.filter?.badges||null,v3OiPath:deep?.v3?.oiPath||null,v3Rvol:deep?.v3?.rvol||null,v3NearestPd:deep?.v3?.nearestPd||null,v3MovingAverage:deep?.v3?.movingAverage||null,v3Invalidation:Boolean(deep?.v3?.invalidation),marketIntelligence,metaEvidence,updatedAt:ts};
  item.summary=Core.beginnerSummary(item);return item;
}
function applySectorRotation(items){
  const groups=new Map();for(const x of items){if(!groups.has(x.sector))groups.set(x.sector,[]);groups.get(x.sector).push(x)}
  for(const [,rows] of groups){
    if(rows.length<2)continue;
    const leaders=rows.filter(x=>x.dataState==='live'&&(x.scanClass?.key==='PRE-SURGE'||x.scanClass?.key==='POST-SURGE'||Number(x.priceChange24h)>=6));
    if(!leaders.length)continue;
    for(const x of rows){
      if(x.dataState!=='live'||leaders.includes(x))continue;
      const key=x.scanClass?.key;if(['PRE-SURGE','META-PRE','POST-SURGE','DISTRIBUTION-RISK','PUMP-RISK','STALE'].includes(key))continue;
      const ch=num(x.priceChange24h);if(ch!=null&&ch>=6)continue;
      const rotated=Core.classifyV2({...x,sectorRotation:true});
      if(rotated.key==='SECTOR-ROTATION'){x.scanClass=rotated;x.reasons=rotated.reasons;x.summary=Core.beginnerSummary(x)}
    }
  }
  return items;
}

function createScanService({provider,now=()=>Date.now(),performanceRecorder=null,alertRecorder=null,transitionSnapshotRecorder=null,recommendationHistory=null,marketValidationStore=null,marketValidationPerformance=null,selectorLedger=null}={}){
  if(!provider)throw new Error('provider required');
  let lastGood=null;
  let previousV2=new Map();
  function attachV2Transitions(items){
    const next=new Map();
    for(const item of items){
      if(!item.v2Flow||!item.v2Csv)continue;
      const prev=previousV2.get(item.symbol)||null;
      item.v2Csv.stage_transition=prev?prev.stage_label+'→'+item.v2Csv.stage_label:'unknown';
      item.v2Csv.is_transition_event=Boolean(prev&&prev.stage_label!==item.v2Csv.stage_label);
      item.stageTransition=item.v2Csv.stage_transition;item.isTransitionEvent=item.v2Csv.is_transition_event;
      next.set(item.symbol,{stage_label:item.v2Csv.stage_label,type:item.v2Flow.type,timestamp:item.updatedAt});
    }
    if(next.size)previousV2=next;
    return items;
  }
  async function run({mode='summary',category=null,sector=null,limit=100,symbols=[],precision=false}={}){
    const max=Math.max(1,Math.min(500,Number(limit)||100)),requestedMode=String(mode||'summary').toLowerCase(),precisionMode=Boolean(precision);
    try{
      if(typeof provider.resetSourceState==='function')provider.resetSourceState();
      let universe=[],marketCoverage={spot:0,futures:0,both:0,total:0};
      if(typeof provider.getSpotUniverse==='function'&&typeof provider.getFuturesUniverse==='function'){
        const [sEx,sTk,fEx,fTk]=await Promise.allSettled([provider.getSpotUniverse(),provider.getSpotTickers(),provider.getFuturesUniverse(),provider.getFuturesTickers()]);
        const spot=sEx.status==='fulfilled'&&sTk.status==='fulfilled'?Core.filterUniverse(sEx.value,sTk.value):[];
        const futures=fEx.status==='fulfilled'&&fTk.status==='fulfilled'?Core.filterUniverse(fEx.value,fTk.value):[];
        universe=mergeDualUniverse(spot,futures);
        marketCoverage={spot:universe.filter(x=>x.spotListed).length,futures:universe.filter(x=>x.futuresListed).length,both:universe.filter(x=>x.spotListed&&x.futuresListed).length,total:universe.length};
        if(!universe.length){const [exchangeInfo,tickers]=await Promise.all([provider.getUniverse(),provider.getTickers()]);universe=Core.filterUniverse(exchangeInfo,tickers).map(x=>({...x,marketScope:'fallback'}));marketCoverage.total=universe.length}
      }else{const [exchangeInfo,tickers]=await Promise.all([provider.getUniverse(),provider.getTickers()]);universe=Core.filterUniverse(exchangeInfo,tickers).map(x=>({...x,marketScope:'legacy'}));marketCoverage.total=universe.length}
      const staged=universe.map(row=>{const evidence=tickerEvidence(row),fast=Core.fastScore(evidence);return{row,evidence,fast,sector:sectorFor(row)}});
      const ranked=staged.slice().sort((a,b)=>b.fast.candidateScore-a.fast.candidateScore||a.row.symbol.localeCompare(b.row.symbol));
      const candidateSymbols=buildCandidateSymbols(staged,Math.min(DEEP_LIMIT,staged.length));
      const marketPartial=marketCoverage.spot===0||marketCoverage.futures===0;const ts=now();let items,deepScanCount=0,partial=marketPartial,deepBatch=null;
      if(requestedMode==='deep'){
        const allowed=new Set(universe.map(x=>x.symbol));const requested=normalizeSymbols(symbols,allowed);const targets=requested.length?requested:candidateSymbols.slice(0,DEEP_REQUEST_LIMIT);const targetSet=new Set(targets);const selected=staged.filter(x=>targetSet.has(x.row.symbol));
        const marketBySymbol=Object.fromEntries(selected.map(x=>[x.row.symbol,x.row.marketScope==='spot'?'spot':'futures']));const tickerBySymbol=Object.fromEntries(selected.map(x=>[x.row.symbol,{spotTicker:x.row.spotTicker||null,futuresTicker:x.row.futuresTicker||null}]));deepBatch=selected.length?await provider.scanDeepCandidates(targets,DEEP_INTERVALS,marketBySymbol,tickerBySymbol):{results:{},errors:[],contexts:{}};deepScanCount=targets.length;partial=(deepBatch.errors||[]).length>0;items=selected.map(x=>deepItem(x,deepBatch,ts,precisionMode));
      }else items=staged.map(x=>baseItem(x,ts));
      applySectorRotation(items);
      let transitionSnapshotRecording=null;
      if(requestedMode==='deep'&&transitionSnapshotRecorder&&typeof transitionSnapshotRecorder.observe==='function'){
        try{transitionSnapshotRecording=await transitionSnapshotRecorder.observe({items,framesBySymbol:deepBatch?.results||{}})}catch(e){transitionSnapshotRecording={observed:0,transitions:0,archived:0,duplicates:0,skipped:0,errors:[String(e?.message||e)]}}
      }else if(requestedMode==='deep')attachV2Transitions(items);
      let performanceRecording=null,alertRecording=null;const auxiliary={status:'ok',errors:[]};
      if(requestedMode==='deep'&&performanceRecorder&&typeof performanceRecorder.recordItems==='function'){
        try{performanceRecording=await performanceRecorder.recordItems(items);for(const e of performanceRecording?.errors||[])auxiliary.errors.push(`performance:${e}`)}catch(e){performanceRecording={recorded:0,duplicate:0,skipped:0,errors:[String(e?.message||e)]};auxiliary.errors.push(`performance:${String(e?.message||e)}`)}
      }
      if(requestedMode==='deep'&&alertRecorder&&typeof alertRecorder.observe==='function'){
        try{alertRecording=await alertRecorder.observe(items);for(const e of alertRecording?.errors||[])auxiliary.errors.push(`alerts:${e}`)}catch(e){alertRecording={recorded:0,skipped:0,errors:[String(e?.message||e)]};auxiliary.errors.push(`alerts:${String(e?.message||e)}`)}
      }
      for(const e of transitionSnapshotRecording?.errors||[])auxiliary.errors.push(`transition-snapshot:${e}`);
      if(auxiliary.errors.length){auxiliary.status='degraded';partial=true}
      const classRank=new Map(Core.SCAN_CLASS_ORDER.map((k,i)=>[k,i]));
      const v3Rank=new Map([['PASS',0],['SOFT_FAIL',1],['MIXED',2],['N/A',3]]);
      const v2Rank=new Map([['A→A+B',0],['A',1],['A-pre',2],['NFB-SQ',3],['NFB',4],['C',5],['B',6],['A+B',7],['미완성',8],['PROGRESSED',9],['NFB-SC',10]]);
      items.sort((a,b)=>(v3Rank.get(a.v3LongTier)??99)-(v3Rank.get(b.v3LongTier)??99)||(v2Rank.get(a.v2Type)??99)-(v2Rank.get(b.v2Type)??99)||(Number(b.isTransitionEvent)||0)-(Number(a.isTransitionEvent)||0)||(classRank.get(a.scanClass?.key)??99)-(classRank.get(b.scanClass?.key)??99)||(Number(b.tradeSignal?.confidence)||0)-(Number(a.tradeSignal?.confidence)||0)||b.priority-a.priority||b.candidateScore-a.candidateScore||a.symbol.localeCompare(b.symbol));
      const sourceState=typeof provider.getSourceState==='function'?provider.getSourceState():{marketSource:'futures'};const spotFallback=sourceState.marketSource==='spot-fallback';if(spotFallback)partial=true;
      const combinedMarketSource=marketCoverage.spot>0&&marketCoverage.futures>0?'dual-market':marketCoverage.spot>0?'spot-only':marketCoverage.futures>0?'futures-only':sourceState.marketSource||'unknown';
      const derivativesSource=marketCoverage.futures>0?'binance-futures + cross-exchange-oi':'cross-exchange-oi + binance-derivatives-n/a';
      let autoRecommendations=null,autoRecommendationValidation=null,autoScreening=null,autoScreeningMeta=null,selectorRecording=null,selectorEvaluation=null;
      if(requestedMode==='deep'){
        const rawRows=AutoRecommend.recommend(items,30),promotable=rawRows.filter(x=>RecommendationValidation.PROMOTABLE.has(String(x.state))).slice(0,12);
        const checked=new Map();
        if(promotable.length&&typeof provider.getExecutionContext==='function'){
          const worker=async row=>{try{return[row.symbol,await provider.getExecutionContext(row.symbol,{spotListed:Boolean(row.item?.spotListed),futuresListed:Boolean(row.item?.futuresListed)})]}catch(e){return[row.symbol,{spot:{available:false,error:String(e?.message||e)},futures:{available:false,error:String(e?.message||e)}}]}};
          const pairs=typeof provider.mapLimit==='function'?await provider.mapLimit(promotable,worker):await Promise.all(promotable.map(worker));
          for(const pair of pairs||[])if(pair?.[0])checked.set(pair[0],pair[1]);
        }
        let validationStats={};try{if(marketValidationPerformance&&typeof marketValidationPerformance.getStats==='function')validationStats=await marketValidationPerformance.getStats({refresh:false})||{}}catch{}
        const gated=rawRows.map(row=>RecommendationValidation.apply(row,{execution:checked.get(row.symbol)||null,stats:validationStats,checked:checked.has(row.symbol)}));
        autoRecommendations=RecommendationValidation.bundle(gated,30);
        autoRecommendationValidation={version:'RECOMMENDATION_VALIDATION_GATE_v1',checkedCount:checked.size,promotableCount:promotable.length,blockedCount:gated.filter(x=>x.validationGate?.status==='INVALIDATED').length,conflictedCount:gated.filter(x=>x.validationGate?.status==='CONFLICTED').length,insufficientCount:gated.filter(x=>x.validationGate?.status==='INSUFFICIENT_DATA').length,statsMature:Boolean(gated.find(x=>x.validationGate?.performance?.mature))};
        const screenTargets=gated.filter(x=>x.state!=='EXCLUDE').slice(0,8),intelChecked=new Map();
        if(screenTargets.length&&typeof provider.getDetailedMarketIntelligence==='function'){
          const intelWorker=async row=>{try{return[row.symbol,await provider.getDetailedMarketIntelligence(row.symbol)]}catch(e){return[row.symbol,{symbol:row.symbol,updatedAt:ts,coverage:{},error:String(e?.message||e)}]}};
          const intelPairs=typeof provider.mapLimit==='function'?await provider.mapLimit(screenTargets,intelWorker):await Promise.all(screenTargets.map(intelWorker));
          for(const pair of intelPairs||[])if(pair?.[0])intelChecked.set(pair[0],pair[1]);
        }
        const screeningRows=gated.map(row=>CandidateScreening.screen(row,{execution:checked.get(row.symbol)||null,intelligence:intelChecked.get(row.symbol)||{},decisionTime:ts,dataCutoff:ts,timeframe:'5m',instrumentId:'binance:'+row.symbol+':'+(row.item?.futuresListed?'perpetual':'spot'),asOf:ts,now:ts}));
        autoScreening=CandidateScreening.bundle(screeningRows);
        autoScreeningMeta={version:'CANDIDATE_SCREENING_v3',specVersion:CandidateScreening.SPEC_VERSION,screenedCount:screeningRows.length,detailedIntelCount:intelChecked.size,candidateCount:autoScreening.candidates.length,watchlistCount:autoScreening.watchlist.length,eventRiskCount:autoScreening.eventRisk.length,riskFilteredCount:autoScreening.riskFiltered.length,insufficientDataCount:autoScreening.insufficientData.length,rejectedCount:autoScreening.rejected.length,decisionTime:ts,dataCutoff:ts,readOnly:true,note:'시장 후보 선별 결과이며 자동 주문 또는 수익 보장을 의미하지 않습니다.'};
        if(selectorLedger&&typeof selectorLedger.observe==='function'){
          const rawBySymbol=new Map(gated.map(row=>[row.symbol,{row,execution:checked.get(row.symbol)||null,intelligence:intelChecked.get(row.symbol)||{}}]));
          try{selectorRecording=await selectorLedger.observe({screeningBundle:autoScreening,rawBySymbol,context:{capturedAt:ts,marketSource:combinedMarketSource,derivativesSource}})}
          catch(e){selectorRecording={observed:0,snapshotsRecorded:0,rawRecorded:0,transitionsRecorded:0,duplicates:0,errors:[String(e?.message||e)]};auxiliary.errors.push('selector-ledger:'+String(e?.message||e));partial=true}
          try{if(typeof selectorLedger.evaluateDue==='function')selectorEvaluation=await selectorLedger.evaluateDue()}catch(e){selectorEvaluation={attempted:0,evaluated:0,pending:0,unavailable:0,errors:[String(e?.message||e)]}}
        }
      }
      let autoRecommendationRecording=null,autoRecommendationEvaluation=null;
      if(requestedMode==='deep'&&autoRecommendations&&recommendationHistory&&typeof recommendationHistory.observe==='function'){
        try{autoRecommendationRecording=await recommendationHistory.observe(autoRecommendations,{updatedAt:ts,marketSource:combinedMarketSource,derivativesSource})}catch(e){autoRecommendationRecording={observed:0,recorded:0,duplicates:0,skipped:0,errors:[String(e?.message||e)]};auxiliary.errors.push('auto-recommendation:'+String(e?.message||e));partial=true}
        if(typeof recommendationHistory.evaluateDue==='function'){try{autoRecommendationEvaluation=await recommendationHistory.evaluateDue()}catch(e){autoRecommendationEvaluation={attempted:0,evaluated:0,unavailable:0,pending:0,errors:[String(e?.message||e)]};auxiliary.errors.push('auto-recommendation-eval:'+String(e?.message||e));partial=true}}
      }
      const response={status:'ok',mode:requestedMode,scannerVersion:'v3',paramSet:'v3_longtrend_taker_0.8_1.2',precisionMode,marketSource:combinedMarketSource,derivativesSource,sourceWarning:marketCoverage.futures===0&&marketCoverage.spot>0?'Binance Futures 직접조회가 제한/미확인되어 현물 유니버스로 동작 중입니다. 이는 선물 미상장을 의미하지 않으며 OI/taker/funding은 N/A일 수 있습니다.':spotFallback?'일부 심볼은 현물 데이터로 대체되었습니다.':null,universe:'Binance USDT 현물+무기한 통합',universeMeta:{key:'binance-usdt-dual-market',label:'통합 유니버스 · Binance USDT 현물 + 무기한 선물',count:universe.length,spotCount:marketCoverage.spot,futuresCount:marketCoverage.futures,bothCount:marketCoverage.both},timeframes:DEEP_INTERVALS,longTrendTimeframes:['28d','14d','1w','3d','1d','4h'],updatedAt:ts,scanCount:universe.length,marketCoverage,deepScanCount,partial,dataHealth:health(items),marketBreadth:buildMarketBreadth(universe),categories:countBy(items,'category'),scanClasses:countScanClasses(items),candidateSymbols,autoRecommendations,autoRecommendationValidation,autoScreening,autoScreeningMeta,selectorRecording,selectorEvaluation,autoRecommendationRecording,autoRecommendationEvaluation,performanceRecording,alertRecording,transitionSnapshotRecording,auxiliary,items};
      if(requestedMode==='summary'&&items.length)lastGood=response;
      let filtered=items;if(category)filtered=filtered.filter(x=>x.category===category||x.scanClass?.key===category);if(sector)filtered=filtered.filter(x=>x.sector===sector);return{...response,items:filtered.slice(0,max)};
    }catch(e){
      if(requestedMode==='summary'&&lastGood){let fallback=cloneDelayed(lastGood,now(),e);let filtered=fallback.items;if(category)filtered=filtered.filter(x=>x.category===category||x.scanClass?.key===category);if(sector)filtered=filtered.filter(x=>x.sector===sector);return{...fallback,items:filtered.slice(0,max)}}
      const err=new Error(`coin scan unavailable: ${e?.message||e}`);err.statusCode=502;throw err;
    }
  }
  async function getMarketIntelligence(symbol){
    const s=String(symbol||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(!s)throw new Error('symbol required');
    if(typeof provider.getDetailedMarketIntelligence!=='function')throw new Error('market intelligence unavailable');
    let spotTicker=null,futuresTicker=null,binanceListed=false;
    const [sEx,sTk,fEx,fTk]=await Promise.allSettled([provider.getSpotUniverse?.(),provider.getSpotTickers?.(),provider.getFuturesUniverse?.(),provider.getFuturesTickers?.()]);
    if(sEx.status==='fulfilled'&&sTk.status==='fulfilled'){const spot=Core.filterUniverse(sEx.value,sTk.value),row=spot.find(x=>x.symbol===s);if(row){binanceListed=true;spotTicker=row.ticker}}
    if(fEx.status==='fulfilled'&&fTk.status==='fulfilled'){const fut=Core.filterUniverse(fEx.value,fTk.value),row=fut.find(x=>x.symbol===s);if(row){binanceListed=true;futuresTicker=row.ticker}}
    if(!binanceListed){const err=new Error('Binance USDT universe symbol required');err.statusCode=404;throw err}
    const sourceState=typeof provider.getSourceState==='function'?provider.getSourceState():{},futuresLookupFailed=fEx.status!=='fulfilled'||fTk.status!=='fulfilled';
    const binanceFuturesStatus=futuresTicker?'listed':futuresLookupFailed&&sourceState.futuresBlockedUntil?'blocked':futuresLookupFailed?'unverified':'not-listed';
    const intelligence=await provider.getDetailedMarketIntelligence(s,{spotTicker,futuresTicker});
    intelligence.binanceFuturesStatus=binanceFuturesStatus;intelligence.binanceFuturesError=futuresLookupFailed?String(sourceState.lastFuturesError||fEx.reason?.message||fTk.reason?.message||'lookup failed'):null;
    return{status:'ok',mode:'intelligence',symbol:s,binanceListed:true,binanceFuturesStatus,marketScope:spotTicker&&futuresTicker?'spot+futures':spotTicker?'spot':'futures',updatedAt:now(),intelligence};
  }
  async function getMarketValidation(symbol,{decisionTimestamp=null,persist=true}={}){
    const s=String(symbol||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(!s)throw new Error('symbol required');
    const requestedDecision=Number(decisionTimestamp)||null;
    const [deep,intel]=await Promise.all([run({mode:'deep',limit:1,symbols:[s],precision:true}),getMarketIntelligence(s)]);const decision=requestedDecision||now();
    const item=(deep.items||[]).find(x=>x.symbol===s)||deep.items?.[0]||null;if(!item){const err=new Error('validation scanner item unavailable');err.statusCode=502;throw err}
    const validationInput={symbol:s,item,intelligence:{...(intel.intelligence||{}),updatedAt:intel.updatedAt},decisionTimestamp:decision,capturedAt:now()};
    const out=MarketValidation.validate(validationInput);
    let persisted=false,rawPersisted=false,normalizedPersisted=false,outcomeInitialized=false;
    if(persist&&marketValidationStore){
      try{
        if(typeof marketValidationStore.putMarketValidationRaw==='function')rawPersisted=await marketValidationStore.putMarketValidationRaw(out.snapshotId,{schemaVersion:'MARKET_VALIDATION_RAW_INPUT_v1',snapshotId:out.snapshotId,capturedAt:validationInput.capturedAt,symbol:s,decisionTimestamp:decision,item,intelligence:validationInput.intelligence});
        if(typeof marketValidationStore.putMarketValidationNormalized==='function')normalizedPersisted=await marketValidationStore.putMarketValidationNormalized(out.snapshotId,{schemaVersion:'MARKET_VALIDATION_NORMALIZED_v1',snapshotId:out.snapshotId,canonicalHash:out.canonicalHash,canonical:out.snapshot.canonical});
        if(typeof marketValidationStore.putMarketValidationSnapshot==='function')persisted=await marketValidationStore.putMarketValidationSnapshot(out.snapshotId,out.snapshot);
        if(marketValidationPerformance&&typeof marketValidationPerformance.record==='function')outcomeInitialized=await marketValidationPerformance.record(out.snapshot);
      }catch(_e){}
    }
    return{status:'ok',mode:'validation',symbol:s,marketScope:intel.marketScope,updatedAt:now(),persisted,rawPersisted,normalizedPersisted,outcomeInitialized,scanner:{updatedAt:deep.updatedAt,item},intelligence:intel.intelligence,validation:{...out,snapshot:undefined}};
  }
  async function getMarketValidationSnapshot(id){return marketValidationStore&&typeof marketValidationStore.getMarketValidationSnapshot==='function'?marketValidationStore.getMarketValidationSnapshot(String(id||'')):null}
  async function listMarketValidationSnapshots({symbol=null,limit=100}={}){
    if(!marketValidationStore||typeof marketValidationStore.listMarketValidationSnapshots!=='function')return[];
    const s=symbol?String(symbol).toUpperCase().replace(/[^A-Z0-9]/g,''):null,rows=await marketValidationStore.listMarketValidationSnapshots();
    return rows.filter(x=>!s||x?.canonical?.symbol===s).sort((a,b)=>Number(b?.canonical?.decisionTimestamp||0)-Number(a?.canonical?.decisionTimestamp||0)).slice(0,Math.max(1,Math.min(500,Number(limit)||100)));
  }
  async function replayMarketValidation(id){
    const snapshot=await getMarketValidationSnapshot(id);if(!snapshot)return null;
    return MarketValidation.replay(snapshot);
  }
  async function evaluateMarketValidationPerformance(){return marketValidationPerformance&&typeof marketValidationPerformance.evaluateDue==='function'?marketValidationPerformance.evaluateDue():{attempted:0,evaluated:0,pending:0,unavailable:0,errors:['validation performance unavailable']}}
  async function getMarketValidationStats(){return marketValidationPerformance&&typeof marketValidationPerformance.getStats==='function'?marketValidationPerformance.getStats({refresh:true}):{version:'MARKET_VALIDATION_STATS_v1',overall:{sampleCount:0,horizons:{}},byStatus:{},validationLift:{},falseRejection:{}}}
  async function getTransitionSnapshot(eventId){return transitionSnapshotRecorder&&typeof transitionSnapshotRecorder.get==='function'?transitionSnapshotRecorder.get(eventId):null}
  async function listTransitionSnapshots(opts={}){return transitionSnapshotRecorder&&typeof transitionSnapshotRecorder.list==='function'?transitionSnapshotRecorder.list(opts):[]}
  async function listRecommendationHistory(opts={}){return recommendationHistory&&typeof recommendationHistory.list==='function'?recommendationHistory.list(opts):[]}
  async function getRecommendationStats(opts={}){return recommendationHistory&&typeof recommendationHistory.stats==='function'?recommendationHistory.stats(opts):{sampleCount:0,horizons:{}}}
  async function evaluateRecommendationHistory(){return recommendationHistory&&typeof recommendationHistory.evaluateDue==='function'?recommendationHistory.evaluateDue():{attempted:0,evaluated:0,unavailable:0,pending:0,errors:[]}}
    async function listSelectorHistory(opts={}){return selectorLedger&&typeof selectorLedger.list==='function'?selectorLedger.list(opts):[]}
  async function listSelectorTransitions(opts={}){return selectorLedger&&typeof selectorLedger.transitions==='function'?selectorLedger.transitions(opts):[]}
  async function replaySelectorSnapshot(id){return selectorLedger&&typeof selectorLedger.replay==='function'?selectorLedger.replay(id):null}
  async function getSelectorStats(opts={}){return selectorLedger&&typeof selectorLedger.stats==='function'?selectorLedger.stats(opts):{version:'SELECTOR_STATS_v1',overall:{sampleCount:0,horizons:{}},lockedOos:{configured:false}}}
  async function exportSelectorCsv(opts={}){const rows=await listSelectorHistory(opts);return selectorLedger&&typeof selectorLedger.toCsv==='function'?selectorLedger.toCsv(rows):''}
async function recordRecommendationPromotion(row={},context={}){
    if(!recommendationHistory||typeof recommendationHistory.observe!=='function')return{observed:0,recorded:0,duplicates:0,skipped:1,errors:['recommendation history unavailable']};
    const state=String(row.state||'').toUpperCase(),bundle={recommended:[],confirmed:[],ready:[],watch:[],wait:[],excluded:[]};
    const key=state==='RECOMMEND'?'recommended':state==='CONFIRMED'?'confirmed':state==='READY'?'ready':state==='WATCH'?'watch':state==='WAIT'?'wait':'excluded';
    bundle[key].push(row);
    return recommendationHistory.observe(bundle,{updatedAt:Number(context.updatedAt)||now(),marketSource:context.marketSource||'book-ai-client',derivativesSource:context.derivativesSource||null});
  }
  return{run,getMarketIntelligence,getMarketValidation,getMarketValidationSnapshot,listMarketValidationSnapshots,replayMarketValidation,evaluateMarketValidationPerformance,getMarketValidationStats,getTransitionSnapshot,listTransitionSnapshots,listRecommendationHistory,getRecommendationStats,evaluateRecommendationHistory,listSelectorHistory,listSelectorTransitions,replaySelectorSnapshot,getSelectorStats,exportSelectorCsv,recordRecommendationPromotion};
}
module.exports={DEEP_INTERVALS,DEEP_LIMIT,DEEP_REQUEST_LIMIT,sectorFor,normalizeMetaEvidence,buildMarketBreadth,buildCandidateSymbols,mergeDualUniverse,applySectorRotation,createScanService};
