const spot=require('../lib/spot-market.js');
const futures=require('../lib/futures-data.js');
const multi=require('../lib/multi-futures-data.js');
const REQUIRED_FUTURES=['XPINUSDT'];

function capture(){let code=200,body=null;return{res:{setHeader(){},status(c){code=c;return this},json(v){body=v;return this}},get:()=>({code,body})}}
async function runSpot(req){const c=capture();try{await spot(req,c.res)}catch(e){return{code:500,body:{ok:false,error:e?.message||String(e)}}}return c.get()}
async function fetchJson(bases,path,timeout=5000){let last;for(const base of bases){const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),timeout);try{const r=await fetch(base+path,{signal:ctl.signal,headers:{accept:'application/json','user-agent':'PulseRadar-Pro/Catalog'}}),t=await r.text();clearTimeout(to);if(!r.ok||!t.trim())throw Error('HTTP '+r.status);return JSON.parse(t)}catch(e){clearTimeout(to);last=e}}throw last||Error('catalog fetch failed')}

function baseFromSymbol(symbol){return multi.userBase(String(symbol||'').toUpperCase())}
function normalizeFutureRow(row){
  const base=row.baseAsset||baseFromSymbol(row.symbol);
  return{...row,baseAsset:base,market:'futures',exchangeCount:Number(row.exchangeCount)||1,exchanges:Array.isArray(row.exchanges)&&row.exchanges.length?row.exchanges:['binance'],primaryExchange:row.primaryExchange||'binance',deepSupported:row.deepSupported!==false};
}
async function catalog(){
  const SPOT=['https://api.binance.com','https://api-gcp.binance.com','https://data-api.binance.vision'];
  const [sR,fR]=await Promise.allSettled([fetchJson(SPOT,'/api/v3/exchangeInfo'),multi.catalog()]);
  const map=new Map();
  if(sR.status==='fulfilled')for(const x of sR.value?.symbols||[]){
    if(x.status!=='TRADING'||x.quoteAsset!=='USDT'||x.isSpotTradingAllowed===false)continue;
    const base=multi.cleanBase(x.baseAsset||baseFromSymbol(x.symbol));if(!base)continue;
    map.set(base,{symbol:x.symbol,baseAsset:base,spot:true,futures:false,futuresExchanges:[],exchangeCount:0});
  }
  if(fR.status==='fulfilled')for(const x of fR.value?.rows||[]){
    const base=x.baseAsset||baseFromSymbol(x.symbol),q=map.get(base)||{symbol:x.symbol,baseAsset:base,spot:false,futures:false,futuresExchanges:[],exchangeCount:0};
    q.futures=true;q.futuresExchanges=x.exchanges||[];q.exchangeCount=x.exchangeCount||0;q.primaryExchange=x.primaryExchange||null;q.deepSupported=x.deepSupported!==false;map.set(base,q);
  }
  for(const symbol of REQUIRED_FUTURES){
    const base=baseFromSymbol(symbol),q=map.get(base)||{symbol,baseAsset:base,spot:false,futures:false,futuresExchanges:[],exchangeCount:0};
    q.futures=true;if(!q.futuresExchanges.includes('binance'))q.futuresExchanges.push('binance');q.exchangeCount=Math.max(1,q.exchangeCount||0);q.deepSupported=true;map.set(base,q);
  }
  const symbols=[...map.values()].sort((a,b)=>a.symbol.localeCompare(b.symbol));
  const mf=fR.status==='fulfilled'?fR.value:null;
  const coreFuturesCount=Number(mf?.sources?.binance?.count)||symbols.filter(x=>x.futures&&x.futuresExchanges?.includes('binance')).length;
  const spotCount=symbols.filter(x=>x.spot).length,futuresCount=symbols.filter(x=>x.futures).length,futuresOnlyCount=symbols.filter(x=>x.futures&&!x.spot).length;
  return{ok:true,version:'catalog-v6-unified-universe',total:symbols.length,coreFuturesCount,spotCount,futuresCount,futuresOnlyCount,symbols,requiredFutures:REQUIRED_FUTURES,
    universe:{core:{key:'binance-usdt-perpetual',label:'코어 유니버스 · Binance USDT 무기한',count:coreFuturesCount},extended:{key:'spot-plus-8-futures-dedup',label:'확장 유니버스 · 현물 + 8개 선물거래소 중복 제거',count:symbols.length,spotCount,futuresCount},dex:{key:'dex-extended-monitoring',label:'DEX 확장 감시 · 페어/토큰 단위 별도 집계'}},
    futuresExchangeCount:mf?.exchangeCount||0,futuresSources:mf?.sources||{},sourceContracts:mf?.sourceContracts||0,duplicateContractsRemoved:mf?.duplicateContractsRemoved||0,updatedAt:new Date().toISOString()};
}
function fallbackFutureRow(symbol){
  return{symbol,baseAsset:baseFromSymbol(symbol),market:'futures',contractType:'PERPETUAL',change24:0,quoteVol24:0,change1h:0,change4h:0,velocity:0,pass:false,preScore:0,surgeScore:0,preRank:null,preTopPct:null,dataStatus:'symbol-only',dataNote:'실시간 선물 시세 피드 일시 미사용',exchangeCount:1,exchanges:['binance'],primaryExchange:'binance',deepSupported:true};
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=20, stale-while-revalidate=40');
  try{
    if(String(req.query.catalog||'')==='1')return res.status(200).json(await catalog());
    const min=Number(req.query.minVolume)||500000;
    const [s,multiSettled]=await Promise.all([runSpot(req),multi.market(min).then(x=>({ok:true,data:x})).catch(e=>({ok:false,error:e}))]);
    const sr=s.body?.ok?(s.body.results||[]).map(x=>({...x,baseAsset:baseFromSymbol(x.symbol),market:'spot'})):[];
    let f=null,futuresFallback=false,futuresError=null;
    if(multiSettled.ok)f=multiSettled.data;
    else{
      futuresFallback=true;futuresError=multiSettled.error?.message||String(multiSettled.error||'multi futures unavailable');
      try{f=await futures.market(min)}catch(e){f={ok:false,error:e?.message||String(e),results:[]}}
    }
    const futureRows=(f?.ok?(f.results||[]):[]).map(normalizeFutureRow);
    const futureByBase=new Map(futureRows.map(x=>[x.baseAsset,x]));
    for(let i=0;i<sr.length;i++){
      const fr=futureByBase.get(sr[i].baseAsset);if(!fr)continue;
      sr[i]={...sr[i],hasFutures:true,futuresExchangeCount:fr.exchangeCount,futuresExchanges:fr.exchanges,futuresQuoteVol24:fr.quoteVol24,primaryFuturesExchange:fr.primaryExchange,futuresContracts:fr.contracts||[],deepSupported:true};
    }
    const spotBases=new Set(sr.map(x=>x.baseAsset));
    let fr=futureRows.filter(x=>!spotBases.has(x.baseAsset));
    if(!f?.ok||!fr.length){
      futuresFallback=true;let c;try{c=await catalog()}catch{}
      const syms=(c?.symbols||[]).filter(x=>x.futures&&!x.spot).map(x=>x.symbol);
      for(const symbol of REQUIRED_FUTURES)if(!syms.includes(symbol)&&!spotBases.has(baseFromSymbol(symbol)))syms.push(symbol);
      const existing=new Set(fr.map(x=>x.baseAsset));
      for(const symbol of syms){const base=baseFromSymbol(symbol);if(!existing.has(base)&&!spotBases.has(base)){fr.push(fallbackFutureRow(symbol));existing.add(base)}}
    }else{
      const existing=new Set(fr.map(x=>x.baseAsset));
      for(const symbol of REQUIRED_FUTURES){const base=baseFromSymbol(symbol);if(!existing.has(base)&&!spotBases.has(base)){fr.push(fallbackFutureRow(symbol));existing.add(base)}}
    }
    const rows=[...sr,...fr];
    rows.sort((a,b)=>Math.max(Number(b.surgeScore)||0,Number(b.preScore)||0)-Math.max(Number(a.surgeScore)||0,Number(a.preScore)||0)||Number(b.quoteVol24||0)-Number(a.quoteVol24||0)||String(a.symbol).localeCompare(String(b.symbol)));
    const futuresUniqueCount=futureRows.length||fr.length;
    const exchangeCount=Number(f?.exchangeCount)||1;
    const sourceContracts=Number(f?.sourceContracts)||futureRows.length;
    const duplicateContractsRemoved=Number(f?.duplicateContractsRemoved)||Math.max(0,sourceContracts-futuresUniqueCount);
    return res.status(200).json({
      ok:true,version:'spot+multi-futures-v5-unified-universe',market:'spot+futures',updatedAt:new Date().toISOString(),total:rows.length,eligible:rows.filter(x=>x.pass).length,results:rows,
      spotCount:sr.length,futuresCount:futuresUniqueCount,futuresOnlyCount:fr.length,futuresExchangeCount:exchangeCount,futuresSources:f?.sources||{},
      coreFuturesCount:Number(f?.sources?.binance?.count)||futureRows.filter(x=>x.exchanges?.includes('binance')).length,
      universe:{core:{key:'binance-usdt-perpetual',label:'코어 유니버스 · Binance USDT 무기한',count:Number(f?.sources?.binance?.count)||futureRows.filter(x=>x.exchanges?.includes('binance')).length},extended:{key:'spot-plus-8-futures-dedup',label:'확장 유니버스 · 현물 + 8개 선물거래소 중복 제거',count:rows.length,spotCount:sr.length,futuresCount:futuresUniqueCount},dex:{key:'dex-extended-monitoring',label:'DEX 확장 감시 · 별도 집계'}},
      sourceContracts,duplicateContractsRemoved,externalOnlyCount:fr.filter(x=>x.deepSupported===false).length,
      futuresFeedOk:!!f?.ok,futuresFallback,futuresError:f?.ok?futuresError:(f?.error||futuresError||'futures feed unavailable'),
      note:'Binance 현물 + Binance/Bybit/OKX/Gate/Bitget/MEXC/KuCoin/Hyperliquid 무기한 선물. 기초자산 기준 중복 제거 후 한 코인당 한 행으로 표시'
    });
  }catch(e){return res.status(502).json({ok:false,error:e?.message||'Data fetch failed'})}
};
