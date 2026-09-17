(()=>{'use strict';
const P=window.CanvasRenderingContext2D?.prototype;if(!P||P.__pulseSnapshotLabelGuard)return;P.__pulseSnapshotLabelGuard=true;
const nativeFillText=P.fillText,nativeClearRect=P.clearRect;const state=new WeakMap();
function mobile(ctx){return ctx?.canvas?.id==='snapshotChart'&&Math.min(ctx.canvas.clientWidth||innerWidth,innerWidth)<=650}
function fresh(ctx){const s={target:0,structure:0,ys:[]};state.set(ctx,s);return s}
P.clearRect=function(x,y,w,h){if(this?.canvas?.id==='snapshotChart')fresh(this);return nativeClearRect.call(this,x,y,w,h)};
P.fillText=function(text,x,y,maxWidth){
  try{
    if(mobile(this)){
      const s=state.get(this)||fresh(this),t=String(text||'').trim();
      if(/^Breakout$/i.test(t))return;
      const isTarget=/^Target$/i.test(t),isInvalid=/^Invalidation$/i.test(t),isStructure=/^(BOS|CHOCH|CHoCH|MSS|SWEEP|GRAB|EQH|EQL|PDH|PDL|PWH|PWL)$/i.test(t);
      if(isTarget&&s.target>=1)return;
      if(isStructure&&s.structure>=2)return;
      if((isTarget||isInvalid||isStructure)&&s.ys.some(v=>Math.abs(v-Number(y))<18))return;
      if(isTarget)s.target++;
      if(isStructure)s.structure++;
      if(isTarget||isInvalid||isStructure)s.ys.push(Number(y));
    }
  }catch{}
  return maxWidth===undefined?nativeFillText.call(this,text,x,y):nativeFillText.call(this,text,x,y,maxWidth);
};
})();
