(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PulseShapeOverlay=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
  const NS='http://www.w3.org/2000/svg';
  const sec=v=>{v=Number(v);return Math.trunc(v>1e12?v/1000:v)};
  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  function canDraw(ctx){return typeof document!=='undefined'&&!!ctx?.container&&!!ctx?.chart?.timeScale&&!!ctx?.candlesSeries?.priceToCoordinate}
  function ensureLayer(ctx,id,z=5){
    if(!canDraw(ctx))return null;
    const c=ctx.container;c.style.position=c.style.position||'relative';
    let svg=c.querySelector?.(`svg[data-pulse-shape-layer="${id}"]`);
    if(!svg){
      svg=document.createElementNS(NS,'svg');
      svg.dataset.pulseShapeLayer=id;
      svg.style.cssText=`position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:${z};overflow:hidden`;
      c.appendChild(svg);
    }
    const w=Math.max(1,c.clientWidth||1),h=Math.max(1,c.clientHeight||1);
    svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
    svg.setAttribute('preserveAspectRatio','none');
    return{svg,w,h};
  }
  function clearLayer(ctx,id){const svg=ctx?.container?.querySelector?.(`svg[data-pulse-shape-layer="${id}"]`);if(svg)svg.replaceChildren()}
  function removeLayer(ctx,id){const svg=ctx?.container?.querySelector?.(`svg[data-pulse-shape-layer="${id}"]`);if(svg?.parentNode)svg.parentNode.removeChild(svg)}
  function setLayerOpacity(ctx,id,value){const svg=ctx?.container?.querySelector?.(`svg[data-pulse-shape-layer="${id}"]`);if(svg)svg.style.opacity=String(value)}
  function xFor(ctx,t){const x=ctx?.chart?.timeScale?.().timeToCoordinate?.(sec(t));return Number.isFinite(Number(x))?Number(x):null}
  function yFor(ctx,p){const y=ctx?.candlesSeries?.priceToCoordinate?.(Number(p));return Number.isFinite(Number(y))?Number(y):null}
  function el(tag,attrs={}){const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs)){if(v==null)continue;n.setAttribute(k,String(v))}return n}
  function line(svg,x1,y1,x2,y2,opt={}){
    if(!svg||![x1,y1,x2,y2].every(v=>Number.isFinite(Number(v))))return null;
    const n=el('line',{x1,y1,x2,y2,stroke:opt.stroke||'#8ba5c4','stroke-width':opt.width||1.5,'stroke-opacity':opt.opacity??.9,'stroke-dasharray':opt.dash||null,'stroke-linecap':'round'});svg.appendChild(n);return n;
  }
  function rect(svg,x1,y1,x2,y2,opt={}){
    if(!svg||![x1,y1,x2,y2].every(v=>Number.isFinite(Number(v))))return null;
    const x=Math.min(x1,x2),y=Math.min(y1,y2),w=Math.abs(x2-x1),h=Math.abs(y2-y1);
    const n=el('rect',{x,y,width:w,height:h,rx:opt.rx??4,fill:opt.fill||'none','fill-opacity':opt.fillOpacity??.12,stroke:opt.stroke||'none','stroke-opacity':opt.strokeOpacity??.8,'stroke-width':opt.width||1,'stroke-dasharray':opt.dash||null});svg.appendChild(n);return n;
  }
  function circle(svg,x,y,r,opt={}){
    if(!svg||![x,y,r].every(v=>Number.isFinite(Number(v))))return null;
    const n=el('circle',{cx:x,cy:y,r,fill:opt.fill||'none','fill-opacity':opt.fillOpacity??1,stroke:opt.stroke||'#fff','stroke-width':opt.width||1.5,'stroke-opacity':opt.strokeOpacity??1});svg.appendChild(n);return n;
  }
  function polygon(svg,points,opt={}){
    if(!svg||!Array.isArray(points)||points.length<3)return null;
    const n=el('polygon',{points:points.map(p=>p.join(',')).join(' '),fill:opt.fill||'#fff','fill-opacity':opt.fillOpacity??1,stroke:opt.stroke||'none','stroke-width':opt.width||1});svg.appendChild(n);return n;
  }
  function arrow(svg,x1,y1,x2,y2,opt={}){
    if(!svg||![x1,y1,x2,y2].every(v=>Number.isFinite(Number(v))))return null;
    const color=opt.stroke||opt.fill||'#35d69a',width=opt.width||2,head=opt.head||7;
    line(svg,x1,y1,x2,y2,{stroke:color,width,opacity:opt.opacity??1,dash:opt.dash});
    const a=Math.atan2(y2-y1,x2-x1),p1=[x2-head*Math.cos(a-Math.PI/6),y2-head*Math.sin(a-Math.PI/6)],p2=[x2-head*Math.cos(a+Math.PI/6),y2-head*Math.sin(a+Math.PI/6)];
    return polygon(svg,[[x2,y2],p1,p2],{fill:color,fillOpacity:opt.opacity??1});
  }
  function badge(svg,x,y,n,opt={}){
    if(!svg||!Number.isFinite(Number(x))||!Number.isFinite(Number(y)))return null;
    const r=opt.r||9,color=opt.color||'#4f8cff';
    circle(svg,x,y,r,{fill:color,fillOpacity:.95,stroke:'#07101a',width:2});
    const t=el('text',{x,y:y+.5,'text-anchor':'middle','dominant-baseline':'middle',fill:opt.textColor||'#fff','font-size':opt.fontSize||10,'font-weight':'800','font-family':'system-ui,-apple-system,sans-serif'});t.textContent=String(n);svg.appendChild(t);return t;
  }
  function priceBand(ctx,svg,price,{x1=0,x2=null,height=10,fill='#8ba5c4',opacity=.12,stroke=null,dash=null}={}){
    const y=yFor(ctx,price);if(y==null)return null;const w=Number(ctx?.container?.clientWidth)||1;return rect(svg,x1,y-height/2,x2==null?w:x2,y+height/2,{fill,fillOpacity:opacity,stroke:stroke||fill,strokeOpacity:.55,width:1,dash,rx:3});
  }
  function zone(ctx,svg,startTime,endTime,low,high,opt={}){
    const x1=xFor(ctx,startTime),x2=xFor(ctx,endTime),y1=yFor(ctx,high),y2=yFor(ctx,low);if([x1,x2,y1,y2].some(v=>v==null))return null;return rect(svg,x1,y1,x2,y2,opt);
  }
  function candleBox(ctx,svg,candle,opt={}){
    if(!candle)return null;const x=xFor(ctx,candle.time??candle.openTime),yh=yFor(ctx,candle.high),yl=yFor(ctx,candle.low);if(x==null||yh==null||yl==null)return null;return rect(svg,x-4,yh,x+4,yl,{fill:opt.fill||'#4fd1c5',fillOpacity:opt.opacity??.18,stroke:opt.stroke||opt.fill||'#4fd1c5',strokeOpacity:.8,width:1,rx:2});
  }
  function polyline(svg,pts,opt={}){
    const clean=(pts||[]).filter(p=>Array.isArray(p)&&p.every(v=>Number.isFinite(Number(v))));if(clean.length<2)return null;
    const n=el('polyline',{points:clean.map(p=>p.join(',')).join(' '),fill:'none',stroke:opt.stroke||'#8ba5c4','stroke-width':opt.width||1.5,'stroke-opacity':opt.opacity??.75,'stroke-dasharray':opt.dash||'4 4','stroke-linecap':'round','stroke-linejoin':'round'});svg.appendChild(n);return n;
  }
  return{canDraw,ensureLayer,clearLayer,removeLayer,setLayerOpacity,xFor,yFor,line,rect,circle,polygon,arrow,badge,priceBand,zone,candleBox,polyline,sec};
});