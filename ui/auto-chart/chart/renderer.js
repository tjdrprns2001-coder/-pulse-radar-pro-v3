(function(root,factory){
 const dep=typeof module==='object'&&module.exports?require('./overlays.js'):root.PulseAutoChartOverlays;const api=factory(dep);if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartRenderer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Overlays){'use strict';
function draw(canvas,analysis,{layers={volume:true,ma:false,ema:true,sr:true,box:true,bowl:true,longma:true,structure:true,liquidity:true,reference:true,dealing:true,zones:true,fib:false,vpvr:true,ichimoku:false},visible=180}={}){
  const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height;ctx.clearRect(0,0,W,H);ctx.fillStyle='#07111d';ctx.fillRect(0,0,W,H);
  if(!analysis?.available){ctx.fillStyle='#8ea4ba';ctx.font='20px system-ui';ctx.fillText('확정봉 데이터 없음',30,48);return}
  const all=analysis.candles,c=all.slice(-visible),offset=all.length-c.length,padL=68,padR=92,padT=42,volH=layers.volume?Math.round(H*.20):0,gap=layers.volume?18:0,priceBottom=H-volH-gap-30,priceH=priceBottom-padT,chartR=W-padR,step=(chartR-padL)/Math.max(1,c.length),bw=Math.max(2,Math.min(10,step*.58));
  let lo=Math.min(...c.map(x=>x.low)),hi=Math.max(...c.map(x=>x.high)),extra=(hi-lo)*.06||1;lo-=extra;hi+=extra;const y=p=>padT+(hi-Number(p))/(hi-lo||1)*priceH,x=i=>padL+(i-offset+.5)*step;
  ctx.strokeStyle='#142b3d';ctx.fillStyle='#7890a5';ctx.font='10px system-ui';for(let i=0;i<=5;i++){const yy=padT+priceH*i/5;ctx.beginPath();ctx.moveTo(padL,yy);ctx.lineTo(chartR,yy);ctx.stroke();const p=hi-(hi-lo)*i/5;ctx.fillText(formatPrice(p),chartR+7,yy+4)}
  const view={x,y,offset,left:padL,right:chartR};
  if(layers.vpvr)Overlays.drawVpvr(ctx,analysis,view);
  if(layers.dealing)Overlays.drawDealingRange(ctx,analysis,view);
  if(layers.ichimoku)Overlays.drawIchimoku(ctx,analysis,view);
  if(layers.reference)Overlays.drawReferenceLevels(ctx,analysis,view);
  if(layers.sr)Overlays.drawLevels(ctx,analysis,view);
  if(layers.zones)Overlays.drawAdvancedZones(ctx,analysis,view,layers);
  if(layers.box)Overlays.drawRange(ctx,analysis,view);
  if(layers.fib)Overlays.drawFib(ctx,analysis,view);
  if(layers.ma)Overlays.drawMa(ctx,analysis,view);
  if(layers.ema)Overlays.drawEmaPack(ctx,analysis,view);
  if(layers.longma)Overlays.drawLongSma(ctx,analysis,view);
  for(let i=0;i<c.length;i++){const k=c[i],gi=offset+i,xx=x(gi),up=k.close>=k.open,col=up?'#38d6a3':'#ff6677';ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(xx,y(k.high));ctx.lineTo(xx,y(k.low));ctx.stroke();ctx.fillRect(xx-bw/2,Math.min(y(k.open),y(k.close)),bw,Math.max(2,Math.abs(y(k.open)-y(k.close))))}
  if(layers.bowl)Overlays.drawBowl(ctx,analysis,view);
  if(layers.liquidity)Overlays.drawLiquidity(ctx,analysis,view);
  if(layers.structure)Overlays.drawSwings(ctx,analysis,view);
  if(layers.volume){const volOf=x=>Number.isFinite(Number(x?.volume))&&x?.volume!=null&&!(typeof x.volume==='string'&&x.volume.trim()==='')?Number(x.volume):0,volTop=priceBottom+gap,max=Math.max(...c.map(volOf),1);ctx.strokeStyle='#173149';ctx.beginPath();ctx.moveTo(padL,volTop);ctx.lineTo(chartR,volTop);ctx.stroke();for(let i=0;i<c.length;i++){const k=c[i],h=volOf(k)/max*(H-volTop-34);ctx.fillStyle=k.close>=k.open?'rgba(57,214,163,.42)':'rgba(255,111,127,.42)';ctx.fillRect(x(offset+i)-bw/2,H-28-h,bw,h)}ctx.fillStyle='#71899d';ctx.fillText('거래량 · 확정봉',padL,H-10)}
  const mtf=analysis.multiTimeframe?.regime||'NO MTF';ctx.fillStyle='#dcecff';ctx.font='bold 14px system-ui';ctx.fillText(analysis.market.symbol+' · '+String(analysis.timeframe).toUpperCase()+' · '+analysis.setup.label,padL,23);ctx.fillStyle='#89a7bf';ctx.font='bold 10px system-ui';ctx.fillText('MTF '+mtf+' · EMA '+String(analysis.advanced?.emaTrend||'N/A')+' · 압축 '+formatPct(analysis.advanced?.compressionPct),Math.max(padL,chartR-270),23);
}
function formatPct(v){return Number.isFinite(Number(v))?Number(v).toFixed(2)+'%':'N/A'}
function formatPrice(v){if(v==null||(typeof v==='string'&&v.trim()===''))return'N/A';const n=Number(v);if(!Number.isFinite(n))return'N/A';if(Math.abs(n)>=100)return n.toFixed(2);if(Math.abs(n)>=1)return n.toFixed(4);return n.toPrecision(5)}
return{draw,formatPrice,formatPct};
});