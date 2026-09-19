(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseMultiChartState=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const MODES=['clean','structure','smc','liquidity','ict','dante','full'];
  const TFS=['15m','1h','4h','1d'];
  const baseCharts=[
    {id:'chart-1',symbol:'BTCUSDT',timeframe:'1h',mode:'smc',preset:'smc',syncGroup:'workspace',expanded:false,liquidityOverlay:false},
    {id:'chart-2',symbol:'BTCUSDT',timeframe:'4h',mode:'ict',preset:'ict',syncGroup:'workspace',expanded:false,liquidityOverlay:false},
    {id:'chart-3',symbol:'BTCUSDT',timeframe:'15m',mode:'structure',preset:'structure',syncGroup:'workspace',expanded:false,liquidityOverlay:false},
    {id:'chart-4',symbol:'BTCUSDT',timeframe:'1d',mode:'dante',preset:'dante',syncGroup:'workspace',expanded:false,liquidityOverlay:false}
  ];
  function normSymbol(v){const s=String(v||'BTCUSDT').trim().toUpperCase();return s||'BTCUSDT'}
  function normalizeChart(c,i,symbol){const mode=MODES.includes(c?.mode)?c.mode:baseCharts[i].mode;const timeframe=TFS.includes(c?.timeframe)?c.timeframe:baseCharts[i].timeframe;return{...baseCharts[i],...(c||{}),id:`chart-${i+1}`,symbol,mode,timeframe,preset:mode,expanded:!!c?.expanded,liquidityOverlay:!!c?.liquidityOverlay}}
  function createWorkspaceState(initial={}){
    let symbol=normSymbol(initial.symbol||initial.workspaceSymbol||'BTCUSDT');
    let layout=[1,2,4].includes(+initial.layout)?+initial.layout:2;
    let stored=baseCharts.map((b,i)=>normalizeChart((initial.charts||[])[i],i,symbol));
    let sync={symbol:true,timeframe:false,mode:false,crosshair:false,range:false,...(initial.sync||{})};
    function snapshot(){return{symbol,layout,charts:stored.slice(0,layout).map(c=>({...c})),sync:{...sync}}}
    function setLayout(count){const n=+count;if(![1,2,4].includes(n))throw new Error('layout must be 1, 2, or 4');layout=n;return snapshot()}
    function setSymbol(next){symbol=normSymbol(next);stored=stored.map(c=>({...c,symbol}));return snapshot()}
    function updateChart(id,patch={}){const i=stored.findIndex(c=>c.id===id);if(i<0)return snapshot();const next={...stored[i],...patch,id:stored[i].id,symbol};if(!TFS.includes(next.timeframe))next.timeframe=stored[i].timeframe;if(!MODES.includes(next.mode))next.mode=stored[i].mode;next.preset=next.mode;stored[i]=next;return snapshot()}
    function duplicateChart(id){const src=stored.find(c=>c.id===id)||stored[0];const target=Math.min(layout,3);stored[target]={...src,id:`chart-${target+1}`,symbol,expanded:false};if(layout<4)layout=layout===1?2:4;return snapshot()}
    function maximizeChart(id){stored=stored.map(c=>({...c,expanded:c.id===id}));return snapshot()}
    function restoreCharts(){stored=stored.map(c=>({...c,expanded:false}));return snapshot()}
    function serialize(){return JSON.stringify({symbol,layout,charts:stored.map(c=>({...c,expanded:false})),sync})}
    return{getState:snapshot,setLayout,setSymbol,updateChart,duplicateChart,maximizeChart,restoreCharts,serialize};
  }
  return{createWorkspaceState,MODES,TFS};
});