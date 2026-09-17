'use strict';
const TO_PRE=new Set(['ACCUMULATION-PRE','ANOMALY','META-PRE','SECTOR-ROTATION']);
const CANDIDATE=new Set(['PRE-SURGE','ACCUMULATION-PRE','META-PRE','SECTOR-ROTATION','ANOMALY']);
const RISK=new Set(['DISTRIBUTION-RISK','PUMP-RISK']);
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function approved(from,to){return (to==='PRE-SURGE'&&TO_PRE.has(from))||(RISK.has(to)&&CANDIDATE.has(from))}
function createAlertService({store,now=()=>Date.now(),cooldownMs=1800000}={}){
  if(!store||typeof store.getState!=='function'||typeof store.putState!=='function'||typeof store.putAlert!=='function')throw new Error('alert store required');
  const cooldown=Math.max(60000,Number(cooldownMs)||1800000);
  async function observe(items=[]){
    const result={recorded:0,skipped:0,errors:[]};
    for(const item of Array.isArray(items)?items:[]){
      const symbol=String(item?.symbol||'').toUpperCase(),to=String(item?.scanClass?.key||item?.scanClassKey||'');if(!symbol||!to){result.skipped++;continue}
      const stateKey=`symbol:${symbol}`;let prev=null;
      try{prev=await store.getState(stateKey)}catch(e){result.errors.push(`${symbol}:state-read:${String(e?.message||e)}`)}
      const ts=finite(item?.updatedAt)??now();const from=String(prev?.classKey||'');
      const lastTransitions=prev?.lastTransitions&&typeof prev.lastTransitions==='object'?{...prev.lastTransitions}:{};
      if(from&&from!==to&&approved(from,to)){
        const transitionKey=`${from}>${to}`;const lastTs=finite(lastTransitions[transitionKey]);
        if(lastTs!=null&&ts-lastTs<cooldown){result.skipped++}
        else{
          const bucket=Math.floor(ts/cooldown)*cooldown;const id=`${symbol}:${from}:${to}:${bucket}`;
          const event={id,symbol,from,to,priority:RISK.has(to)?'risk':'signal',capturedAt:ts,previousConfidence:finite(prev?.confidence),currentConfidence:finite(item?.calibratedConfidence??item?.tradeSignal?.confidence),reasons:Array.isArray(item?.reasons)?item.reasons.slice(0,5).map(String):[],invalidations:Array.isArray(item?.tradeSignal?.invalidations)?item.tradeSignal.invalidations.slice(0,5).map(String):[]};
          try{if(await store.putAlert(id,event)){result.recorded++;lastTransitions[transitionKey]=ts}else result.skipped++}catch(e){result.errors.push(`${symbol}:alert:${String(e?.message||e)}`)}
        }
      }else result.skipped++;
      try{await store.putState(stateKey,{symbol,classKey:to,confidence:finite(item?.calibratedConfidence??item?.tradeSignal?.confidence),updatedAt:ts,lastTransitions})}catch(e){result.errors.push(`${symbol}:state-write:${String(e?.message||e)}`)}
    }
    return result;
  }
  async function list({symbol=null,limit=100}={}){const sym=symbol?String(symbol).toUpperCase():null;const rows=await store.listAlerts();return rows.filter(x=>!sym||x.symbol===sym).sort((a,b)=>Number(b.capturedAt)-Number(a.capturedAt)).slice(0,Math.max(1,Math.min(500,Number(limit)||100)))}
  return{observe,list};
}
module.exports={TO_PRE,CANDIDATE,RISK,approved,createAlertService};
