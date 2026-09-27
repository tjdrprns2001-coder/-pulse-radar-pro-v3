import {closedBars,resample3h,pct} from './indicators.mjs';
const DEFAULT_FUTURES_BASES=[
 'https://fapi.binance.com'
];
const DEFAULT_SPOT_BASES=[
 'https://api.binance.com',
 'https://api-gcp.binance.com',
 'https://api1.binance.com',
 'https://api2.binance.com',
 'https://api3.binance.com',
 'https://api4.binance.com',
 'https://data-api.binance.vision'
];
const HOST_COOLDOWN_MS=5*60*1000;
export class UpstreamError extends Error{constructor(message,status=502,retryAt=null){super(message);this.status=status;this.retryAt=retryAt;}}
export async function pool(items,limit,fn){let n=0;const result=Array(items.length);await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(n<items.length){const i=n++;try{result[i]={ok:true,value:await fn(items[i],i)};}catch(e){result[i]={ok:false,error:e.message,status:e.status,retryAt:e.retryAt};}}}));return result;}
export class Binance {
 constructor(store,fetcher=fetch,options={}){this.store=store;this.fetcher=fetcher;this.metrics={requests:0,hits:0,errors:0,weight:0,failovers:0};this.inflight=new Map();this.bases={futures:Array.isArray(options.futuresBases)&&options.futuresBases.length?options.futuresBases:DEFAULT_FUTURES_BASES,spot:Array.isArray(options.spotBases)&&options.spotBases.length?options.spotBases:DEFAULT_SPOT_BASES};this.preferred={futures:null,spot:null};}
 basesFor(market){const all=this.bases[market];const preferred=this.preferred[market];return preferred&&all.includes(preferred)?[preferred,...all.filter(x=>x!==preferred)]:all;}
 async get(path,params={},ttl=30000,spot=false){const market=spot?'spot':'futures',search=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null).map(([k,v])=>[k,String(v)])).toString(),cacheKey='binance:'+market+':'+path+(search?'?'+search:'');
 const cached=await this.store.get(cacheKey);if(cached){this.metrics.hits++;return cached;}
 if(this.inflight.has(cacheKey))return this.inflight.get(cacheKey);
 const promise=this.request(path,search,ttl,market,cacheKey);this.inflight.set(cacheKey,promise);try{return await promise;}finally{this.inflight.delete(cacheKey);}}
 async request(path,search,ttl,market,cacheKey){const blocked=await this.store.get('binance:blocked');if(blocked)throw new UpstreamError(blocked.message,429,blocked.until);
 const stats=path.startsWith('/futures/data/'),funding=path.endsWith('/fundingRate'),spot=market==='spot';
 const ms=stats||funding?300000:60000,limit=stats?900:funding?450:spot?4000:1800;
 const params=new URLSearchParams(search),l=+(params.get('limit')||500);const weight=stats||funding?1:path.endsWith('/klines')?(l<100?1:l<500?2:l<=1000?5:10):path.endsWith('/ticker/24hr')?40:1;
 const key=stats?'statistics':funding?'funding':spot?'spot':'futures';
 let lastStatus=502,lastMessage='Binance 연결 실패',attempted=0;
 for(const base of this.basesFor(market)){
   const hostBlock=await this.store.get('binance:host-blocked:'+base);if(hostBlock)continue;
   let moveNextHost=false;
   for(let attempt=0;attempt<2;attempt++){
     if(this.store.reserve&&!await this.store.reserve(key,limit,ms,weight))throw new UpstreamError('요청 예산 대기. 자동으로 이어서 실행합니다.',429,(Math.floor(Date.now()/ms)+1)*ms+1000);
     const url=base+path+(search?'?'+search:'');attempted++;this.metrics.requests++;
     let response;
     try{response=await this.fetcher(url,{signal:AbortSignal.timeout(20000),headers:{Accept:'application/json','User-Agent':'IGNITION-Scanner/1.0'}});}
     catch(e){if(!attempt)continue;this.metrics.errors++;this.metrics.failovers++;lastStatus=502;lastMessage='Binance 연결 시간 초과: '+e.message;moveNextHost=true;break;}
     this.metrics.weight=Math.max(this.metrics.weight,Number(response.headers.get('x-mbx-used-weight-1m')||0));
     if(response.status===429||response.status===418){const sec=Math.max(60,Number(response.headers.get('retry-after')||60)),until=Date.now()+sec*1000,message='Binance 요청 제한. 재시도 시각 이후 이어서 진행합니다.';await this.store.put('binance:blocked',{until,message},sec*1000);this.metrics.errors++;throw new UpstreamError(message,429,until);}
     if(response.ok){let data;try{data=await response.json();}catch(e){if(!attempt)continue;this.metrics.errors++;throw new UpstreamError('Binance 응답 읽기 실패: '+e.message);}if(path.endsWith('/exchangeInfo')&&Array.isArray(data.symbols))data={symbols:data.symbols.map(s=>({symbol:s.symbol,baseAsset:s.baseAsset,quoteAsset:s.quoteAsset,contractType:s.contractType,status:s.status}))};if(data?.code<0)throw new UpstreamError('Binance '+data.msg);await this.store.put(cacheKey,data,ttl);this.preferred[market]=base;return data;}
     if(response.status===403||response.status===451){const until=Date.now()+HOST_COOLDOWN_MS;await this.store.put('binance:host-blocked:'+base,{until,status:response.status},HOST_COOLDOWN_MS);this.metrics.errors++;this.metrics.failovers++;lastStatus=response.status;lastMessage=response.status===451?'Binance 지역 접근 제한 (451)':'Binance WAF 접근 차단 (403)';moveNextHost=true;break;}
     if(response.status>=500){if(!attempt)continue;this.metrics.errors++;this.metrics.failovers++;lastStatus=response.status;lastMessage='Binance HTTP '+response.status;moveNextHost=true;break;}
     this.metrics.errors++;throw new UpstreamError('Binance HTTP '+response.status,response.status);
   }
   if(!moveNextHost)break;
 }
 throw new UpstreamError(attempted?lastMessage:'사용 가능한 Binance 호스트 없음',lastStatus);
 }
 async universe(){const [exchange,tickers,time]=await Promise.all([this.get('/fapi/v1/exchangeInfo',{},3600000),this.get('/fapi/v1/ticker/24hr',{},30000),this.get('/fapi/v1/time',{},10000)]);if(!Array.isArray(exchange.symbols)||!Array.isArray(tickers)||!time.serverTime)throw new Error('Binance 유니버스 응답 형식 오류');const map=new Map(tickers.map(x=>[x.symbol,x]));return {asOf:time.serverTime,rows:exchange.symbols.filter(s=>s.quoteAsset==='USDT'&&s.contractType==='PERPETUAL'&&s.status==='TRADING').map(s=>{const t=map.get(s.symbol);return {symbol:s.symbol,base:s.baseAsset,price:t?+t.lastPrice:null,change:t?+t.priceChangePercent:null,quoteVolume:t?+t.quoteVolume:null,tickerAsOf:t?+t.closeTime:null};})};}
 async oi(symbol,asOf){const a=await this.get('/futures/data/openInterestHist',{symbol,period:'5m',limit:100,endTime:Math.floor(asOf/300000)*300000},60000);if(!Array.isArray(a))throw new Error('OI 응답 오류');const rows=a.filter(x=>+x.timestamp<=asOf).sort((a,b)=>+a.timestamp-+b.timestamp),end=rows.at(-1);if(!end||asOf-end.timestamp>15*60000)return {change4h:null,change8h:null,asOf:null,reason:'OI 최신 자료 없음'};const calc=hours=>{const target=+end.timestamp-hours*3600000;const start=rows.find(x=>Math.abs(+x.timestamp-target)<=60000);return start?pct(+end.sumOpenInterest,+start.sumOpenInterest):null;};return {change4h:calc(4),change8h:calc(8),asOf:+end.timestamp,value:+end.sumOpenInterest};}
 async bars(symbol,tf,asOf,limit=499){if(tf==='3h')return resample3h(await this.bars(symbol,'1h',asOf,1499),asOf);const durations={'5m':300000,'15m':900000,'1h':3600000,'2h':7200000,'4h':14400000,'12h':43200000,'1d':86400000,'3d':259200000,'1w':604800000};const duration=durations[tf];if(!duration)throw new Error('지원하지 않는 TF');const offset=tf==='1w'?345600000:0,window=Math.floor((asOf-offset)/duration);const key=`bars:${symbol}:${tf}:${limit}:${window}`;const cached=await this.store.get(key);if(cached&&asOf<cached.nextClose){this.metrics.hits++;return cached.bars.filter(b=>b.end<asOf);}const raw=await this.get('/fapi/v1/klines',{symbol,interval:tf,limit,endTime:asOf},60000);if(!Array.isArray(raw))throw new Error('캔들 응답 오류');const bars=closedBars(raw,asOf);await this.store.put(key,{bars,nextClose:(bars.at(-1)?.end??0)+duration+1},Math.min(duration,3600000));return bars;}
 async taker(symbol,asOf){const rows=await this.get('/futures/data/takerlongshortRatio',{symbol,period:'1h',limit:4,endTime:asOf},60000);const valid=rows.filter(x=>+x.timestamp+3600000<=asOf),row=valid.at(-1);return row?{ratio:+row.buySellRatio,asOf:+row.timestamp,period:'1h',direction:+row.buySellRatio>1.2?'buy':+row.buySellRatio<.8?'sell':'none'}:{ratio:null,reason:'확정 taker 구간 없음'};}
 async funding(symbol,asOf){const a=await this.get('/fapi/v1/fundingRate',{symbol,limit:1,endTime:asOf},300000);return a.length?{rate:+a[0].fundingRate,asOf:+a[0].fundingTime}:null;}
 async spotMap(){const [info,tickers]=await Promise.all([this.get('/api/v3/exchangeInfo',{},3600000,true),this.get('/api/v3/ticker/24hr',{type:'MINI'},30000,true)]);const allowed=new Set(info.symbols.filter(x=>x.quoteAsset==='USDT'&&x.status==='TRADING').map(x=>x.symbol));return tickers.filter(x=>allowed.has(x.symbol));}
 async spot(symbol,asOf){const raw=await this.get('/api/v3/klines',{symbol,interval:'1h',limit:35,endTime:asOf},60000,true);return closedBars(raw,asOf);}
}
