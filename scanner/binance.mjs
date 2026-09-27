import {closedBars,resample3h,pct} from './indicators.mjs';
import {BINANCE_USDT_PERPETUALS,BINANCE_UNIVERSE_AS_OF} from './binance-universe-snapshot.mjs';

const DEFAULT_FUTURES_BASES=['https://fapi.binance.com'];
const DEFAULT_SPOT_BASES=[
  'https://api.binance.com',
  'https://api-gcp.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
  'https://api4.binance.com',
  'https://data-api.binance.vision'
];
const BYBIT='https://api.bybit.com';
const HOST_COOLDOWN_MS=5*60*1000;
const DURATIONS={
  '5m':300000,'15m':900000,'1h':3600000,'2h':7200000,'3h':10800000,
  '4h':14400000,'12h':43200000,'1d':86400000,'3d':259200000,'1w':604800000
};
const BYBIT_INTERVAL={'5m':'5','15m':'15','1h':'60','2h':'120','4h':'240','12h':'720','1d':'D','1w':'W'};
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
export function retryAtFromHeader(value,now=Date.now()){
  const raw=Number(value);
  if(!Number.isFinite(raw)||raw<=0)return now+60000;
  if(raw>1e12)return Math.max(now+1000,raw);
  if(raw>1e9)return Math.max(now+1000,raw*1000);
  return now+Math.max(60,Math.min(3600,raw))*1000;
}

export class UpstreamError extends Error{
  constructor(message,status=502,retryAt=null){super(message);this.status=status;this.retryAt=retryAt;}
}

export async function pool(items,limit,fn){
  let cursor=0;const result=Array(items.length);
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
    while(cursor<items.length){
      const i=cursor++;
      try{result[i]={ok:true,value:await fn(items[i],i)};}
      catch(e){result[i]={ok:false,error:e?.message||String(e),status:e?.status,retryAt:e?.retryAt};}
    }
  }));
  return result;
}

function aggregateBars(rows,duration,asOf){
  const groups=new Map();
  for(const b of rows){
    const t=Math.floor(b.t/duration)*duration;
    if(!groups.has(t))groups.set(t,[]);
    groups.get(t).push(b);
  }
  return [...groups].sort((a,b)=>a[0]-b[0]).flatMap(([t,a])=>{
    a.sort((x,y)=>x.t-y.t);
    const expected=Math.round(duration/86400000);
    if(a.length<expected||t+duration>asOf)return[];
    return[{
      t,o:a[0].o,h:Math.max(...a.map(x=>x.h)),l:Math.min(...a.map(x=>x.l)),
      c:a.at(-1).c,v:a.reduce((s,x)=>s+x.v,0),q:a.reduce((s,x)=>s+x.q,0),
      buy:a.every(x=>Number.isFinite(x.buy))?a.reduce((s,x)=>s+x.buy,0):null,
      end:t+duration-1,_source:'BYBIT_LINEAR'
    }];
  });
}

export class Binance{
  constructor(store,fetcher=fetch,options={}){
    this.store=store;
    this.fetcher=fetcher;
    this.metrics={requests:0,hits:0,errors:0,weight:0,futuresWeight:0,spotWeight:0,failovers:0};
    this.inflight=new Map();
    this.bases={
      futures:Array.isArray(options.futuresBases)&&options.futuresBases.length?options.futuresBases:DEFAULT_FUTURES_BASES,
      spot:Array.isArray(options.spotBases)&&options.spotBases.length?options.spotBases:DEFAULT_SPOT_BASES
    };
    this.preferred={futures:null,spot:null};
    this.fallbackSources=new Set();
    this.universeAllowlist=options.universeAllowlist instanceof Set?options.universeAllowlist:BINANCE_USDT_PERPETUALS;
    this.universeAllowlistAsOf=Number(options.universeAllowlistAsOf||BINANCE_UNIVERSE_AS_OF)||null;
  }

  sourceSummary(){return this.fallbackSources.size?['BINANCE_PRIMARY',...this.fallbackSources]:['BINANCE_PRIMARY'];}
  markFallback(source){if(!this.fallbackSources.has(source))this.metrics.failovers++;this.fallbackSources.add(source);}
  basesFor(market){
    const all=this.bases[market],preferred=this.preferred[market];
    return preferred&&all.includes(preferred)?[preferred,...all.filter(x=>x!==preferred)]:all;
  }

  async get(path,params={},ttl=30000,spot=false){
    const market=spot?'spot':'futures';
    const search=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null).map(([k,v])=>[k,String(v)])).toString();
    const cacheKey='binance:'+market+':'+path+(search?'?'+search:'');
    const cached=await this.store.get(cacheKey);
    if(cached){this.metrics.hits++;return cached;}
    if(this.inflight.has(cacheKey))return this.inflight.get(cacheKey);
    const promise=this.request(path,search,ttl,market,cacheKey);
    this.inflight.set(cacheKey,promise);
    try{return await promise;}finally{this.inflight.delete(cacheKey);}
  }

  async request(path,search,ttl,market,cacheKey){
    const blocked=await this.store.get('binance:blocked:'+market);
    if(blocked)throw new UpstreamError(blocked.message,429,blocked.until);
    const stats=path.startsWith('/futures/data/'),funding=path.endsWith('/fundingRate'),spot=market==='spot';
    const ms=stats||funding?300000:60000,limit=stats?900:funding?450:spot?4000:1800;
    const params=new URLSearchParams(search),l=+(params.get('limit')||500);
    const weight=stats||funding?1:path.endsWith('/klines')?(l<100?1:l<500?2:l<=1000?5:10):path.endsWith('/ticker/24hr')?40:1;
    const key=stats?'statistics':funding?'funding':spot?'spot':'futures';
    let lastStatus=502,lastMessage='Binance 연결 실패',attempted=0;
    for(const base of this.basesFor(market)){
      if(await this.store.get('binance:host-blocked:'+base))continue;
      let moveNext=false;
      for(let attempt=0;attempt<2;attempt++){
        if(this.store.reserve&&!await this.store.reserve(key,limit,ms,weight)){
          throw new UpstreamError('요청 예산 대기. 자동으로 이어서 실행합니다.',429,(Math.floor(Date.now()/ms)+1)*ms+1000);
        }
        const url=base+path+(search?'?'+search:'');attempted++;this.metrics.requests++;
        let response;
        try{
          response=await this.fetcher(url,{signal:AbortSignal.timeout(20000),headers:{Accept:'application/json','User-Agent':'IGNITION-Scanner/1.0'}});
        }catch(e){
          if(!attempt)continue;
          this.metrics.errors++;lastStatus=502;lastMessage='Binance 연결 시간 초과: '+e.message;moveNext=true;break;
        }
        const observedWeight=Number(response.headers.get('x-mbx-used-weight-1m')||0);
        this.metrics.weight=Math.max(this.metrics.weight,observedWeight);
        this.metrics[market+'Weight']=Math.max(Number(this.metrics[market+'Weight']||0),observedWeight);
        if(response.status===429||response.status===418){
          const now=Date.now(),until=retryAtFromHeader(response.headers.get('retry-after'),now);
          const ttl=Math.max(1000,Math.min(3600000,until-now));
          const message='Binance 요청 제한. 재시도 시각 이후 이어서 진행합니다.';
          await this.store.put('binance:blocked:'+market,{until,message},ttl);
          this.metrics.errors++;
          throw new UpstreamError(message,429,until);
        }
        if(response.ok){
          let data;
          try{data=await response.json();}
          catch(e){if(!attempt)continue;this.metrics.errors++;throw new UpstreamError('Binance 응답 읽기 실패: '+e.message);}
          if(path.endsWith('/exchangeInfo')&&Array.isArray(data.symbols)){
            data={symbols:data.symbols.map(s=>({symbol:s.symbol,baseAsset:s.baseAsset,quoteAsset:s.quoteAsset,contractType:s.contractType,status:s.status}))};
          }
          if(data?.code<0)throw new UpstreamError('Binance '+data.msg);
          await this.store.put(cacheKey,data,ttl);
          this.preferred[market]=base;
          return data;
        }
        if(response.status===403||response.status===451){
          await this.store.put('binance:host-blocked:'+base,{until:Date.now()+HOST_COOLDOWN_MS,status:response.status},HOST_COOLDOWN_MS);
          this.metrics.errors++;lastStatus=response.status;
          lastMessage=response.status===451?'Binance 지역 접근 제한 (451)':'Binance WAF 접근 차단 (403)';
          moveNext=true;break;
        }
        if(response.status>=500){
          if(!attempt)continue;
          this.metrics.errors++;lastStatus=response.status;lastMessage='Binance HTTP '+response.status;moveNext=true;break;
        }
        this.metrics.errors++;
        throw new UpstreamError('Binance HTTP '+response.status,response.status);
      }
      if(!moveNext)break;
    }
    throw new UpstreamError(attempted?lastMessage:'사용 가능한 Binance 호스트 없음',lastStatus);
  }

  async bybitGet(path,ttl=30000,key=path){
    const cacheKey='bybit:'+key,cached=await this.store.get(cacheKey);
    if(cached){this.metrics.hits++;return cached;}
    if(this.inflight.has(cacheKey))return this.inflight.get(cacheKey);
    const task=(async()=>{
      this.metrics.requests++;
      let response;
      try{response=await this.fetcher(BYBIT+path,{signal:AbortSignal.timeout(15000),headers:{Accept:'application/json','User-Agent':'IGNITION-Scanner/1.0'}});}
      catch(e){this.metrics.errors++;throw new UpstreamError('Bybit 연결 실패: '+e.message,502);}
      if(!response.ok){this.metrics.errors++;throw new UpstreamError('Bybit HTTP '+response.status,response.status);}
      const body=await response.json();
      if(Number(body?.retCode)!==0)throw new UpstreamError('Bybit '+String(body?.retMsg||body?.retCode||'error'),502);
      await this.store.put(cacheKey,body,ttl);
      this.markFallback('BYBIT_LINEAR_FALLBACK');
      return body;
    })().finally(()=>this.inflight.delete(cacheKey));
    this.inflight.set(cacheKey,task);
    return task;
  }

  async futuresTickerSnapshot(timeoutMs=10000){
    const WS=globalThis.WebSocket;
    if(typeof WS!=='function')throw new UpstreamError('Binance WebSocket 클라이언트 사용 불가',502);
    return await new Promise((resolve,reject)=>{
      let settled=false,ws,timer;
      const finish=(err,value)=>{if(settled)return;settled=true;clearTimeout(timer);try{ws?.close();}catch{}err?reject(err):resolve(value);};
      try{ws=new WS('wss://fstream.binance.com/ws/!ticker@arr');}
      catch(e){return finish(new UpstreamError('Binance ticker WebSocket 연결 실패: '+e.message,502));}
      timer=setTimeout(()=>finish(new UpstreamError('Binance ticker WebSocket 시간 초과',502)),timeoutMs);
      ws.addEventListener('message',event=>{
        try{
          const payload=JSON.parse(typeof event.data==='string'?event.data:String(event.data));
          const list=Array.isArray(payload)?payload:Array.isArray(payload?.data)?payload.data:null;
          if(!list?.length)return;
          const rows=list.map(x=>({symbol:x.s,lastPrice:x.c,priceChangePercent:x.P,quoteVolume:x.q,closeTime:+x.E||Date.now()})).filter(x=>x.symbol);
          if(rows.length)finish(null,{rows,asOf:Math.max(...rows.map(x=>+x.closeTime||0)),source:'BINANCE_FUTURES_WS'});
        }catch{}
      });
      ws.addEventListener('error',()=>finish(new UpstreamError('Binance ticker WebSocket 오류',502)));
    });
  }

  async bybitUniverse(){
    const tickers=await this.bybitGet('/v5/market/tickers?category=linear',30000,'linear:tickers');
    const tickerMap=new Map((tickers?.result?.list||[]).map(x=>[String(x?.symbol||'').toUpperCase(),x]));
    const now=Date.now();
    let covered=0;
    const rows=[...BINANCE_USDT_PERPETUALS].map(symbol=>{
      const x=tickerMap.get(symbol);
      if(x)covered++;
      return{
        symbol,
        base:String(symbol).endsWith('USDT')?String(symbol).slice(0,-4):String(symbol),
        price:x?n(x.lastPrice):null,
        change:x&&n(x.price24hPcnt)!=null?n(x.price24hPcnt)*100:null,
        quoteVolume:x?n(x.turnover24h):null,
        tickerAsOf:x?now:null,
        marketSource:x?'BYBIT_LINEAR_FALLBACK':'UNAVAILABLE'
      };
    });
    if(!covered)throw new UpstreamError('Bybit에서 Binance 유니버스 가격 데이터를 찾지 못했습니다.',502);
    return{
      asOf:now,
      rows,
      source:'BYBIT_LINEAR_FALLBACK',
      universeSnapshotAsOf:BINANCE_UNIVERSE_AS_OF,
      coverage:{total:rows.length,available:covered,ratio:covered/rows.length}
    };
  }

  async universe(){
    try{
      const snap=await this.futuresTickerSnapshot();
      const rows=(snap.rows||[])
        .filter(t=>/^[A-Z0-9]+USDT$/.test(String(t.symbol||''))&&!String(t.symbol).includes('_'))
        .map(t=>({symbol:t.symbol,base:String(t.symbol).slice(0,-4),price:n(t.lastPrice),change:n(t.priceChangePercent),quoteVolume:n(t.quoteVolume),tickerAsOf:n(t.closeTime),marketSource:'BINANCE_FUTURES_WS'}))
        .filter(r=>r.price!=null&&r.quoteVolume!=null);
      if(!rows.length)throw new UpstreamError('Binance WebSocket 유니버스 없음',502);
      return{asOf:snap.asOf,rows,source:'BINANCE_FUTURES_WS'};
    }catch(primary){
      try{return await this.bybitUniverse();}
      catch(fallback){throw new UpstreamError(primary.message+' | '+fallback.message,502);}
    }
  }

  oiFromRows(rows,asOf,source){
    const a=(rows||[]).filter(x=>n(x.timestamp)!=null&&n(x.sumOpenInterest)!=null&&+x.timestamp<=asOf).sort((x,y)=>+x.timestamp-+y.timestamp);
    const end=a.at(-1);
    if(!end||asOf-Number(end.timestamp)>20*60000)return{change4h:null,change8h:null,asOf:null,reason:'OI 최신 자료 없음',source};
    const calc=hours=>{
      const target=+end.timestamp-hours*3600000;
      let best=null,dist=Infinity;
      for(const row of a){const d=Math.abs(+row.timestamp-target);if(d<dist){dist=d;best=row;}}
      return best&&dist<=6*60000?pct(+end.sumOpenInterest,+best.sumOpenInterest):null;
    };
    return{change4h:calc(4),change8h:calc(8),asOf:+end.timestamp,value:+end.sumOpenInterest,source};
  }

  async bybitOi(symbol,asOf){
    const end=Math.floor(asOf/300000)*300000;
    const body=await this.bybitGet('/v5/market/open-interest?category=linear&symbol='+encodeURIComponent(symbol)+'&intervalTime=5min&limit=100&endTime='+end,60000,'oi:'+symbol+':'+Math.floor(end/300000));
    const rows=(body?.result?.list||[]).map(x=>({timestamp:+x.timestamp,sumOpenInterest:+x.openInterest}));
    return this.oiFromRows(rows,asOf,'BYBIT_LINEAR_FALLBACK');
  }

  async oi(symbol,asOf){
    try{
      const a=await this.get('/futures/data/openInterestHist',{symbol,period:'5m',limit:100,endTime:Math.floor(asOf/300000)*300000},60000);
      if(!Array.isArray(a))throw new Error('OI 응답 오류');
      return this.oiFromRows(a,asOf,'BINANCE_FUTURES');
    }catch(primary){
      if(primary?.status===429)throw primary;
      try{return await this.bybitOi(symbol,asOf);}
      catch(fallback){return{change4h:null,change8h:null,asOf:null,reason:'OI unavailable: '+primary.message+' | '+fallback.message,source:'UNAVAILABLE'};}
    }
  }

  async bybitBars(symbol,tf,asOf,limit=499,category='linear'){
    const duration=DURATIONS[tf];
    if(!duration)throw new Error('지원하지 않는 TF');
    const source=category==='spot'?'BYBIT_SPOT_FALLBACK':'BYBIT_LINEAR_FALLBACK';
    let baseTf=tf,target=limit;
    if(tf==='3d'){baseTf='1d';target=Math.min(1800,limit*3);}
    const interval=BYBIT_INTERVAL[baseTf];
    if(!interval)throw new Error('Bybit unsupported TF '+tf);
    const baseDuration=DURATIONS[baseTf],rowsByTime=new Map();
    let cursor=asOf,pages=0;
    while(rowsByTime.size<target&&pages<3){
      const pageLimit=Math.min(1000,target-rowsByTime.size);
      const path='/v5/market/kline?category='+category+'&symbol='+encodeURIComponent(symbol)+'&interval='+encodeURIComponent(interval)+'&limit='+pageLimit+'&end='+Math.floor(cursor);
      const body=await this.bybitGet(path,Math.min(baseDuration,60000),'kline:'+category+':'+symbol+':'+baseTf+':'+pageLimit+':'+Math.floor(cursor/baseDuration));
      const list=body?.result?.list||[];
      if(!list.length)break;
      let oldest=Infinity;
      for(const x of list){
        const t=+x[0],end=t+baseDuration-1;
        if(!Number.isFinite(t)||end>=asOf)continue;
        oldest=Math.min(oldest,t);
        const volume=n(x[5]),quote=n(x[6]);
        if([n(x[1]),n(x[2]),n(x[3]),n(x[4]),volume,quote].some(v=>v==null))continue;
        rowsByTime.set(t,{t,o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:volume,end,q:quote,buy:null,_source:source});
      }
      if(!Number.isFinite(oldest)||list.length<pageLimit)break;
      cursor=oldest-1;pages++;
    }
    let rows=[...rowsByTime.values()].sort((a,b)=>a.t-b.t);
    if(tf==='3d')rows=aggregateBars(rows,DURATIONS['3d'],asOf);
    rows=rows.slice(-limit);
    if(rows.length<35)throw new UpstreamError('Bybit '+tf+' 확정봉 부족',502);
    this.markFallback(source);
    try{Object.defineProperty(rows,'_source',{value:source,enumerable:false});}catch{}
    return rows;
  }

  async futuresKlines(symbol,tf,asOf,limit){
    const target=Math.max(1,Math.floor(Number(limit)||1));
    if(target<=499)return this.get('/fapi/v1/klines',{symbol,interval:tf,limit:target,endTime:asOf},60000);
    const byTime=new Map();
    let cursor=asOf,pages=0;
    while(byTime.size<target&&pages<10){
      const pageLimit=Math.min(499,target-byTime.size);
      const page=await this.get('/fapi/v1/klines',{symbol,interval:tf,limit:pageLimit,endTime:cursor},60000);
      if(!Array.isArray(page)||!page.length)break;
      let oldest=Infinity;
      for(const row of page){
        const t=Number(row?.[0]);
        if(!Number.isFinite(t))continue;
        oldest=Math.min(oldest,t);
        byTime.set(t,row);
      }
      if(!Number.isFinite(oldest)||page.length<pageLimit)break;
      cursor=oldest-1;pages++;
    }
    return [...byTime.values()].sort((a,b)=>Number(a[0])-Number(b[0])).slice(-target);
  }

  async bars(symbol,tf,asOf,limit=499){
    if(tf==='3h'){
      const duration=DURATIONS['3h'],window=Math.floor(asOf/duration),key='bars:'+symbol+':3h:'+limit+':'+window;
      const cached=await this.store.get(key);
      if(cached&&asOf<cached.nextClose){this.metrics.hits++;return cached.bars.filter(b=>b.end<asOf);}
      const baseLimit=Math.min(1497,Math.max(105,Math.floor(limit)*3));
      let bars;
      try{
        const raw=await this.futuresKlines(symbol,'1h',asOf,baseLimit);
        const oneHour=closedBars(raw,asOf);
        for(const b of oneHour)b._source='BINANCE_FUTURES';
        bars=resample3h(oneHour,asOf).slice(-limit);
      }catch(primary){
        try{
          const oneHour=await this.bybitBars(symbol,'1h',asOf,baseLimit,'linear');
          bars=resample3h(oneHour,asOf).slice(-limit);
        }catch(fallback){throw new UpstreamError(primary.message+' | '+fallback.message,502);}
      }
      await this.store.put(key,{bars,nextClose:(bars.at(-1)?.end??0)+duration+1},Math.min(duration,3600000));
      return bars;
    }
    const duration=DURATIONS[tf];
    if(!duration)throw new Error('지원하지 않는 TF');
    const offset=tf==='1w'?345600000:0,window=Math.floor((asOf-offset)/duration);
    const key='bars:'+symbol+':'+tf+':'+limit+':'+window;
    const cached=await this.store.get(key);
    if(cached&&asOf<cached.nextClose){this.metrics.hits++;return cached.bars.filter(b=>b.end<asOf);}
    let bars;
    try{
      const raw=await this.futuresKlines(symbol,tf,asOf,limit);
      if(!Array.isArray(raw))throw new Error('캔들 응답 오류');
      bars=closedBars(raw,asOf);
      try{Object.defineProperty(bars,'_source',{value:'BINANCE_FUTURES',enumerable:false});}catch{}
    }catch(primary){
      try{bars=await this.bybitBars(symbol,tf,asOf,limit,'linear');}
      catch(fallback){throw new UpstreamError(primary.message+' | '+fallback.message,502);}
    }
    await this.store.put(key,{bars,nextClose:(bars.at(-1)?.end??0)+duration+1},Math.min(duration,3600000));
    return bars;
  }

  async taker(symbol,asOf){
    try{
      const rows=await this.get('/futures/data/takerlongshortRatio',{symbol,period:'1h',limit:4,endTime:asOf},60000);
      const valid=rows.filter(x=>+x.timestamp+3600000<=asOf),row=valid.at(-1);
      return row?{ratio:+row.buySellRatio,asOf:+row.timestamp,period:'1h',direction:+row.buySellRatio>1.2?'buy':+row.buySellRatio<.8?'sell':'none',source:'BINANCE_FUTURES'}:{ratio:null,reason:'확정 taker 구간 없음',source:'BINANCE_FUTURES'};
    }catch(e){
      if(e?.status===429)throw e;
      return{ratio:null,asOf:null,period:'1h',direction:'none',available:false,reason:'Binance taker unavailable; 동등하지 않은 대체값 미사용',source:'UNAVAILABLE'};
    }
  }

  async funding(symbol,asOf){
    try{
      const a=await this.get('/fapi/v1/fundingRate',{symbol,limit:1,endTime:asOf},300000);
      return a.length?{rate:+a[0].fundingRate,asOf:+a[0].fundingTime,source:'BINANCE_FUTURES'}:null;
    }catch(primary){
      if(primary?.status===429)throw primary;
      try{
        const body=await this.bybitGet('/v5/market/tickers?category=linear&symbol='+encodeURIComponent(symbol),60000,'funding:'+symbol);
        const row=body?.result?.list?.[0],rate=n(row?.fundingRate);
        return rate==null?null:{rate,asOf:Date.now(),source:'BYBIT_LINEAR_FALLBACK'};
      }catch{return null;}
    }
  }

  async spotMap(){
    try{
      const [info,tickers]=await Promise.all([
        this.get('/api/v3/exchangeInfo',{},3600000,true),
        this.get('/api/v3/ticker/24hr',{type:'MINI'},30000,true)
      ]);
      const allowed=new Set(info.symbols.filter(x=>x.quoteAsset==='USDT'&&x.status==='TRADING').map(x=>x.symbol));
      return tickers.filter(x=>allowed.has(x.symbol)).map(x=>({...x,_source:'BINANCE_SPOT'}));
    }catch(primary){
      try{
        const body=await this.bybitGet('/v5/market/tickers?category=spot',30000,'spot:tickers');
        return(body?.result?.list||[]).filter(x=>String(x?.symbol||'').endsWith('USDT')).map(x=>({
          symbol:String(x.symbol).toUpperCase(),lastPrice:x.lastPrice,openPrice:x.prevPrice24h,quoteVolume:x.turnover24h,_source:'BYBIT_SPOT_FALLBACK'
        }));
      }catch{return[];}
    }
  }

  async spot(symbol,asOf){
    try{
      const raw=await this.get('/api/v3/klines',{symbol,interval:'1h',limit:35,endTime:asOf},60000,true);
      const rows=closedBars(raw,asOf);try{Object.defineProperty(rows,'_source',{value:'BINANCE_SPOT',enumerable:false});}catch{}return rows;
    }catch(primary){
      return this.bybitBars(symbol,'1h',asOf,35,'spot');
    }
  }
}
