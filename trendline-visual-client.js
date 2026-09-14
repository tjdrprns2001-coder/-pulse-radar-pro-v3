(()=>{
  if(window.__pulseTrendlineVisualV1)return;window.__pulseTrendlineVisualV1=true;
  function install(){
    if(typeof renderOverlay!=='function'||typeof $!=='function')return false;
    if(renderOverlay.__pulseTrendlineVisualV1)return true;
    const base=renderOverlay;
    renderOverlay=function(){
      base();
      try{
        if(!F||!DATA||!$('#tTrend')?.checked||!series?.candle||!charts?.price)return;
        const svg=$('#trendSvg');if(!svg)return;
        const lastX=pxTime(F.b.length-1);
        const draw=(L,color,secondary=false)=>{
          if(!L||!Number.isFinite(+L.slope)||!Number.isFinite(+L.intercept))return;
          const local=Math.max(0,(L.anchorA?.barIndex??F.off)-F.off),end=F.b.length-1;
          const x1=pxTime(local),x2=lastX,p1=(+L.intercept)+(+L.slope)*(local+F.off),p2=(+L.intercept)+(+L.slope)*(end+F.off);
          const y1=series.candle.priceToCoordinate(p1),y2=series.candle.priceToCoordinate(p2);
          if(![x1,x2,y1,y2].every(Number.isFinite))return;
          const line=document.createElementNS('http://www.w3.org/2000/svg','line');
          line.setAttribute('x1',x1);line.setAttribute('x2',x2);line.setAttribute('y1',y1);line.setAttribute('y2',y2);line.setAttribute('stroke',color);
          line.setAttribute('stroke-width',secondary?'1.15':'2');
          if(secondary){line.setAttribute('stroke-dasharray','5 5');line.setAttribute('opacity','.48')}
          svg.appendChild(line)
        };
        // base() already renders exactly one primary support + resistance.
        const sec=DATA.trendlines?.secondary||{};
        (sec.support||[]).filter(x=>x&&x.state!=='broken').slice(0,2).forEach(x=>draw(x,C.green,true));
        (sec.resistance||[]).filter(x=>x&&x.state!=='broken').slice(0,2).forEach(x=>draw(x,C.red,true));
      }catch(e){console.warn('trendline visual extension',e)}
    };
    renderOverlay.__pulseTrendlineVisualV1=true;
    try{renderOverlay()}catch{}
    return true
  }
  let tries=0,t=setInterval(()=>{if(install()||++tries>40)clearInterval(t)},250);
})();