(()=>{
  if(window.__pulseTrendlineVisualV7)return;window.__pulseTrendlineVisualV7=true;
  let hostChart=null,supSeries=null,resSeries=null;
  const secOf=t=>{const n=Number(t);return Number.isFinite(n)?(n>1e12?Math.floor(n/1000):Math.floor(n)):null};
  function removeSeries(){if(hostChart){for(const s of [supSeries,resSeries]){if(s)try{hostChart.removeSeries(s)}catch{}}}supSeries=resSeries=null}
  function ensureSeries(){
    if(!charts?.price||!window.LightweightCharts)return false;
    if(hostChart!==charts.price){removeSeries();hostChart=charts.price}
    const common={lineWidth:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false,autoscaleInfoProvider:()=>null};
    if(!supSeries)supSeries=hostChart.addLineSeries({...common,color:C.green});
    if(!resSeries)resSeries=hostChart.addLineSeries({...common,color:C.red});
    return true;
  }
  function candleTime(c){return c?.time??c?.openTime??c?.open_time??null}
  function normalizedTouches(L,full){
    const raw=Array.isArray(L?.touchPoints)&&L.touchPoints.length?L.touchPoints:(L?.touchBars||[]).map(barIndex=>({barIndex}));
    return raw.map(p=>{
      const barIndex=Number(p?.barIndex);
      if(!Number.isInteger(barIndex)||barIndex<0||barIndex>=full.length)return null;
      const c=full[barIndex];
      // IMPORTANT: never trust a trendline/pattern timestamp here. The candle array is the chart's x-axis source of truth.
      const time=secOf(candleTime(c));
      const price=(+L.intercept)+(+L.slope)*barIndex;
      if(time==null||!Number.isFinite(price))return null;
      return{barIndex,time,price};
    }).filter(Boolean).sort((a,b)=>a.barIndex-b.barIndex);
  }
  function lineData(L,full){
    if(!L||L.state==='broken'||!Number.isFinite(+L.slope)||!Number.isFinite(+L.intercept))return[];
    const pts=normalizedTouches(L,full);if(pts.length<2)return[];
    const visibleStart=Number.isFinite(+F?.off)?+F.off:Math.max(0,full.length-(F?.b?.length||full.length));
    const visibleEnd=Math.min(full.length-1,visibleStart+(F?.b?.length||full.length)-1);
    const visiblePts=pts.filter(p=>p.barIndex>=visibleStart&&p.barIndex<=visibleEnd);
    if(visiblePts.length<2)return[];
    const a=visiblePts[0],b=visiblePts.at(-1);
    if(b.barIndex-a.barIndex<3||b.time<=a.time)return[];
    // Two real candle timestamps only. No pixel offsets, no future projection, no price-axis extension.
    return[{time:a.time,value:a.price},{time:b.time,value:b.price}];
  }
  function clearOldSvg(){const oldSvg=$('#trendSvg');if(oldSvg)oldSvg.innerHTML=''}
  function renderNative(){
    try{
      clearOldSvg();
      if(!F||!DATA||!$('#tTrend')?.checked||!ensureSeries()){if(supSeries)supSeries.setData([]);if(resSeries)resSeries.setData([]);return}
      const full=DATA.candles||[];if(full.length<2){supSeries.setData([]);resSeries.setData([]);return}
      const tl=DATA.trendlines||{};
      supSeries.setData(lineData(tl.support,full));
      resSeries.setData(lineData(tl.resistance,full));
    }catch(e){console.warn('trendline visual v7',e)}
  }
  function install(){
    if(typeof renderOverlay!=='function'||typeof $!=='function')return false;
    if(!renderOverlay.__pulseTrendlineVisualV7){const base=renderOverlay;renderOverlay=function(){base();clearOldSvg();renderNative()};renderOverlay.__pulseTrendlineVisualV7=true}
    renderNative();return true;
  }
  let tries=0,t=setInterval(()=>{if(install()){if(++tries>12)clearInterval(t)}else if(++tries>80)clearInterval(t)},250);
  window.addEventListener('resize',renderNative,{passive:true});
})();