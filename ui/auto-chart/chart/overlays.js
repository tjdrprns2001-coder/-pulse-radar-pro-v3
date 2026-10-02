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
function drawLevels(ctx,analysis,view){const zs=(analysis.displayLevels||[]).map(z=>({z,top:Math.min(view.y(z.high),view.y(z.low))})).filter(x=>Number.isFinite(x.top)).sort((a,b)=>a.top-b.top);let last=-Infinity;for(const item of zs){let ly=item.top+13;if(ly-last<14)ly=last+14;last=ly;zone(ctx,item.z,{...view,labelY:ly})}}
function drawRange(ctx,analysis,{y,left,right}){const active=analysis.setup&&analysis.setup.state!=='INVALIDATED'&&analysis.setup.state!=='NO_SETUP',r=active?analysis.setup?.range:analysis.range;if(!r)return;const top=y(r.high),bot=y(r.low);ctx.save();ctx.strokeStyle=r.frozen?'#9fbcff':'#5a8fff';ctx.lineWidth=1.5;ctx.setLineDash([8,5]);ctx.strokeRect(left,Math.min(top,bot),right-left,Math.abs(bot-top));ctx.setLineDash([]);ctx.fillStyle='#9fbcff';ctx.font='bold 11px system-ui';ctx.fillText(r.frozen?'고정 박스':'관찰 박스',left+8,Math.min(top,bot)+16);ctx.restore()}
function drawSwings(ctx,analysis,{x,y,offset}){ctx.save();ctx.font='bold 10px system-ui';for(const s of (analysis.swings||[]).filter(q=>q.pivotIndex>=offset).slice(-14)){ctx.fillStyle=s.type==='H'?'#ffc3c9':'#97e7c7';ctx.fillText(s.label,x(s.pivotIndex)-9,y(s.price)+(s.type==='H'?-8:16))}ctx.restore()}
function plotSeries(ctx,series,{x,y,offset},style){ctx.save();ctx.strokeStyle=style.stroke;ctx.lineWidth=style.width||1.2;if(style.dash)ctx.setLineDash(style.dash);ctx.beginPath();let started=false;for(let i=offset;i<series.length;i++){if(!Number.isFinite(Number(series[i])))continue;const xx=x(i),yy=y(series[i]);if(!started){ctx.moveTo(xx,yy);started=true}else ctx.lineTo(xx,yy)}if(started)ctx.stroke();ctx.restore()}
function drawMa(ctx,analysis,view){const ma=analysis.indicators?.ma||{};plotSeries(ctx,ma[20]||[],view,{stroke:'#5fc7ff',width:1.4});plotSeries(ctx,ma[60]||[],view,{stroke:'#ffd166',width:1.4})}
function drawEmaPack(ctx,analysis,view){
 const e=analysis.advanced?.ema||{},cfg={14:['#6dd6ff',1.7],28:['#b4e06d',1.45],57:['#ffd166',1.35],92:['#ff9f68',1.35],142:['#c7a3ff',1],224:['#9aa9ff',1],268:['#d3a0db',1],378:['#9b8cff',1],448:['#7f79cf',1]};
 for(const p of[14,28,57,92])if(e[p])plotSeries(ctx,e[p],view,{stroke:cfg[p][0],width:cfg[p][1]});
 if(['1d','4h'].includes(String(analysis.timeframe).toLowerCase()))for(const p of[142,224,268,378,448])if(e[p])plotSeries(ctx,e[p],view,{stroke:cfg[p][0],width:cfg[p][1],dash:[5,5]});
}
function drawAdvancedZones(ctx,analysis,{y,left,right}){
 const a=analysis.advanced||{},zones=[...(a.fvg||[]).slice(-4),...(a.orderBlocks||[]).slice(-4)];
 ctx.save();ctx.font='bold 9px system-ui';
 for(const z of zones){const top=Math.min(y(z.high),y(z.low)),h=Math.max(2,Math.abs(y(z.high)-y(z.low))),bull=z.side==='bull';ctx.fillStyle=bull?'rgba(71,210,164,.08)':'rgba(255,111,127,.08)';ctx.strokeStyle=bull?'rgba(71,210,164,.48)':'rgba(255,111,127,.48)';ctx.setLineDash(z.kind.includes('FVG')?[6,4]:[]);ctx.fillRect(left,top,right-left,h);ctx.strokeRect(left,top,right-left,h);ctx.setLineDash([]);ctx.fillStyle=bull?'#84e4bd':'#ffabb4';ctx.fillText(z.kind.replace('_',' '),left+6,top+11)}
 ctx.restore()
}
function drawLiquidity(ctx,analysis,{y,left,right,x,offset}){
 const a=analysis.advanced||{};ctx.save();ctx.font='bold 9px system-ui';
 for(const l of(a.liquidity||[]).slice(-6)){const yy=y(l.price);ctx.strokeStyle=l.side==='buy-side'?'rgba(255,157,176,.65)':'rgba(98,224,177,.65)';ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=l.side==='buy-side'?'#ffadc0':'#8fe7c1';ctx.fillText(l.kind,right-34,yy-4)}
 for(const s of(a.sweeps||[]).filter(q=>q.index>=offset).slice(-8)){const xx=x(s.index),yy=y(s.price);ctx.fillStyle=s.side==='bull'?'#66e4b2':'#ff8290';ctx.beginPath();if(s.side==='bull'){ctx.moveTo(xx,yy-12);ctx.lineTo(xx-5,yy-3);ctx.lineTo(xx+5,yy-3)}else{ctx.moveTo(xx,yy+12);ctx.lineTo(xx-5,yy+3);ctx.lineTo(xx+5,yy+3)}ctx.closePath();ctx.fill();ctx.fillText(s.kind.includes('SWEEP')?'SWEEP':'MSS',xx+6,yy+(s.side==='bull'?-4:12))}
 ctx.restore()
}
function drawFib(ctx,analysis,{y,left,right}){
 const f=analysis.advanced?.fib;if(!f)return;ctx.save();ctx.font='9px system-ui';for(const [r,p] of Object.entries(f.levels||{})){const yy=y(p);ctx.strokeStyle='rgba(197,169,255,.45)';ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();ctx.fillStyle='#cbb3ff';ctx.fillText('Fib '+r,right-48,yy-3)}ctx.restore()
}
function drawVpvr(ctx,analysis,{y,left,right}){
 const v=analysis.advanced?.vpvr;if(!v)return;ctx.save();const top=Math.min(y(v.vah),y(v.val)),h=Math.abs(y(v.vah)-y(v.val));ctx.fillStyle='rgba(102,149,255,.045)';ctx.fillRect(left,top,right-left,h);for(const [name,p,stroke] of [['VAH',v.vah,'rgba(101,154,255,.42)'],['POC',v.poc,'rgba(255,214,110,.72)'],['VAL',v.val,'rgba(101,154,255,.42)']]){const yy=y(p);ctx.strokeStyle=stroke;ctx.setLineDash(name==='POC'?[]:[2,5]);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();ctx.fillStyle=name==='POC'?'#ffdb7d':'#9bbcff';ctx.font='bold 9px system-ui';ctx.fillText(name,left+6,yy-3)}ctx.restore()
}

function drawReferenceLevels(ctx,analysis,{y,left,right}){
 const lines=analysis.referenceLevels?.lines||[];ctx.save();ctx.font='bold 9px system-ui';let lane=0;
 for(const l of lines){const yy=y(l.price);if(!Number.isFinite(yy))continue;const weekly=l.label.startsWith('PW')||l.label==='W OPEN',session=/ASIA|LONDON|NY/.test(l.label),open=l.kind==='open';ctx.strokeStyle=weekly?'rgba(199,163,255,.62)':session?'rgba(94,191,255,.56)':open?'rgba(255,214,112,.55)':'rgba(210,224,240,.50)';ctx.lineWidth=weekly?1.5:1;ctx.setLineDash(session?[7,4]:open?[2,4]:[4,4]);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=weekly?'#d2b7ff':session?'#9fd7ff':open?'#ffdb7d':'#c7d5e2';const xx=Math.max(left+4,right-72-(lane%2)*54);ctx.fillText(l.label,xx,yy-3);lane++}
 ctx.restore()
}
function drawDealingRange(ctx,analysis,{y,left,right}){
 const d=analysis.referenceLevels?.dealingRange;if(!d)return;const yh=y(d.high),yl=y(d.low),ye=y(d.equilibrium);if(![yh,yl,ye].every(Number.isFinite))return;
 const top=Math.min(yh,yl),bottom=Math.max(yh,yl);ctx.save();ctx.fillStyle='rgba(255,106,126,.025)';ctx.fillRect(left,top,right-left,Math.max(0,ye-top));ctx.fillStyle='rgba(57,214,163,.025)';ctx.fillRect(left,ye,right-left,Math.max(0,bottom-ye));ctx.strokeStyle='rgba(193,169,255,.66)';ctx.setLineDash([8,5]);ctx.beginPath();ctx.moveTo(left,ye);ctx.lineTo(right,ye);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#cdb4ff';ctx.font='bold 9px system-ui';ctx.fillText('IPDA EQ · '+String(d.position||'UNKNOWN')+' '+(Number.isFinite(Number(d.positionPct))?Number(d.positionPct).toFixed(1)+'%':''),left+8,ye-4);ctx.restore()
}
function drawIchimoku(ctx,analysis,view){
 const a=analysis.advanced?.ichimoku;if(!a)return;const {x,y,offset}=view,sa=a.spanA||[],sb=a.spanB||[];ctx.save();for(let i=Math.max(offset+1,1);i<analysis.candles.length;i++){if(!Number.isFinite(Number(sa[i]))||!Number.isFinite(Number(sb[i])))continue;const x1=x(i-1),x2=x(i),a1=y(sa[i-1]),a2=y(sa[i]),b1=y(sb[i-1]),b2=y(sb[i]);if([a1,a2,b1,b2].some(v=>!Number.isFinite(v)))continue;ctx.fillStyle=sa[i]>=sb[i]?'rgba(70,190,145,.055)':'rgba(220,90,110,.055)';ctx.beginPath();ctx.moveTo(x1,a1);ctx.lineTo(x2,a2);ctx.lineTo(x2,b2);ctx.lineTo(x1,b1);ctx.closePath();ctx.fill()}ctx.restore()
}
return{drawLevels,drawRange,drawSwings,drawMa,drawEmaPack,drawAdvancedZones,drawLiquidity,drawReferenceLevels,drawDealingRange,drawFib,drawVpvr,drawIchimoku,palette,source,roleName};
});