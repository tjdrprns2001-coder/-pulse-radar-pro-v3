'use strict';
const {num,TF_MS}=require('./data');
function closedCutoff(at,tf){const d=new Date(at+1);if(tf==='1M')return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1)-1;const step=TF_MS[tf];if(!step)throw new Error('unsupported timeframe');const anchor=tf==='1w'?345600000:0;return Math.floor((at+1-anchor)/step)*step+anchor-1;}
const BASES={perpetual:'https://fapi.binance.com',spot:'https://data-api.binance.vision'};
class Provider{
 constructor({fetchImpl=globalThis.fetch,now=()=>Date.now(),pace_ms=350}={}){this.fetch=fetchImpl;this.now=now;this.pace=pace_ms;this.queue=Promise.resolve();this.cache=new Map();this.flights=new Map();this.blocks=new Map();}
 cooldown(market){const b=this.blocks.get(market);if(!b||b.until<=this.now())return null;return Object.assign(new Error((this.name||'Binance')+' 요청 제한 · 재시도 '+new Date(b.until).toISOString()),{code:this.name?'UPSTREAM_COOLDOWN':'BINANCE_COOLDOWN',upstream_status:b.status,retry_at:b.until,statusCode:503});}
 async request(market,path,{ttl=0,deadline=8000,signal=null}={}){
  const base=BASES[market];if(!base)throw new Error('unsupported market');
  const key=market+path,hit=this.cache.get(key);if(hit&&hit.until>this.now())return hit.value;
  if(signal?.aborted)throw new Error('request cancelled');
  const blocked=this.cooldown(market);if(blocked)throw blocked;
  if(this.flights.has(key))return this.flights.get(key);
  const task=this.requestQueued(base+path,{deadline,signal,market}).then(value=>{if(ttl){this.cache.set(key,{value,until:this.now()+ttl});if(this.cache.size>500)this.cache.delete(this.cache.keys().next().value);}return value;}).finally(()=>this.flights.delete(key));
  this.flights.set(key,task);return task;
 }
 async requestQueued(url,{deadline,signal,market}){
  const end=Date.now()+deadline,previous=this.queue;let release,started=false;
  const own=new Promise(r=>release=r);this.queue=previous.then(()=>own);
  let waitTimer;
  try{
   await Promise.race([previous,new Promise((_,reject)=>waitTimer=setTimeout(()=>reject(new Error('request queue deadline')),Math.max(1,end-Date.now())))]);clearTimeout(waitTimer);
   if(signal?.aborted)throw new Error('request cancelled');
   const blocked=this.cooldown(market);if(blocked)throw blocked;
   started=true;let error;
   for(let attempt=0;attempt<3&&Date.now()<end;attempt++){
    const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,Math.max(1,end-Date.now()));signal?.addEventListener('abort',abort,{once:true});
    try{
     const response=await this.fetch(url,{signal:controller.signal,headers:{accept:'application/json'}});
     if(response.ok)return await response.json();
     error=new Error((this.name||'Binance')+' HTTP '+response.status);
     if([418,429].includes(response.status)){
      const stamp=this.now(),header=response.headers.get('retry-after'),seconds=header==null?null:Number(header),headerAt=Number.isFinite(seconds)&&seconds>0?stamp+seconds*1000:Date.parse(header||'');
      let until=Number.isFinite(headerAt)&&headerAt>stamp?headerAt:stamp+(response.status===418?900000:60000);
      this.blocks.set(market,{until,status:response.status});
      try{const body=await response.json(),m=String(body?.msg||'').match(/banned until (\d{10,})/i);if(m){let t=Number(m[1]);if(t<1e12)t*=1000;if(t>stamp)until=Math.max(until,t);}}catch{}
      this.blocks.set(market,{until,status:response.status});throw this.cooldown(market);
     }
     if(![429,500,502,503,504].includes(response.status))throw error;
     const retry=Number(response.headers.get('retry-after'))*1000||500*2**attempt;
     if(Date.now()+retry>=end)break;
     await new Promise(r=>setTimeout(r,retry));
    }catch(e){error=e;if(signal?.aborted)throw new Error('request cancelled');if(['BINANCE_COOLDOWN','UPSTREAM_COOLDOWN'].includes(e.code))throw e;if(e.name!=='AbortError'&&!/HTTP (429|500|502|503|504)/.test(e.message))throw e;}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
   }
   if(Date.now()>=end)throw new Error('request deadline');throw error||new Error('request deadline');
  }finally{clearTimeout(waitTimer);if(started&&this.pace)await new Promise(r=>setTimeout(r,this.pace));release();}
 }
 async bars({symbol,tf,market='perpetual',at,limit=600,signal=null}){const p=market==='perpetual'?'/fapi/v1':'/api/v3';const query=new URLSearchParams({symbol,interval:tf,limit:String(Math.min(1500,limit)),endTime:String(closedCutoff(at,tf))});const rows=await this.request(market,p+'/klines?'+query,{ttl:15000,signal});return rows.map(r=>{const x=r.slice();x.source_version='binance_rest_v1';return x;});}
 async instruments({market='perpetual',signal=null}={}){const prefix=market==='perpetual'?'/fapi/v1':'/api/v3',j=await this.request(market,prefix+'/exchangeInfo',{ttl:300000,signal});return j.symbols.filter(x=>x.quoteAsset==='USDT'&&x.status==='TRADING'&&(market==='spot'||x.contractType==='PERPETUAL')).map(x=>({venue:'binance',market,symbol:x.symbol,tick:num(x.filters.find(f=>f.filterType==='PRICE_FILTER')?.tickSize),lot:num(x.filters.find(f=>f.filterType==='LOT_SIZE')?.stepSize),min_notional:num(x.filters.find(f=>['MIN_NOTIONAL','NOTIONAL'].includes(f.filterType))?.notional??x.filters.find(f=>['MIN_NOTIONAL','NOTIONAL'].includes(f.filterType))?.minNotional)}));}
 async tickers({market='perpetual'}={}){return this.request(market,(market==='perpetual'?'/fapi/v1':'/api/v3')+'/ticker/24hr',{ttl:15000});}
 async flow({symbol,at,market='perpetual',signal=null}){if(market!=='perpetual')return {oi:null,funding:null};const [oi,funding,taker]=await Promise.allSettled([this.request(market,'/futures/data/openInterestHist?'+new URLSearchParams({symbol,period:'5m',limit:'60',endTime:String(at)}),{ttl:15000,signal}),this.request(market,'/fapi/v1/fundingRate?'+new URLSearchParams({symbol,limit:'1',endTime:String(at)}),{ttl:60000,signal}),this.request(market,'/futures/data/takerlongshortRatio?'+new URLSearchParams({symbol,period:'15m',limit:'3',endTime:String(at)}),{ttl:15000,signal})]);const xs=oi.status==='fulfilled'?oi.value.filter(x=>+x.timestamp<=at):[],last=xs.at(-1),base=last?xs.filter(x=>+x.timestamp<=+last.timestamp-14400000).at(-1):null;const delta=(a,b)=>num(a)!=null&&num(b)>0?(+a/+b-1)*100:null;return {oi:last&&base?{contracts_change_pct:delta(last.sumOpenInterest,base.sumOpenInterest),notional_change_pct:delta(last.sumOpenInterestValue,base.sumOpenInterestValue),unit:'contracts',window_start:+base.timestamp,window_end:+last.timestamp,observed_at:+last.timestamp,received_at:this.now(),quality:at- +last.timestamp<=900000?'fresh':'stale'}:null,funding:funding.status==='fulfilled'&&funding.value.length?{rate:num(funding.value.at(-1).fundingRate),observed_at:+funding.value.at(-1).fundingTime,received_at:this.now()}:null,taker:taker.status==='fulfilled'?taker.value.filter(x=>+x.timestamp<=at).map(x=>({ratio:num(x.buySellRatio),observed_at:+x.timestamp,received_at:this.now()})):null,errors:[oi,funding,taker].filter(x=>x.status==='rejected').map(x=>x.reason.message)};}
}
module.exports={Provider,closedCutoff};
