(()=>{
  if(window.__pulseTrendlineVisualV5)return;window.__pulseTrendlineVisualV5=true;
  let hostChart=null,supSeries=null,resSeries=null,secSeries=[];
  const secOf=t=>{const n=Number(t);return Number.isFinite(n)?(n>1e12?Math.floor(n/1000):Math.floor(n)):null};
  function removeSeries(){
    if(hostChart){for(const s of [supSeries,resSeries,...secSeries]){if(s)try{hostChart.removeSeries(s)}catch{}}}
    supSeries=resSeries=null;secSeries=[];
  }
  function ensureSeries(){
    if(!charts?.price||!LightweightCharts)return false;
    if(hostChart!==charts.price){removeSeries();hostChart=charts.price}
    const common={lineWidth:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false,autoscaleInfoProvider:()=>null};
    if(!supSeries)supSeries=hostChart.addLineSeries({...common,color:C.green});
    if(!resSeries)resSeries=hostChart.addLineSeries({...common,color:C.red});
    return true;
  }
  function candleTime(c){return c?.time??c?.openTime??c?.open_time??null}
  function pointTime(full,index){const c=full[index];return secOf(candleTime(c))}
  function lineData(L,full){
    if(!L||L.state==='broken'||!Number.isFinite(+L.slope)||!Number.isFinite(+L.intercept))return[];
    const pts=(Array.isArray(L.touchPoints)?L.touchPoints:[]).filter(p=>Number.isFinite(+p.barIndex)).sort((a,b)=>a.barIndex-b.barIndex);
    const first=Number(pts[0]?.barIndex??L.anchorA?.barIndex),lastTouch=Number(pts.at(-1)?.barIndex??L.anchorB?.barIndex);
    if(!Number.isFinite(first)||!Number.isFinite(lastTouch)||first<0||lastTouch<=first||first>=full.length)return[];
    const last=full.length-1,age=last-lastTouch;
    const maxAge={'15m':36,'1h':42,'4h':48,'1d':60}[typeof tf==='string'?tf:'4h']||48;
    if(age>maxAge)return[];
    const startTime=pointTime(full,first),endTime=pointTime(full,last);
    if(startTime==null||endTime==null||endTime<=startTime)return[];
    const y0=(+L.intercept)+(+L.slope)*first,y1=(+L.intercept)+(+L.slope)*last;
    if(!Number.isFinite(y0)||!Number.isFinite(y1))return[];
    return[{time:startTime,value:y0},{time:endTime,value:y1}];
  }
  function styleSecondary(s,color){s.applyOptions({color,lineWidth:1,lineStyle:LightweightCharts.LineStyle.Dashed,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false,autoscaleInfoProvider:()=>null})}
  function renderNative(){
    try{
      if(!F||!DATA||!$('#tTrend')?.checked||!ensureSeries()){
        if(supSeries)supSeries.setData([]);if(resSeries)resSeries.setData([]);for(const s of secSeries)s.setData([]);return;
      }
      const svg=$('#trendSvg');if(svg)svg.innerHTML='';
      const full=DATA.candles||[];if(full.length<2)return;
      const tl=DATA.trendlines||{};
      supSeries.setData(lineData(tl.support,full));
      resSeries.setData(lineData(tl.resistance,full));
      const desired=[...(tl.secondary?.support||[]).slice(0,2).map(x=>({x,color:C.green})),...(tl.secondary?.resistance||[]).slice(0,2).map(x=>({x,color:C.red}))];
      while(secSeries.length<desired.length){const s=hostChart.addLineSeries({lineWidth:1,lineStyle:LightweightCharts.LineStyle.Dashed,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false,autoscaleInfoProvider:()=>null});secSeries.push(s)}
      secSeries.forEach((s,i)=>{const d=desired[i];if(!d){s.setData([]);return}styleSecondary(s,d.color);s.setData(lineData(d.x,full))});
    }catch(e){console.warn('trendline visual v5',e)}
  }
  function install(){
    if(typeof renderOverlay!=='function'||typeof $!=='function')return false;
    if(!renderOverlay.__pulseTrendlineVisualV5){
      const base=renderOverlay;
      renderOverlay=function(){base();const svg=$('#trendSvg');if(svg)svg.innerHTML='';renderNative()};
      renderOverlay.__pulseTrendlineVisualV5=true;
    }
    renderNative();return true;
  }
  let tries=0,t=setInterval(()=>{if(install()){if(++tries>12)clearInterval(t)}else if(++tries>80)clearInterval(t)},250);
  window.addEventListener('resize',()=>{try{renderNative()}catch{}},{passive:true});
})();