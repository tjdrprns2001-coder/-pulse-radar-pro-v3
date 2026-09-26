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

function normalizeCandidate(row={}){
  const coverage=finite(row.coverage);
  const detailComplete=Boolean(row.detailComplete);
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
    matches:Array.isArray(row.matches)?row.matches.slice(0,12):[]
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
  const timeoutMs=Math.max(1000,Math.min(30000,Number(ctx.timeoutMs)||10000));
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  const now=typeof ctx.now==='function'?ctx.now():Date.now();

  try{
    const upstream=await fetchImpl(base+'/api/v1/results',{
      headers:{
        authorization:'Bearer '+token,
        accept:'application/json'
      },
      cache:'no-store',
      signal:ctrl.signal
    });
    if(!upstream.ok){
      return res.status(502).json({
        status:'degraded',
        source:'IGNITION',
        configured:true,
        upstreamStatus:upstream.status,
        error:'ignition_upstream_http_'+upstream.status,
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
  }finally{
    clearTimeout(timer);
  }
};
