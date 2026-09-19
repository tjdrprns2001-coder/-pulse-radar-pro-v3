(function(root,factory){const cp=typeof module==='object'&&module.exports?require('../collision-policy'):root?.PulseCollisionPolicy;const api=factory(cp);if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseLiquidityPlugin=api;})(typeof globalThis!=='undefined'?globalThis:this,function(CollisionPolicy){'use strict';
  const LABELS={PDH:'PDH',PDL:'PDL',PWH:'PWH',PWL:'PWL',EQH:'EQH',EQL:'EQL'};
  const OVERLAY_LABELS={SWING_HIGH:'BSL',EQH:'BSL·EQH',PDH:'BSL·PDH',PWH:'BSL·PWH',SWING_LOW:'SSL',EQL:'SSL·EQL',PDL:'SSL·PDL',PWL:'SSL·PWL'};
  const ACTIVE_STATES=new Set(['active','probed','swept']);
  function sweepLabel(sw){const up=String(sw.dir||'')==='up';return sw.variant==='GRAB'?(up?'G↑':'G↓'):(up?'S↑':'S↓');}
  function overlaySweepLabel(sw){const bullish=String(sw.dir||'')==='up';const side=bullish?'SSL':'BSL';return sw.variant==='GRAB'?side+' R':side+' SWEEP';}
  function buildLiquidityPresentation(liquidity={},context={}){
    const tf=String(context.tf||context.timeframe||'');const annotations=[],regions=[];
    for(const l of Array.isArray(liquidity.levels)?liquidity.levels:[]){if(!LABELS[l.type])continue;annotations.push({type:l.type,category:'liquidity',label:LABELS[l.type],barIndex:Number(l.confirmedAt??l.startIndex??0)||0,price:Number(l.price),side:l.side==='buy'?'above':'below',collisionGroup:'chart-label',allowOffset:true,maxOffset:24,viewportLevel:context.viewportLevel||'normal',tf,sourceId:String(l.sourceId||l.id),width:Math.max(28,LABELS[l.type].length*8),height:18,metadata:{levelId:l.id,state:l.state}})}
    for(const sw of Array.isArray(liquidity.sweeps)?liquidity.sweeps:[]){const label=sweepLabel(sw);annotations.push({type:sw.variant==='GRAB'?'GRAB':'SWEEP',category:'liquidity',label,barIndex:Number(sw.index)||0,price:Number(sw.level),side:String(sw.dir)==='up'?'below':'above',collisionGroup:'chart-label',allowOffset:true,maxOffset:24,viewportLevel:context.viewportLevel||'normal',tf,sourceId:String(sw.sourceId||sw.sourceSweepId||sw.id),width:Math.max(28,label.length*8),height:18,metadata:{sweepId:sw.id,variant:sw.variant}})}
    for(const ind of Array.isArray(liquidity.inducements)?liquidity.inducements:[]){const sourceId=String(ind.id||ind.sourceSweepId||ind.sourceIds?.join('|')||'ind');const target=(liquidity.levels||[]).find(l=>l.id===ind.targetLevelId);const small=(liquidity.levels||[]).find(l=>l.id===ind.smallLevelId);annotations.push({type:'IND',category:'liquidity',label:'IND?',barIndex:Number(ind.index??small?.confirmedAt??small?.startIndex??0)||0,price:Number(small?.price??target?.price??0),side:ind.direction==='up'?'below':'above',collisionGroup:'chart-label',allowOffset:true,maxOffset:16,viewportLevel:context.viewportLevel||'normal',tf,sourceId,width:34,height:18,metadata:{confidence:'candidate',sourceIds:ind.sourceIds||[]}})}
    for(const v of Array.isArray(liquidity.voids)?liquidity.voids:[]){regions.push({id:v.id,kind:'VOID',dir:v.dir,low:Number(v.low),high:Number(v.high),startIndex:Number(v.startIndex)||0,endIndex:Number(v.endIndex)||0,state:v.state||'active',definitionVersion:v.definitionVersion||'VOID_v1'})}
    return{annotations,regions};
  }
  function uniqueByPrice(levels,tolerance=.0008){
    const out=[];for(const l of levels){const p=Number(l.price);if(!Number.isFinite(p))continue;const hit=out.some(x=>Math.abs(Number(x.price)-p)<=Math.max(Math.abs(p)*tolerance,1e-12));if(!hit)out.push(l)}return out;
  }
  function selectOverlayLevels(liquidity={},candles=[],limitPerSide=2){
    const last=Number(candles?.at(-1)?.close);if(!Number.isFinite(last))return[];
    const source=(liquidity.levels||[]).filter(l=>Number.isFinite(Number(l.price))&&OVERLAY_LABELS[l.type]&&(!l.state||ACTIVE_STATES.has(l.state)));
    const rank=side=>uniqueByPrice(source.filter(l=>l.side===side).sort((a,b)=>Math.abs(Number(a.price)-last)-Math.abs(Number(b.price)-last)||Number(b.quality||0)-Number(a.quality||0))).slice(0,limitPerSide);
    return [...rank('buy'),...rank('sell')].map(l=>({...l,overlayLabel:OVERLAY_LABELS[l.type]||l.type}));
  }
  function buildOverlayPresentation(liquidity={},candles=[],context={}){
    const tf=String(context.tf||context.timeframe||''),levels=selectOverlayLevels(liquidity,candles,Number(context.limitPerSide)||2);
    const annotations=levels.map(l=>({type:l.type,category:'liquidity-overlay',label:l.overlayLabel,barIndex:Number(l.confirmedAt??l.startIndex??0)||0,price:Number(l.price),side:l.side==='buy'?'above':'below',collisionGroup:'liquidity-overlay',allowOffset:true,maxOffset:18,viewportLevel:context.viewportLevel||'normal',tf,sourceId:String(l.sourceId||l.id),width:Math.max(32,l.overlayLabel.length*8),height:18,metadata:{levelId:l.id,state:l.state,side:l.side}}));
    const sweeps=(liquidity.sweeps||[]).slice(-4).map(sw=>{const label=overlaySweepLabel(sw);return{type:sw.variant==='GRAB'?'RECLAIM':'SWEEP',category:'liquidity-overlay',label,barIndex:Number(sw.index)||0,price:Number(sw.level),side:String(sw.dir)==='up'?'below':'above',collisionGroup:'liquidity-overlay',allowOffset:true,maxOffset:22,viewportLevel:context.viewportLevel||'normal',tf,sourceId:String(sw.sourceId||sw.sourceSweepId||sw.id),width:Math.max(48,label.length*8),height:18,metadata:{sweepId:sw.id,variant:sw.variant,displacementConfirmed:!!sw.displacementConfirmed}}});
    return{levels,annotations:[...annotations,...sweeps]};
  }
  function createLiquidityPlugin(){let ctx=null,visible=true,series=[],markersApi=null,lastState=null;const sec=v=>{v=Number(v);return Math.trunc(v>1e12?v/1000:v)};
    function clear(){try{markersApi?.detach?.()}catch{}markersApi=null;for(const s of series){try{ctx?.chart?.removeSeries(s)}catch{}}series=[]}
    function addLevelLine(price,start,end,{style=2,width=1}={}){if(!ctx?.addLineSeries||!Number.isFinite(Number(price))||!start||!end)return;const s=ctx.addLineSeries({lineWidth:width,lineStyle:style,lastValueVisible:false,priceLineVisible:false});s.setData([{time:start,value:Number(price)},{time:end,value:Number(price)}]);series.push(s)}
    function update(state={}){lastState=state;clear();if(!ctx||!visible)return;const liquidity=state.liquidity;if(!liquidity)return;const candles=state.rawCandles||state.candles||[],end=sec(candles.at(-1)?.time);if(!end)return;const overlay=buildOverlayPresentation(liquidity,candles,{tf:state.timeframe||state.tf||'',viewportLevel:state.viewportLevel||'normal',limitPerSide:2});
      for(const l of overlay.levels){const start=sec(candles[Math.max(0,Number(l.startIndex)||0)]?.time||candles[0]?.time);addLevelLine(l.price,start,end,{style:l.type.startsWith('PW')?3:2,width:l.type==='EQH'||l.type==='EQL'?2:1})}
      if(!ctx?.library?.createSeriesMarkers||!ctx.candlesSeries||!overlay.annotations.length)return;let chosen=overlay.annotations;
      if(CollisionPolicy?.layoutMarkerCandidates&&ctx?.chart?.timeScale&&ctx?.candlesSeries?.priceToCoordinate){try{const width=Number(ctx?.container?.clientWidth)||1024,height=Number(ctx?.container?.clientHeight)||480;const result=CollisionPolicy.layoutMarkerCandidates(overlay.annotations,{mode:'liquidity',viewportLevel:state.viewportLevel||'normal',width,height,xForBar:i=>{const t=sec(candles?.[i]?.time);const x=ctx.chart.timeScale().timeToCoordinate(t);return Number.isFinite(Number(x))?Number(x):i*10},yForPrice:p=>{const y=ctx.candlesSeries.priceToCoordinate(Number(p));return Number.isFinite(Number(y))?Number(y):Number(p)}});chosen=result.visible}catch{}}
      const marks=chosen.filter(a=>candles?.[a.barIndex]).map(a=>({time:sec(candles[a.barIndex].time),position:a.side==='above'?'aboveBar':'belowBar',shape:a.type==='RECLAIM'?'arrowUp':'circle',text:a.label,color:a.type==='RECLAIM'?'#67e8f9':a.label.startsWith('BSL')?'#f0abfc':'#7dd3fc'}));if(marks.length)markersApi=ctx.library.createSeriesMarkers(ctx.candlesSeries,marks,{autoScale:false});
    }
    return{id:'liquidity',version:'2.0.0',requiredData:['candles','liquidity'],mount(c){ctx=c},update,setVisible(v){visible=!!v;if(!visible)clear();else if(lastState)update(lastState)},dispose(){clear();lastState=null;ctx=null}};
  }
  return{buildLiquidityPresentation,buildOverlayPresentation,selectOverlayLevels,createLiquidityPlugin};
});