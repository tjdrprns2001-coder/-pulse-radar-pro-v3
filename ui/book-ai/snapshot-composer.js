(function(root,factory){
  const Builder=typeof module==='object'&&module.exports?require('../../lib/analysis/snapshot-builder.js'):root?.PulseSnapshotBuilder;
  const api=factory(Builder);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PulseBookAiSnapshotComposer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Builder){'use strict';
const VERSION='BOOK_AI_SNAPSHOT_COMPOSER_v2';
function ensureCanvas(canvas){if(!canvas||typeof canvas.getContext!=='function')throw new Error('canvas required')}
function overlayText(ctx,summary,W,H){
  const lines=[summary?.headline,summary?.htf,summary?.setup,summary?.counterEvidence].filter(Boolean).slice(0,4);
  const h=28+lines.length*21,y=H-h;
  ctx.save();ctx.fillStyle='rgba(5,10,17,.92)';ctx.fillRect(0,y,W,h);ctx.strokeStyle='rgba(79,140,255,.45)';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();
  ctx.fillStyle='#8fbaff';ctx.font='bold 12px system-ui';ctx.fillText('BOOK AI · '+String(summary?.symbol||''),18,y+20);
  ctx.fillStyle='#edf5ff';ctx.font='12px system-ui';
  lines.forEach((line,i)=>{const t=String(line);ctx.fillText(t.length>115?t.slice(0,112)+'…':t,18,y+43+i*21)});
  ctx.restore();
}
function chartTechnical(technical){
  if(!technical)return null;
  const ma=technical.ma||{},picked={};
  for(const p of[112,224,448]){
    if(Number.isFinite(Number(ma[p])))picked[p]=Number(ma[p]);
    if(Array.isArray(ma['series'+p]))picked['series'+p]=ma['series'+p];
  }
  return{...technical,ma:picked};
}
function compose({canvas,symbol,timeframe='4h',candles=[],analysis=null,smc=null,liquidity=null,ict=null,technical=null,summary,renderer,show=null}={}){
  ensureCanvas(canvas);
  if(!renderer||typeof renderer.draw!=='function')throw new Error('PulseSnapshotRenderer required');
  const opts=show||{trend:true,structure:true,pd:true,smc:true,liquidity:true,profile:false,ma:true,dante:false,labels:true};
  const snapshotModel=Builder?.buildSnapshotModel?Builder.buildSnapshotModel({tf:timeframe,candles,structure:analysis,liquidity,smc}):null;
  renderer.draw(canvas,{symbol,timeframe,candles,analysis,smc,liquidity,ict,technical:chartTechnical(technical),show:opts});
  overlayText(canvas.getContext('2d'),summary,canvas.width,canvas.height);
  canvas.dataset.bookAiRendered='1';
  return{version:VERSION,timeframe,snapshotModel,show:opts};
}
function pngDataUrl(canvas){ensureCanvas(canvas);if(canvas.dataset.bookAiRendered!=='1')throw new Error('snapshot not rendered');return canvas.toDataURL('image/png')}
return{VERSION,compose,pngDataUrl};
});