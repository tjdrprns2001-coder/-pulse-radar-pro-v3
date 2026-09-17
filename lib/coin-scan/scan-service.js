'use strict';
const Core=require('./scanner-core.js');
const Deep=require('./deep-scan.js');
const Themes=require('../../ui/radar-themes.js');

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
function tickerEvidence(row){const t=row.ticker||{};return{priceChange24h:num(t.priceChangePercent),quoteVolume24h:num(t.quoteVolume),priceChange1h:null,priceChange15m:null,volumeAcceleration:null,takerRatio:null}}
function countBy(items,key){const out={};for(const x of items){const k=x[key]||'unknown';out[k]=(out[k]||0)+1}return out}
function health(items){const h={live:0,delayed:0,blocked:0,errors:0};for(const x of items){if(x.dataState==='live')h.live++;else if(x.dataState==='delayed')h.delayed++;else{h.blocked++;if(x.dataState==='failed')h.errors++}}return h}
function cloneDelayed(last,now,error){
  const items=last.items.map(x=>{const category=x.category==='급등 전조 강함'?'급등 전조 관찰':x.category;const next={...x,category,priority:category==='급등 전조 관찰'&&x.category==='급등 전조 강함'?Math.min(Number(x.priority)||0,72):x.priority,dataState:'delayed',updatedAt:now};next.summary=Core.beginnerSummary(next);return next});
  return{...last,updatedAt:now,partial:true,staleFallback:true,error:String(error?.message||error),dataHealth:health(items),items,categories:countBy(items,'category')};
}
function normalizeSymbols(symbols,allowed){
  const src=Array.isArray(symbols)?symbols:String(symbols||'').split(',');const seen=new Set(),out=[];
  for(const raw of src){const s=String(raw||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(!s||seen.has(s)||!allowed.has(s))continue;seen.add(s);out.push(s);if(out.length>=DEEP_REQUEST_LIMIT)break}
  return out;
}
function baseItem(staged,ts){
  const {row,evidence,fast,sector}=staged;const merged={...evidence,...fast,dataState:'live',reasons:fast.fastReasons||[]};const c=Core.classify(merged);
  const item={symbol:row.symbol,baseAsset:row.baseAsset,category:c.category,sector,priority:c.priority,dataState:c.dataState,reasons:c.reasons,structure:'neutral',momentum:'neutral',tfState:{},preSurge:null,candidateScore:fast.candidateScore,updatedAt:ts};
  item.summary=Core.beginnerSummary(item);return item;
}
function deepItem(staged,deepBatch,ts){
  const {row,evidence,fast,sector}=staged;let deep=null,dataState='live';const frames=deepBatch.results?.[row.symbol];const symbolErrors=(deepBatch.errors||[]).filter(e=>e.symbol===row.symbol);const complete=frames&&DEEP_INTERVALS.every(tf=>Array.isArray(frames[tf])&&frames[tf].length>0);
  if(symbolErrors.length||!complete)dataState='failed';
  else{const ctx=deepBatch.contexts?.[row.symbol]||{};deep=Deep.analyzeDeep({symbol:row.symbol,frames,dataState:'live',oiChangePct:ctx.oiChangePct??null,fundingPct:ctx.fundingPct??null,alertState:ctx.alertState||null})}
  const merged={...evidence,...fast,...(deep||{}),dataState,reasons:deep?.reasons||fast.fastReasons||[]};if(dataState==='failed')merged.reasons=[`정밀 스캔 실패: ${symbolErrors[0]?.error||'필수 시간봉 데이터 누락'}`];
  const c=Core.classify(merged);const item={symbol:row.symbol,baseAsset:row.baseAsset,category:c.category,sector,priority:c.priority,dataState:c.dataState,reasons:c.reasons,structure:deep?.structure||'neutral',momentum:deep?.momentum||'neutral',tfState:deep?.tfState||{},preSurge:deep?.preSurge||null,candidateScore:fast.candidateScore,updatedAt:ts};item.summary=Core.beginnerSummary(item);return item;
}

function createScanService({provider,now=()=>Date.now()}={}){
  if(!provider)throw new Error('provider required');
  let lastGood=null;
  async function run({mode='summary',category=null,sector=null,limit=100,symbols=[]}={}){
    const max=Math.max(1,Math.min(500,Number(limit)||100)),requestedMode=String(mode||'summary').toLowerCase();
    try{
      const [exchangeInfo,tickers]=await Promise.all([provider.getUniverse(),provider.getTickers()]);
      const universe=Core.filterUniverse(exchangeInfo,tickers);
      const staged=universe.map(row=>{const evidence=tickerEvidence(row),fast=Core.fastScore(evidence);return{row,evidence,fast,sector:sectorFor(row)}});
      const ranked=staged.slice().sort((a,b)=>b.fast.candidateScore-a.fast.candidateScore||a.row.symbol.localeCompare(b.row.symbol));
      const candidateSymbols=ranked.slice(0,Math.min(DEEP_LIMIT,ranked.length)).map(x=>x.row.symbol);
      const ts=now();let items,deepScanCount=0,partial=false;
      if(requestedMode==='deep'){
        const allowed=new Set(universe.map(x=>x.symbol));const requested=normalizeSymbols(symbols,allowed);const targets=requested.length?requested:candidateSymbols.slice(0,DEEP_REQUEST_LIMIT);const targetSet=new Set(targets);const selected=staged.filter(x=>targetSet.has(x.row.symbol));
        const deepBatch=selected.length?await provider.scanDeepCandidates(targets,DEEP_INTERVALS):{results:{},errors:[],contexts:{}};deepScanCount=targets.length;partial=(deepBatch.errors||[]).length>0;items=selected.map(x=>deepItem(x,deepBatch,ts));
      }else{
        items=staged.map(x=>baseItem(x,ts));
      }
      items.sort((a,b)=>b.priority-a.priority||b.candidateScore-a.candidateScore||a.symbol.localeCompare(b.symbol));
      const response={status:'ok',mode:requestedMode,updatedAt:ts,scanCount:universe.length,deepScanCount,partial,dataHealth:health(items),categories:countBy(items,'category'),candidateSymbols,items};
      if(requestedMode==='summary'&&items.length)lastGood=response;
      let filtered=items;if(category)filtered=filtered.filter(x=>x.category===category);if(sector)filtered=filtered.filter(x=>x.sector===sector);return{...response,items:filtered.slice(0,max)};
    }catch(e){
      if(requestedMode==='summary'&&lastGood){let fallback=cloneDelayed(lastGood,now(),e);let filtered=fallback.items;if(category)filtered=filtered.filter(x=>x.category===category);if(sector)filtered=filtered.filter(x=>x.sector===sector);return{...fallback,items:filtered.slice(0,max)}}
      const err=new Error(`coin scan unavailable: ${e?.message||e}`);err.statusCode=502;throw err;
    }
  }
  return{run};
}
module.exports={DEEP_INTERVALS,DEEP_LIMIT,DEEP_REQUEST_LIMIT,sectorFor,createScanService};
