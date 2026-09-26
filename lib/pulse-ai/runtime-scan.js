'use strict';

const VERSION='PULSE_AI_RUNTIME_SCAN_v2';

function n(v,d=0){const x=Number(v);return Number.isFinite(x)?x:d}
function quality(body={}){
  const c=body.marketCoverage||{},h=body.dataHealth||{};
  const futures=n(c.futures)+n(c.both),spot=n(c.spot)+n(c.both),live=n(h.live),errors=n(h.errors),blocked=n(h.blocked),delayed=n(h.delayed);
  return{
    futures,spot,live,errors,blocked,delayed,
    score:futures*5+spot*.35+live-errors*300-blocked*300-delayed*3,
    futuresUsable:futures>0
  };
}
function createRuntimeScanService({
  runtimeUrl=process.env.PULSE_SCAN_RUNTIME_URL||process.env.TRADER_RUNTIME_URL||'',
  fetchImpl=global.fetch,
  fallback=null,
  timeoutMs=12000,
  degradedCooldownMs=120000,
  now=()=>Date.now()
}={}){
  const base=String(runtimeUrl||'').replace(/\/$/,'');
  let lastGood=null,remoteDegradedUntil=0;
  async function remoteRun(options={}){
    if(!base||!fetchImpl)throw new Error('runtime unavailable');
    const q=new URLSearchParams({
      mode:String(options.mode||'summary'),
      limit:String(Math.max(1,Math.min(200,Number(options.limit)||100))),
      persist:'0',local:'1'
    });
    const signal=global.AbortSignal&&typeof AbortSignal.timeout==='function'?AbortSignal.timeout(timeoutMs):undefined;
    const r=await fetchImpl(base+'/api/coin-scan?'+q.toString(),{headers:{accept:'application/json'},signal});
    const body=await r.json().catch(()=>null);
    if(!r.ok||!body||body.status!=='ok')throw new Error(body?.error||`runtime HTTP ${r.status}`);
    return body;
  }
  async function localRun(options={}){
    if(!fallback||typeof fallback.run!=='function')throw new Error('local fallback unavailable');
    return fallback.run(options);
  }
  async function run(options={}){
    let remoteBody=null,remoteError=null;
    if(now()>=remoteDegradedUntil){
      try{remoteBody=await remoteRun(options)}catch(e){remoteError=e}
    }
    if(remoteBody){
      const rq=quality(remoteBody);
      if(rq.futuresUsable){
        lastGood=remoteBody;
        return{...remoteBody,pulseAiScanSource:'runtime',pulseAiScanQuality:rq};
      }
      try{
        const local=await localRun(options),lq=quality(local);
        if(lq.score>rq.score&&lq.futuresUsable){
          remoteDegradedUntil=now()+degradedCooldownMs;lastGood=local;
          return{...local,pulseAiScanSource:'local-quality-fallback',pulseAiScanQuality:lq,
            sourceWarning:[local?.sourceWarning,'Pulse AI 원격 스캔이 선물 유니버스를 잃어 통합 사이트 스캔으로 자동 전환'].filter(Boolean).join(' · ')};
        }
      }catch{}
      lastGood=remoteBody;
      return{...remoteBody,pulseAiScanSource:'runtime-degraded',pulseAiScanQuality:rq,
        sourceWarning:[remoteBody?.sourceWarning,'Pulse AI 선물 유니버스 미확인'].filter(Boolean).join(' · ')};
    }
    try{
      const local=await localRun(options),lq=quality(local);lastGood=local;
      return{...local,pulseAiScanSource:'local-fallback',pulseAiScanQuality:lq,
        sourceWarning:[local?.sourceWarning,remoteError?'Pulse AI 원격 스캔 실패 · 통합 사이트 스캔 사용':null].filter(Boolean).join(' · ')};
    }catch{}
    if(lastGood){
      return{...lastGood,partial:true,pulseAiScanSource:'last-good',sourceWarning:[lastGood?.sourceWarning,'Pulse AI 최신 스캔 실패 · 직전 정상 스냅샷 사용'].filter(Boolean).join(' · '),servedAt:now()};
    }
    throw remoteError||new Error('Pulse AI scan unavailable');
  }
  return{version:VERSION,run,quality};
}
module.exports={VERSION,quality,createRuntimeScanService};
