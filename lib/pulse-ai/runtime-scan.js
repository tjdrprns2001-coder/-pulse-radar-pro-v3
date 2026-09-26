'use strict';

const VERSION='PULSE_AI_RUNTIME_SCAN_v1';

function createRuntimeScanService({
  runtimeUrl=process.env.PULSE_SCAN_RUNTIME_URL||process.env.TRADER_RUNTIME_URL||'',
  fetchImpl=global.fetch,
  fallback=null,
  timeoutMs=12000,
  now=()=>Date.now()
}={}){
  const base=String(runtimeUrl||'').replace(/\/$/,'');
  let lastGood=null;
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
  async function run(options={}){
    try{
      const body=await remoteRun(options);lastGood=body;return{...body,pulseAiScanSource:'runtime'};
    }catch(remoteError){
      if(fallback&&typeof fallback.run==='function'){
        try{
          const body=await fallback.run(options);lastGood=body;return{...body,pulseAiScanSource:'local-fallback',sourceWarning:[body?.sourceWarning,'Pulse AI runtime fallback 사용'].filter(Boolean).join(' · ')};
        }catch{}
      }
      if(lastGood){
        return{...lastGood,partial:true,pulseAiScanSource:'last-good',sourceWarning:[lastGood?.sourceWarning,'Pulse AI 최신 스캔 실패 · 직전 정상 스냅샷 사용'].filter(Boolean).join(' · '),servedAt:now()};
      }
      throw remoteError;
    }
  }
  return{version:VERSION,run};
}
module.exports={VERSION,createRuntimeScanService};
