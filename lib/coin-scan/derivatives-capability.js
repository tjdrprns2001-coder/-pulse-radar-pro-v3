'use strict';

const DEFAULT_TIMEOUT_MS=7000;
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function baseAsset(symbol){const s=String(symbol||'').toUpperCase();return s.endsWith('USDT')?s.slice(0,-4):s}
function pct(a,b){return Number.isFinite(a)&&a!==0&&Number.isFinite(b)?((b/a)-1)*100:null}
function weighted(rows,key,weightKey='openInterestUsd'){
  const usable=(rows||[]).filter(x=>Number.isFinite(x?.[key])&&Number.isFinite(x?.[weightKey])&&x[weightKey]>0);
  if(!usable.length)return null;
  const w=usable.reduce((s,x)=>s+x[weightKey],0);
  return w>0?usable.reduce((s,x)=>s+x[key]*x[weightKey],0)/w:null;
}
function last(a){return Array.isArray(a)&&a.length?a[a.length-1]:null}
function historyDeltas(rows){
  const a=(rows||[]).filter(x=>Number.isFinite(x?.openInterest)&&Number.isFinite(x?.timestamp)).sort((x,y)=>x.timestamp-y.timestamp);
  if(a.length<2)return{oi1hPct:null,oi4hPct:null,oi24hPct:null};
  const cur=a[a.length-1];
  const atHours=h=>{
    const target=cur.timestamp-h*3600000;
    let best=null;
    for(const x of a){if(x.timestamp<=target)best=x;else break}
    if(!best)best=a[Math.max(0,a.length-1-h)];
    return best&&best.openInterest>0?pct(best.openInterest,cur.openInterest):null
  };
  return{oi1hPct:atHours(1),oi4hPct:atHours(4),oi24hPct:atHours(24)}
}
function statusFor(v){
  if(v.queryError&&!v.supportKnown)return'query_error';
  if(v.supported===false)return'unsupported';
  if(v.supported===true){
    const any=[v.openInterestUsd,v.openInterest,v.fundingRatePct,v.volume24hUsd,v.oi1hPct,v.oi4hPct,v.oi24hPct].some(Number.isFinite);
    return any?'data_normal':'provider_data_unavailable';
  }
  return v.queryError?'query_error':'unknown';
}
function availabilityStatus({derivativesSupported,dataAvailable,status,supportedVenues=[],dataVenues=[],mappingMissing=false}={}){
  if(mappingMissing)return'mapping_missing';
  if(status==='query_error'&&derivativesSupported!==true)return'query_error';
  if(derivativesSupported===false)return'not_supported';
  if(derivativesSupported===true&&!dataAvailable)return'supported_but_empty';
  if(dataAvailable&&supportedVenues.length&&dataVenues.length<supportedVenues.length)return'partial';
  if(dataAvailable)return'available';
  return status==='query_error'?'query_error':'mapping_missing'
}
function normalizeFunding(rateFraction,intervalHours){
  const rate=finite(rateFraction),hours=finite(intervalHours);
  const fundingRatePct=rate==null?null:rate*100;
  const funding8hEquivalentPct=fundingRatePct!=null&&hours>0?fundingRatePct*(8/hours):null;
  return{fundingRatePct,fundingIntervalHours:hours,funding8hEquivalentPct}
}
function createDerivativesCapabilityProvider({fetchImpl=globalThis.fetch,cache=null,now=()=>Date.now(),timeoutMs=DEFAULT_TIMEOUT_MS}={}){
  if(typeof fetchImpl!=='function')throw new Error('fetch implementation required');
  const local=new Map();
  function cget(k){if(cache?.get){const x=cache.get(k);if(x!=null)return x}const x=local.get(k);if(!x||x.exp<=now()){local.delete(k);return null}return x.value}
  function cset(k,v,ttl){if(cache?.set)try{cache.set(k,v,ttl)}catch{}local.set(k,{value:v,exp:now()+ttl});return v}
  async function json(url,key,ttl=30000){
    const ck='deriv-cap:'+key,c=cget(ck);if(c!=null)return c;
    const signal=typeof AbortSignal!=='undefined'&&AbortSignal.timeout?AbortSignal.timeout(timeoutMs):undefined;
    const res=await fetchImpl(url,{headers:{accept:'application/json','user-agent':'PulseRadar-Pro-v5'},signal});
    if(!res?.ok){const e=new Error('HTTP '+(res?.status||'ERR'));e.status=Number(res?.status)||null;throw e}
    return cset(ck,await res.json(),ttl)
  }
  function fail(venue,e,supportKnown=false,supported=null,contract=null){
    return{venue,supportKnown,supported,contract,openInterest:null,openInterestUsd:null,volume24hUsd:null,fundingRatePct:null,fundingIntervalHours:null,funding8hEquivalentPct:null,oi1hPct:null,oi4hPct:null,oi24hPct:null,queryError:String(e?.message||e),status:'query_error'}
  }
  async function probeBinance(symbol){
    const s=String(symbol||'').toUpperCase(),venue='BINANCE';
    try{
      const ex=await json('https://fapi.binance.com/fapi/v1/exchangeInfo','binance:exchangeInfo',300000);
      const inst=(ex?.symbols||[]).find(x=>String(x?.symbol).toUpperCase()===s);
      if(!inst)return{...fail(venue,'contract not listed',true,false),queryError:null,status:'unsupported'};
      const supported=String(inst.status||'')==='TRADING'&&String(inst.contractType||'')==='PERPETUAL';
      if(!supported)return{...fail(venue,'contract not active',true,false),queryError:null,status:'unsupported'};
      const [oi,mark,ticker,hist]=await Promise.all([
        json('https://fapi.binance.com/fapi/v1/openInterest?symbol='+encodeURIComponent(s),'binance:oi:'+s,15000).catch(()=>null),
        json('https://fapi.binance.com/fapi/v1/premiumIndex?symbol='+encodeURIComponent(s),'binance:mark:'+s,15000).catch(()=>null),
        json('https://fapi.binance.com/fapi/v1/ticker/24hr?symbol='+encodeURIComponent(s),'binance:ticker:'+s,15000).catch(()=>null),
        json('https://fapi.binance.com/futures/data/openInterestHist?symbol='+encodeURIComponent(s)+'&period=1h&limit=25','binance:oiHist:'+s,30000).catch(()=>[])
      ]);
      const rows=(Array.isArray(hist)?hist:[]).map(x=>({timestamp:finite(x?.timestamp),openInterest:finite(x?.sumOpenInterest)})).filter(x=>x.timestamp!=null&&x.openInterest!=null);
      const histLast=last(rows),oiBase=finite(oi?.openInterest)??finite(histLast?.openInterest),markPrice=finite(mark?.markPrice)??finite(ticker?.lastPrice),oiUsd=oiBase!=null&&markPrice!=null?oiBase*markPrice:null;
      const d=historyDeltas(rows),fund=normalizeFunding(mark?.lastFundingRate,inst?.fundingIntervalHours??8);
      const out={venue,supportKnown:true,supported:true,contract:{symbol:s,quote:'USDT',type:'PERPETUAL'},openInterest:oiBase,openInterestUnit:'BASE',openInterestUsd:oiUsd,volume24hUsd:finite(ticker?.quoteVolume),markPrice,...fund,...d,queryError:null};
      out.status=statusFor(out);return out
    }catch(e){return fail(venue,e,false,null,{symbol:s,quote:'USDT',type:'PERPETUAL'})}
  }
  async function probeBybit(symbol){
    const s=String(symbol||'').toUpperCase(),venue='BYBIT';
    try{
      const ins=await json('https://api.bybit.com/v5/market/instruments-info?category=linear&symbol='+encodeURIComponent(s),'bybit:instrument:'+s,300000);
      if(Number(ins?.retCode)!==0)throw new Error('Bybit '+String(ins?.retMsg||ins?.retCode));
      const inst=ins?.result?.list?.[0];
      if(!inst)return{...fail(venue,'contract not listed',true,false),queryError:null,status:'unsupported'};
      const supported=String(inst.status)==='Trading'&&String(inst.quoteCoin)==='USDT'&&/Perpetual/i.test(String(inst.contractType||''));
      if(!supported)return{...fail(venue,'contract not active',true,false),queryError:null,status:'unsupported'};
      const [tick,hist]=await Promise.all([
        json('https://api.bybit.com/v5/market/tickers?category=linear&symbol='+encodeURIComponent(s),'bybit:ticker:'+s,15000).catch(()=>null),
        json('https://api.bybit.com/v5/market/open-interest?category=linear&symbol='+encodeURIComponent(s)+'&intervalTime=1h&limit=25','bybit:oiHist:'+s,30000).catch(()=>null)
      ]);
      const t=tick?.result?.list?.[0],oiBase=finite(t?.openInterest),lastPrice=finite(t?.lastPrice),oiUsd=finite(t?.openInterestValue)??(oiBase!=null&&lastPrice!=null?oiBase*lastPrice:null);
      const rows=(hist?.result?.list||[]).map(x=>({timestamp:finite(x?.timestamp),openInterest:finite(x?.openInterest)})).filter(x=>x.timestamp!=null&&x.openInterest!=null).sort((a,b)=>a.timestamp-b.timestamp);
      const d=historyDeltas(rows),fund=normalizeFunding(t?.fundingRate,finite(inst?.fundingInterval)/60||8);
      const out={venue,supportKnown:true,supported:true,contract:{symbol:s,quote:'USDT',type:'PERPETUAL',fundingIntervalMinutes:finite(inst?.fundingInterval)},openInterest:oiBase,openInterestUnit:'BASE',openInterestUsd:oiUsd,volume24hUsd:finite(t?.turnover24h),markPrice:finite(t?.markPrice)??lastPrice,...fund,...d,queryError:null};
      out.status=statusFor(out);return out
    }catch(e){return fail(venue,e,false,null,{symbol:s,quote:'USDT',type:'PERPETUAL'})}
  }
  async function probeOkx(symbol){
    const s=String(symbol||'').toUpperCase(),base=baseAsset(s),instId=base+'-USDT-SWAP',venue='OKX';
    try{
      const ins=await json('https://www.okx.com/api/v5/public/instruments?instType=SWAP&instId='+encodeURIComponent(instId),'okx:instrument:'+instId,300000);
      if(String(ins?.code??'0')!=='0')throw new Error('OKX '+String(ins?.msg||ins?.code));
      const inst=ins?.data?.[0];
      if(!inst)return{...fail(venue,'contract not listed',true,false),queryError:null,status:'unsupported'};
      const supported=String(inst.state||'live')==='live';
      if(!supported)return{...fail(venue,'contract not active',true,false),queryError:null,status:'unsupported'};
      const [oi,fund,tick]=await Promise.all([
        json('https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId='+encodeURIComponent(instId),'okx:oi:'+instId,15000).catch(()=>null),
        json('https://www.okx.com/api/v5/public/funding-rate?instId='+encodeURIComponent(instId),'okx:fund:'+instId,15000).catch(()=>null),
        json('https://www.okx.com/api/v5/market/ticker?instId='+encodeURIComponent(instId),'okx:ticker:'+instId,15000).catch(()=>null)
      ]);
      const o=oi?.data?.[0],f=fund?.data?.[0],t=tick?.data?.[0],mark=finite(t?.last),oiUsd=finite(o?.oiUsd),oiCcy=finite(o?.oiCcy);
      const intervalMs=finite(f?.nextFundingTime)!=null&&finite(f?.fundingTime)!=null?finite(f.nextFundingTime)-finite(f.fundingTime):null;
      const fundNorm=normalizeFunding(f?.fundingRate,intervalMs>0?intervalMs/3600000:8);
      const out={venue,supportKnown:true,supported:true,contract:{symbol:instId,quote:'USDT',type:'SWAP',ctVal:finite(inst?.ctVal),ctValCcy:inst?.ctValCcy||null},openInterest:oiCcy??finite(o?.oi),openInterestUnit:oiCcy!=null?'BASE':'CONTRACTS',openInterestUsd:oiUsd,volume24hUsd:finite(t?.volCcy24h)!=null&&mark!=null?finite(t.volCcy24h)*mark:null,markPrice:mark,...fundNorm,oi1hPct:null,oi4hPct:null,oi24hPct:null,queryError:null};
      out.status=statusFor(out);return out
    }catch(e){return fail(venue,e,false,null,{symbol:instId,quote:'USDT',type:'SWAP'})}
  }
  async function probeGate(symbol){
    const s=String(symbol||'').toUpperCase(),contract=baseAsset(s)+'_USDT',venue='GATE';
    try{
      const inst=await json('https://api.gateio.ws/api/v4/futures/usdt/contracts/'+encodeURIComponent(contract),'gate:contract:'+contract,300000);
      if(!inst||String(inst?.name||'').toUpperCase()!==contract)return{...fail(venue,'contract not listed',true,false),queryError:null,status:'unsupported'};
      const supported=String(inst?.status||'trading').toLowerCase()==='trading';
      if(!supported)return{...fail(venue,'contract not active',true,false),queryError:null,status:'unsupported'};
      const stats=await json('https://api.gateio.ws/api/v4/futures/usdt/contract_stats?contract='+encodeURIComponent(contract)+'&interval=1h&limit=25','gate:stats:'+contract,30000).catch(()=>[]);
      const rows=(Array.isArray(stats)?stats:[]).map(x=>({timestamp:(finite(x?.time)||0)*1000,openInterest:finite(x?.open_interest)})).filter(x=>x.timestamp>0&&x.openInterest!=null);
      const d=historyDeltas(rows),mark=finite(inst?.mark_price),contracts=finite(inst?.open_interest)??finite(last(rows)?.openInterest),mult=finite(inst?.quanto_multiplier),oiUsd=finite(inst?.open_interest_usd)??(contracts!=null&&mult!=null&&mark!=null?contracts*mult*mark:null);
      const intervalSeconds=finite(inst?.funding_interval),fund=normalizeFunding(inst?.funding_rate,intervalSeconds>0?intervalSeconds/3600:8);
      const out={venue,supportKnown:true,supported:true,contract:{symbol:contract,quote:'USDT',type:'PERPETUAL',quantoMultiplier:mult},openInterest:contracts,openInterestUnit:'CONTRACTS',openInterestUsd:oiUsd,volume24hUsd:null,markPrice:mark,...fund,...d,queryError:null};
      out.status=statusFor(out);return out
    }catch(e){
      if(Number(e?.status)===404)return{...fail(venue,'contract not listed',true,false),queryError:null,status:'unsupported'};
      return fail(venue,e,false,null,{symbol:contract,quote:'USDT',type:'PERPETUAL'})
    }
  }
  async function probe(symbol){
    const s=String(symbol||'').trim().toUpperCase();
    const venues=await Promise.all([probeBinance(s),probeBybit(s),probeOkx(s),probeGate(s)]);
    const supportedVenues=venues.filter(x=>x.supported===true),dataVenues=venues.filter(x=>x.status==='data_normal');
    const derivativesSupported=supportedVenues.length>0,dataAvailable=dataVenues.length>0;
    const oiUsd=dataVenues.reduce((sum,x)=>sum+(finite(x.openInterestUsd)||0),0)||null;
    const aggregate={
      openInterestUsd:oiUsd,
      oi1hPct:weighted(dataVenues,'oi1hPct'),
      oi4hPct:weighted(dataVenues,'oi4hPct'),
      oi24hPct:weighted(dataVenues,'oi24hPct'),
      funding8hPct:weighted(dataVenues,'funding8hEquivalentPct'),
      volume24hUsd:dataVenues.reduce((sum,x)=>sum+(finite(x.volume24hUsd)||0),0)||null
    };
    let status='unknown';
    if(!derivativesSupported&&venues.every(x=>x.supportKnown===true))status='unsupported';
    else if(derivativesSupported&&!dataAvailable)status='provider_data_unavailable';
    else if(dataAvailable&&dataVenues.length<supportedVenues.length)status='partial_venue_data';
    else if(dataAvailable)status='data_normal';
    else if(venues.some(x=>x.status==='query_error'))status='query_error';
    return{
      symbol:s,
      baseAsset:baseAsset(s),
      derivativesSupported,
      dataAvailable,
      status,
      availabilityStatus:availabilityStatus({derivativesSupported,dataAvailable,status,supportedVenues:supportedVenues.map(x=>x.venue),dataVenues:dataVenues.map(x=>x.venue)}),
      supportedVenues:supportedVenues.map(x=>x.venue),
      dataVenues:dataVenues.map(x=>x.venue),
      quoteCurrencies:['USDT'],
      contractTypes:['PERPETUAL','SWAP'],
      aggregate,
      venues,
      observedAt:now(),
      estimated:false
    }
  }
  async function getSupportUniverse(){
    const bySymbol=new Map();
    const add=(symbol,venue,contract)=>{
      const s=String(symbol||'').toUpperCase();if(!s.endsWith('USDT'))return;
      if(!bySymbol.has(s))bySymbol.set(s,{symbol:s,baseAsset:baseAsset(s),supportedVenues:[],contracts:[]});
      const x=bySymbol.get(s);if(!x.supportedVenues.includes(venue))x.supportedVenues.push(venue);x.contracts.push({venue,...contract});
    };
    const errors=[];
    await Promise.all([
      (async()=>{try{const x=await json('https://fapi.binance.com/fapi/v1/exchangeInfo','binance:exchangeInfo',300000);for(const i of x?.symbols||[])if(String(i?.status)==='TRADING'&&String(i?.contractType)==='PERPETUAL'&&String(i?.quoteAsset)==='USDT')add(i.symbol,'BINANCE',{symbol:i.symbol,quote:'USDT',type:'PERPETUAL'})}catch(e){errors.push({venue:'BINANCE',error:String(e?.message||e)})}})(),
      (async()=>{try{let cursor='',pages=0;do{const suffix=cursor?'&cursor='+encodeURIComponent(cursor):'';const x=await json('https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000'+suffix,'bybit:universe:'+cursor,300000);if(Number(x?.retCode)!==0)throw new Error('Bybit '+String(x?.retMsg||x?.retCode));for(const i of x?.result?.list||[])if(String(i?.status)==='Trading'&&String(i?.quoteCoin)==='USDT'&&/Perpetual/i.test(String(i?.contractType||'')))add(i.symbol,'BYBIT',{symbol:i.symbol,quote:'USDT',type:'PERPETUAL',fundingIntervalMinutes:finite(i?.fundingInterval)});cursor=String(x?.result?.nextPageCursor||'');pages++}while(cursor&&pages<4)}catch(e){errors.push({venue:'BYBIT',error:String(e?.message||e)})}})(),
      (async()=>{try{const x=await json('https://www.okx.com/api/v5/public/instruments?instType=SWAP','okx:universe',300000);if(String(x?.code??'0')!=='0')throw new Error('OKX '+String(x?.msg||x?.code));for(const i of x?.data||[])if(String(i?.state||'live')==='live'&&String(i?.instId||'').endsWith('-USDT-SWAP')){const b=String(i.instId).split('-')[0].toUpperCase();add(b+'USDT','OKX',{symbol:i.instId,quote:'USDT',type:'SWAP',ctVal:finite(i?.ctVal),ctValCcy:i?.ctValCcy||null})}}catch(e){errors.push({venue:'OKX',error:String(e?.message||e)})}})(),
      (async()=>{try{const x=await json('https://api.gateio.ws/api/v4/futures/usdt/contracts','gate:universe',300000);for(const i of Array.isArray(x)?x:[])if(String(i?.status||'').toLowerCase()==='trading'&&String(i?.name||'').toUpperCase().endsWith('_USDT'))add(String(i.name).toUpperCase().replace('_',''),'GATE',{symbol:i.name,quote:'USDT',type:'PERPETUAL',quantoMultiplier:finite(i?.quanto_multiplier)})}catch(e){errors.push({venue:'GATE',error:String(e?.message||e)})}})()
    ]);
    const items=[...bySymbol.values()].sort((a,b)=>a.symbol.localeCompare(b.symbol));
    return{status:items.length?'ok':'unavailable',count:items.length,items,errors,observedAt:now()}
  }
  async function probeMany(symbols,{concurrency=4}={}){
    const list=Array.from(new Set((symbols||[]).map(x=>String(x||'').trim().toUpperCase()).filter(Boolean)));
    const out=new Array(list.length);let next=0;
    async function worker(){while(true){const i=next++;if(i>=list.length)return;out[i]=await probe(list[i])}}
    await Promise.all(Array.from({length:Math.max(1,Math.min(Number(concurrency)||4,list.length||1))},worker));
    return out
  }
  return{probe,probeMany,getSupportUniverse,probeBinance,probeBybit,probeOkx,probeGate}
}
module.exports={createDerivativesCapabilityProvider,finite,baseAsset,historyDeltas,statusFor,availabilityStatus,normalizeFunding};
