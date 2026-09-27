'use strict';

function finite(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}

function freshnessOf(scan,now){
  const direct=finite(scan?.freshnessMs);
  const updated=finite(scan?.updatedAt)??finite(scan?.scan?.finishedAt)??finite(scan?.finishedAt)??finite(scan?.scan?.asOf);
  const ms=direct!=null?Math.max(0,direct):(updated!=null?Math.max(0,now-updated):null);
  const state=ms==null?'unknown':ms<=120000?'live':ms<=600000?'delayed':'stale';
  return{ms,state};
}

function sourceLabel(value){
  const s=String(value||'').toUpperCase();
  if(!s)return null;
  if(s.includes('BYBIT'))return 'BYBIT';
  if(s.includes('BINANCE'))return 'BINANCE';
  if(s.includes('UNAVAILABLE'))return 'UNAVAILABLE';
  return s.slice(0,40);
}

function sourceSummary(row={}){
  const all=[];
  const push=v=>{const x=sourceLabel(v);if(x)all.push(x);};
  if(Array.isArray(row.dataSources))row.dataSources.forEach(push);
  push(row.marketSource);
  push(row.oi?.source);
  push(row.taker?.source);
  push(row.funding?.source);
  push(row.spot?.source);
  for(const frame of Object.values(row.frames||{}))push(frame?.source);
  const uniq=[...new Set(all)];
  const hasBinance=uniq.includes('BINANCE');
  const hasBybit=uniq.includes('BYBIT');
  const mode=hasBinance&&hasBybit?'mixed':hasBybit?'bybit-fallback':hasBinance?'binance-primary':'unknown';
  return{
    mode,
    sources:uniq,
    fallbackUsed:hasBybit,
    oi:sourceLabel(row.oi?.source),
    taker:sourceLabel(row.taker?.source),
    funding:sourceLabel(row.funding?.source),
    frames:[...new Set(Object.values(row.frames||{}).map(x=>sourceLabel(x?.source)).filter(Boolean))]
  };
}

function normalizeCandidate(row={}){
  const coverage=finite(row.coverage);
  const detailComplete=Boolean(row.detailComplete);
  const provenance=sourceSummary(row);
  return{
    symbol:String(row.symbol||'').toUpperCase(),
    price:finite(row.price),
    change:finite(row.change),
    quoteVolume:finite(row.quoteVolume),
    oi:row.oi??null,
    score:finite(row.score),
    status:String(row.status||''),
    reasons:Array.isArray(row.reasons)?row.reasons.slice(0,12).map(String):[],
    detailComplete,
    coverage,
    usable:detailComplete&&coverage===10,
    frames:row.frames&&typeof row.frames==='object'?row.frames:{},
    taker:row.taker&&typeof row.taker==='object'?row.taker:null,
    funding:row.funding&&typeof row.funding==='object'?row.funding:null,
    spot:row.spot&&typeof row.spot==='object'?row.spot:null,
    matches:Array.isArray(row.matches)?row.matches.slice(0,12):[],
    provenance
  };
}

module.exports=async function handler(req,res,ctx={}){
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(String(req?.method||'GET').toUpperCase()!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({status:'error',error:'method_not_allowed'});
  }

  const env=ctx.env||process.env;
  const base=String(env.IGNITION_API_BASE_URL||'').replace(/\/$/,'');
  const token=String(env.IGNITION_RESULTS_TOKEN||'');
  if(!base||!token){
    return res.status(503).json({
      status:'degraded',
      source:'IGNITION',
      configured:false,
      error:'ignition_bridge_not_configured',
      candidates:[]
    });
  }

  const fetchImpl=ctx.fetchImpl||globalThis.fetch;
  const timeoutMs=Math.max(1000,Math.min(30000,Number(ctx.timeoutMs)||12000));
  const now=typeof ctx.now==='function'?ctx.now():Date.now();
  const headers={authorization:'Bearer '+token,accept:'application/json'};
  const transient=new Set([502,503,504]);
  let upstream=null,lastStatus=null,lastError=null;

  async function fetchWithTimeout(path,ms){
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),ms);
    try{return await fetchImpl(base+path,{headers,cache:'no-store',signal:ctrl.signal})}
    finally{clearTimeout(timer)}
  }

  try{
    const attempts=3;
    for(let attempt=0;attempt<attempts;attempt++){
      try{
        upstream=await fetchWithTimeout('/api/v1/results',Math.max(2500,Math.floor(timeoutMs/attempts)));
        lastStatus=upstream.status;
        if(upstream.ok)break;
        if(!transient.has(upstream.status))break;
      }catch(error){
        lastError=error;
      }
      // Free/sleeping upstreams can return a transient gateway error during wake-up.
      try{await fetchWithTimeout('/api/v1/health',2500)}catch{}
      if(attempt<attempts-1)await new Promise(r=>setTimeout(r,350*(attempt+1)));
    }
    if(!upstream||!upstream.ok){
      const status=upstream?.status??lastStatus;
      const aborted=lastError&&lastError.name==='AbortError';
      return res.status(502).json({
        status:'degraded',
        source:'IGNITION',
        configured:true,
        upstreamStatus:status??null,
        retryable:status==null||transient.has(status),
        error:aborted?'ignition_upstream_timeout':status?'ignition_upstream_http_'+status:'ignition_upstream_unavailable',
        candidates:[]
      });
    }

    const scan=await upstream.json().catch(()=>null);
    if(!scan||typeof scan!=='object'){
      return res.status(502).json({
        status:'degraded',
        source:'IGNITION',
        configured:true,
        error:'ignition_invalid_json',
        candidates:[]
      });
    }

    if(String(scan.schemaVersion||'')!=='1.0'){
      return res.status(502).json({status:'degraded',source:'IGNITION',configured:true,error:'ignition_schema_mismatch',candidates:[]});
    }
    const candidates=Array.isArray(scan.candidates)?scan.candidates.slice(0,40).map(normalizeCandidate):[];
    const freshness=freshnessOf(scan,now);
    const scanMeta=scan.scan&&typeof scan.scan==='object'?scan.scan:{};
    const usableCount=candidates.filter(x=>x.usable).length;
    const partialCount=candidates.filter(x=>!x.usable).length;
    const provenanceModes=candidates.map(x=>x.provenance?.mode).filter(Boolean);
    const fallbackCandidateCount=candidates.filter(x=>x.provenance?.fallbackUsed).length;
    const hasMixed=provenanceModes.includes('mixed');
    const hasBybit=provenanceModes.includes('bybit-fallback');
    const hasPrimary=provenanceModes.includes('binance-primary');
    const dataMode=hasMixed||(hasBybit&&hasPrimary)?'mixed-fallback':hasBybit?'bybit-fallback':hasPrimary?'binance-primary':fallbackCandidateCount?'fallback':'unknown';
    const scanStatus=String(scan.status||'').toLowerCase();
    const sourceStatus=String(scan.sourceStatus||scan.status||'').toLowerCase();
    const servedFromLastComplete=Boolean(scan.servedFromLastComplete);
    const state=scanStatus==='empty'?'empty':servedFromLastComplete?'fallback':['queued','running','paused'].includes(scanStatus)?'partial':'ready';

    return res.status(200).json({
      status:'ok',
      state,
      source:'IGNITION',
      configured:true,
      schemaVersion:String(scan.schemaVersion||''),
      id:scan.id??scanMeta.id??null,
      scanStatus:scan.status??null,
      sourceStatus:scan.sourceStatus??scan.status??null,
      servedFromLastComplete,
      active:['queued','running','paused'].includes(scanStatus),
      stage:scan.stage??scanMeta.stage??(scan.status==='complete'?'complete':null),
      asOf:finite(scan.asOf)??finite(scanMeta.asOf),
      updatedAt:finite(scan.updatedAt)??finite(scanMeta.finishedAt)??finite(scanMeta.asOf),
      finishedAt:finite(scan.finishedAt)??finite(scanMeta.finishedAt),
      partialData:Boolean(scanMeta.partialData??scan.partialData),
      freshnessMs:freshness.ms,
      freshnessState:freshness.state,
      counts:scan.counts&&typeof scan.counts==='object'?scan.counts:{},
      timings:scan.timings&&typeof scan.timings==='object'?scan.timings:{},
      metrics:scan.metrics&&typeof scan.metrics==='object'?scan.metrics:{},
      config:scan.config&&typeof scan.config==='object'?scan.config:{},
      candidateCount:candidates.length,
      usableCount,
      partialCount,
      dataMode,
      fallbackCandidateCount,
      candidates,
      errors:Array.isArray(scan.errors)?scan.errors.slice(0,20):[],
      excluded:Array.isArray(scan.excluded)?scan.excluded.slice(0,50):[],
      fetchedAt:now
    });
  }catch(error){
    const aborted=error&&error.name==='AbortError';
    return res.status(502).json({
      status:'degraded',
      source:'IGNITION',
      configured:true,
      error:aborted?'ignition_upstream_timeout':'ignition_upstream_unavailable',
      candidates:[]
    });
  }
};
