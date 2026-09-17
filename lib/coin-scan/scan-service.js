'use strict';
const Core=require('./scanner-core.js');
const Deep=require('./deep-scan.js');
const Themes=require('../../ui/radar-themes.js');

const DEEP_INTERVALS=['1w','1d','4h','1h','15m','5m'];
const DEEP_LIMIT=40;
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
function cloneDelayed(last,now,error){const items=last.items.map(x=>({...x,dataState:'delayed',summary:Core.beginnerSummary({...x,dataState:'delayed'}),updatedAt:now}));return{...last,updatedAt:now,partial:true,staleFallback:true,error:String(error?.message||error),dataHealth:health(items),items,categories:countBy(items,'category')}}
function health(items){const h={live:0,delayed:0,blocked:0,errors:0};for(const x of items){if(x.dataState==='live')h.live++;else if(x.dataState==='delayed')h.delayed++;else{h.blocked++;if(x.dataState==='failed')h.errors++}}return h}

function createScanService({provider,now=()=>Date.now()}={}){
  if(!provider)throw new Error('provider required');
  let lastGood=null;
  async function run({mode='summary',category=null,sector=null,limit=100}={}){
    const max=Math.max(1,Math.min(500,Number(limit)||100));
    try{
      const [exchangeInfo,tickers]=await Promise.all([provider.getUniverse(),provider.getTickers()]);
      const universe=Core.filterUniverse(exchangeInfo,tickers);
      const staged=universe.map(row=>{const evidence=tickerEvidence(row),fast=Core.fastScore(evidence);return{row,evidence,fast,sector:sectorFor(row)}});
      const candidates=staged.slice().sort((a,b)=>b.fast.candidateScore-a.fast.candidateScore||a.row.symbol.localeCompare(b.row.symbol)).slice(0,Math.min(DEEP_LIMIT,staged.length));
      const candidateSet=new Set(candidates.map(x=>x.row.symbol));
      const deepBatch=candidates.length?await provider.scanDeepCandidates(candidates.map(x=>x.row.symbol),DEEP_INTERVALS):{results:{},errors:[]};
      const failedSymbols=new Set((deepBatch.errors||[]).map(e=>e.symbol).filter(s=>!deepBatch.results?.[s]));
      const errorBySymbol=new Map();for(const e of deepBatch.errors||[])if(!errorBySymbol.has(e.symbol))errorBySymbol.set(e.symbol,e.error||'deep scan failed');
      const ts=now();
      const items=staged.map(({row,evidence,fast,sector})=>{
        let deep=null,dataState='live';
        if(candidateSet.has(row.symbol)){
          if(failedSymbols.has(row.symbol)||!deepBatch.results?.[row.symbol])dataState='failed';
          else deep=Deep.analyzeDeep({symbol:row.symbol,frames:deepBatch.results[row.symbol],dataState:'live',oiChangePct:null,fundingPct:null,alertState:'WATCH'});
        }
        const merged={...evidence,...fast,...(deep||{}),dataState,reasons:deep?.reasons||fast.fastReasons||[]};
        if(dataState==='failed')merged.reasons=[`정밀 스캔 실패: ${errorBySymbol.get(row.symbol)||'데이터 수집 실패'}`];
        const c=Core.classify(merged);
        const item={symbol:row.symbol,baseAsset:row.baseAsset,category:c.category,sector,priority:c.priority,dataState:c.dataState,reasons:c.reasons,structure:deep?.structure||'neutral',momentum:deep?.momentum||'neutral',tfState:deep?.tfState||{},preSurge:deep?.preSurge||null,candidateScore:fast.candidateScore,updatedAt:ts};
        item.summary=Core.beginnerSummary(item);
        return item;
      }).sort((a,b)=>b.priority-a.priority||b.candidateScore-a.candidateScore||a.symbol.localeCompare(b.symbol));
      const response={status:'ok',updatedAt:ts,scanCount:universe.length,deepScanCount:candidates.length,partial:(deepBatch.errors||[]).length>0,dataHealth:health(items),categories:countBy(items,'category'),items};
      if(items.length)lastGood=response;
      let filtered=items;
      if(category)filtered=filtered.filter(x=>x.category===category);
      if(sector)filtered=filtered.filter(x=>x.sector===sector);
      if(String(mode).toLowerCase()==='deep')filtered=filtered.filter(x=>candidateSet.has(x.symbol));
      return{...response,items:filtered.slice(0,max)};
    }catch(e){
      if(lastGood)return cloneDelayed(lastGood,now(),e);
      const err=new Error(`coin scan unavailable: ${e?.message||e}`);err.statusCode=502;throw err;
    }
  }
  return{run};
}
module.exports={DEEP_INTERVALS,DEEP_LIMIT,sectorFor,createScanService};
