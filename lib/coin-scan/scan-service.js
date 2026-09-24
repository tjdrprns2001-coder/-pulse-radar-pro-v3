'use strict';
const Core=require('./scanner-core.js');
const Deep=require('./deep-scan.js');
const Themes=require('../../ui/radar-themes.js');
const Evidence=require('../signal-performance/evidence.js');

const DEEP_INTERVALS=['1w','3d','1d','12h','4h','1h','15m','5m'];
const DEEP_LIMIT=40;
const DEEP_REQUEST_LIMIT=20;
const ALLOWED_SECTORS=new Set(['AI','MEME','RWA','DeFi','L1','L2','Gaming','Infrastructure','기타']);

function num(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function sectorFor(row){
  const theme=Themes.classifyMarket({symbol:row.symbol,baseAsset:row.baseAsset}).primaryTheme;
  if(ALLOWED_SECTORS.has(theme))return theme;
  if(['DEX','Lending','Liquid Staking','Restaking','Perp DEX','Launchpad'].includes(theme))return'DeFi';
  if(['DePIN','Oracle','Storage','Payments'].includes(theme))return'Infrastructure';
  return'기타';
}
function tickerEvidence(row){const t=row.ticker||{};return{lastPrice:num(t.lastPrice),priceChange24h:num(t.priceChangePercent),quoteVolume24h:num(t.quoteVolume),priceChange1h:null,priceChange15m:null,volumeAcceleration:null,takerRatio:null}}
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
  const out=[],seen=new Set();for(const bucket of [ranked.slice(0,18),laggards.slice(0,16),quiet.slice(0,16)])for(const x of bucket){if(seen.has(x.row.symbol))continue;seen.add(x.row.symbol);out.push(x.row.symbol);if(out.length>=limit)return out}return out;
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
  const {row,evidence,fast,sector}=staged;const merged={...evidence,...fast,dataState:'live',reasons:fast.fastReasons||[]};const c=Core.classify(merged);const scanClass=Core.classifyV2(merged);
  const tradeSignal=Core.buildTradeSignal({...merged,scanClass,category:c.category,dataState:c.dataState,structure:'neutral',preSurge:null});
  const item={symbol:row.symbol,baseAsset:row.baseAsset,category:c.category,scanClass,sector,priority:c.priority,dataState:c.dataState,reasons:scanClass.reasons.length?scanClass.reasons:c.reasons,structure:'neutral',momentum:'neutral',momentumSignals:null,tfState:{},preSurge:null,candidateScore:fast.candidateScore,tradeSignal,lastPrice:evidence.lastPrice,priceChange24h:evidence.priceChange24h,quoteVolume24h:evidence.quoteVolume24h,priceChange1h:null,priceChange15m:null,volumeAcceleration:null,takerRatio:null,metaEvidence:null,updatedAt:ts};
  item.summary=Core.beginnerSummary(item);return item;
}
function deepItem(staged,deepBatch,ts,precisionMode=false){
  const {row,evidence,fast,sector}=staged;let deep=null,dataState='live';const frames=deepBatch.results?.[row.symbol];const symbolErrors=(deepBatch.errors||[]).filter(e=>e.symbol===row.symbol);const complete=frames&&DEEP_INTERVALS.every(tf=>Array.isArray(frames[tf])&&frames[tf].length>0);const ctx=deepBatch.contexts?.[row.symbol]||{};const metaEvidence=normalizeMetaEvidence(ctx.metaEvidence,ts);
  if(symbolErrors.length||!complete)dataState='failed';
  else deep=Deep.analyzeDeep({symbol:row.symbol,frames,dataState:'live',oiChangePct:ctx.oiChangePct??null,fundingPct:ctx.fundingPct??null,priceChange24hPct:evidence.priceChange24h,derivativesProfile:ctx.derivativesProfile||null,v2Profile:ctx.v2Profile||ctx.derivativesProfile?.v2Profile||null,alertState:ctx.alertState||null,precisionMode});
  const merged={...evidence,...fast,...(deep||{}),takerRatio:deep?.v3?.taker?.latest??deep?.takerRatio??null,volumeAcceleration:deep?.v3?.rvol?.main1h?.value??deep?.volumeAcceleration??null,metaEvidence,dataState,reasons:deep?.reasons||fast.fastReasons||[]};if(dataState==='failed')merged.reasons=[`정밀 스캔 실패: ${symbolErrors[0]?.error||'필수 시간봉 데이터 누락'}`];
  const c=Core.classify(merged);const scanClass=Core.classifyV2(merged);let tradeSignal=Core.buildTradeSignal({...merged,scanClass,category:c.category,dataState:c.dataState});
  const v3Filter=deep?.v3?.longTerm?.filter;if(deep?.v3?.invalidation){tradeSignal={...tradeSignal,level:'제외',confidence:0,invalidations:[...(tradeSignal.invalidations||[]),'v3 장기 핵심 추세 반증']}}else if(v3Filter?.mixed&&tradeSignal.level==='매수 후보'){tradeSignal={...tradeSignal,level:'관찰',confidence:Math.min(Number(tradeSignal.confidence)||0,49),invalidations:[...(tradeSignal.invalidations||[]),`v3 장기 6TF 혼조·관망 · 정렬 ${Number(v3Filter.alignmentPct||0).toFixed(1)}%`]}}
  const item={symbol:row.symbol,baseAsset:row.baseAsset,category:c.category,scanClass,sector,priority:c.priority,dataState:c.dataState,reasons:scanClass.reasons.length?scanClass.reasons:c.reasons,structure:deep?.structure||'neutral',momentum:deep?.momentum||'neutral',momentumSignals:deep?.momentumSignals||null,tfState:deep?.tfState||{},preSurge:deep?.preSurge||null,candidateScore:fast.candidateScore,tradeSignal,lastPrice:evidence.lastPrice,
    priceChange24h:evidence.priceChange24h,quoteVolume24h:evidence.quoteVolume24h,priceChange1h:deep?.priceChange1h??null,priceChange15m:deep?.priceChange15m??null,volumeAcceleration:deep?.volumeAcceleration??null,takerRatio:deep?.takerRatio??null,
    volumeAcceleration4h:deep?.volumeAcceleration4h??null,volumeAcceleration1h:deep?.volumeAcceleration1h??null,volumeAcceleration15m:deep?.volumeAcceleration15m??null,volumeIncreasing5m:deep?.volumeIncreasing5m??0,structureShift4h:Boolean(deep?.structureShift4h),lowTrend:deep?.lowTrend||'unknown',breakout:Boolean(deep?.breakout),samplePattern:deep?.samplePattern||null,sampleArchetype:deep?.samplePattern?.archetype||null,samplePhase:deep?.samplePattern?.phase||null,sampleScore:deep?.samplePattern?.score??null,xoiSequence:deep?.samplePattern?.sequenceTag||null,xoiProfile:deep?.samplePattern?.xoiProfile||null,liquidityPattern:deep?.samplePattern?.liquidity?.key||null,v2Flow:deep?.v2Flow||null,v2Csv:deep?.v2Csv||null,v2Type:deep?.v2Flow?.type||'미완성',v2RawType:deep?.v2Flow?.rawType||'INCOMPLETE',v2Stage:deep?.v2Flow?.stageLabel||'⚪ 관찰',direction:deep?.v2Flow?.direction||'none',deadBand:Boolean(deep?.v2Flow?.deadBand),sampleSubtype:deep?.v2Flow?.sampleSubtype||null,oi4hChangePct:deep?.v2Input?.oi4hPct??null,oi8hChangePct:deep?.v2Input?.oi8hPct??null,trueTakerRatio:deep?.v3?.taker?.latest??deep?.v2Flow?.takerLatest??null,fundingRate:deep?.v2Input?.fundingRate??null,paramSet:deep?.v3?.paramSet||deep?.v2Flow?.paramSet||null,v3:deep?.v3||null,v3LongTier:deep?.v3?.longTerm?.filter?.tier||'N/A',v3AlignmentPct:deep?.v3?.longTerm?.filter?.alignmentPct??null,v3Badges:deep?.v3?.longTerm?.filter?.badges||null,v3OiPath:deep?.v3?.oiPath||null,v3Rvol:deep?.v3?.rvol||null,v3NearestPd:deep?.v3?.nearestPd||null,v3MovingAverage:deep?.v3?.movingAverage||null,v3Invalidation:Boolean(deep?.v3?.invalidation),metaEvidence,updatedAt:ts};
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

function createScanService({provider,now=()=>Date.now(),performanceRecorder=null,alertRecorder=null,transitionSnapshotRecorder=null}={}){
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
      const [exchangeInfo,tickers]=await Promise.all([provider.getUniverse(),provider.getTickers()]);
      const universe=Core.filterUniverse(exchangeInfo,tickers);
      const staged=universe.map(row=>{const evidence=tickerEvidence(row),fast=Core.fastScore(evidence);return{row,evidence,fast,sector:sectorFor(row)}});
      const ranked=staged.slice().sort((a,b)=>b.fast.candidateScore-a.fast.candidateScore||a.row.symbol.localeCompare(b.row.symbol));
      const candidateSymbols=buildCandidateSymbols(staged,Math.min(DEEP_LIMIT,staged.length));
      const ts=now();let items,deepScanCount=0,partial=false,deepBatch=null;
      if(requestedMode==='deep'){
        const allowed=new Set(universe.map(x=>x.symbol));const requested=normalizeSymbols(symbols,allowed);const targets=requested.length?requested:candidateSymbols.slice(0,DEEP_REQUEST_LIMIT);const targetSet=new Set(targets);const selected=staged.filter(x=>targetSet.has(x.row.symbol));
        deepBatch=selected.length?await provider.scanDeepCandidates(targets,DEEP_INTERVALS):{results:{},errors:[],contexts:{}};deepScanCount=targets.length;partial=(deepBatch.errors||[]).length>0;items=selected.map(x=>deepItem(x,deepBatch,ts,precisionMode));
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
      const response={status:'ok',mode:requestedMode,scannerVersion:'v3',paramSet:'v3_longtrend_taker_0.8_1.2',precisionMode,marketSource:sourceState.marketSource||'futures',derivativesSource:spotFallback?'cross-exchange-oi + binance-derivatives-n/a':'binance-futures + cross-exchange-oi',sourceWarning:spotFallback?'Binance Futures 지역 제한으로 가격·거래량·멀티TF는 Binance Spot fallback 사용. Binance OI/taker/funding은 N/A일 수 있음.':null,universe:spotFallback?'Binance USDT spot fallback':'Binance USDT perpetual',universeMeta:{key:spotFallback?'binance-usdt-spot-fallback':'binance-usdt-perpetual',label:spotFallback?'대체 유니버스 · Binance USDT Spot (Futures 제한)':'코어 유니버스 · Binance USDT 무기한',count:universe.length},timeframes:DEEP_INTERVALS,longTrendTimeframes:['28d','14d','1w','3d','1d','4h'],updatedAt:ts,scanCount:universe.length,deepScanCount,partial,dataHealth:health(items),marketBreadth:buildMarketBreadth(universe),categories:countBy(items,'category'),scanClasses:countScanClasses(items),candidateSymbols,performanceRecording,alertRecording,transitionSnapshotRecording,auxiliary,items};
      if(requestedMode==='summary'&&items.length)lastGood=response;
      let filtered=items;if(category)filtered=filtered.filter(x=>x.category===category||x.scanClass?.key===category);if(sector)filtered=filtered.filter(x=>x.sector===sector);return{...response,items:filtered.slice(0,max)};
    }catch(e){
      if(requestedMode==='summary'&&lastGood){let fallback=cloneDelayed(lastGood,now(),e);let filtered=fallback.items;if(category)filtered=filtered.filter(x=>x.category===category||x.scanClass?.key===category);if(sector)filtered=filtered.filter(x=>x.sector===sector);return{...fallback,items:filtered.slice(0,max)}}
      const err=new Error(`coin scan unavailable: ${e?.message||e}`);err.statusCode=502;throw err;
    }
  }
  async function getTransitionSnapshot(eventId){return transitionSnapshotRecorder&&typeof transitionSnapshotRecorder.get==='function'?transitionSnapshotRecorder.get(eventId):null}
  async function listTransitionSnapshots(opts={}){return transitionSnapshotRecorder&&typeof transitionSnapshotRecorder.list==='function'?transitionSnapshotRecorder.list(opts):[]}
  return{run,getTransitionSnapshot,listTransitionSnapshots};
}
module.exports={DEEP_INTERVALS,DEEP_LIMIT,DEEP_REQUEST_LIMIT,sectorFor,normalizeMetaEvidence,buildMarketBreadth,buildCandidateSymbols,applySectorRotation,createScanService};
