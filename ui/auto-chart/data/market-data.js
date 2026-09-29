(function(root,factory){const dep=typeof module==='object'&&module.exports?{Normalize:require('./normalize.js')}: {Normalize:root.PulseAutoChartNormalize};const api=factory(dep);if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartMarketData=api;})(typeof globalThis!=='undefined'?globalThis:this,function({Normalize}){'use strict';
const getCD=()=>typeof window!=='undefined'?window.PulseChartData:null;
async function json(url,fetchImpl){const f=fetchImpl||(typeof fetch==='function'?fetch:null);if(!f)throw new Error('fetch unavailable');const r=await f(url,{cache:'no-store',headers:{accept:'application/json'}}),j=await r.json().catch(()=>null);if(!r.ok||!j?.ok)throw new Error(j?.error||('HTTP '+r.status));return j}
async function fetchHistorical({exchange='binance',market='futures',symbol='BTCUSDT',interval='4h',limit=600,refresh=false,fetchImpl}={}){
  if(exchange!=='binance')throw new Error('Auto Chart v1 supports Binance only');
  const CD=getCD();
  let raw;
  if(CD?.fetchStructure)raw=await CD.fetchStructure({symbol,interval,limit,market,cacheBust:refresh?Date.now():null,fetchImpl});
  else raw=await json('/api/structure?symbol='+encodeURIComponent(symbol)+'&interval='+encodeURIComponent(interval)+'&market='+encodeURIComponent(market)+'&limit='+limit+(refresh?'&refresh='+Date.now():''),fetchImpl);
  return Normalize.normalizeStructure(raw,{exchange,market,symbol,interval});
}
async function fetchMeta({market='futures',symbol='BTCUSDT',fetchImpl}={}){const CD=getCD();if(CD?.fetchMarketMeta)return CD.fetchMarketMeta({symbol,market,fetchImpl});return json('/api/structure?symbol='+encodeURIComponent(symbol)+'&meta=1&market='+encodeURIComponent(market),fetchImpl)}
async function fetchLive({market='futures',symbol='BTCUSDT',fetchImpl}={}){const CD=getCD();if(CD?.fetchLive)return CD.fetchLive({symbol,interval:'1m',market,fetchImpl});return json('/api/structure?symbol='+encodeURIComponent(symbol)+'&interval=1m&live=1&market='+encodeURIComponent(market),fetchImpl)}
async function fetchDerivatives({symbol='BTCUSDT',fetchImpl}={}){const raw=await json('/api/structure?symbol='+encodeURIComponent(symbol)+'&derivatives=1',fetchImpl);return Normalize.normalizeDerivatives(raw)}
async function fetchAuxiliary({exchange='binance',market='futures',symbol='BTCUSDT',interval='4h',fetchImpl}={}){
  const metaP=fetchMeta({market,symbol,fetchImpl}).catch(e=>({available:false,error:e.message}));
  const liveP=fetchLive({market,symbol,fetchImpl}).catch(e=>({available:false,error:e.message}));
  const derivativesP=market==='futures'?fetchDerivatives({symbol,fetchImpl}).catch(e=>({available:false,error:e.message})):Promise.resolve({available:false,spotMarket:true});
  const spotP=market==='futures'?fetchHistorical({exchange,market:'spot',symbol,interval,limit:300,fetchImpl}).catch(()=>null):Promise.resolve(null);
  const [meta,live,derivatives,spot]=await Promise.all([metaP,liveP,derivativesP,spotP]);
  return{meta,live,derivatives,spot};
}
return{fetchHistorical,fetchMeta,fetchLive,fetchDerivatives,fetchAuxiliary};
});