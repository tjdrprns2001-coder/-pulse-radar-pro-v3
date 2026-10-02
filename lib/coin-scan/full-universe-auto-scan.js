'use strict';

const Mtf=require('./mtf-market-analyzer.js');
const AmdLong=require('./amd-long-entry.js');
const VERSION='FULL_UNIVERSE_AUTO_SCAN_v2';
const AUTO_INTERVAL_MS=30*60*1000;
const AUTO_STALE_MS=90*1000;
const TIMEFRAMES=Object.freeze(['5m','15m','1h','4h','1d','1w']);
const TIER_ORDER=Object.freeze(['small','mid','large']);

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function pct(a,b){const x=finite(a),y=finite(b);return x!=null&&y!=null&&y!==0?(x/y-1)*100:null}
function autoBucketStart(at=Date.now()){const n=Number(at)||0;return Math.floor(n/AUTO_INTERVAL_MS)*AUTO_INTERVAL_MS}
function autoBucketKey(at=Date.now()){return 'auto:'+autoBucketStart(at)}
function runId(kind,at=Date.now()){return `${kind}-${Number(at).toString(36)}-${Math.random().toString(36).slice(2,8)}`}
function cleanTier(x){const v=String(x||'').trim().toLowerCase();return TIER_ORDER.includes(v)?v:null}
function normalizeTierSelection(input){
  const raw=Array.isArray(input)?input:String(input||'').split(',');
  const out=[];for(const x of raw){const t=cleanTier(x);if(t&&!out.includes(t))out.push(t)}
  return TIER_ORDER.filter(x=>out.includes(x));
}
function buildUniverse(exchangeInfo={}){
  return (Array.isArray(exchangeInfo?.symbols)?exchangeInfo.symbols:[])
    .filter(x=>String(x?.status||'').toUpperCase()==='TRADING')
    .filter(x=>String(x?.quoteAsset||'').toUpperCase()==='USDT')
    .filter(x=>String(x?.contractType||'').toUpperCase()==='PERPETUAL')
    .map(x=>({
      symbol:String(x.symbol||'').toUpperCase(),
      baseAsset:String(x.baseAsset||'').toUpperCase(),
      quoteAsset:'USDT',
      contractType:'PERPETUAL'
    })).filter(x=>x.symbol&&x.baseAsset);
}
function marketCapOf(row,marketCaps){
  if(marketCaps instanceof Map){
    return finite(marketCaps.get(row.baseAsset)??marketCaps.get(row.symbol));
  }
  if(marketCaps&&typeof marketCaps==='object')return finite(marketCaps[row.baseAsset]??marketCaps[row.symbol]);
  return null;
}
function assignMarketCapTiers(universe=[],marketCaps={}){
  const rows=(universe||[]).map(x=>({...x,marketCapUsd:marketCapOf(x,marketCaps),tier:'unknown'}));
  const resolved=rows.filter(x=>x.marketCapUsd!=null&&x.marketCapUsd>0).sort((a,b)=>a.marketCapUsd-b.marketCapUsd);
  const n=resolved.length;
  for(let i=0;i<n;i++){
    const rank=n<=1?.5:i/(n-1);
    resolved[i].tier=rank<.25?'small':rank>=.75?'large':'mid';
  }
  const bySymbol=new Map(resolved.map(x=>[x.symbol,x.tier]));
  for(const x of rows)if(bySymbol.has(x.symbol))x.tier=bySymbol.get(x.symbol);
  return rows;
}
function selectUniverse(rows=[],{kind='auto',tiers=[]}={}){
  if(String(kind).toLowerCase()==='auto')return [...rows];
  const wanted=new Set(normalizeTierSelection(tiers));
  if(!wanted.size)return [];
  return rows.filter(x=>wanted.has(x.tier));
}
function closedRows(rows=[],at=Date.now()){
  const now=Number(at)||0;
  return (Array.isArray(rows)?rows:[]).filter(r=>{
    const close=finite(Array.isArray(r)?r[6]:r?.closeTime);
    return close!=null&&close<=now;
  });
}
function frameSummary(rows=[],at=Date.now()){
  const a=closedRows(rows,at);if(!a.length)return{available:false,closedBars:0};
  const get=(r,i,key)=>finite(Array.isArray(r)?r[i]:r?.[key]);
  const last=a[a.length-1],prev=a[a.length-2]||null,first=a[0];
  const close=get(last,4,'close'),prevClose=prev?get(prev,4,'close'):null,firstClose=get(first,4,'close'),volume=get(last,5,'volume');
  const prior=a.slice(Math.max(0,a.length-21),-1).map(r=>get(r,5,'volume')).filter(Number.isFinite);
  const avg20=prior.length?prior.reduce((s,v)=>s+v,0)/prior.length:null;
  return{
    available:close!=null,
    closedBars:a.length,
    openTime:get(last,0,'openTime'),
    closeTime:get(last,6,'closeTime'),
    open:get(last,1,'open'),
    high:get(last,2,'high'),
    low:get(last,3,'low'),
    close,
    volume,
    barChangePct:pct(close,prevClose),
    windowReturnPct:pct(close,firstClose),
    rvol20:volume!=null&&avg20>0?volume/avg20:null
  };
}
function createSpacingGate({requestsPerMinute=240,now=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
  const rpm=Math.max(1,Math.floor(Number(requestsPerMinute)||240)),spacing=Math.ceil(60000/rpm);let tail=Promise.resolve(),nextAt=0;
  return async function gate(fn){
    let release;const mine=new Promise(r=>{release=r}),prev=tail;tail=mine;await prev;
    const wait=Math.max(0,nextAt-now());if(wait)await sleep(wait);nextAt=Math.max(nextAt,now())+spacing;release();
    return fn();
  };
}
async function mapLimit(items,maxWorkers,worker){
  const src=Array.from(items||[]),out=new Array(src.length);let next=0;
  async function run(){while(true){const i=next++;if(i>=src.length)return;out[i]=await worker(src[i],i)}}
  await Promise.all(Array.from({length:Math.min(Math.max(1,Number(maxWorkers)||1),src.length||1)},run));return out;
}
function summarizeCounts(rows=[]){
  const out={total:rows.length,small:0,mid:0,large:0,unknown:0};for(const x of rows)out[x.tier] = (out[x.tier]||0)+1;return out;
}
function createFullUniverseScanService({provider,marketCapProvider=null,store,now=()=>Date.now(),sleep,maxWorkers=8,requestsPerMinute=240,klineRows=64,staleRunMs=AUTO_STALE_MS}={}){
  if(!provider)throw new Error('provider required');
  if(!store)throw new Error('store required');
  const gate=createSpacingGate({requestsPerMinute,now,sleep});
  async function loadUniverse(){
    let exchangeInfo=null,base=[];
    try{
      exchangeInfo=await gate(()=>typeof provider.getStrictFuturesUniverse==='function'?provider.getStrictFuturesUniverse():provider.getFuturesUniverse());
      base=buildUniverse(exchangeInfo);
    }catch(e){
      if(typeof store.latest==='function'){
        const prior=await store.latest({limit:2000}).catch(()=>null),items=prior?.items||[];
        base=items.map(x=>({symbol:String(x?.symbol||'').toUpperCase(),baseAsset:String(x?.baseAsset||'').toUpperCase(),quoteAsset:'USDT',contractType:'PERPETUAL'})).filter(x=>x.symbol&&x.baseAsset);
      }
      if(!base.length)throw e;
    }
    let caps={};try{caps=marketCapProvider?await marketCapProvider.resolve(base):{}}catch{}
    return assignMarketCapTiers(base,caps);
  }
  async function scanSymbol(row,fundingMap,scanAt,marketMaps={}){
    const frames={},rawFrames={},errors=[];
    await mapLimit(TIMEFRAMES,2,async tf=>{
      try{const raw=await gate(()=>provider.getFuturesKlines(row.symbol,tf,Math.max(Number(klineRows)||0,Mtf.rowsForTf(tf))));rawFrames[tf]=raw;frames[tf]=frameSummary(raw,scanAt)}
      catch(e){errors.push({source:'kline',timeframe:tf,error:String(e?.message||e)});rawFrames[tf]=[];frames[tf]={available:false,closedBars:0}}
    });
    let oi={};try{oi=await gate(()=>provider.getV2OiProfile(row.symbol))}catch(e){errors.push({source:'oi',error:String(e?.message||e)})}
    const fut=marketMaps.futures?.get?.(row.symbol)||{},spot=marketMaps.spot?.get?.(row.symbol)||{},fundingPct=finite(fundingMap?.get?.(row.symbol)),lastPrice=finite(fut.lastPrice)??finite(frames['5m']?.close);
    let longEntry=null;try{longEntry=AmdLong.evaluate({frames:rawFrames,asOf:scanAt,lastPrice,minRr:1.5})}catch(e){errors.push({source:'long-entry',error:String(e?.message||e)})}
    const flow={symbol:row.symbol,lastPrice,priceChange24h:finite(fut.priceChangePercent),quoteVolume24h:finite(fut.quoteVolume),spotPriceChange24h:finite(spot.priceChangePercent),spotQuoteVolume24h:finite(spot.quoteVolume),fundingRatePct:fundingPct,
      oi1hPct:finite(oi?.oi1hPct),oi4hPct:finite(oi?.oi4hPct),oi8hPct:finite(oi?.oi8hPct),oi12hPct:finite(oi?.oi12hPct),oi24hPct:finite(oi?.oi24hPct),oiDrawdownPct:finite(oi?.oiDrawdownPct)};
    let analysis=null;try{analysis=Mtf.analyze({symbol:row.symbol,rawFrames,row:flow,asOf:scanAt,longEntry,cohort:'FULL_UNIVERSE_30M'})}catch(e){errors.push({source:'mtf-analysis',error:String(e?.message||e)})}
    return{
      symbol:row.symbol,baseAsset:row.baseAsset,tier:row.tier,marketCapUsd:row.marketCapUsd,
      fundingPct,priceChange24h:flow.priceChange24h,quoteVolume24h:flow.quoteVolume24h,spotPriceChange24h:flow.spotPriceChange24h,spotQuoteVolume24h:flow.spotQuoteVolume24h,
      oi:{oi1hPct:flow.oi1hPct,oi4hPct:flow.oi4hPct,oi8hPct:flow.oi8hPct,oi12hPct:flow.oi12hPct,oi24hPct:flow.oi24hPct,oiDrawdownPct:flow.oiDrawdownPct},
      frames,mtfAnalysis:analysis,preIgnitionScore:analysis?.preIgnition?.score??null,preIgnitionStage:analysis?.preIgnition?.stage||null,entryMap:analysis?.entryMap||null,researchSample:analysis?.researchSample||null,
      errors,complete:TIMEFRAMES.every(tf=>frames[tf]?.available)&&errors.filter(x=>x.source==='oi').length===0,updatedAt:now()
    };
  }
  async function prepare({kind='auto',tiers=[],force=false,owner='worker'}={}){
    const scanKind=String(kind).toLowerCase()==='manual'?'manual':'auto',at=now(),bucket=autoBucketStart(at),id=runId(scanKind,at),selectedTiers=normalizeTierSelection(tiers);
    let run={version:VERSION,id,kind:scanKind,bucketStart:bucket,bucketKey:scanKind==='auto'?autoBucketKey(at):`manual:${id}`,status:'QUEUED',tiers:scanKind==='auto'?TIER_ORDER:selectedTiers,createdAt:at,updatedAt:at,owner};
    if(scanKind==='auto'&&!force){
      const claim=await store.claimAutoBucket(run);
      if(!claim?.claimed){
        const existing=claim?.run||null,updated=Number(existing?.updatedAt||existing?.createdAt||0),age=Math.max(0,at-updated);
        const recoverable=Boolean(existing&&existing.status!=='DONE'&&(existing.status!=='RUNNING'||age>Math.max(1000,Number(staleRunMs)||AUTO_STALE_MS)));
        if(recoverable)return{run:existing,cacheHit:false,skipped:false,recovered:true,tiers:selectedTiers};
        return{run:existing,cacheHit:existing?.status==='DONE',skipped:true,recovered:false,tiers:selectedTiers};
      }
      run=claim.run;
    }else run=await store.createRun(run);
    return{run,cacheHit:false,skipped:false,recovered:false,tiers:selectedTiers};
  }
  async function executeRun(run,{tiers=[]}={}){
    if(!run?.id)throw new Error('prepared run required');
    const id=run.id,scanKind=run.kind==='manual'?'manual':'auto',selectedTiers=normalizeTierSelection(tiers?.length?tiers:run.tiers);
    try{
      run=await store.updateRun(id,{status:'RUNNING',startedAt:run.startedAt||now(),stage:'universe',error:null,failedAt:null});
      const universe=await loadUniverse(),selected=selectUniverse(universe,{kind:scanKind,tiers:selectedTiers}),selectedSet=new Set(selected.map(x=>x.symbol));
      const prior=typeof store.getItems==='function'?await store.getItems(id,{limit:2000}):[];
      const metaBySymbol=new Map(selected.map(x=>[x.symbol,x]));
      const resumedItems=(prior||[]).filter(x=>selectedSet.has(x?.symbol)&&x?.complete===true).map(x=>{
        const meta=metaBySymbol.get(x.symbol);return meta?{...x,tier:meta.tier,marketCapUsd:meta.marketCapUsd}:x;
      }),resumedSet=new Set(resumedItems.map(x=>x.symbol));
      if(typeof store.putItem==='function')for(const item of resumedItems)await store.putItem(id,item);
      const remaining=selected.filter(x=>!resumedSet.has(x.symbol));
      let completed=resumedItems.length,failed=0;
      run=await store.updateRun(id,{stage:'scan',universeCount:universe.length,selectedCount:selected.length,resumedCount:resumedItems.length,remainingCount:remaining.length,completedCount:completed,errorCount:failed,tierCounts:summarizeCounts(universe),selectedTierCounts:summarizeCounts(selected)});
      let fundingMap=new Map(),spotMap=new Map(),futuresMap=new Map();
      if(remaining.length){
        try{fundingMap=await gate(()=>provider.getFundingMap())}catch(e){run=await store.updateRun(id,{fundingError:String(e?.message||e)})}
        try{const xs=await gate(()=>provider.getSpotTickers());spotMap=new Map((Array.isArray(xs)?xs:[]).map(x=>[String(x?.symbol||'').toUpperCase(),x]))}catch(e){run=await store.updateRun(id,{spotTickerError:String(e?.message||e)})}
        try{const xs=await gate(()=>provider.getFuturesTickers());futuresMap=new Map((Array.isArray(xs)?xs:[]).map(x=>[String(x?.symbol||'').toUpperCase(),x]))}catch(e){run=await store.updateRun(id,{futuresTickerError:String(e?.message||e)})}
      }
      const marketMaps={spot:spotMap,futures:futuresMap};
      const scanned=await mapLimit(remaining,maxWorkers,async row=>{
        const item=await scanSymbol(row,fundingMap,run.bucketStart||now(),marketMaps);completed++;if(!item.complete)failed++;
        if(typeof store.putItem==='function')await store.putItem(id,item);
        if(completed===selected.length||completed%10===0)run=await store.updateRun(id,{completedCount:completed,errorCount:failed,remainingCount:Math.max(0,selected.length-completed),stage:'scan'});
        return item;
      });
      const bySymbol=new Map(resumedItems.map(x=>[x.symbol,x]));for(const x of scanned||[])if(x?.symbol)bySymbol.set(x.symbol,x);
      const items=selected.map(x=>bySymbol.get(x.symbol)).filter(Boolean);
      run=await store.updateRun(id,{status:'DONE',stage:'complete',completedAt:now(),completedCount:completed,errorCount:failed,remainingCount:0,resumedCount:resumedItems.length,cacheHit:false});
      return{...run,items};
    }catch(e){await store.updateRun(id,{status:'FAILED',stage:'failed',failedAt:now(),error:String(e?.message||e)});throw e}
  }
  async function execute(options={}){
    const prepared=await prepare(options);
    if(prepared.skipped)return{...prepared.run,cacheHit:true,skipped:true};
    const result=await executeRun(prepared.run,{tiers:prepared.tiers});return{...result,recovered:Boolean(prepared.recovered)};
  }
  return{VERSION,AUTO_INTERVAL_MS,TIMEFRAMES,TIER_ORDER,loadUniverse,scanSymbol,prepare,executeRun,execute};
}

function createMemoryFullScanStore(){
  const runs=new Map(),items=new Map(),buckets=new Map();
  function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
  async function createRun(run){runs.set(run.id,clone(run));return clone(run)}
  async function claimAutoBucket(run){const existingId=buckets.get(run.bucketKey);if(existingId)return{claimed:false,run:clone(runs.get(existingId))};buckets.set(run.bucketKey,run.id);runs.set(run.id,clone(run));return{claimed:true,run:clone(run)}}
  async function updateRun(id,patch){const next={...(runs.get(id)||{id}),...clone(patch),updatedAt:Date.now()};runs.set(id,next);return clone(next)}
  async function putItem(id,item){if(!items.has(id))items.set(id,new Map());items.get(id).set(item.symbol,clone(item));return clone(item)}
  async function getRun(id){return clone(runs.get(id)||null)}
  async function getItems(id){return [...(items.get(id)?.values()||[])].map(clone)}
  async function latest(){const done=[...runs.values()].filter(x=>x.status==='DONE').sort((a,b)=>(b.completedAt||0)-(a.completedAt||0))[0]||null;return done?{...clone(done),items:await getItems(done.id)}:null}
  return{createRun,claimAutoBucket,updateRun,putItem,getRun,getItems,latest,_runs:runs,_items:items};
}

module.exports={VERSION,AUTO_INTERVAL_MS,AUTO_STALE_MS,TIMEFRAMES,TIER_ORDER,finite,pct,autoBucketStart,autoBucketKey,normalizeTierSelection,buildUniverse,assignMarketCapTiers,selectUniverse,closedRows,frameSummary,createSpacingGate,mapLimit,summarizeCounts,createFullUniverseScanService,createMemoryFullScanStore};
