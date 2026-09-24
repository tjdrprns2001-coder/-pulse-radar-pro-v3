(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PulseBookAiMtfComposer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const VERSION='BOOK_AI_MTF_COMPOSER_v1';
const ORDER=['1d','4h','1h','15m'];
function canvasLike(doc,w,h){const c=doc.createElement('canvas');c.width=w;c.height=h;return c}
function drawPanelHeader(ctx,{x,y,w,label,state='',bias=''}){ctx.save();ctx.fillStyle='rgba(7,17,29,.92)';ctx.fillRect(x,y,w,30);ctx.strokeStyle='#20384f';ctx.strokeRect(x,y,w,30);ctx.fillStyle='#edf5ff';ctx.font='bold 15px system-ui';ctx.fillText(String(label).toUpperCase(),x+10,y+20);ctx.fillStyle='#8ea4ba';ctx.font='11px system-ui';const meta=[state,bias].filter(Boolean).join(' · ');if(meta)ctx.fillText(meta,x+58,y+20);ctx.restore()}
function compose({canvas,panels={},renderer,documentRef=(typeof document!=='undefined'?document:null),symbol='BTCUSDT'}={}){
  if(!canvas||typeof canvas.getContext!=='function')throw new Error('aggregate canvas required');
  if(!renderer||typeof renderer.draw!=='function')throw new Error('SnapshotRenderer required');
  if(!documentRef||typeof documentRef.createElement!=='function')throw new Error('document required');
  const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height,gap=8,pw=Math.floor((W-gap)/2),ph=Math.floor((H-gap)/2);
  ctx.clearRect(0,0,W,H);ctx.fillStyle='#06101a';ctx.fillRect(0,0,W,H);
  ORDER.forEach((tf,idx)=>{
    const p=panels[tf],x=(idx%2)*(pw+gap),y=Math.floor(idx/2)*(ph+gap);
    ctx.save();ctx.fillStyle='#07111d';ctx.fillRect(x,y,pw,ph);ctx.restore();
    if(!p?.candles?.length){ctx.fillStyle='#7890a7';ctx.font='14px system-ui';ctx.fillText(tf.toUpperCase()+' 데이터 없음',x+16,y+52);return}
    const off=canvasLike(documentRef,pw,ph-30);
    renderer.draw(off,{symbol,timeframe:tf,candles:p.candles,analysis:p.analysis,smc:p.smc,liquidity:p.liquidity,ict:p.ict,show:{trend:true,structure:true,pd:true,smc:true,liquidity:true,profile:false,ma:false,dante:false,labels:true}});
    ctx.drawImage(off,x,y+30,pw,ph-30);
    drawPanelHeader(ctx,{x,y,w:pw,label:tf,state:p.state||'',bias:p.bias||''});
    ctx.strokeStyle='#20384f';ctx.strokeRect(x+.5,y+.5,pw-1,ph-1);
  });
  canvas.dataset.bookAiMtfRendered='1';
  return{version:VERSION,order:[...ORDER],panelCount:ORDER.filter(tf=>panels[tf]?.candles?.length).length};
}
function pngDataUrl(canvas){if(canvas?.dataset?.bookAiMtfRendered!=='1')throw new Error('aggregate snapshot not rendered');return canvas.toDataURL('image/png')}
return{VERSION,ORDER,compose,pngDataUrl};
});