import {Binance} from './scanner/binance.mjs';
import {createJob,stepJob,publicJob} from './scanner/engine.mjs';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

class RuntimeStore{
  constructor(now=Date.now){this.now=now;this.cache=new Map();this.jobs=new Map();this.samplesMap=new Map();this.locks=new Set();}
  async get(k){const e=this.cache.get(k);if(!e)return null;if(e.expires<=this.now()){this.cache.delete(k);return null;}return e.data;}
  async put(k,data,ttl){this.cache.set(k,{data,expires:this.now()+Math.max(1,Number(ttl)||1)});}
  async gate(k,ttl){if(await this.get(k))return false;await this.put(k,true,ttl);return true;}
  async reserve(k,limit,ms,units){const bucket='rate:'+k+':'+Math.floor(this.now()/ms),used=Number(await this.get(bucket)||0);if(used+units>limit)return false;await this.put(bucket,used+units,ms);return true;}
  async latest(kind='scan'){
    const rows=[...this.jobs.values()].filter(x=>x.kind===kind).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
    const latest=rows[0]||null;
    if(latest?.status==='paused'&&Number(latest.retryAt||0)-this.now()>3600000){
      latest.status='failed';
      latest.errors=[...(latest.errors||[]),{stage:latest.stage,message:'비정상 retryAt 감지로 작업 폐기'}];
      this.jobs.set(latest.id,structuredClone(latest));
      return null;
    }
    return latest;
  }
  async job(id){return this.jobs.get(id)||null;}
  async save(job){job.updatedAt=this.now();this.jobs.set(job.id,structuredClone(job));}
  async acquire(id){if(this.locks.has(id))return false;this.locks.add(id);return true;}
  async release(id){this.locks.delete(id);}
  async samples(){return [...this.samplesMap.values()].sort((a,b)=>(b.cutoff||0)-(a.cutoff||0)).slice(0,300);}
  async sample(s){if(!this.samplesMap.has(s.id))this.samplesMap.set(s.id,structuredClone(s));}
  async cleanup(){
    for(const [k,v] of this.cache)if(v.expires<this.now()-3600000)this.cache.delete(k);
    const jobs=[...this.jobs.values()].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
    for(const j of jobs.slice(20))this.jobs.delete(j.id);
    const samples=[...this.samplesMap.values()].sort((a,b)=>(b.cutoff||0)-(a.cutoff||0));
    this.samplesMap=new Map(samples.slice(0,1000).map(x=>[x.id,x]));
  }
}

function configFrom(env){
  const n=(k,d,lo,hi)=>{const v=Number(env[k]);return Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):d;};
  return{
    top:Math.round(n('IGNITION_SCAN_TOP',20,20,40)),
    maxChange:n('IGNITION_MAX_CHANGE',10,1,20),
    minVolume:n('IGNITION_MIN_VOLUME',1000000,0,1000000000),
    minOi:n('IGNITION_MIN_OI',1,0,10)
  };
}

function proxyBases(env){
  const list=String(env.IGNITION_BINANCE_PROXY_URLS||'')
    .split(',')
    .map(x=>x.trim().replace(/\/$/,''))
    .filter(Boolean);
  const legacy=String(env.IGNITION_BINANCE_PROXY_URL||'').trim().replace(/\/$/,'');
  if(legacy)list.push(legacy);
  return [...new Set(list)];
}

export function routedFetcher(env,directFetch=fetch,now=Date.now,sleeper=sleep){
  const bases=proxyBases(env);
  const token=String(env.IGNITION_BINANCE_PROXY_TOKEN||'');
  const cooldowns=new Map();
  const maxConcurrent=Math.max(1,Math.min(4,Number(env.IGNITION_BINANCE_PROXY_CONCURRENCY)||2));
  const minGapMs=Math.max(0,Math.min(1000,Number(env.IGNITION_BINANCE_PROXY_GAP_MS)||120));
  const klineGapMs=Math.max(minGapMs,Math.min(2000,Number(env.IGNITION_BINANCE_KLINE_GAP_MS)||350));
  const futuresSoftWeight=Math.max(500,Math.min(2300,Number(env.IGNITION_BINANCE_FUTURES_WEIGHT_SOFT_LIMIT||env.IGNITION_BINANCE_WEIGHT_SOFT_LIMIT)||1700));
  const spotSoftWeight=Math.max(500,Math.min(5900,Number(env.IGNITION_BINANCE_SPOT_WEIGHT_SOFT_LIMIT)||5000));
  const resetSafetyMs=Math.max(250,Math.min(5000,Number(env.IGNITION_BINANCE_WEIGHT_RESET_SAFETY_MS)||1500));
  let active=0;
  const nextStartAt={futures:0,spot:0};
  const waiters=[];
  const acquire=async(market,pathname)=>{
    if(active>=maxConcurrent)await new Promise(resolve=>waiters.push(resolve));
    active++;
    const gap=market==='futures'&&String(pathname||'').endsWith('/klines')?klineGapMs:minGapMs;
    const current=now(),startAt=Math.max(current,nextStartAt[market]||0);
    nextStartAt[market]=startAt+gap;
    if(startAt>current)await sleeper(startAt-current);
  };
  const release=()=>{active=Math.max(0,active-1);const next=waiters.shift();if(next)next();};
  if(!bases.length||token.length<43)return directFetch;

  return async(url,options={})=>{
    let parsed=null;try{parsed=new URL(String(url));}catch{}
    const host=parsed?.hostname||'';
    const isFutures=host==='fapi.binance.com';
    const isBinance=isFutures||host==='api.binance.com'||host==='api-gcp.binance.com'||/^api[1-4]\.binance\.com$/.test(host)||host==='data-api.binance.vision';
    if(!isBinance)return directFetch(url,options);
    const market=isFutures?'futures':'spot';
    const pathname=String(parsed?.pathname||'');
    const endpointFamily=market==='spot'?'spot':pathname.endsWith('/klines')?'kline':pathname.startsWith('/futures/data/')?'stats':pathname.endsWith('/fundingRate')?'funding':'core';

    await acquire(market,pathname);
    try{
    let lastResponse=null,rateLimitedResponse=null;
    const statsBase=String(env.IGNITION_BINANCE_STATS_PROXY_URL||'').trim().replace(/\/$/,'');
    const isStats=isFutures&&String(parsed?.pathname||'').startsWith('/futures/data/');
    const orderedBases=isStats&&statsBase&&bases.includes(statsBase)?[statsBase,...bases.filter(x=>x!==statsBase)]:bases;
    for(const base of orderedBases){
      const cooldownKey=market+'|'+endpointFamily+'|'+base;
      const until=cooldowns.get(cooldownKey)||0;
      if(until>now())continue;
      const target=base+'/fetch?url='+encodeURIComponent(String(url));
      const timeout=AbortSignal.timeout(8000);
      const signal=options.signal&&typeof AbortSignal.any==='function'?AbortSignal.any([options.signal,timeout]):timeout;
      try{
        const response=await directFetch(target,{
          method:'GET',
          headers:{authorization:'Bearer '+token,accept:'application/json'},
          signal,
          redirect:'error'
        });
        lastResponse=response;
        if(response.ok){
          const used=Number(response.headers.get('x-mbx-used-weight-1m')||0);
          const softWeight=market==='futures'?futuresSoftWeight:spotSoftWeight;
          if(Number.isFinite(used)&&used>=softWeight){
            const current=now();
            const resetAt=(Math.floor(current/60000)+1)*60000+resetSafetyMs;
            nextStartAt[market]=Math.max(nextStartAt[market]||0,resetAt);
          }
          return response;
        }
        if([418,429,403,451].includes(response.status)||response.status>=500){
          const retryAfter=Math.max(60,Number(response.headers.get('retry-after')||0));
          const ttl=[403,451].includes(response.status)?300000:Math.min(300000,retryAfter*1000);
          cooldowns.set(cooldownKey,now()+ttl);
          if(response.status===418||response.status===429)rateLimitedResponse=response;
          continue;
        }
        return response;
      }catch{
        cooldowns.set(cooldownKey,now()+60000);
      }
    }

    if(rateLimitedResponse)return rateLimitedResponse;
    try{return await directFetch(url,options);}
    catch(e){if(lastResponse)return lastResponse;throw e;}
    }finally{release();}
  };
}

export function createLocalScannerSource({env=process.env,fetcher=fetch,now=Date.now,autoStart=true}={}){
  const store=new RuntimeStore(now);
  const scannerFetch=routedFetcher(env,fetcher,now);
  const health={mode:'local-render',state:'INIT',startedAt:now(),lastStartedAt:null,lastFinishedAt:null,lastError:null,lastScanId:null,nextRunAt:null};
  let latestSnapshot=null,lastCompleted=null,loopStarted=false;

  function publish(job){
    if(!job)return;
    const p=publicJob(job);
    if(p.status==='complete'){
      lastCompleted={...p,sourceStatus:'complete',servedFromLastComplete:false};
      latestSnapshot=lastCompleted;
      health.lastFinishedAt=now();
      health.state='COMPLETE';
    }else if(['running','paused'].includes(p.status)){
      latestSnapshot={...p,sourceStatus:p.status,servedFromLastComplete:false};
      health.state=p.status.toUpperCase();
    }else if(lastCompleted){
      latestSnapshot={...lastCompleted,sourceStatus:p.status||'failed',servedFromLastComplete:true};
      health.state='FALLBACK';
    }else{
      latestSnapshot=null;
      health.state=String(p.status||'FAILED').toUpperCase();
    }
  }

  async function runOne(){
    health.lastStartedAt=now();health.lastError=null;health.state='STARTING';
    let job=await createJob(store,'scan',configFrom(env));
    health.lastScanId=job.id;publish(job);
    let steps=0;
    while(['running','paused'].includes(job.status)&&steps++<500){
      if(job.status==='paused'){
        const remaining=Number(job.retryAt||0)-now();
        if(!Number.isFinite(remaining)||remaining>3600000)throw new Error('invalid_retry_at');
        const wait=Math.max(1000,Math.min(300000,remaining));
        if(wait>0)await sleep(wait);
      }
      const api=new Binance(store,scannerFetch);
      job=await stepJob(store,api,job.id);
      if(job?.busy){await sleep(250);job=await store.job(health.lastScanId);continue;}
      publish(job);
      if(job?.status==='paused')console.warn('[IGNITION] paused',{stage:job.stage,retryAt:job.retryAt,lastError:job.errors?.at(-1)?.message||null,metrics:job.metrics});
      else console.log('[IGNITION] step',{stage:job?.stage,status:job?.status,counts:job?.counts,metrics:job?.metrics,lastError:job?.errors?.at(-1)?.message||null});
      await sleep(25);
    }
    if(job?.status==='complete')return job;
    if(job?.status==='paused')throw new Error('scan_paused_timeout');
    if(job?.status!=='complete')throw new Error(job?.errors?.at(-1)?.message||'scan_incomplete');
    return job;
  }

  async function loop(){
    const initial=Math.max(1000,Number(env.IGNITION_SCAN_START_DELAY_MS||1500));
    await sleep(initial);
    while(true){
      try{await runOne();}
      catch(e){health.lastError=String(e?.message||e);health.state=lastCompleted?'FALLBACK':'DEGRADED';if(lastCompleted)latestSnapshot={...lastCompleted,sourceStatus:'unavailable',servedFromLastComplete:true};}
      const interval=Math.max(300000,Number(env.IGNITION_SCAN_INTERVAL_MS||900000));
      health.nextRunAt=now()+interval;
      await sleep(interval);
    }
  }

  if(autoStart&&!loopStarted){loopStarted=true;loop().catch(e=>{health.lastError=String(e?.message||e);health.state='DEGRADED';});}
  const source=async()=>latestSnapshot;
  source.health=()=>({...health,hasSnapshot:Boolean(latestSnapshot),hasCompleted:Boolean(lastCompleted)});
  source.runNow=runOne;
  return source;
}
