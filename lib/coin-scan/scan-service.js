'use strict';
const Core=require('./scanner-core.js');
const Deep=require('./deep-scan.js');
const Themes=require('../../ui/radar-themes.js');
const Evidence=require('../signal-performance/evidence.js');

const DEEP_INTERVALS=['1w','1d','4h','1h','15m','5m'];
const DEEP_LIMIT=40;
const DEEP_REQUEST_LIMIT=6;
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
function deepItem(staged,deepBatch,ts){
  const {row,evidence,fast,sector}=staged;let deep=null,dataState='live';const frames=deepBatch.results?.[row.symbol];const symbolErrors=(deepBatch.errors||[]).filter(e=>e.symbol===row.symbol);const complete=frames&&DEEP_INTERVALS.every(tf=>Array.isArray(frames[tf])&&frames[tf].length>0);const ctx=deepBatch.contexts?.[row.symbol]||{};const metaEvidence=normalizeMetaEvidence(ctx.metaEvidence,ts);
  if(symbolErrors.length||!complete)dataState='failed';
  else deep=Deep.analyzeDeep({symbol:row.symbol,frames,dataState:'live',oiChangePct:ctx.oiChangePct??null,fundingPct:ctx.fundingPct??null,derivativesProfile:ctx.derivativesProfile||null,alertState:ctx.alertState||null});
  const merged={...evidence,...fast,...(deep||{}),metaEvidence,dataState,reasons:deep?.reasons||fast.fastReasons||[]};if(dataState==='failed')merged.reasons=[`정밀 스캔 실패: ${symbolErrors[0]?.error||'필수 시간봉 데이터 누락'}`];
  const c=Core.classify(merged);const scanClass=Core.classifyV2(merged);const tradeSignal=Core.buildTradeSignal({...merged,scanClass,category:c.category,dataState:c.dataState});
  const item={symbol:row.symbol,baseAsset:row.baseAsset,category:c.category,scanClass,sector,priority:c.priority,dataState:c.dataState,reasons:scanClass.reasons.length?scanClass.reasons:c.reasons,structure:deep?.structure||'neutral',momentum:deep?.momentum||'neutral',momentumSignals:deep?.momentumSignals||null,tfState:deep?.tfState||{},preSurge:deep?.preSurge||null,candidateScore:fast.candidateScore,tradeSignal,lastPrice:evidence.lastPrice,
    priceChange24h:evidence.priceChange24h,quoteVolume24h:evidence.quoteVolume24h,priceChange1h:deep?.priceChange1h??null,priceChange15m:deep?.priceChange15m??null,volumeAcceleration:deep?.volumeAcceleration??null,takerRatio:deep?.takerRatio??null,
    volumeAcceleration4h:deep?.volumeAcceleration4h??null,volumeAcceleration1h:deep?.volumeAcceleration1h??null,volumeAcceleration15m:deep?.volumeAcceleration15m??null,volumeIncreasing5m:deep?.volumeIncreasing5m??0,structureShift4h:Boolean(deep?.structureShift4h),lowTrend:deep?.lowTrend||'unknown',breakout:Boolean(deep?.breakout),samplePattern:deep?.samplePattern||null,sampleArchetype:deep?.samplePattern?.archetype||null,samplePhase:deep?.samplePattern?.phase||null,sampleScore:deep?.samplePattern?.score??null,liquidityPattern:deep?.samplePattern?.liquidity?.key||null,metaEvidence,updatedAt:ts};
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

function createScanService({provider,now=()=>Date.now(),performanceRecorder=null,alertRecorder=null}={}){
  if(!provider)throw new Error('provider required');
  let lastGood=null;
  async function run({mode='summary',category=null,sector=null,limit=100,symbols=[]}={}){
    const max=Math.max(1,Math.min(500,Number(limit)||100)),requestedMode=String(mode||'summary').toLowerCase();
    try{
      const [exchangeInfo,tickers]=await Promise.all([provider.getUniverse(),provider.getTickers()]);
      const universe=Core.filterUniverse(exchangeInfo,tickers);
      const staged=universe.map(row=>{const evidence=tickerEvidence(row),fast=Core.fastScore(evidence);return{row,evidence,fast,sector:sectorFor(row)}});
      const ranked=staged.slice().sort((a,b)=>b.fast.candidateScore-a.fast.candidateScore||a.row.symbol.localeCompare(b.row.symbol));
      const candidateSymbols=buildCandidateSymbols(staged,Math.min(DEEP_LIMIT,staged.length));
      const ts=now();let items,deepScanCount=0,partial=false;
      if(requestedMode==='deep'){
        const allowed=new Set(universe.map(x=>x.symbol));const requested=normalizeSymbols(symbols,allowed);const targets=requested.length?requested:candidateSymbols.slice(0,DEEP_REQUEST_LIMIT);const targetSet=new Set(targets);const selected=staged.filter(x=>targetSet.has(x.row.symbol));
        const deepBatch=selected.length?await provider.scanDeepCandidates(targets,DEEP_INTERVALS):{results:{},errors:[],contexts:{}};deepScanCount=targets.length;partial=(deepBatch.errors||[]).length>0;items=selected.map(x=>deepItem(x,deepBatch,ts));
      }else items=staged.map(x=>baseItem(x,ts));
      applySectorRotation(items);
      let performanceRecording=null,alertRecording=null;const auxiliary={status:'ok',errors:[]};
      if(requestedMode==='deep'&&performanceRecorder&&typeof performanceRecorder.recordItems==='function'){
        try{performanceRecording=await performanceRecorder.recordItems(items);for(const e of performanceRecording?.errors||[])auxiliary.errors.push(`performance:${e}`)}catch(e){performanceRecording={recorded:0,duplicate:0,skipped:0,errors:[String(e?.message||e)]};auxiliary.errors.push(`performance:${String(e?.message||e)}`)}
      }
      if(requestedMode==='deep'&&alertRecorder&&typeof alertRecorder.observe==='function'){
        try{alertRecording=await alertRecorder.observe(items);for(const e of alertRecording?.errors||[])auxiliary.errors.push(`alerts:${e}`)}catch(e){alertRecording={recorded:0,skipped:0,errors:[String(e?.message||e)]};auxiliary.errors.push(`alerts:${String(e?.message||e)}`)}
      }
      if(auxiliary.errors.length){auxiliary.status='degraded';partial=true}
      const classRank=new Map(Core.SCAN_CLASS_ORDER.map((k,i)=>[k,i]));
      items.sort((a,b)=>(classRank.get(a.scanClass?.key)??99)-(classRank.get(b.scanClass?.key)??99)||(Number(b.tradeSignal?.confidence)||0)-(Number(a.tradeSignal?.confidence)||0)||b.priority-a.priority||b.candidateScore-a.candidateScore||a.symbol.localeCompare(b.symbol));
      const response={status:'ok',mode:requestedMode,updatedAt:ts,scanCount:universe.length,deepScanCount,partial,dataHealth:health(items),marketBreadth:buildMarketBreadth(universe),categories:countBy(items,'category'),scanClasses:countScanClasses(items),candidateSymbols,performanceRecording,alertRecording,auxiliary,items};
      if(requestedMode==='summary'&&items.length)lastGood=response;
      let filtered=items;if(category)filtered=filtered.filter(x=>x.category===category||x.scanClass?.key===category);if(sector)filtered=filtered.filter(x=>x.sector===sector);return{...response,items:filtered.slice(0,max)};
    }catch(e){
      if(requestedMode==='summary'&&lastGood){let fallback=cloneDelayed(lastGood,now(),e);let filtered=fallback.items;if(category)filtered=filtered.filter(x=>x.category===category||x.scanClass?.key===category);if(sector)filtered=filtered.filter(x=>x.sector===sector);return{...fallback,items:filtered.slice(0,max)}}
      const err=new Error(`coin scan unavailable: ${e?.message||e}`);err.statusCode=502;throw err;
    }
  }
  return{run};
}
module.exports={DEEP_INTERVALS,DEEP_LIMIT,DEEP_REQUEST_LIMIT,sectorFor,normalizeMetaEvidence,buildMarketBreadth,buildCandidateSymbols,applySectorRotation,createScanService};
