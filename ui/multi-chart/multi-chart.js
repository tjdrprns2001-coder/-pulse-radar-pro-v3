(()=>{
  const KEY='pulse.multiChart.v1',$=id=>document.getElementById(id),q=new URLSearchParams(location.search),grid=$('mcGrid'),symbolEl=$('mcSymbol'),State=window.PulseMultiChartState,Req=window.PulseRequestCoordinator,Modes=window.PulseMultiChartModes,Card=window.PulseMultiChartCard,CD=window.PulseChartData;
  if(!State||!Req||!Modes||!Card||!CD){grid.innerHTML='<div class="mcCardStatus" data-state="error">다중차트 모듈을 불러오지 못했습니다.</div>';return}
  if(q.get('shell')==='1')document.documentElement.dataset.shell='1';
  function cleanSymbol(v){const s=String(v||'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');return s||'BTCUSDT'}
  function readSaved(){try{return JSON.parse(localStorage.getItem(KEY)||'null')||{}}catch{return{}}}
  const saved=readSaved(),initial={...saved,symbol:cleanSymbol(q.get('symbol')||saved.symbol||'BTCUSDT')},workspace=State.createWorkspaceState(initial),cards=new Map();
  const coordinator=Req.createRequestCoordinator({ttlMs:15000,fetcher:(symbol,timeframe)=>CD.fetchStructure({symbol,interval:timeframe,limit:500})});
  function persist(){try{localStorage.setItem(KEY,workspace.serialize())}catch{}}
  function syncUrl(){const s=workspace.getState();const u=new URL(location.href);u.searchParams.set('symbol',s.symbol);u.searchParams.set('layout',s.layout);history.replaceState(null,'',u)}
  function notifySymbol(symbol){if(q.get('shell')==='1'&&window.parent!==window)parent.postMessage({type:'pulse-symbol-sync',symbol},'*');window.dispatchEvent(new CustomEvent('pulse:multi-symbolchange',{detail:{symbol}}))}
  function onCardChange(id,patch){if(patch?.action==='duplicate'){workspace.duplicateChart(id);persist();syncUrl();reconcile();return}if(patch?.action==='maximize'){workspace.maximizeChart(id);reconcile();return}workspace.updateChart(id,patch);persist();reconcile({load:false})}
  function makeRoot(id){const el=document.createElement('article');el.dataset.chartId=id;grid.appendChild(el);return el}
  function reconcile({load=true}={}){const s=workspace.getState();symbolEl.value=s.symbol;grid.dataset.layout=String(s.layout);document.querySelectorAll('[data-layout]').forEach(b=>b.classList.toggle('active',Number(b.dataset.layout)===s.layout));const wanted=new Set(s.charts.map(c=>c.id));for(const [id,entry] of cards){if(!wanted.has(id)){entry.card.dispose();entry.root.remove();cards.delete(id)}}
    for(const cfg0 of s.charts){const cfg={...cfg0,layoutCount:s.layout};let entry=cards.get(cfg.id);if(!entry){const root=makeRoot(cfg.id),card=Card.createChartCard({root,config:cfg,library:window.LightweightCharts,coordinator,modeRegistry:Modes,onConfigChange:onCardChange});entry={root,card,last:{}};cards.set(cfg.id,entry);card.load().catch(()=>{})}else{const last=entry.card.getConfig(),changed=last.symbol!==cfg.symbol||last.timeframe!==cfg.timeframe||last.mode!==cfg.mode;if(changed&&load)entry.card.setConfig(cfg).catch(()=>{})}
      entry.root.classList.toggle('isExpanded',!!cfg.expanded)}
    const expanded=s.charts.some(c=>c.expanded);grid.classList.toggle('mcExpanded',expanded);requestAnimationFrame(()=>cards.forEach(e=>e.card.resize()))}
  function applySymbol(){const s=cleanSymbol(symbolEl.value);workspace.setSymbol(s);persist();syncUrl();notifySymbol(s);reconcile()}
  $('mcApply').onclick=applySymbol;symbolEl.addEventListener('keydown',e=>{if(e.key==='Enter')applySymbol()});document.querySelectorAll('[data-layout]').forEach(b=>b.onclick=()=>{workspace.setLayout(Number(b.dataset.layout));persist();syncUrl();reconcile()});$('mcRestore').onclick=()=>{workspace.restoreCharts();reconcile({load:false})};
  window.addEventListener('resize',()=>cards.forEach(e=>e.card.resize()));
  window.addEventListener('message',e=>{if(e.data?.type==='pulse-symbol-sync'){const s=cleanSymbol(e.data.symbol);if(s!==workspace.getState().symbol){workspace.setSymbol(s);persist();syncUrl();reconcile()}}});
  if([1,2,4].includes(Number(q.get('layout'))))workspace.setLayout(Number(q.get('layout')));syncUrl();reconcile();
})();