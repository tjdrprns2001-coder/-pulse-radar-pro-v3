const handlers = {
  chartbro: require('../handlers/chartbro'),
  backtest: require('../handlers/backtest'),
  'bowl224-research': require('../handlers/bowl224-research'),
  'dante-backtest': require('../handlers/dante-backtest'),
  'calibration-freeze': require('../handlers/calibration-freeze'),
  'calibration-health': require('../handlers/calibration-health'),
  detail: require('../handlers/detail'),
  'historical-structure-study': require('../handlers/historical-structure-study'),
  htf: require('../handlers/htf'),
  'independent-temporal': require('../handlers/independent-temporal'),
  market: require('../handlers/market'),
  'micro-features': require('../handlers/micro-features'),
  pattern: require('../handlers/pattern'),
  'pattern-validation': require('../handlers/pattern-validation'),
  'structure-study': require('../handlers/structure-study'),
  structure: require('../handlers/structure'),
  'temporal-features': require('../handlers/temporal-features'),
  'trendline-study': require('../handlers/trendline-study'),
  'signal-alerts': require('../handlers/signal-alerts'),
  'signal-backfill': require('../handlers/signal-backfill'),
  'signal-calibration': require('../handlers/signal-calibration'),
  'signal-health': require('../handlers/signal-health'),
  'signal-performance': require('../handlers/signal-performance'),
  'learning-ai': require('../handlers/learning-ai'),
  'ignition-results': require('../handlers/ignition-results'),
  'chartbro-research': require('../handlers/chartbro-research'),
  'chart-snapshots': require('../handlers/chart-snapshots')
};

const structureEdgeCache=new Map();
function isHistoricalStructureQuery(q){
  return String(q?.market||'spot').toLowerCase()==='futures'&&String(q?.live||'')!=='1'&&String(q?.derivatives||'')!=='1'&&String(q?.meta||'')!=='1';
}
async function fetchStructureEdge(req){
  if(process.env.VERCEL||String(req.query?.edge||'')==='1'||!isHistoricalStructureQuery(req.query))return null;
  const base=String(process.env.STRUCTURE_EDGE_URL||'https://pulse-radar-pro-v3.vercel.app').replace(/\/$/,'');
  const params=new URLSearchParams();
  for(const [k,v] of Object.entries(req.query||{})){
    if(k==='route'||k==='local'||k==='edge'||v==null)continue;
    params.set(k,String(v));
  }
  params.set('local','1');params.set('edge','1');
  const key=params.toString(),now=Date.now(),hit=structureEdgeCache.get(key);
  if(hit&&hit.expiresAt>now)return hit.body;
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
  try{
    const rr=await fetch(base+'/api/structure?'+key,{signal:ctrl.signal,headers:{accept:'application/json','user-agent':'PulseRadar-Structure-Edge/1.0'}});
    const body=await rr.json().catch(()=>null);
    if(rr.ok&&body?.ok&&String(body?.market||'').toLowerCase()==='futures'){
      const tf=String(req.query?.interval||'1h').toLowerCase(),ttl=/^(1d|1w)$/.test(tf)?120000:/^(4h|1h)$/.test(tf)?60000:30000;
      structureEdgeCache.set(key,{body,expiresAt:now+ttl});
      if(structureEdgeCache.size>120){for(const [k,v] of structureEdgeCache)if(v.expiresAt<=now)structureEdgeCache.delete(k)}
      return body;
    }
    return null;
  }catch{return null}finally{clearTimeout(timer)}
}

module.exports = async function handler(req, res) {
  const route = String(req.query?.route || '').trim();
  const fn = handlers[route];
  if (!fn) {
    return res.status(404).json({ ok: false, error: 'Unknown API route', route });
  }
  try {
    if(route==='structure'){
      const runtime=String(process.env.STRUCTURE_RUNTIME_URL||'').replace(/\/$/,'');
      if(runtime&&String(req.query?.local||'')!=='1'){
        const params=new URLSearchParams();
        for(const [k,v] of Object.entries(req.query||{})){
          if(k==='route'||v==null)continue;
          params.set(k,String(v));
        }
        params.set('local','1');
        const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),25000);
        try{
          const rr=await fetch(runtime+'/api/structure?'+params.toString(),{signal:ctrl.signal,headers:{accept:'application/json'}});
          const body=await rr.json().catch(()=>({ok:false,error:'Structure runtime invalid response'}));
          const requestedMarket=String(req.query?.market||'spot').toLowerCase()==='futures'?'futures':'spot';
          const marketMatches=requestedMarket!=='futures'||String(body?.market||'').toLowerCase()==='futures';
          if(rr.ok&&body?.ok&&marketMatches)return res.status(200).json({...body,structureRuntime:'oregon'});
          if(rr.status<500&&rr.status!==418&&rr.status!==429&&marketMatches)return res.status(rr.status).json(body);
        }catch(_e){
          // Fall through to the local handler. Spot data may still be available even if the runtime is not.
        }finally{clearTimeout(timer)}
      }
      const edge=await fetchStructureEdge(req);
      if(edge)return res.status(200).json({...edge,structureRuntime:'vercel-edge',edgeFallback:true});
    }
    return await fn(req, res);
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, error: error?.message || 'API handler failed', route });
    }
    throw error;
  }
};
