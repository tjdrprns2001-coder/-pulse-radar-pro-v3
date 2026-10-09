'use strict';
// Descriptive cohort aggregation. Correlated coin events share calendar-date clusters.
const KEYS=['train','validation','test'];
function summarizeWalkForwardCohort(reports=[]){
 const valid=(Array.isArray(reports)?reports:[]).filter(x=>x?.status==='READY'&&x?.version==='BOWL_WALK_FORWARD_v1');
 const splits={};
 for(const name of KEYS){
  const events=valid.flatMap(r=>(r.events?.[name]||[]).map(e=>({symbol:r.symbol,at:e.at,hit:e.hit72h10,return7dPct:e.return7dPct})));
  const clusters=new Map(),controls=valid.map(r=>r.bySplit?.[name]?.controls).filter(Boolean);
  for(const e of events){
   const day=new Date(e.at).toISOString().slice(0,10);
   if(!clusters.has(day))clusters.set(day,{day,events:0,hits:0,symbols:[]});
   const cluster=clusters.get(day);cluster.events++;if(e.hit)cluster.hits++;cluster.symbols.push(e.symbol);
  }
  const controlCount=controls.reduce((n,x)=>n+(x.count||0),0),controlHits=controls.reduce((n,x)=>n+(x.hit72h10Count||0),0);
  const hitCount=events.filter(e=>e.hit).length;
  splits[name]={signalCount:events.length,hitCount,hitRate:events.length?hitCount/events.length:null,
    controlCount,controlHits,controlHitRate:controlCount?controlHits/controlCount:null,
    signalDateClusters:clusters.size,
    correlationWarning:clusters.size<events.length,
    clusters:[...clusters.values()].sort((a,b)=>a.day.localeCompare(b.day)).map(z=>({...z,symbols:[...new Set(z.symbols)]}))};
 }
 const allEvents=KEYS.reduce((sum,k)=>sum+splits[k].signalCount,0);
 return{version:'BOWL_COHORT_SUMMARY_v1',shadowOnly:true,status:valid.length?'READY':'UNAVAILABLE',
   symbols:valid.map(r=>r.symbol),universeSize:valid.length,
   eventCount:allEvents,bySplit:splits,
   limitations:['calendar-day grouping exposes but does not remove macro cross-asset correlation',
     'controls are fixed-cadence descriptive references, not risk-matched controls',
     'no live tradability, PnL or reliable hit-probability claims']};
}
module.exports={summarizeWalkForwardCohort};
