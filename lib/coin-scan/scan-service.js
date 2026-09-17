'use strict';
const core=require('./scanner-core.js');
const deep=require('./deep-scan.js');
const themes=require('../../ui/radar-themes.js');
const INTERVALS=['1w','1d','4h','1h','15m','5m'];
const SECTOR_MAP={Gaming:'Gaming',DePIN:'Infrastructure','Other / Unclassified':'기타'};
function sectorFor(row){const c=themes.classifyMarket({symbol:row.symbol,baseAsset:row.baseAsset});const p=c.primaryTheme||c.theme||'Other / Unclassified';return[SECTOR_MAP[p]||p]}
function makeFastInput(row){const t=row.ticker||{};return{priceChange24h:Number(t.priceChangePercent),volumeAcceleration:Number(t.volumeAcceleration||t.volumeRatio||1),priceFromHighPct:t.priceFromHighPct==null?null:Number(t.priceFromHighPct),takerRatio:t.takerRatio==null?null:Number(t.takerRatio),volatility:t.volatility==null?null:Number(t.volatility)}}
function createScanService({provider,now=Date.now}={}){
  if(!provider)throw new Error('provider required');let lastGood=null;
  async function run({mode='summary',category=null,sector=null,limit=100}={}){
    const safeLimit=Math.max(1,Math.min(500,Number(limit)||100));
    try{
      const [exchangeInfo,tickers]=await Promise.all([provider.getUniverse(),provider.getTickers()]);
      const universe=core.filterUniverse(exchangeInfo,tickers);const staged=universe.map(row=>({...row,fast:core.fastScore(makeFastInput(row))}));
      const candidates=staged.slice().sort((a,b)=>b.fast.candidateScore-a.fast.candidateScore).slice(0,40);
      const symbols=candidates.map(x=>x.symbol);const deepBatch=symbols.length?await provider.scanDeepCandidates(symbols,INTERVALS):{results:{},errors:[]};
      const failedSymbols=new Set((deepBatch.errors||[]).map(e=>e.symbol));
      const items=staged.map(row=>{
        const failed=failedSymbols.has(row.symbol),frames=deepBatch.results?.[row.symbol];let evidence={dataState:'live',structure:'neutral',reasons:row.fast.fastReasons||[],tfState:{},updatedAt:now()};
        if(failed)evidence={...evidence,dataState:'failed',reasons:[...(evidence.reasons||[]),'정밀 스캔 요청 실패']};
        else if(frames)evidence={...deep.analyzeDeep({symbol:row.symbol,frames,dataState:'live',oiChangePct:null,fundingPct:null,alertState:'WATCH'}),reasons:[...(row.fast.fastReasons||[])]};
        const merged={...evidence,...row.fast,alreadySurged:row.fast.alreadySurged,reasons:[...(evidence.reasons||[]),...(row.fast.fastReasons||[])]};
        const cls=core.classify(merged),sectorTags=sectorFor(row);const item={symbol:row.symbol,baseAsset:row.baseAsset,category:cls.category,sector:sectorTags,priority:cls.priority,dataState:cls.dataState,reasons:cls.reasons.slice(0,3),tfState:evidence.tfState||{},summary:'',updatedAt:evidence.updatedAt||now(),structure:evidence.structure||'neutral'};item.summary=core.beginnerSummary(item);return item;
      });
      const categories=Object.fromEntries(core.CATEGORY_ORDER.map(c=>[c,0]));for(const it of items)categories[it.category]=(categories[it.category]||0)+1;
      const dataHealth={live:0,delayed:0,blocked:0,errors:(deepBatch.errors||[]).length};for(const it of items){if(it.dataState==='live')dataHealth.live++;else if(it.dataState==='delayed')dataHealth.delayed++;else dataHealth.blocked++}
      const response={status:'ok',updatedAt:now(),scanCount:universe.length,deepScanCount:symbols.length,partial:(deepBatch.errors||[]).length>0,dataHealth,categories,items};lastGood=response;
      let visible=items;if(category)visible=visible.filter(x=>x.category===category);if(sector)visible=visible.filter(x=>x.sector.includes(sector));visible=visible.slice(0,safeLimit);return{...response,items:visible};
    }catch(err){
      if(lastGood){const delayedItems=lastGood.items.map(x=>({...x,dataState:'delayed',summary:core.beginnerSummary({...x,dataState:'delayed'})}));return{...lastGood,updatedAt:now(),partial:true,dataHealth:{...lastGood.dataHealth,delayed:delayedItems.length,live:0},items:delayedItems.slice(0,safeLimit),upstreamError:String(err&&err.message||err)}}
      const e=new Error(String(err&&err.message||err));e.statusCode=502;throw e;
    }
  }
  return{run};
}
module.exports={createScanService,INTERVALS};
