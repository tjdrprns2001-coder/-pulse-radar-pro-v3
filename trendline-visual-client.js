(()=>{
  if(window.__pulseTrendlineVisualV4)return;window.__pulseTrendlineVisualV4=true;
  let raf1=0,raf2=0,hookedSeries=null,hookedChart=null;
  function schedule(){
    cancelAnimationFrame(raf1);cancelAnimationFrame(raf2);
    raf1=requestAnimationFrame(()=>{raf2=requestAnimationFrame(()=>{try{typeof renderOverlay==='function'&&renderOverlay()}catch{}})});
  }
  function install(){
    if(typeof renderOverlay!=='function'||typeof $!=='function')return false;
    if(!renderOverlay.__pulseTrendlineVisualV4){
      const base=renderOverlay;
      renderOverlay=function(){
        base();
        try{
          if(!F||!DATA||!$('#tTrend')?.checked||!series?.candle||!charts?.price)return;
          const svg=$('#trendSvg');if(!svg)return;
          svg.innerHTML='';svg.style.overflow='hidden';
          const full=DATA.candles||[],visible=F.b||[],lastGlobal=full.length-1;
          if(lastGlobal<1||!visible.length)return;
          const secOf=t=>{const n=Number(t);return n>1e12?Math.floor(n/1000):Math.floor(n)};
          const xByTime=t=>charts.price.timeScale().timeToCoordinate(secOf(t));
          const yByPrice=p=>series.candle.priceToCoordinate(Number(p));
          const atr=Number(F.atr)||0,current=Number(visible.at(-1)?.close)||0,tfKey=typeof tf==='string'?tf:'4h';
          const maxDistanceAtr={'15m':5,'1h':6,'4h':7,'1d':8}[tfKey]||7;
          const maxAge={'15m':48,'1h':60,'4h':72,'1d':90}[tfKey]||72;
          const lastCandleTime=full.at(-1)?.time??full.at(-1)?.openTime;
          const plotRight=xByTime(lastCandleTime);
          if(!Number.isFinite(plotRight))return;
          function points(L){
            const pts=Array.isArray(L?.touchPoints)?L.touchPoints:[];
            if(pts.length>=2)return pts.filter(p=>Number.isFinite(+p.time)&&Number.isFinite(+p.price)&&Number.isFinite(+p.barIndex)).sort((a,b)=>a.barIndex-b.barIndex);
            const out=[];for(const a of [L?.anchorA,L?.anchorB])if(Number.isFinite(+a?.time)&&Number.isFinite(+a?.price)&&Number.isFinite(+a?.barIndex))out.push({time:+a.time,price:+a.price,barIndex:+a.barIndex});return out.sort((a,b)=>a.barIndex-b.barIndex);
          }
          function valid(L){
            if(!L||L.state==='broken'||!Number.isFinite(+L.slope)||!Number.isFinite(+L.intercept))return false;
            const pts=points(L);if(pts.length<2)return false;
            const age=lastGlobal-pts.at(-1).barIndex;if(age>maxAge)return false;
            const now=(+L.intercept)+(+L.slope)*lastGlobal;
            if(atr>0&&current>0&&Math.abs(now-current)/atr>maxDistanceAtr)return false;
            return true;
          }
          function el(name,attrs){const z=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [k,v] of Object.entries(attrs))z.setAttribute(k,String(v));return z}
          function draw(L,color,secondary=false){
            if(!valid(L))return;
            const pts=points(L),first=pts[0],lastTouch=pts.at(-1),span=Math.max(1,lastTouch.barIndex-first.barIndex);
            // Draw only the line's meaningful structural window plus a short projection. Never extend indefinitely.
            const extension=Math.min(lastGlobal-lastTouch.barIndex,Math.max(4,Math.round(span*.22)));
            const endBar=Math.min(lastGlobal,lastTouch.barIndex+extension);
            const startBar=first.barIndex;
            const startCandle=full[startBar],endCandle=full[endBar];
            if(!startCandle||!endCandle)return;
            const startTime=startCandle.time??startCandle.openTime,endTime=endCandle.time??endCandle.openTime;
            let x1=xByTime(startTime),x2=xByTime(endTime);
            const y1=yByPrice((+L.intercept)+(+L.slope)*startBar),y2=yByPrice((+L.intercept)+(+L.slope)*endBar);
            if(![x1,x2,y1,y2].every(Number.isFinite))return;
            // Clip strictly to the candle plot. Do not enter the right price-axis label area.
            x1=Math.max(0,Math.min(plotRight,x1));x2=Math.max(0,Math.min(plotRight,x2));
            if(x2<=x1+1)return;
            const line=el('line',{x1,x2,y1,y2,stroke:color,'stroke-linecap':'round','stroke-width':secondary?1:2.2});
            if(secondary){line.setAttribute('stroke-dasharray','5 5');line.setAttribute('opacity','.25')}
            svg.appendChild(line);
            if(!secondary){
              for(const p of pts){const x=xByTime(p.time),y=yByPrice((+L.intercept)+(+L.slope)*p.barIndex);if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>plotRight)continue;svg.appendChild(el('circle',{cx:x,cy:y,r:2.2,fill:color,opacity:.88}))}
            }
          }
          const tl=DATA.trendlines||{};draw(tl.support,C.green,false);draw(tl.resistance,C.red,false);
          const sec=tl.secondary||{};(sec.support||[]).filter(valid).slice(0,2).forEach(x=>draw(x,C.green,true));(sec.resistance||[]).filter(valid).slice(0,2).forEach(x=>draw(x,C.red,true));
        }catch(e){console.warn('trendline visual v4',e)}
      };
      renderOverlay.__pulseTrendlineVisualV4=true;
    }
    // Lightweight Charts can autoscale after a WebSocket candle update. Reproject after every update, not just initial render.
    if(series?.candle&&series.candle!==hookedSeries){
      hookedSeries=series.candle;const originalUpdate=hookedSeries.update.bind(hookedSeries);
      hookedSeries.update=function(){const out=originalUpdate(...arguments);schedule();return out};
    }
    if(charts?.price&&charts.price!==hookedChart){
      hookedChart=charts.price;try{hookedChart.timeScale().subscribeVisibleLogicalRangeChange(schedule)}catch{}
    }
    try{renderOverlay()}catch{}return true;
  }
  let tries=0,t=setInterval(()=>{if(install()){if(++tries>8)clearInterval(t)}else if(++tries>60)clearInterval(t)},300);
  window.addEventListener('resize',schedule,{passive:true});
})();