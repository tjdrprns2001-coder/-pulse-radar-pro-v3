(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartOverlays=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
function palette(z){
  const role=z.effectiveRole||z.role||z.type;
  if(role==='support')return{fill:'rgba(57,214,163,.10)',stroke:'rgba(57,214,163,.72)',text:'#86e8bd'};
  if(role==='resistance')return{fill:'rgba(255,111,127,.10)',stroke:'rgba(255,111,127,.72)',text:'#ffabb4'};
  return{fill:'rgba(255,203,92,.08)',stroke:'rgba(255,203,92,.78)',text:'#ffd67b'};
}
function source(z){const xs=z.timeframes?.length?z.timeframes:[z.sourceTimeframe||z.timeframe];return xs.filter(Boolean).map(x=>String(x).toUpperCase()).join('+')}
function roleName(z){const r=z.effectiveRole||z.role||z.type;return r==='support'?'지지':r==='resistance'?'저항':'전환'}
function lineWidth(z){const rank=Number(z.htfRank||0);return rank>=4?2.5:rank===3?1.9:rank===2?1.45:1.05}
function zone(ctx,z,{y,left,right,labelY=null}){const a=y(z.high),b=y(z.low),top=Math.min(a,b),h=Math.max(2,Math.abs(a-b)),p=palette(z),transition=(z.effectiveRole||z.role)==='transition';ctx.save();ctx.fillStyle=p.fill;ctx.strokeStyle=p.stroke;ctx.lineWidth=lineWidth(z);if(transition)ctx.setLineDash([7,5]);ctx.fillRect(left,top,right-left,h);ctx.strokeRect(left,top,right-left,h);ctx.setLineDash([]);ctx.fillStyle=p.text;ctx.font=(Number(z.htfRank||0)>=4?'bold 12px':'bold 10px')+' system-ui';const shortStatus=z.statusLabel||'';const label=(source(z)||'TF')+' '+roleName(z)+(shortStatus?' · '+shortStatus:'');ctx.fillText(label,Math.max(left+6,right-Math.min(250,ctx.measureText(label).width+8)),labelY??(top+14));ctx.restore()}
function drawLevels(ctx,analysis,view){
  const zs=(analysis.displayLevels||[]).map(z=>({z,top:Math.min(view.y(z.high),view.y(z.low))})).filter(x=>Number.isFinite(x.top)).sort((a,b)=>a.top-b.top);
  let last=-Infinity;
  for(const item of zs){let ly=item.top+13;if(ly-last<14)ly=last+14;last=ly;zone(ctx,item.z,{...view,labelY:ly})}
}
function drawRange(ctx,analysis,{y,left,right}){const active=analysis.setup&&analysis.setup.state!=='INVALIDATED'&&analysis.setup.state!=='NO_SETUP',r=active?analysis.setup?.range:analysis.range;if(!r)return;const top=y(r.high),bot=y(r.low);ctx.save();ctx.strokeStyle=r.frozen?'#9fbcff':'#5a8fff';ctx.lineWidth=1.5;ctx.setLineDash([8,5]);ctx.strokeRect(left,Math.min(top,bot),right-left,Math.abs(bot-top));ctx.setLineDash([]);ctx.fillStyle='#9fbcff';ctx.font='bold 11px system-ui';ctx.fillText(r.frozen?'고정 박스':'관찰 박스',left+8,Math.min(top,bot)+16);ctx.restore()}
function drawSwings(ctx,analysis,{x,y,offset}){ctx.save();ctx.font='bold 10px system-ui';for(const s of (analysis.swings||[]).filter(q=>q.pivotIndex>=offset).slice(-12)){ctx.fillStyle=s.type==='H'?'#ffc3c9':'#97e7c7';ctx.fillText(s.label,x(s.pivotIndex)-9,y(s.price)+(s.type==='H'?-8:16))}ctx.restore()}
function drawMa(ctx,analysis,{x,y,offset}){const ma=analysis.indicators?.ma||{},colors={20:'#5fc7ff',60:'#ffd166'};for(const p of[20,60]){const s=ma[p]||[];ctx.save();ctx.strokeStyle=colors[p];ctx.lineWidth=1.5;ctx.beginPath();let started=false;for(let i=offset;i<analysis.candles.length;i++){if(!Number.isFinite(Number(s[i])))continue;const xx=x(i),yy=y(s[i]);if(!started){ctx.moveTo(xx,yy);started=true}else ctx.lineTo(xx,yy)}ctx.stroke();ctx.restore()}}
return{drawLevels,drawRange,drawSwings,drawMa,palette,source,roleName};
});