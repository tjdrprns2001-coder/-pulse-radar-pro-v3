(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseChartCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function createUnifiedChart({container,library,preset={id:'clean',panes:[]}}={}){
    const L=library||(typeof globalThis!=='undefined'?globalThis.LightweightCharts:null);if(!L||typeof L.createChart!=='function')throw new Error('Lightweight Charts unavailable');if(!container)throw new Error('chart container required');
    const chart=L.createChart(container,{autoSize:true,layout:{background:{type:'solid',color:'#09111b'},textColor:'#9fb4c9'},grid:{vertLines:{color:'#132238'},horzLines:{color:'#132238'}},timeScale:{rightOffsetPixels:24,timeVisible:true,secondsVisible:false}});
    const add=(def,opts,pane=0)=>chart.addSeries(def,opts,pane);
    const candlesSeries=add(L.CandlestickSeries,{upColor:'#35d69a',downColor:'#ff6577',borderVisible:false,wickUpColor:'#35d69a',wickDownColor:'#ff6577'},0);
    const volumeSeries=add(L.HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'vol',lastValueVisible:false,priceLineVisible:false},0);
    try{chart.priceScale('vol',0).applyOptions({scaleMargins:{top:.78,bottom:0}})}catch{}
    const indicatorPanes={};
    function ensurePane(name){if(indicatorPanes[name])return indicatorPanes[name];const paneIndex={rsi:1,macd:2,stoch:3}[name];if(paneIndex==null)return null;if(name==='rsi'){indicatorPanes.rsi={main:add(L.LineSeries,{lineWidth:2,lastValueVisible:true,priceLineVisible:false},paneIndex)}}else if(name==='macd'){indicatorPanes.macd={macd:add(L.LineSeries,{lineWidth:2,priceLineVisible:false},paneIndex),signal:add(L.LineSeries,{lineWidth:1,priceLineVisible:false},paneIndex),hist:add(L.HistogramSeries,{priceLineVisible:false,lastValueVisible:false},paneIndex)}}else if(name==='stoch'){indicatorPanes.stoch={k:add(L.LineSeries,{lineWidth:2,priceLineVisible:false},paneIndex),d:add(L.LineSeries,{lineWidth:1,priceLineVisible:false},paneIndex)}}return indicatorPanes[name];}
    (preset.panes||[]).forEach(ensurePane);
    function setData(snapshot={}){if(snapshot.candles)candlesSeries.setData(snapshot.candles);if(snapshot.volume)volumeSeries.setData(snapshot.volume);const i=snapshot.indicators||{};if(i.rsi){const p=ensurePane('rsi');p.main.setData(i.rsi)}if(i.macd){const p=ensurePane('macd');p.macd.setData(i.macd.macd||[]);p.signal.setData(i.macd.signal||[]);p.hist.setData(i.macd.histogram||[])}if(i.stoch){const p=ensurePane('stoch');p.k.setData(i.stoch.k||[]);p.d.setData(i.stoch.d||[])}try{chart.timeScale().fitContent()}catch{}}
    function addLineSeries(options={},paneIndex=0){return add(L.LineSeries,{priceLineVisible:false,lastValueVisible:false,...options},paneIndex)}
    function setPaneVisibility(name,visible){const p=indicatorPanes[name];if(!p)return;Object.values(p).forEach(s=>{try{s.applyOptions({visible:!!visible})}catch{}})}
    let onResize=null;if(typeof ResizeObserver==='undefined'&&typeof window!=='undefined'){onResize=()=>{try{chart.resize(container.clientWidth,container.clientHeight)}catch{}};window.addEventListener('resize',onResize)}
    let disposed=false;function dispose(){if(disposed)return;disposed=true;if(onResize&&typeof window!=='undefined')window.removeEventListener('resize',onResize);chart.remove()}
    return{library:L,chart,pricePane:chart.panes?.()[0]||null,candlesSeries,volumeSeries,indicatorPanes,series:{candles:candlesSeries,volume:volumeSeries},setData,ensurePane,setPaneVisibility,addLineSeries,resize(){try{chart.resize(container.clientWidth,container.clientHeight)}catch{}},dispose};
  }
  return{createUnifiedChart};
});