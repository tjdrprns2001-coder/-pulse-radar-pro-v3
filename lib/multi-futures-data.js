'use strict';

const EXCHANGE_ORDER=Object.freeze(['binance','bybit','okx','gate','bitget','mexc','kucoin','hyperliquid']);
const STABLES=new Set(['USDT','USDC','FDUSD','TUSD','DAI','USDE','USDS','BUSD']);
const ALIASES=Object.freeze({XBT:'BTC'});
const BINANCE_BASES=Object.freeze(['https://fapi.binance.com','https://www.binance.com']);
const BASES=Object.freeze({
  binance:'https://fapi.binance.com',
  bybit:'https://api.bybit.com',
  okx:'https://www.okx.com',
  gate:'https://api.gateio.ws',
  bitget:'https://api.bitget.com',
  mexc:'https://contract.mexc.com',
  kucoin:'https://api-futures.kucoin.com',
  hyperliquid:'https://api.hyperliquid.xyz'
});
let cache={ts:0,data:null};

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function clamp(v,a=0,b=100){return Math.max(a,Math.min(b,Number.isFinite(Number(v))?Number(v):0))}
function avg(a){const v=(a||[]).map(finite).filter(x=>x!=null);return v.length?v.reduce((s,x)=>s+x,0)/v.length:null}
function sum(a){return(a||[]).map(finite).filter(x=>x!=null).reduce((s,x)=>s+x,0)}
function cleanBase(raw){
  let b=String(raw||'').toUpperCase().trim().replace(/[^A-Z0-9]/g,'');
  if(!b)return'';
  if(ALIASES[b])b=ALIASES[b];
  const m=b.match(/^(1000000|10000|1000)([A-Z][A-Z0-9]{1,})$/);
  if(m)b=m[2];
  if(ALIASES[b])b=ALIASES[b];
  return b;
}
function userBase(raw){
  let s=String(raw||'').toUpperCase().trim();
  s=s.replace(/[-_:/.]/g,'').replace(/(PERP|SWAP)$/,'').replace(/(USDTM|USDT|USDC|USD)$/,'');
  return cleanBase(s);
}
function uiSymbol(base){return cleanBase(base)+'USDT'}
function pctFromOpen(last,open){const l=finite(last),o=finite(open);return l!=null&&o?((l/o)-1)*100:null}
function pctMaybeDecimal(v){const n=finite(v);if(n==null)return null;return Math.abs(n)<=2?n*100:n}
function standard(exchange,{symbol,baseAsset,quoteAsset='USDT',lastPrice,priceChangePercent,quoteVolume24h,openInterestUsd=null,fundingRate=null,assetClass=null}={}){
  const base=cleanBase(baseAsset);
  const price=finite(lastPrice),change=finite(priceChangePercent),vol=finite(quoteVolume24h);
  if(!base||STABLES.has(base)||price==null||price<=0)return null;
  return{exchange,symbol:String(symbol||'').toUpperCase(),baseAsset:base,quoteAsset:String(quoteAsset||'USDT').toUpperCase(),lastPrice:price,priceChangePercent:change,quoteVolume24h:vol??0,openInterestUsd:finite(openInterestUsd),fundingRate:finite(fundingRate),contractType:'PERPETUAL',assetClass:assetClass||null};
}
async function getFirstJson(bases,path,options={}){
  let last;
  for(const base of bases){try{return await getJson(base+path,options)}catch(e){last=e}}
  throw last||Error('all public hosts failed');
}
function classifyAssetClass(...values){
  const s=values.filter(v=>v!=null).join(' ').toLowerCase();
  if(/tradifi|tradfi|stock|equity|forex|\bfx\b|commodity|commodities|bond|index|metal|oil/.test(s))return'tradfi';
  if(/crypto|coin|token|digital asset/.test(s))return'crypto';
  return null;
}
function obviousTradfiBase(base){
  const b=cleanBase(base);
  if(['XAU','XAG','WTI','BRENT','UKOIL','USOIL','GOLD','SILVER'].includes(b))return true;
  if(/^(EUR|GBP|AUD|NZD|USD|JPY|CHF|CAD)(EUR|GBP|AUD|NZD|USD|JPY|CHF|CAD)$/.test(b))return true;
  return false;
}
async function getJson(url,{method='GET',body=null,timeout=5500}={}){
  const ac=new AbortController(),to=setTimeout(()=>ac.abort(),timeout);
  try{
    const r=await fetch(url,{method,body:body==null?undefined:JSON.stringify(body),signal:ac.signal,headers:{accept:'application/json','content-type':'application/json','user-agent':'PulseRadar-Pro/MultiFutures'}});
    const t=await r.text();if(!r.ok||!t.trim())throw Error(`HTTP ${r.status}`);
    return JSON.parse(t);
  }finally{clearTimeout(to)}
}
function bySymbol(rows,key='symbol'){const m=new Map();for(const x of rows||[]){const k=String(x?.[key]||'').toUpperCase();if(k)m.set(k,x)}return m}

async function loadBinance(){
  const [info,tickers]=await Promise.all([getFirstJson(BINANCE_BASES,'/fapi/v1/exchangeInfo'),getFirstJson(BINANCE_BASES,'/fapi/v1/ticker/24hr')]);
  const tm=bySymbol(tickers);
  const out=[];
  for(const x of info?.symbols||[]){
    if(x.status!=='TRADING'||x.quoteAsset!=='USDT'||x.contractType!=='PERPETUAL')continue;
    const t=tm.get(String(x.symbol).toUpperCase());if(!t)continue;
    const assetClass=classifyAssetClass(x.contractType,x.underlyingType,...(Array.isArray(x.underlyingSubType)?x.underlyingSubType:[]));
    if(assetClass==='tradfi')continue;
    const row=standard('binance',{symbol:x.symbol,baseAsset:x.baseAsset,quoteAsset:x.quoteAsset,lastPrice:t.lastPrice,priceChangePercent:t.priceChangePercent,quoteVolume24h:t.quoteVolume,assetClass:assetClass||'crypto'});
    if(row)out.push(row);
  }
  return out;
}
async function loadBybit(){
  const list=[];let cursor='';
  for(let page=0;page<3;page++){
    const u=new URL(BASES.bybit+'/v5/market/instruments-info');u.searchParams.set('category','linear');u.searchParams.set('limit','1000');if(cursor)u.searchParams.set('cursor',cursor);
    const d=await getJson(u.toString());if(Number(d?.retCode)!==0)throw Error(d?.retMsg||'Bybit instruments failed');
    list.push(...(d?.result?.list||[]));cursor=String(d?.result?.nextPageCursor||'');if(!cursor)break;
  }
  const t=await getJson(BASES.bybit+'/v5/market/tickers?category=linear');if(Number(t?.retCode)!==0)throw Error(t?.retMsg||'Bybit tickers failed');
  const tm=bySymbol(t?.result?.list||[]);
  const out=[];
  for(const x of list){
    if(x.status!=='Trading'||x.quoteCoin!=='USDT')continue;
    const q=tm.get(String(x.symbol).toUpperCase());if(!q)continue;
    const oi=finite(q.openInterestValue);
    const row=standard('bybit',{symbol:x.symbol,baseAsset:x.baseCoin,quoteAsset:x.quoteCoin,lastPrice:q.lastPrice,priceChangePercent:finite(q.price24hPcnt)!=null?finite(q.price24hPcnt)*100:null,quoteVolume24h:q.turnover24h,openInterestUsd:oi,fundingRate:q.fundingRate});
    if(row)out.push(row);
  }
  return out;
}
async function loadOkx(){
  const [info,tickers]=await Promise.all([getJson(BASES.okx+'/api/v5/public/instruments?instType=SWAP'),getJson(BASES.okx+'/api/v5/market/tickers?instType=SWAP')]);
  if(String(info?.code??'0')!=='0'||String(tickers?.code??'0')!=='0')throw Error(info?.msg||tickers?.msg||'OKX failed');
  const tm=bySymbol(tickers?.data||[],'instId'),out=[];
  for(const x of info?.data||[]){
    const id=String(x.instId||'').toUpperCase();if(x.state!=='live'||!id.endsWith('-USDT-SWAP'))continue;
    const q=tm.get(id);if(!q)continue;
    const base=String(x.baseCcy||id.split('-')[0]),last=finite(q.last),baseVol=finite(q.volCcy24h);
    const assetClass=String(x.instCategory||'')==='1'?'crypto':['3','4','5','6'].includes(String(x.instCategory||''))?'tradfi':classifyAssetClass(x.instFamily,x.instType);
    const row=standard('okx',{symbol:id,baseAsset:base,quoteAsset:'USDT',lastPrice:last,priceChangePercent:pctFromOpen(last,q.open24h),quoteVolume24h:last!=null&&baseVol!=null?last*baseVol:0,assetClass:obviousTradfiBase(base)?'tradfi':assetClass});
    if(row)out.push(row);
  }
  return out;
}
async function loadGate(){
  const [info,tickers]=await Promise.all([getJson(BASES.gate+'/api/v4/futures/usdt/contracts'),getJson(BASES.gate+'/api/v4/futures/usdt/tickers')]);
  const tm=bySymbol(tickers,'contract'),out=[];
  for(const x of info||[]){
    const id=String(x.name||'').toUpperCase();if(!id.endsWith('_USDT')||x.in_delisting===true)continue;
    const q=tm.get(id);if(!q)continue;const base=id.replace(/_USDT$/,'');
    const row=standard('gate',{symbol:id,baseAsset:base,quoteAsset:'USDT',lastPrice:q.last,priceChangePercent:q.change_percentage,quoteVolume24h:q.volume_24h_quote??q.volume_24h_usd,fundingRate:q.funding_rate});
    if(row)out.push(row);
  }
  return out;
}
async function loadBitget(){
  const [info,tickers]=await Promise.all([getJson(BASES.bitget+'/api/v2/mix/market/contracts?productType=USDT-FUTURES'),getJson(BASES.bitget+'/api/v2/mix/market/tickers?productType=USDT-FUTURES')]);
  if(String(info?.code)!=='00000'||String(tickers?.code)!=='00000')throw Error(info?.msg||tickers?.msg||'Bitget failed');
  const tm=bySymbol(tickers?.data||[]),out=[];
  for(const x of info?.data||[]){
    if(String(x.quoteCoin||'').toUpperCase()!=='USDT')continue;
    const q=tm.get(String(x.symbol||'').toUpperCase());if(!q)continue;
    const row=standard('bitget',{symbol:x.symbol,baseAsset:x.baseCoin,quoteAsset:x.quoteCoin,lastPrice:q.lastPr??q.last,priceChangePercent:pctMaybeDecimal(q.change24h),quoteVolume24h:q.usdtVolume??q.quoteVolume,fundingRate:q.fundingRate});
    if(row)out.push(row);
  }
  return out;
}
async function loadMexc(){
  const [info,tickers]=await Promise.all([getJson(BASES.mexc+'/api/v1/contract/detail'),getJson(BASES.mexc+'/api/v1/contract/ticker')]);
  if(info?.success===false||tickers?.success===false)throw Error(info?.message||tickers?.message||'MEXC failed');
  const tm=bySymbol(tickers?.data||[]),out=[];
  for(const x of info?.data||[]){
    const id=String(x.symbol||'').toUpperCase();if(String(x.quoteCoin||'').toUpperCase()!=='USDT')continue;
    const q=tm.get(id);if(!q)continue;
    const row=standard('mexc',{symbol:id,baseAsset:x.baseCoin||id.replace(/_USDT$/,''),quoteAsset:'USDT',lastPrice:q.lastPrice,priceChangePercent:pctMaybeDecimal(q.riseFallRate),quoteVolume24h:q.amount24??q.volume24,fundingRate:q.fundingRate});
    if(row)out.push(row);
  }
  return out;
}
async function loadKucoin(){
  const d=await getJson(BASES.kucoin+'/api/v1/contracts/active');if(String(d?.code)!=='200000')throw Error('KuCoin failed');
  const out=[];
  for(const x of d?.data||[]){
    if(String(x.quoteCurrency||'').toUpperCase()!=='USDT')continue;
    const last=finite(x.lastTradePrice??x.markPrice);if(last==null||last<=0)continue;
    const assetClass=classifyAssetClass(x.assetClass,x.subMarketType,x.marketType);
    const oi=finite(x.openInterest),multiplier=finite(x.multiplier);
    const oiUsd=oi!=null&&multiplier!=null?oi*multiplier*last:null;
    const row=standard('kucoin',{symbol:x.symbol,baseAsset:x.baseCurrency,quoteAsset:x.quoteCurrency,lastPrice:last,priceChangePercent:pctMaybeDecimal(x.priceChgPct),quoteVolume24h:x.turnoverOf24h,openInterestUsd:oiUsd,fundingRate:x.fundingFeeRate,assetClass:obviousTradfiBase(x.baseCurrency)?'tradfi':assetClass});
    if(row)out.push(row);
  }
  return out;
}
async function loadHyperliquid(){
  const d=await getJson(BASES.hyperliquid+'/info',{method:'POST',body:{type:'metaAndAssetCtxs'}});if(!Array.isArray(d)||!d[0]?.universe||!Array.isArray(d[1]))throw Error('Hyperliquid failed');
  const out=[];
  for(let i=0;i<d[0].universe.length;i++){
    const x=d[0].universe[i],q=d[1][i]||{},name=String(x?.name||'');
    if(!name||name.includes(':')||x.isDelisted)continue;
    const last=finite(q.markPx??q.midPx),prev=finite(q.prevDayPx),oi=finite(q.openInterest);
    const row=standard('hyperliquid',{symbol:name,baseAsset:name,quoteAsset:'USDC',lastPrice:last,priceChangePercent:pctFromOpen(last,prev),quoteVolume24h:q.dayNtlVlm,openInterestUsd:last!=null&&oi!=null?last*oi:null,fundingRate:q.funding});
    if(row)out.push(row);
  }
  return out;
}

const LOADERS=Object.freeze({binance:loadBinance,bybit:loadBybit,okx:loadOkx,gate:loadGate,bitget:loadBitget,mexc:loadMexc,kucoin:loadKucoin,hyperliquid:loadHyperliquid});

async function collect({maxAgeMs=20000}={}){
  if(cache.data&&Date.now()-cache.ts<maxAgeMs)return cache.data;
  const settled=await Promise.all(EXCHANGE_ORDER.map(async exchange=>{
    try{return{exchange,ok:true,rows:await LOADERS[exchange](),error:null}}catch(e){return{exchange,ok:false,rows:[],error:String(e?.message||e)}}
  }));
  const markets=settled.flatMap(x=>x.rows);
  if(!markets.length)throw Error('모든 선물 거래소 공개 데이터 조회 실패');
  const sources={};for(const x of settled)sources[x.exchange]={ok:x.ok,count:x.rows.length,error:x.error};
  const data={markets,sources,sourceContracts:markets.length,successfulExchanges:settled.filter(x=>x.ok).length};
  cache={ts:Date.now(),data};return data;
}
function rankRows(rows,minVolume){
  const volumeRank=percentiles(rows,'quoteVol24'),changeRank=percentiles(rows,'change24');
  let out=rows.map(r=>{
    const v=volumeRank.get(r.symbol)||0,m=changeRank.get(r.symbol)||0,over=Math.max(0,Math.abs(r.change24||0)-20);
    const pre=Math.round(clamp(.58*v+.42*(100-Math.abs(m-65)*1.4)-over,0,99)*10)/10;
    const surge=Math.round(clamp(.55*v+.45*m-over,0,100));
    return{...r,pass:(r.quoteVol24||0)>=minVolume,p1:m,p4:m,pv:v,btcRel:0,preScore:pre,surgeScore:surge,axis:{volume:Math.round(v/5),momentum:Math.round(m/5),relativeStrength:0},preFeatures:{multiExchangeFutures:true,exchangeCount:r.exchangeCount}};
  });
  const ranked=out.filter(r=>r.pass).sort((a,b)=>b.preScore-a.preScore||b.quoteVol24-a.quoteVol24);
  ranked.forEach((r,i)=>{r.preRank=i+1;r.preTopPct=(i+1)/Math.max(1,ranked.length)*100});
  return out.sort((a,b)=>Math.max(b.surgeScore,b.preScore)-Math.max(a.surgeScore,a.preScore)||b.quoteVol24-a.quoteVol24);
}
function percentiles(rows,key){
  const v=rows.map(x=>({s:x.symbol,v:finite(x[key])})).filter(x=>x.v!=null).sort((a,b)=>a.v-b.v),m=new Map(),d=Math.max(1,v.length-1);
  v.forEach((x,i)=>m.set(x.s,i/d*100));return m;
}
function mergeMarkets(markets=[]){
  const groups=new Map();
  for(const m of markets){
    const key=cleanBase(m.baseAsset);if(!key||STABLES.has(key))continue;
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(m);
  }
  const rows=[];
  for(const [base,list] of groups){
    const classes=new Set(list.map(x=>x.assetClass).filter(Boolean));
    if((classes.has('tradfi')&&!classes.has('crypto'))||obviousTradfiBase(base))continue;
    const uniqueExchange=[...new Set(list.map(x=>x.exchange))];
    const ordered=list.slice().sort((a,b)=>(finite(b.quoteVolume24h)||0)-(finite(a.quoteVolume24h)||0)||(EXCHANGE_ORDER.indexOf(a.exchange)-EXCHANGE_ORDER.indexOf(b.exchange)));
    const primary=ordered[0],binance=ordered.find(x=>x.exchange==='binance')||null;
    const weights=ordered.map(x=>Math.max(0,finite(x.quoteVolume24h)||0)),ws=sum(weights);
    const changes=ordered.map(x=>finite(x.priceChangePercent));
    const weightedChange=ws>0?ordered.reduce((s,x,i)=>s+(finite(x.priceChangePercent)||0)*weights[i],0)/ws:avg(changes);
    const quoteVol24=sum(ordered.map(x=>x.quoteVolume24h)),oiUsd=sum(ordered.map(x=>x.openInterestUsd));
    const funding=avg(ordered.map(x=>x.fundingRate));
    rows.push({
      symbol:binance?.symbol||uiSymbol(base),baseAsset:base,market:'futures',contractType:'PERPETUAL',
      price:finite(binance?.lastPrice??primary.lastPrice),change24:weightedChange??0,quoteVol24,change1h:0,change4h:0,velocity:quoteVol24,
      exchangeCount:uniqueExchange.length,exchanges:uniqueExchange,primaryExchange:primary.exchange,primarySymbol:primary.symbol,
      detailExchange:binance?'binance':null,detailSymbol:binance?.symbol||null,deepSupported:Boolean(binance),
      openInterestUsd:oiUsd||null,fundingRate:funding,contracts:ordered.map(x=>({exchange:x.exchange,symbol:x.symbol,quoteAsset:x.quoteAsset,quoteVolume24h:x.quoteVolume24h,openInterestUsd:x.openInterestUsd,fundingRate:x.fundingRate})),
      dataStatus:'live'
    });
  }
  return rows;
}
async function market(minVolume=500000){
  const raw=await collect(),merged=mergeMarkets(raw.markets),results=rankRows(merged,Number(minVolume)||0);
  return{ok:true,version:'multi-futures-v1',market:'futures',updatedAt:new Date().toISOString(),total:results.length,eligible:results.filter(x=>x.pass).length,results,
    sourceContracts:raw.sourceContracts,duplicateContractsRemoved:Math.max(0,raw.sourceContracts-results.length),exchangeCount:raw.successfulExchanges,sources:raw.sources,
    note:'Binance/Bybit/OKX/Gate/Bitget/MEXC/KuCoin/Hyperliquid perpetual futures; base asset 기준 중복 제거'};
}
async function catalog(){const raw=await collect(),rows=mergeMarkets(raw.markets);return{ok:true,total:rows.length,rows,sourceContracts:raw.sourceContracts,duplicateContractsRemoved:Math.max(0,raw.sourceContracts-rows.length),exchangeCount:raw.successfulExchanges,sources:raw.sources}}
async function find(symbol){const base=userBase(symbol),c=await catalog();return c.rows.find(x=>x.baseAsset===base||x.symbol===String(symbol||'').toUpperCase())||null}
function resetCache(){cache={ts:0,data:null}}
module.exports={EXCHANGE_ORDER,cleanBase,userBase,standard,classifyAssetClass,obviousTradfiBase,mergeMarkets,rankRows,collect,market,catalog,find,resetCache,LOADERS};
