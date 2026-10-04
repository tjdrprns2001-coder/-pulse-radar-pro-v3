'use strict';
const D=require('./data'),{Provider,closedCutoff}=require('./provider');
const VENUES=['okx','bybit','bitget','gate','binance'];
const URLS={bybit:'https://api.bybit.com',okx:'https://www.okx.com',bitget:'https://api.bitget.com',gate:'https://api.gateio.ws/api/v4'};
const interval={bybit:{'1M':'M','1w':'W','1d':'D','12h':'720','4h':'240','1h':'60','15m':'15','5m':'5'},okx:{'1M':'1Mutc','1w':'1Wutc','1d':'1Dutc','12h':'12Hutc','4h':'4H','1h':'1H','15m':'15m','5m':'5m'},bitget:{'1M':'1Mutc','1w':'1Wutc','1d':'1Dutc','12h':'12Hutc','4h':'4H','1h':'1H','15m':'15m','5m':'5m'},gate:{'1d':'1d','4h':'4h','1h':'1h','15m':'15m','5m':'5m'}};
function native(venue,symbol,market){const base=symbol.slice(0,-4);return venue==='okx'?base+'-USDT'+(market==='perpetual'?'-SWAP':''):venue==='gate'?base+'_USDT':symbol;}
function bar(r,tf,venue,{base=5,quote=6,closed=true}={}){const t=+r[0];return {open_time:t,close_time:D.nextOpen(t,tf)-1,open:r[1],high:r[2],low:r[3],close:r[4],base_volume:r[base]??null,quote_volume:r[quote]??null,taker_buy_base:null,taker_buy_quote:null,is_closed:closed,source_version:venue+'_rest_v1'};}
class VenueProvider extends Provider{
 constructor(venue,options){super(options);this.venue=venue;this.name=venue.toUpperCase();}
 async get(path,market,{ttl=30000,signal,deadline=4500}={}){
  const key=market+path,hit=this.cache.get(key);if(hit&&hit.until>this.now())return hit.value;
  const blocked=this.cooldown(market);if(blocked)throw blocked;if(this.flights.has(key))return this.flights.get(key);
  const task=this.requestQueued(URLS[this.venue]+path,{market,signal,deadline}).then(j=>{
   const code=this.venue==='bybit'?j.retCode:this.venue==='okx'||this.venue==='bitget'?j.code:null;
   if(code!=null&&!['0','00000'].includes(String(code)))throw new Error(this.name+' API '+code+' '+(j.retMsg||j.msg||''));
   this.cache.set(key,{value:j,until:this.now()+ttl});if(this.cache.size>200)this.cache.delete(this.cache.keys().next().value);return j;
  }).finally(()=>this.flights.delete(key));this.flights.set(key,task);return task;
 }
 async instruments(q){return require('./venue-universe').instruments(this,q);}
 async tickers(q){return require('./venue-universe').tickers(this,q);}
 async bars({symbol,tf,market='perpetual',at,limit=600,signal}){
  const v=this.venue,iv=interval[v][tf];if(!iv)throw new Error(v+' unsupported timeframe '+tf);const id=native(v,symbol,market),end=closedCutoff(at,tf),qs=x=>new URLSearchParams(x),out=[];
  if(v==='bybit'){
   const j=await this.get('/v5/market/kline?'+qs({category:market==='spot'?'spot':'linear',symbol,interval:iv,end:String(end),limit:String(Math.min(1000,limit))}),market,{signal});return (j.result?.list||[]).map(r=>bar(r,tf,v)).sort((a,b)=>a.open_time-b.open_time);
  }
  if(v==='okx'){
   let cursor=end+1;for(let page=0;page<6&&out.length<limit;page++){
    const j=await this.get('/api/v5/market/history-candles?'+qs({instId:id,bar:iv,after:String(cursor),limit:String(Math.min(100,limit-out.length))}),market,{signal});const rows=j.data||[];if(!rows.length)break;
    out.push(...rows.map(r=>bar(r,tf,v,{base:market==='spot'?5:6,quote:7,closed:r[8]==='1'})));const next=Math.min(...rows.map(r=>+r[0]));if(next>=cursor)break;cursor=next;
   }return [...new Map(out.map(x=>[x.open_time,x])).values()].sort((a,b)=>a.open_time-b.open_time).slice(-limit);
  }
  if(v==='bitget'){
   let cursor=end+1;for(let page=0;page<4&&out.length<limit;page++){
    const j=await this.get((market==='spot'?'/api/v2/spot/market/history-candles?':'/api/v2/mix/market/history-candles?')+qs({symbol,granularity:market==='spot'?({'4h':'4h','1h':'1h','15m':'15min','5m':'5min'}[tf]||iv):iv,endTime:String(cursor),limit:String(Math.min(200,limit-out.length)),...(market==='spot'?{}:{productType:'USDT-FUTURES'})}),market,{signal});const rows=j.data||[];if(!rows.length)break;out.push(...rows.map(r=>bar(r,tf,v)));const next=Math.min(...rows.map(r=>+r[0]));if(next>=cursor)break;cursor=next;
   }return [...new Map(out.map(x=>[x.open_time,x])).values()].sort((a,b)=>a.open_time-b.open_time).slice(-limit);
  }
  const step=D.TF_MS[tf],from=Math.floor((end+1-limit*step)/1000),to=Math.floor(end/1000);
  const j=await this.get((market==='spot'?'/spot/candlesticks?':'/futures/usdt/candlesticks?')+qs({[market==='spot'?'currency_pair':'contract']:id,interval:iv,from:String(from),to:String(to)}),market,{signal});
  if(market==='spot')return j.map(r=>bar([+r[0]*1000,r[5],r[3],r[4],r[2],r[6],r[1]],tf,v,{closed:r[7]==='true'||r[7]===true}));
  const meta=(await this.instruments({symbol,market,signal}))[0];return j.map(r=>bar([+r.t*1000,r.o,r.h,r.l,r.c,D.num(r.v)!=null&&meta?.contract_value>0?+r.v*meta.contract_value:null,r.sum??null],tf,v));
 }
 async flow(q){return require('./venue-flow').flow(this,q);}
}
class MultiProvider{
 constructor(options={}){this.venues=VENUES;this.clients={binance:new Provider(options),...Object.fromEntries(VENUES.filter(v=>v!=='binance').map(v=>[v,new VenueProvider(v,options)]))};}
 client(venue='binance'){if(!this.clients[venue])throw new Error('unsupported venue');return this.clients[venue];}
 instruments(q={}){return this.client(q.venue).instruments(q);}
 bars(q){return this.client(q.venue).bars(q);}
 flow(q){return this.client(q.venue).flow(q);}
 tickers(q={}){return this.client(q.venue).tickers(q);}
 cooldown(market,venue='binance'){return this.client(venue).cooldown(market);}
}
module.exports={MultiProvider,VenueProvider,VENUES,native};
