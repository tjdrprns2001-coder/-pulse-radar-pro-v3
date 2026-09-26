const handlers = {
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
  'signal-performance': require('../handlers/signal-performance')
};

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
          if(rr.ok&&body?.ok)return res.status(200).json({...body,structureRuntime:'oregon'});
          if(rr.status<500)return res.status(rr.status).json(body);
        }catch(_e){
          // Fall through to the local handler. Spot data may still be available even if the runtime is not.
        }finally{clearTimeout(timer)}
      }
    }
    return await fn(req, res);
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, error: error?.message || 'API handler failed', route });
    }
    throw error;
  }
};
