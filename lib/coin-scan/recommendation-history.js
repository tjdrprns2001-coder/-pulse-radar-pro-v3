'use strict';

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function clean(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')}
function safe(v){return String(v||'NA').replace(/[^A-Za-z0-9_-]/g,'-').slice(0,64)||'NA'}

function createRecommendationHistoryService({store,now=()=>Date.now(),cooldownMs=1800000,scoreDelta=8}={}){
  if(!store||typeof store.getState!=='function'||typeof store.putState!=='function'||typeof store.putRecommendation!=='function')throw new Error('recommendation history store required');
  const cooldown=Math.max(300000,Number(cooldownMs)||1800000),delta=Math.max(1,Number(scoreDelta)||8);
  async function observe(bundle={},context={}){
    const rows=[...(bundle.recommended||[]),...(bundle.watch||[]),...(bundle.wait||[]),...(bundle.excluded||[])];
    const result={observed:0,recorded:0,duplicates:0,skipped:0,errors:[]};
    for(const rec of rows){
      const symbol=clean(rec?.symbol),state=String(rec?.state||'').toUpperCase();if(!symbol||!state){result.skipped++;continue}
      result.observed++;
      const score=finite(rec.score)??0,ts=finite(context.updatedAt)??now(),stateKey='auto-rec:'+symbol;
      let prev=null;try{prev=await store.getState(stateKey)}catch(e){result.errors.push(symbol+':state-read:'+String(e?.message||e))}
      const stateChanged=Boolean(prev?.state&&prev.state!==state),scoreMoved=prev&&finite(prev.score)!=null?Math.abs(score-Number(prev.score))>=delta:false;
      const elapsed=prev&&finite(prev.recordedAt)!=null?ts-Number(prev.recordedAt):Infinity;
      const shouldRecord=!prev||stateChanged||scoreMoved||elapsed>=cooldown;
      const direction=!prev?'NEW':stateChanged?(prev.state+'→'+state):(scoreMoved?(score>Number(prev.score)?'SCORE_UP':'SCORE_DOWN'):'REFRESH');
      let recordedAt=prev?.recordedAt||null;
      if(shouldRecord){
        const bucket=Math.floor(ts/cooldown)*cooldown,id=[symbol,safe(state),safe(direction),bucket].join(':');
        const event={
          id,symbol,state,label:rec.label||state,score,capturedAt:ts,direction,
          previousState:prev?.state||null,previousScore:finite(prev?.score),
          price:finite(rec?.item?.lastPrice??rec?.price??context?.prices?.[symbol]),
          marketSource:context.marketSource||null,derivativesSource:context.derivativesSource||null,
          reasons:Array.isArray(rec.reasons)?rec.reasons.slice(0,6).map(String):[],
          missing:Array.isArray(rec.missing)?rec.missing.slice(0,5).map(String):[],
          invalidations:Array.isArray(rec.invalidations)?rec.invalidations.slice(0,5).map(String):[],
          scanClass:String(rec?.item?.scanClass?.key||rec?.scanClass||''),
          v2Type:String(rec?.item?.v2Type||rec?.v2Type||''),
          v3Tier:String(rec?.item?.v3LongTier||rec?.v3Tier||'')
        };
        try{if(await store.putRecommendation(id,event)){result.recorded++;recordedAt=ts}else result.duplicates++}catch(e){result.errors.push(symbol+':write:'+String(e?.message||e))}
      }else result.skipped++;
      try{await store.putState(stateKey,{symbol,state,score,updatedAt:ts,recordedAt:recordedAt||prev?.recordedAt||ts})}catch(e){result.errors.push(symbol+':state-write:'+String(e?.message||e))}
    }
    return result;
  }
  async function list({symbol=null,state=null,limit=100}={}){
    if(typeof store.listRecommendations!=='function')return[];
    const sym=symbol?clean(symbol):null,st=state?String(state).toUpperCase():null;
    const rows=await store.listRecommendations();
    return rows.filter(x=>(!sym||x.symbol===sym)&&(!st||x.state===st)).sort((a,b)=>Number(b.capturedAt)-Number(a.capturedAt)).slice(0,Math.max(1,Math.min(500,Number(limit)||100)));
  }
  return{observe,list};
}
module.exports={createRecommendationHistoryService};
