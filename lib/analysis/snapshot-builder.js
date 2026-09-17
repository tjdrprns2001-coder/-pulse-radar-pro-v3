(function(root,factory){const layout=typeof module==='object'&&module.exports?require('../../ui/chart/annotation-layout.js'):root?.PulseAnnotationLayout;const api=factory(layout);if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseSnapshotBuilder=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Layout){'use strict';
const LIMITS={structure:3,sweepGrab:2,eq:2,smc:2,pattern:1,interest:1,invalidation:1,target:3};
function cat(a){const t=String(a.type||'').toUpperCase();if(t==='SWEEP'||t==='GRAB')return'sweepGrab';if(t==='EQH'||t==='EQL')return'eq';if(t==='FVG'||t==='OB')return'smc';return a.category||'structure';}
function normalizeAnnotation(a,tf,i){return{id:a.id||('snap:'+String(a.sourceId||a.type||'a')+':'+i),type:String(a.type||'LABEL').toUpperCase(),category:a.category||cat(a),priority:Number(a.priority)||0,barIndex:Number(a.barIndex)||0,price:Number(a.price),side:a.side||'above',collisionGroup:a.collisionGroup||'snapshot-label',allowOffset:a.allowOffset!==false,maxOffset:Number(a.maxOffset??16),viewportLevel:a.viewportLevel||'focused',tf,sourceId:a.sourceId||a.id||null,width:Number(a.width)||58,height:Number(a.height)||16,metadata:a.metadata||{}};}
function patternName(p){const t=String(p?.type||''),s=String(p?.subtype||'');if(t==='channel')return s==='ascending'?'상승 채널':s==='descending'?'하락 채널':'수평 채널';if(t==='triangle')return s==='ascending'?'상승 삼각형':s==='descending'?'하락 삼각형':'대칭 삼각형';if(t==='falling_wedge')return'하락 쐐기';if(t==='rising_wedge')return'상승 쐐기';return null;}
function patternStateText(s){return s==='BREAKOUT_CONFIRMED'?'돌파 확인':s==='BREAKOUT_CANDIDATE'?'돌파 후보':s==='PRE_BREAKOUT'?'돌파 관찰':s==='FAILED'?'패턴 무효':'형성 중';}
function lineGeometry(line,role,candles){if(!line?.id)return null;const startIndex=Number(line.startIndex??line.anchorA?.barIndex??0),endIndex=Number(line.endIndex??line.anchorB?.barIndex??Math.max(0,candles.length-1)),slope=Number(line.slope),intercept=Number(line.intercept);if(![startIndex,endIndex,slope,intercept].every(Number.isFinite))return null;const end=Math.max(endIndex,candles.length-1),priceAt=i=>intercept+slope*i;return{kind:'pattern-boundary',role,sourceId:line.id,startIndex,endIndex:end,startPrice:priceAt(startIndex),endPrice:priceAt(end),slope,intercept};}
function chooseBreakoutLine(pattern,support,resistance){if(pattern?.state==='BREAKOUT_CONFIRMED'||pattern?.state==='BREAKOUT_CANDIDATE'){if(resistance?.breakStatus?.confirmed||Number(resistance?.breakStatus?.maxDistanceAtr)>=.5)return resistance;if(support?.breakStatus?.confirmed||Number(support?.breakStatus?.maxDistanceAtr)>=.5)return support;}if(pattern?.type==='rising_wedge'||(pattern?.type==='triangle'&&pattern?.subtype==='descending'))return support;return resistance||support;}
function buildPatternGeometry(patternSet,trendlines,candles){const p=patternSet?.primary;if(!p?.type||!Array.isArray(p.sourceIds)||p.sourceIds.length<2)return null;const support=trendlines?.support,resistance=trendlines?.resistance;if(!support?.id||!resistance?.id)return null;const ids=new Set(p.sourceIds);if(!ids.has(support.id)||!ids.has(resistance.id))return null;const boundaries=[lineGeometry(support,'support',candles),lineGeometry(resistance,'resistance',candles)].filter(Boolean);if(boundaries.length!==2)return null;const breakLine=chooseBreakoutLine(p,support,resistance),breakGeom=lineGeometry(breakLine,breakLine===support?'support':'resistance',candles),name=patternName(p);if(!name||!breakGeom)return null;const breakout={kind:'pattern-breakout',sourceId:breakLine.id,role:breakGeom.role,startIndex:Math.max(0,candles.length-12),endIndex:Math.max(0,candles.length-1),price:Number(breakLine.currentLinePrice??breakGeom.endPrice)};return{type:p.type,subtype:p.subtype||null,state:p.state||'FORMING',confidence:Number(p.confidence)||0,sourceIds:[support.id,resistance.id],boundaries,breakout,label:`${name} · ${patternStateText(p.state)}`};}
function buildSnapshotModel(input={}){
  const tf=String(input.tf||'4h'),candles=Array.isArray(input.candles)?input.candles:[];
  const raw=[...(input.structure?.annotations||[]),...(input.liquidity?.annotations||[])];
  for(const z of input.smc?.zones||[]){if(z?.active===false)continue;const mid=(Number(z.low)+Number(z.high))/2;if(!Number.isFinite(mid))continue;raw.push({id:z.id||z.sourceId,type:String(z.type||'ZONE').toUpperCase(),category:'smc',barIndex:Number(z.barIndex)||Math.max(0,candles.length-1),price:mid,sourceId:z.sourceId||z.id,side:z.side==='bullish'?'below':'above',priority:Number(z.confluenceScore)||10});}
  const pattern=input.patternSet?.primary?{...input.patternSet.primary}:null;
  const patternGeometry=buildPatternGeometry(input.patternSet,input.trendlines,candles);
  if(patternGeometry){const mid=(patternGeometry.boundaries[0].endPrice+patternGeometry.boundaries[1].endPrice)/2;raw.push({id:'snapshot-pattern-label',type:patternGeometry.label,category:'pattern',barIndex:Math.max(0,candles.length-1),price:mid,sourceId:patternGeometry.sourceIds.join('|'),priority:18,allowOffset:true,maxOffset:18,width:118,height:16,metadata:{sourceIds:patternGeometry.sourceIds}});}
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
  return{tf,candles,overlays,annotations,pattern,patternGeometry};
}
return{buildSnapshotModel,SNAPSHOT_LIMITS:{...LIMITS}};
});
