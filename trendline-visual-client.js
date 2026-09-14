(()=>{
  if(window.__pulseTrendlineVisualV2)return;window.__pulseTrendlineVisualV2=true;
  function install(){
    if(typeof renderOverlay!=='function'||typeof $!=='function')return false;
    if(renderOverlay.__pulseTrendlineVisualV2)return true;
    const base=renderOverlay;
    renderOverlay=function(){
      // Let the base renderer draw zones/events, but remove its old full-length trendlines.
      base();
      try{
        if(!F||!DATA||!$('#tTrend')?.checked||!series?.candle||!charts?.price)return;
        const svg=$('#trendSvg');if(!svg)return;
        svg.innerHTML='';
        const N=F.b.length,last=N-1;
        if(last<1)return;
        const globalOf=local=>local+F.off;
        const localOf=global=>Math.max(0,Math.min(last,global-F.off));
        const atr=Number(F.atr)||0;
        const current=Number(F.b[last]?.close)||0;
        const maxAge={"15m":72,"1h":84,"4h":96,"1d":120}[typeof tf==='string'?tf:'4h']||96;
        const maxDistanceAtr={"15m":5,"1h":6,"4h":7,"1d":8}[typeof tf==='string'?tf:'4h']||7;
        function touchIndexes(L){
          const raw=[];
          for(const t of (L?.touches||[])){
            const g=Number(t.barIndex??t.index??t.i);
            if(Number.isFinite(g))raw.push(g);
          }
          for(const k of ['anchorA','anchorB']){
            const g=Number(L?.[k]?.barIndex);
            if(Number.isFinite(g))raw.push(g);
          }
          return [...new Set(raw)].sort((a,b)=>a-b);
        }
        function valid(L){
          if(!L||L.state==='broken'||!Number.isFinite(+L.slope)||!Number.isFinite(+L.intercept))return false;
          const ts=touchIndexes(L);if(ts.length<2)return false;
          const lastTouch=ts[ts.length-1],age=globalOf(last)-lastTouch;
          if(age>maxAge)return false;
          const now=(+L.intercept)+(+L.slope)*globalOf(last);
          if(atr>0&&current>0&&Math.abs(now-current)/atr>maxDistanceAtr)return false;
          return true;
        }
        function draw(L,color,secondary=false){
          if(!valid(L))return;
          const ts=touchIndexes(L),first=localOf(ts[0]),lastTouch=localOf(ts[ts.length-1]);
          // Only extend a modest distance beyond the latest meaningful swing, never from a stale remote anchor to infinity.
          const extension=Math.min(last-lastTouch,Math.max(6,Math.round((lastTouch-first)*0.35)));
          const end=Math.min(last,lastTouch+extension);
          if(end<=first)return;
          const x1=pxTime(first),x2=pxTime(end);
          const g1=globalOf(first),g2=globalOf(end);
          const p1=(+L.intercept)+(+L.slope)*g1,p2=(+L.intercept)+(+L.slope)*g2;
          const y1=series.candle.priceToCoordinate(p1),y2=series.candle.priceToCoordinate(p2);
          if(![x1,x2,y1,y2].every(Number.isFinite))return;
          const line=document.createElementNS('http://www.w3.org/2000/svg','line');
          line.setAttribute('x1',x1);line.setAttribute('x2',x2);line.setAttribute('y1',y1);line.setAttribute('y2',y2);line.setAttribute('stroke',color);
          line.setAttribute('stroke-width',secondary?'1.1':'2');line.setAttribute('stroke-linecap','round');
          if(secondary){line.setAttribute('stroke-dasharray','5 5');line.setAttribute('opacity','.32')}
          svg.appendChild(line);
        }
        const tl=DATA.trendlines||{};
        draw(tl.support,C.green,false);draw(tl.resistance,C.red,false);
        const sec=tl.secondary||{};
        (sec.support||[]).filter(valid).slice(0,2).forEach(x=>draw(x,C.green,true));
        (sec.resistance||[]).filter(valid).slice(0,2).forEach(x=>draw(x,C.red,true));
      }catch(e){console.warn('trendline visual v2',e)}
    };
    renderOverlay.__pulseTrendlineVisualV2=true;
    try{renderOverlay()}catch{}
    return true
  }
  let tries=0,t=setInterval(()=>{if(install()||++tries>40)clearInterval(t)},250);
})();