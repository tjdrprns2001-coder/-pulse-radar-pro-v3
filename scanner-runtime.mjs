import {Binance} from './scanner/binance.mjs';
import {createJob,stepJob,publicJob} from './scanner/engine.mjs';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

class RuntimeStore{
  constructor(now=Date.now){this.now=now;this.cache=new Map();this.jobs=new Map();this.samplesMap=new Map();this.locks=new Set();}
  async get(k){const e=this.cache.get(k);if(!e)return null;if(e.expires<=this.now()){this.cache.delete(k);return null;}return e.data;}
  async put(k,data,ttl){this.cache.set(k,{data,expires:this.now()+Math.max(1,Number(ttl)||1)});}
  async gate(k,ttl){if(await this.get(k))return false;await this.put(k,true,ttl);return true;}
  async reserve(k,limit,ms,units){const bucket='rate:'+k+':'+Math.floor(this.now()/ms),used=Number(await this.get(bucket)||0);if(used+units>limit)return false;await this.put(bucket,used+units,ms);return true;}
  async latest(kind='scan'){const rows=[...this.jobs.values()].filter(x=>x.kind===kind).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));return rows[0]||null;}
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
    minVolume:n('IGNITION_MIN_VOLUME',10000000,1000000,1000000000),
    minOi:n('IGNITION_MIN_OI',1,0,10)
  };
}

export function createLocalScannerSource({env=process.env,fetcher=fetch,now=Date.now}={}){
  const store=new RuntimeStore(now);
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
        const wait=Math.max(1000,Math.min(300000,Number(job.retryAt||0)-now()));
        if(wait>0)await sleep(wait);
      }
      const api=new Binance(store,fetcher);
      job=await stepJob(store,api,job.id);
      if(job?.busy){await sleep(250);job=await store.job(health.lastScanId);continue;}
      publish(job);
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

  if(!loopStarted){loopStarted=true;loop().catch(e=>{health.lastError=String(e?.message||e);health.state='DEGRADED';});}
  const source=async()=>latestSnapshot;
  source.health=()=>({...health,hasSnapshot:Boolean(latestSnapshot),hasCompleted:Boolean(lastCompleted)});
  source.runNow=runOne;
  return source;
}
