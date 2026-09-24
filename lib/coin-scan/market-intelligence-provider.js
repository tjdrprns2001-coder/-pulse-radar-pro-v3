'use strict';

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function median(values=[]){const a=values.map(finite).filter(v=>v!=null).sort((a,b)=>a-b);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function sum(values=[]){const a=values.map(finite).filter(v=>v!=null);return a.length?a.reduce((s,v)=>s+v,0):null}
function pct(a,b){return a!=null&&a!==0&&b!=null?((b/a)-1)*100:null}
function baseOf(symbol){const s=String(symbol||'').toUpperCase();return s.endsWith('USDT')?s.slice(0,-4):s}
function quoteVolumeFrom(baseVolume,price,quoteVolume){const q=finite(quoteVolume);if(q!=null)return q;const b=finite(baseVolume),p=finite(price);return b!=null&&p!=null?b*p:null}
function emptySource(name,error=null){return{name,available:false,price:null,quoteVolume24h:null,priceChange24h:null,marketType:null,error:error?String(error):null}}
function normalizeSymbol(s){return String(s||'').toUpperCase().replace(/[-_/:]/g,'')}

function createMarketIntelligenceProvider({
  fetchImpl=globalThis.fetch,cache=null,now=()=>Date.now(),
  env=typeof process!=='undefined'&&process.env?process.env:{}
}={}){
  if(typeof fetchImpl!=='function')throw new Error('fetch implementation required');

  async function json(url,{ttlMs=30000,key=url,method='GET',body=null,headers={}}={}){
    if(cache&&typeof cache.get==='function'){const hit=cache.get(key);if(hit!=null)return hit}
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),6500);
    try{
      const res=await fetchImpl(url,{method,body,headers,signal:ctrl.signal});
      if(!res||!res.ok)throw new Error('HTTP '+(res&&res.status||'ERR'));
      const data=await res.json();
      if(cache&&typeof cache.set==='function')cache.set(key,data,ttlMs);
      return data;
    }finally{clearTimeout(timer)}
  }

  function mapRows(rows,fn){const out=new Map();for(const row of rows||[]){try{const x=fn(row);if(x?.symbol)out.set(normalizeSymbol(x.symbol),x)}catch{}}return out}
  async function bybit(){
    try{
      const [spot,linear]=await Promise.all([
        json('https://api.bybit.com/v5/market/tickers?category=spot',{key:'intel:bybit:spot'}),
        json('https://api.bybit.com/v5/market/tickers?category=linear',{key:'intel:bybit:linear'})
      ]);
      const sm=mapRows(spot?.result?.list,x=>({symbol:x.symbol,price:finite(x.lastPrice),quoteVolume24h:finite(x.turnover24h),priceChange24h:finite(x.price24hPcnt)!=null?finite(x.price24hPcnt)*100:null,marketType:'spot'}));
      const fm=mapRows(linear?.result?.list,x=>({symbol:x.symbol,price:finite(x.lastPrice),quoteVolume24h:finite(x.turnover24h),priceChange24h:finite(x.price24hPcnt)!=null?finite(x.price24hPcnt)*100:null,openInterest:finite(x.openInterest),fundingRate:finite(x.fundingRate),marketType:'swap'}));
      return{name:'bybit',spot:sm,futures:fm};
    }catch(e){return{name:'bybit',spot:new Map(),futures:new Map(),error:String(e?.message||e)}}
  }
  async function okx(){
    try{
      const [spot,swap]=await Promise.all([
        json('https://www.okx.com/api/v5/market/tickers?instType=SPOT',{key:'intel:okx:spot'}),
        json('https://www.okx.com/api/v5/market/tickers?instType=SWAP',{key:'intel:okx:swap'})
      ]);
      const sm=mapRows(spot?.data,x=>({symbol:x.instId,price:finite(x.last),quoteVolume24h:quoteVolumeFrom(x.vol24h,x.last,x.volCcy24h),priceChange24h:pct(finite(x.open24h),finite(x.last)),marketType:'spot'}));
      const fm=mapRows(swap?.data,x=>({symbol:x.instId,price:finite(x.last),quoteVolume24h:quoteVolumeFrom(x.vol24h,x.last,x.volCcy24h),priceChange24h:pct(finite(x.open24h),finite(x.last)),marketType:'swap'}));
      return{name:'okx',spot:sm,futures:fm};
    }catch(e){return{name:'okx',spot:new Map(),futures:new Map(),error:String(e?.message||e)}}
  }
  async function gate(){
    try{
      const [spot,fut]=await Promise.all([
        json('https://api.gateio.ws/api/v4/spot/tickers',{key:'intel:gate:spot'}),
        json('https://api.gateio.ws/api/v4/futures/usdt/tickers',{key:'intel:gate:futures'})
      ]);
      const sm=mapRows(spot,x=>({symbol:x.currency_pair,price:finite(x.last),quoteVolume24h:finite(x.quote_volume),priceChange24h:finite(x.change_percentage),marketType:'spot'}));
      const fm=mapRows(fut,x=>({symbol:x.contract,price:finite(x.last),quoteVolume24h:finite(x.volume_24h_quote),priceChange24h:finite(x.change_percentage),marketType:'swap'}));
      return{name:'gate',spot:sm,futures:fm};
    }catch(e){return{name:'gate',spot:new Map(),futures:new Map(),error:String(e?.message||e)}}
  }
  async function bitget(){
    try{
      const [spot,fut]=await Promise.all([
        json('https://api.bitget.com/api/v2/spot/market/tickers',{key:'intel:bitget:spot'}),
        json('https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES',{key:'intel:bitget:futures'})
      ]);
      const sm=mapRows(spot?.data,x=>({symbol:x.symbol,price:finite(x.lastPr),quoteVolume24h:finite(x.usdtVolume),priceChange24h:finite(x.change24h)!=null?finite(x.change24h)*100:null,marketType:'spot'}));
      const fm=mapRows(fut?.data,x=>({symbol:x.symbol,price:finite(x.lastPr),quoteVolume24h:finite(x.usdtVolume),priceChange24h:finite(x.change24h)!=null?finite(x.change24h)*100:null,openInterest:finite(x.holdingAmount),fundingRate:finite(x.fundingRate),marketType:'swap'}));
      return{name:'bitget',spot:sm,futures:fm};
    }catch(e){return{name:'bitget',spot:new Map(),futures:new Map(),error:String(e?.message||e)}}
  }
  async function mexc(){
    try{
      const [spot,fut]=await Promise.all([
        json('https://api.mexc.com/api/v3/ticker/24hr',{key:'intel:mexc:spot'}),
        json('https://contract.mexc.com/api/v1/contract/ticker',{key:'intel:mexc:futures'})
      ]);
      const sm=mapRows(spot,x=>({symbol:x.symbol,price:finite(x.lastPrice),quoteVolume24h:finite(x.quoteVolume),priceChange24h:finite(x.priceChangePercent),marketType:'spot'}));
      const fm=mapRows(fut?.data,x=>({symbol:x.symbol,price:finite(x.lastPrice),quoteVolume24h:finite(x.amount24),priceChange24h:finite(x.riseFallRate)!=null?finite(x.riseFallRate)*100:null,openInterest:finite(x.holdVol),fundingRate:finite(x.fundingRate),marketType:'swap'}));
      return{name:'mexc',spot:sm,futures:fm};
    }catch(e){return{name:'mexc',spot:new Map(),futures:new Map(),error:String(e?.message||e)}}
  }
  async function kucoin(){
    try{
      const [spot,fut]=await Promise.all([
        json('https://api.kucoin.com/api/v1/market/allTickers',{key:'intel:kucoin:spot'}),
        json('https://api-futures.kucoin.com/api/v1/contracts/active',{key:'intel:kucoin:futures'})
      ]);
      const sm=mapRows(spot?.data?.ticker,x=>({symbol:x.symbol,price:finite(x.last),quoteVolume24h:finite(x.volValue),priceChange24h:finite(x.changeRate)!=null?finite(x.changeRate)*100:null,marketType:'spot'}));
      const fm=mapRows(fut?.data,x=>({symbol:x.symbol,price:finite(x.lastTradePrice),quoteVolume24h:finite(x.turnoverOf24h),priceChange24h:finite(x.priceChgPct)!=null?finite(x.priceChgPct)*100:null,openInterest:finite(x.openInterest),fundingRate:finite(x.fundingFeeRate),marketType:'swap'}));
      return{name:'kucoin',spot:sm,futures:fm};
    }catch(e){return{name:'kucoin',spot:new Map(),futures:new Map(),error:String(e?.message||e)}}
  }
  async function htx(){
    try{
      const spot=await json('https://api.huobi.pro/market/tickers',{key:'intel:htx:spot'});
      const sm=mapRows(spot?.data,x=>({symbol:x.symbol,price:finite(x.close),quoteVolume24h:finite(x.vol),priceChange24h:pct(finite(x.open),finite(x.close)),marketType:'spot'}));
      return{name:'htx',spot:sm,futures:new Map()};
    }catch(e){return{name:'htx',spot:new Map(),futures:new Map(),error:String(e?.message||e)}}
  }
  async function bitfinex(){
    try{
      const rows=await json('https://api-pub.bitfinex.com/v2/tickers?symbols=ALL',{key:'intel:bitfinex:all'});
      const sm=new Map(),fm=new Map();
      for(const x of Array.isArray(rows)?rows:[]){const raw=String(x?.[0]||'');if(!raw.startsWith('t'))continue;const pair=raw.slice(1),last=finite(x?.[7]),change=finite(x?.[6]),vol=finite(x?.[8]);const item={symbol:pair,price:last,quoteVolume24h:quoteVolumeFrom(vol,last,null),priceChange24h:change!=null?change*100:null,marketType:raw.includes('F0')?'swap':'spot'};(item.marketType==='swap'?fm:sm).set(normalizeSymbol(pair),item)}
      return{name:'bitfinex',spot:sm,futures:fm};
    }catch(e){return{name:'bitfinex',spot:new Map(),futures:new Map(),error:String(e?.message||e)}}
  }
  async function hyperliquid(){
    try{
      const data=await json('https://api.hyperliquid.xyz/info',{method:'POST',body:JSON.stringify({type:'metaAndAssetCtxs'}),headers:{'content-type':'application/json'},key:'intel:hyperliquid:ctx'});
      const universe=data?.[0]?.universe||[],ctx=data?.[1]||[],fm=new Map();
      universe.forEach((u,i)=>{const x=ctx[i]||{},symbol=String(u?.name||'')+'USDT';fm.set(normalizeSymbol(symbol),{symbol,price:finite(x.markPx),quoteVolume24h:finite(x.dayNtlVlm),priceChange24h:pct(finite(x.prevDayPx),finite(x.markPx)),openInterest:finite(x.openInterest),fundingRate:finite(x.funding),marketType:'perp'})});
      return{name:'hyperliquid',spot:new Map(),futures:fm};
    }catch(e){return{name:'hyperliquid',spot:new Map(),futures:new Map(),error:String(e?.message||e)}}
  }

  const sourceLoaders=[bybit,okx,gate,bitget,mexc,kucoin,htx,bitfinex,hyperliquid];
  let sourceSnapshot=null,sourceSnapshotAt=0,sourceSnapshotPromise=null;
  async function loadSources(){
    if(sourceSnapshot&&now()-sourceSnapshotAt<30000)return sourceSnapshot;
    if(sourceSnapshotPromise)return sourceSnapshotPromise;
    sourceSnapshotPromise=Promise.all(sourceLoaders.map(fn=>fn())).then(rows=>{sourceSnapshot=rows;sourceSnapshotAt=now();return rows}).finally(()=>{sourceSnapshotPromise=null});
    return sourceSnapshotPromise;
  }
  async function getCexCrossCheck(symbol,{binanceSpotTicker=null,binanceFuturesTicker=null}={}){
    const key=normalizeSymbol(symbol),settled=await loadSources(),sources=[];
    if(binanceSpotTicker)sources.push({name:'binance',available:true,marketType:'spot',price:finite(binanceSpotTicker.lastPrice),quoteVolume24h:finite(binanceSpotTicker.quoteVolume),priceChange24h:finite(binanceSpotTicker.priceChangePercent)});
    if(binanceFuturesTicker)sources.push({name:'binance',available:true,marketType:'swap',price:finite(binanceFuturesTicker.lastPrice),quoteVolume24h:finite(binanceFuturesTicker.quoteVolume),priceChange24h:finite(binanceFuturesTicker.priceChangePercent)});
    for(const ex of settled){const s=ex.spot.get(key),f=ex.futures.get(key);if(s)sources.push({name:ex.name,available:true,...s});if(f)sources.push({name:ex.name,available:true,...f})}
    const active=sources.filter(x=>x.available&&finite(x.price)!=null),prices=active.map(x=>x.price),med=median(prices),disp=med?Math.max(...prices.map(p=>Math.abs((p/med-1)*100))):null;
    const spot=active.filter(x=>x.marketType==='spot'),derivatives=active.filter(x=>x.marketType!=='spot');
    return{available:active.length>0,sources,exchangeCount:new Set(active.map(x=>x.name)).size,marketCount:active.length,spotCount:spot.length,derivativesCount:derivatives.length,medianPrice:med,maxPriceDispersionPct:disp,totalQuoteVolume24h:sum(active.map(x=>x.quoteVolume24h)),spotMedianPrice:median(spot.map(x=>x.price)),derivativesMedianPrice:median(derivatives.map(x=>x.price)),spotFuturesBasisPct:pct(median(spot.map(x=>x.price)),median(derivatives.map(x=>x.price))),failures:settled.filter(x=>x.error).map(x=>({source:x.name,error:x.error}))};
  }

  async function dex(symbol){
    const base=baseOf(symbol);
    try{
      const d=await json('https://api.dexscreener.com/latest/dex/search?q='+encodeURIComponent(base+' USDT'),{ttlMs:60000,key:'intel:dex:'+base});
      const pairs=(Array.isArray(d?.pairs)?d.pairs:[]).filter(x=>String(x?.baseToken?.symbol||'').toUpperCase()===base).sort((a,b)=>(finite(b?.liquidity?.usd)||0)-(finite(a?.liquidity?.usd)||0)).slice(0,20);
      const contracts={};for(const p of pairs){const a=String(p?.baseToken?.address||'');if(a)contracts[a]=(contracts[a]||0)+1}
      const best=pairs[0]||null,contractEntries=Object.entries(contracts).sort((a,b)=>b[1]-a[1]);
      return{available:pairs.length>0,pairCount:pairs.length,chains:[...new Set(pairs.map(x=>x.chainId).filter(Boolean))],dexes:[...new Set(pairs.map(x=>x.dexId).filter(Boolean))],liquidityUsd:sum(pairs.map(x=>x?.liquidity?.usd)),volume24hUsd:sum(pairs.map(x=>x?.volume?.h24)),bestPair:best?{chainId:best.chainId,dexId:best.dexId,pairAddress:best.pairAddress,tokenAddress:best.baseToken?.address,priceUsd:finite(best.priceUsd),liquidityUsd:finite(best.liquidity?.usd),volume24hUsd:finite(best.volume?.h24)}:null,contractCandidates:contractEntries.slice(0,5).map(([address,count])=>({address,count})),contractVerification:contractEntries.length===1&&pairs.length>=2?{status:'CROSS_PAIR_MATCH',verified:true,address:contractEntries[0][0],evidencePairs:pairs.length}:{status:pairs.length?'AMBIGUOUS_OR_SINGLE_SOURCE':'N/A',verified:false,address:best?.baseToken?.address||null,evidencePairs:pairs.length}};
    }catch(e){return{available:false,pairCount:0,error:String(e?.message||e),contractVerification:{status:'N/A',verified:false}}}
  }

  async function news(symbol){
    const base=baseOf(symbol),needle=base.toUpperCase();
    try{
      const d=await json('https://min-api.cryptocompare.com/data/v2/news/?lang=EN',{ttlMs:60000,key:'intel:news:global'});
      const rows=(Array.isArray(d?.Data)?d.Data:[]).filter(x=>{const cats=String(x?.categories||'').toUpperCase(),title=String(x?.title||'').toUpperCase(),body=String(x?.body||'').toUpperCase();return cats.split('|').includes(needle)||title.includes(needle)||body.includes(' '+needle+' ')}).slice(0,12).map(x=>({id:String(x.id||''),publishedAt:Number(x.published_on||0)*1000,title:String(x.title||''),source:String(x.source_info?.name||x.source||''),url:String(x.url||''),categories:String(x.categories||'').split('|').filter(Boolean)}));
      return{available:rows.length>0,count:rows.length,items:rows};
    }catch(e){return{available:false,count:0,items:[],error:String(e?.message||e)}}
  }

  function deriveNewsEvents(newsResult){
    const re=/(listing|list(ed|ing)?|delist|unlock|upgrade|mainnet|testnet|airdrop|snapshot|merge|migration|launch|release|fork|burn|staking|vote|governance|partnership)/i;
    return (newsResult?.items||[]).filter(x=>re.test(x.title)).slice(0,8).map(x=>({kind:'NEWS_EVENT',title:x.title,source:x.source,publishedAt:x.publishedAt,url:x.url}));
  }

  async function scheduledEvents(symbol){
    const token=env.COINMARKETCAL_API_KEY||env.COINMARKETCAL_TOKEN;
    if(!token)return{available:false,provider:'coinmarketcal',reason:'API_KEY_NOT_CONFIGURED',items:[]};
    const base=baseOf(symbol);
    try{
      const d=await json('https://developers.coinmarketcal.com/v1/events?max=50&coins='+encodeURIComponent(base),{ttlMs:300000,key:'intel:cmc:'+base,headers:{'x-api-key':token,Accept:'application/json'}});
      const rows=Array.isArray(d?.body)?d.body:Array.isArray(d)?d:[];
      return{available:rows.length>0,provider:'coinmarketcal',items:rows.slice(0,20).map(x=>({id:x.id||null,title:x.title?.en||x.title||'',date:x.date_event||x.created_date||null,proof:x.proof||null,source:x.source||null}))};
    }catch(e){return{available:false,provider:'coinmarketcal',reason:String(e?.message||e),items:[]}}
  }

  async function walletMovements(symbol){
    const key=env.WHALE_ALERT_API_KEY;
    if(!key)return{available:false,provider:'whale-alert',reason:'API_KEY_NOT_CONFIGURED',items:[]};
    const base=baseOf(symbol).toLowerCase(),start=Math.floor((now()-6*3600000)/1000);
    try{
      const d=await json('https://api.whale-alert.io/v1/transactions?api_key='+encodeURIComponent(key)+'&start='+start+'&min_value=500000',{ttlMs:60000,key:'intel:whale:'+start});
      const rows=(Array.isArray(d?.transactions)?d.transactions:[]).filter(x=>String(x?.symbol||'').toLowerCase()===base).slice(0,20).map(x=>({timestamp:Number(x.timestamp||0)*1000,amountUsd:finite(x.amount_usd),amount:finite(x.amount),symbol:String(x.symbol||'').toUpperCase(),from:{address:x.from?.address||null,owner:x.from?.owner||null,ownerType:x.from?.owner_type||null},to:{address:x.to?.address||null,owner:x.to?.owner||null,ownerType:x.to?.owner_type||null},transactionType:x.transaction_type||null,hash:x.hash||null}));
      return{available:rows.length>0,provider:'whale-alert',items:rows};
    }catch(e){return{available:false,provider:'whale-alert',reason:String(e?.message||e),items:[]}}
  }

  function walletVerification(walletResult,dexResult){
    const items=walletResult?.items||[],attributed=items.filter(x=>x.from?.owner||x.to?.owner);
    return{status:walletResult?.available?(attributed.length?'ATTRIBUTED_SOURCE':'UNATTRIBUTED'):'N/A',verifiedAttributions:attributed.length,totalTransfers:items.length,contractStatus:dexResult?.contractVerification?.status||'N/A',tokenContractVerified:Boolean(dexResult?.contractVerification?.verified),note:'지갑 소유자 표시는 외부 데이터 제공자가 명시한 경우에만 사용하며 추정하지 않습니다.'};
  }

  return{getCexCrossCheck,dex,news,deriveNewsEvents,scheduledEvents,walletMovements,walletVerification,loadSources};
}
module.exports={createMarketIntelligenceProvider,normalizeSymbol,baseOf,median};
