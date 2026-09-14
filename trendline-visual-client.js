(()=>{
  if(window.__pulseTrendlineVisualV3)return;window.__pulseTrendlineVisualV3=true;
  function install(){
    if(typeof renderOverlay!=='function'||typeof $!=='function')return false;
    if(renderOverlay.__pulseTrendlineVisualV3)return true;
    const base=renderOverlay;
    renderOverlay=function(){
      base();
      try{
        if(!F||!DATA||!$('#tTrend')?.checked||!series?.candle||!charts?.price)return;
        const svg=$('#trendSvg');if(!svg)return;svg.innerHTML='';
        const full=DATA.candles||[],visible=F.b||[],lastLocal=visible.length-1;
        if(lastLocal<1)return;
        const atr=Number(F.atr)||0,current=Number(visible[lastLocal]?.close)||0;
        const secOf=t=>{const n=Number(t);return n>1e12?Math.floor(n/1000):Math.floor(n)};
        const xByTime=t=>charts.price.timeScale().timeToCoordinate(secOf(t));
        const yByPrice=p=>series.candle.priceToCoordinate(Number(p));
        const tfKey=typeof tf==='string'?tf:'4h';
        const maxDistanceAtr={'15m':5,'1h':6,'4h':7,'1d':8}[tfKey]||7;
        const maxAge={'15m':48,'1h':60,'4h':72,'1d':90}[tfKey]||72;
        function points(L){
          if(Array.isArray(L?.touchPoints)&&L.touchPoints.length>=2)return L.touchPoints.filter(p=>Number.isFinite(+p.time)&&Number.isFinite(+p.price));
          const out=[];
          for(const a of [L?.anchorA,L?.anchorB])if(Number.isFinite(+a?.time)&&Number.isFinite(+a?.price))out.push({time:+a.time,price:+a.price,barIndex:+a.barIndex});
          return out;
        }
        function valid(L){
          if(!L||L.state==='broken'||!Number.isFinite(+L.slope)||!Number.isFinite(+L.intercept))return false;
          const pts=points(L);if(pts.length<2)return false;
          const lastBar=Number(pts.at(-1).barIndex??L.anchorB?.barIndex),age=Number.isFinite(lastBar)?full.length-1-lastBar:0;
          if(age>maxAge)return false;
          if(atr>0&&current>0&&Number.isFinite(+L.currentLinePrice)&&Math.abs(+L.currentLinePrice-current)/atr>maxDistanceAtr)return false;
          return true;
        }
        function appendLine(x1,y1,x2,y2,color,secondary){
          if(![x1,y1,x2,y2].every(Number.isFinite))return;
          const line=document.createElementNS('http://www.w3.org/2000/svg','line');
          line.setAttribute('x1',x1);line.setAttribute('x2',x2);line.setAttribute('y1',y1);line.setAttribute('y2',y2);line.setAttribute('stroke',color);line.setAttribute('stroke-linecap','round');line.setAttribute('stroke-width',secondary?'1':'2.2');
          if(secondary){line.setAttribute('stroke-dasharray','5 5');line.setAttribute('opacity','.28')}
          svg.appendChild(line);
        }
        function draw(L,color,secondary=false){
          if(!valid(L))return;
          const pts=points(L);if(pts.length<2)return;
          const first=pts[0],lastTouch=pts.at(-1),currentCandle=full.at(-1);
          let x1=xByTime(first.time),y1=yByPrice((+L.intercept)+(+L.slope)*(first.barIndex??L.anchorA?.barIndex));
          let endBar=full.length-1,endTime=currentCandle?.time??currentCandle?.openTime;
          let endPrice=(+L.intercept)+(+L.slope)*endBar;
          let x2=xByTime(endTime),y2=yByPrice(endPrice);
          // If the first anchor is outside the current visible chart, begin at the first visible candle using the same regression equation.
          if(!Number.isFinite(x1)||x1<0){const visibleGlobal=Math.max(0,full.length-visible.length),v=full[visibleGlobal];x1=xByTime(v?.time??v?.openTime);y1=yByPrice((+L.intercept)+(+L.slope)*visibleGlobal)}
          appendLine(x1,y1,x2,y2,color,secondary);
          // Draw tiny touch dots so the user can visually verify the line is actually attached to swing touches.
          if(!secondary){for(const p of pts){const x=xByTime(p.time),y=yByPrice(p.price);if(!Number.isFinite(x)||!Number.isFinite(y)||x<0)continue;const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');dot.setAttribute('cx',x);dot.setAttribute('cy',y);dot.setAttribute('r','2.4');dot.setAttribute('fill',color);dot.setAttribute('opacity','.9');svg.appendChild(dot)}}
        }
        const tl=DATA.trendlines||{};draw(tl.support,C.green,false);draw(tl.resistance,C.red,false);
        const sec=tl.secondary||{};(sec.support||[]).filter(valid).slice(0,2).forEach(x=>draw(x,C.green,true));(sec.resistance||[]).filter(valid).slice(0,2).forEach(x=>draw(x,C.red,true));
      }catch(e){console.warn('trendline visual v3',e)}
    };
    renderOverlay.__pulseTrendlineVisualV3=true;try{renderOverlay()}catch{}return true
  }
  let tries=0,t=setInterval(()=>{if(install()||++tries>40)clearInterval(t)},250);
})();