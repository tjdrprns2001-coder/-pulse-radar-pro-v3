(function(root,factory){const layout=typeof module==='object'&&module.exports?require('../../ui/chart/annotation-layout.js'):root?.PulseAnnotationLayout;const api=factory(layout);if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseSnapshotBuilder=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Layout){'use strict';
const LIMITS={structure:3,sweepGrab:2,eq:2,smc:2,interest:1,invalidation:1,target:3};
function cat(a){const t=String(a.type||'').toUpperCase();if(t==='SWEEP'||t==='GRAB')return'sweepGrab';if(t==='EQH'||t==='EQL')return'eq';if(t==='FVG'||t==='OB')return'smc';return a.category||'structure';}
function normalizeAnnotation(a,tf,i){return{id:a.id||('snap:'+String(a.sourceId||a.type||'a')+':'+i),type:String(a.type||'LABEL').toUpperCase(),category:a.category||cat(a),priority:Number(a.priority)||0,barIndex:Number(a.barIndex)||0,price:Number(a.price),side:a.side||'above',collisionGroup:a.collisionGroup||'snapshot-label',allowOffset:a.allowOffset!==false,maxOffset:Number(a.maxOffset??16),viewportLevel:a.viewportLevel||'focused',tf,sourceId:a.sourceId||a.id||null,width:Number(a.width)||58,height:Number(a.height)||16,metadata:a.metadata||{}};}
function buildSnapshotModel(input={}){
  const tf=String(input.tf||'4h'),candles=Array.isArray(input.candles)?input.candles:[];
  const raw=[...(input.structure?.annotations||[]),...(input.liquidity?.annotations||[])];
  for(const z of input.smc?.zones||[]){if(z?.active===false)continue;const mid=(Number(z.low)+Number(z.high))/2;if(!Number.isFinite(mid))continue;raw.push({id:z.id||z.sourceId,type:String(z.type||'ZONE').toUpperCase(),category:'smc',barIndex:Number(z.barIndex)||Math.max(0,candles.length-1),price:mid,sourceId:z.sourceId||z.id,side:z.side==='bullish'?'below':'above',priority:Number(z.confluenceScore)||10});}
  const counts={},curated=[];
  for(const [i,a] of raw.entries()){
    const k=cat(a),limit=LIMITS[k]??LIMITS.structure;if((counts[k]||0)>=limit)continue;counts[k]=(counts[k]||0)+1;curated.push(normalizeAnnotation(a,tf,i));
  }
  const overlays=[];const s=input.scenario||{};
  if(s.interestZone)overlays.push({kind:'interest-zone',low:Number(s.interestZone.low),high:Number(s.interestZone.high),sourceId:s.interestZone.sourceId,type:s.interestZone.type});
  if(s.invalidation)overlays.push({kind:'invalidation',price:Number(s.invalidation.price),sourceId:s.invalidation.sourceId});
  for(const t of (s.targets||[]).slice(0,3))overlays.push({kind:'target',price:Number(t.price),sourceId:t.sourceId,type:t.type});
  let annotations=curated;
  if(Layout?.layoutAnnotations&&curated.length){
    const maxPrice=Math.max(...candles.map(c=>Number(c.high??c.close)).filter(Number.isFinite),1),minPrice=Math.min(...candles.map(c=>Number(c.low??c.close)).filter(Number.isFinite),0),span=Math.max(1e-12,maxPrice-minPrice);
    const result=Layout.layoutAnnotations(curated,{mode:'structure',viewportLevel:input.viewportLevel||'focused',xForBar:v=>Number(v)*12,yForPrice:v=>(maxPrice-Number(v))/span*400,width:Math.max(320,candles.length*12),height:420});
    annotations=result.visible||curated;
  }
  const pattern=input.patternSet?.primary?{...input.patternSet.primary}:null;
  return{tf,candles,overlays,annotations,pattern};
}
return{buildSnapshotModel,SNAPSHOT_LIMITS:{...LIMITS}};
});
