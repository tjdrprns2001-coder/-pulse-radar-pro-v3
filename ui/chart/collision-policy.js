(function(root,factory){const model=typeof module==='object'&&module.exports?require('./annotation-model'):root?.PulseAnnotationModel;const layout=typeof module==='object'&&module.exports?require('./annotation-layout'):root?.PulseAnnotationLayout;const api=factory(model,layout);if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseCollisionPolicy=api;})(typeof globalThis!=='undefined'?globalThis:this,function(AnnotationModel,AnnotationLayout){
  function selectNonCollidingMarkers(items,{minGapBars=1,maxItems=8}={}){
    const ranked=(Array.isArray(items)?items:[]).filter(x=>Number.isFinite(Number(x.i))).slice().sort((a,b)=>(Number(a.priority)||0)-(Number(b.priority)||0)||Number(b.i)-Number(a.i));
    const selected=[];
    for(const item of ranked){
      if(selected.some(x=>Math.abs(Number(x.i)-Number(item.i))<=minGapBars))continue;
      selected.push(item);
      if(selected.length>=maxItems)break;
    }
    return selected.sort((a,b)=>Number(a.i)-Number(b.i));
  }

  function clusterDirectionalMarkers(items,{distanceBars=2}={}){
    const src=(Array.isArray(items)?items:[]).filter(x=>Number.isFinite(Number(x.i))).slice().sort((a,b)=>Number(a.i)-Number(b.i));
    const out=[];
    for(const item of src){
      const prev=out.at(-1);
      if(prev&&prev.dir===item.dir&&Number(item.i)-Number(prev.lastI)<=distanceBars){prev.count+=1;prev.lastI=Number(item.i);prev.i=Number(item.i);continue}
      out.push({...item,i:Number(item.i),lastI:Number(item.i),count:1});
    }
    return out.map(x=>({...x,label:(x.dir==='up'?'S↑':'S↓')+(x.count>1?'×'+x.count:'')}));
  }

  function layoutMarkerCandidates(items,context={}){
    if(!AnnotationModel?.normalizeAnnotationCandidate||!AnnotationLayout?.layoutAnnotations)throw new Error('Pulse annotation layout dependencies are unavailable');
    const normalized=(Array.isArray(items)?items:[]).map(item=>AnnotationModel.normalizeAnnotationCandidate(item,context));
    return AnnotationLayout.layoutAnnotations(normalized,context);
  }

  return{selectNonCollidingMarkers,clusterDirectionalMarkers,layoutMarkerCandidates};
});