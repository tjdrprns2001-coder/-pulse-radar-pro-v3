'use strict';

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function clean(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')}
function safe(v){return String(v||'NA').replace(/[^A-Za-z0-9_-]/g,'-').slice(0,64)||'NA'}

const HORIZONS=Object.freeze({h1:3600000,h4:14400000,h24:86400000});
function returnPct(entry,future){const a=finite(entry),b=finite(future);return a!=null&&a>0&&b!=null?((b/a)-1)*100:null}
function initialOutcome(event){const horizons={};for(const [key,ms] of Object.entries(HORIZONS))horizons[key]={status:'pending',targetTs:Number(event.capturedAt)+ms};return{id:event.id,symbol:event.symbol,state:event.state,entryPrice:event.price,capturedAt:event.capturedAt,horizons,updatedAt:event.capturedAt}}

function createRecommendationHistoryService({store,resolver=null,now=()=>Date.now(),cooldownMs=1800000,scoreDelta=8,maxEvaluationsPerRun=6}={}){
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
        try{if(await store.putRecommendation(id,event)){result.recorded++;recordedAt=ts;if(finite(event.price)!=null&&event.price>0&&typeof store.putRecommendationOutcome==='function')await store.putRecommendationOutcome(id,initialOutcome(event))}else result.duplicates++}catch(e){result.errors.push(symbol+':write:'+String(e?.message||e))}
      }else result.skipped++;
      try{await store.putState(stateKey,{symbol,state,score,updatedAt:ts,recordedAt:recordedAt||prev?.recordedAt||ts})}catch(e){result.errors.push(symbol+':state-write:'+String(e?.message||e))}
    }
    return result;
  }
  async function evaluateDue(){
    const result={attempted:0,evaluated:0,unavailable:0,pending:0,errors:[]};
    if(!resolver||typeof resolver.resolve!=='function'||typeof store.listRecommendations!=='function'||typeof store.getRecommendationOutcome!=='function'||typeof store.putRecommendationOutcome!=='function')return result;
    const ts=now(),rows=await store.listRecommendations();
    outer:for(const event of rows.sort((a,b)=>Number(a.capturedAt)-Number(b.capturedAt))){
      if(finite(event.price)==null||event.price<=0)continue;
      let outcome=await store.getRecommendationOutcome(event.id)||initialOutcome(event),changed=false;
      for(const key of Object.keys(HORIZONS)){
        const h=outcome.horizons?.[key]||{status:'pending',targetTs:Number(event.capturedAt)+HORIZONS[key]};
        if(h.status==='evaluated'||h.status==='unavailable')continue;
        if(ts<Number(h.targetTs)){result.pending++;continue}
        if(result.attempted>=Math.max(1,Number(maxEvaluationsPerRun)||6))break outer;
        result.attempted++;
        try{
          const resolved=await resolver.resolve(event.symbol,h.targetTs,ts);
          if(resolved?.status==='evaluated'){outcome.horizons[key]={status:'evaluated',targetTs:h.targetTs,marketTs:resolved.marketTs,price:resolved.price,returnPct:returnPct(event.price,resolved.price)};result.evaluated++;changed=true}
          else if(resolved?.status==='unavailable'){outcome.horizons[key]={status:'unavailable',targetTs:h.targetTs};result.unavailable++;changed=true}
          else result.pending++;
        }catch(e){result.errors.push(event.id+':'+key+':'+String(e?.message||e))}
      }
      if(changed){outcome.updatedAt=ts;await store.putRecommendationOutcome(event.id,outcome)}
    }
    return result;
  }
  async function list({symbol=null,state=null,limit=100,includeOutcomes=true}={}){
    if(typeof store.listRecommendations!=='function')return[];
    const sym=symbol?clean(symbol):null,st=state?String(state).toUpperCase():null;
    let rows=await store.listRecommendations();
    rows=rows.filter(x=>(!sym||x.symbol===sym)&&(!st||x.state===st)).sort((a,b)=>Number(b.capturedAt)-Number(a.capturedAt)).slice(0,Math.max(1,Math.min(500,Number(limit)||100)));
    if(!includeOutcomes||typeof store.listRecommendationOutcomes!=='function')return rows;
    const outcomes=await store.listRecommendationOutcomes(),map=new Map(outcomes.map(x=>[x.id,x]));
    return rows.map(x=>({...x,outcome:map.get(x.id)||null}));
  }
  function aggregateRows(rows=[]){
    const horizons={};
    for(const key of Object.keys(HORIZONS)){
      const vals=rows.map(x=>finite(x.outcome?.horizons?.[key]?.returnPct)).filter(v=>v!=null);
      horizons[key]={
        evaluatedCount:vals.length,
        positiveRatio:vals.length?vals.filter(v=>v>0).length/vals.length:null,
        meanReturnPct:vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null,
        bestReturnPct:vals.length?Math.max(...vals):null,
        worstReturnPct:vals.length?Math.min(...vals):null,
        sampleState:vals.length>=30?'통계 사용 가능':vals.length>=10?'참고용':'표본 부족'
      };
    }
    return{sampleCount:rows.length,horizons};
  }
  function grouped(rows,key){
    const map=new Map();
    for(const x of rows){const k=String(x?.[key]||'N/A');if(!map.has(k))map.set(k,[]);map.get(k).push(x)}
    return Object.fromEntries([...map.entries()].map(([k,v])=>[k,aggregateRows(v)]));
  }
  async function stats({state='RECOMMEND'}={}){
    const rows=await list({state,limit:500,includeOutcomes:true});
    return{...aggregateRows(rows),byScanClass:grouped(rows,'scanClass'),byV2Type:grouped(rows,'v2Type'),state:String(state||'RECOMMEND').toUpperCase()};
  }
  return{observe,evaluateDue,list,stats};
}
module.exports={HORIZONS,returnPct,initialOutcome,createRecommendationHistoryService};
