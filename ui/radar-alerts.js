(function(g){
  const states=new Map(),items=[];
  const COOLDOWN_MS=60000,MAX_RECENT=20;
  const idOf=m=>m?.id||`${m?.source||'unknown'}:${m?.marketType||'unknown'}:${m?.chain||''}:${m?.pairAddress||m?.symbol||'unknown'}`;
  function alertable(from,to,m){
    if(to==='RISK')return Number(m?.riskScore||0)>=50||m?.signal==='LIQUIDITY_RISK';
    if(to==='PRE-SURGE')return from==='WATCH'||from==='RISK';
    if(to==='SURGE')return from==='WATCH'||from==='PRE-SURGE'||from==='RISK';
    return false;
  }
  function observe(market,now){
    if(!market)return null;
    const id=idOf(market),ts=Number(now??Date.now()),to=String(market.label||'WATCH');
    let s=states.get(id);
    if(!s){states.set(id,{current:to,lastAlerted:to,lastAlertTs:-Infinity});return null}
    s.current=to;
    const from=s.lastAlerted;
    if(from===to)return null;
    if(!alertable(from,to,market))return null;
    if(ts-s.lastAlertTs<COOLDOWN_MS)return null;
    const alert={id,market:market.symbol||id,from,to,signal:market.signal||to,reasons:Array.isArray(market.reasons)?market.reasons.slice(0,3):[],ts};
    s.lastAlerted=to;s.lastAlertTs=ts;states.set(id,s);
    items.unshift(alert);if(items.length>MAX_RECENT)items.length=MAX_RECENT;
    return alert;
  }
  function recent(){return items.slice()}
  function reset(){states.clear();items.length=0}
  const api={observe,recent,reset,cooldownMs:COOLDOWN_MS};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;g.PulseRadarAlerts=api;
})(typeof window!=='undefined'?window:globalThis);
