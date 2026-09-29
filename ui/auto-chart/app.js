(()=>{'use strict';
const State=window.PulseAutoChartState,MarketData=window.PulseAutoChartMarketData,Core=window.PulseAutoChartCore,Renderer=window.PulseAutoChartRenderer,Controls=window.PulseAutoChartControls,Card=window.PulseAutoChartAnalysisCard,Png=window.PulseAutoChartPng,$=id=>document.getElementById(id);
if(!State||!MarketData||!Core||!Renderer||!Controls||!Card){document.addEventListener('DOMContentLoaded',()=>{const e=$('dataError');if(e)e.textContent='Auto Chart core module load failed'});return}
const store=State.createState(),canvas=()=>$('chart');
function keyOf(s){return[s.exchange,s.market,s.symbol,s.timeframe].join(':')}
function syncUrl(s){const u=new URL(location.href);u.searchParams.set('symbol',s.symbol);u.searchParams.set('market',s.market);u.searchParams.set('tf',s.timeframe);history.replaceState(null,'',u)}
function render(){const s=store.get();if(!s.analysis?.available)return;Renderer.draw(canvas(),s.analysis,{layers:s.layers,visible:180});Card.render(s.analysis,{aux:s.aux})}
async function analyze(refresh=false){
  const selection=Controls.read(),id=store.beginRequest(),key=keyOf(selection);store.patch({...selection,error:null,layers:Controls.layers()});syncUrl(selection);Card.loading(selection);$('dataError').textContent='';
  try{
    const historical=await MarketData.fetchHistorical({...selection,interval:selection.timeframe,refresh});if(!store.isCurrent(id))return;
    const analysis=Core.analyze(historical);if(!analysis.available)throw new Error(analysis.error||'분석 불가');
    store.patch({historical,analysis,lastGood:{key,analysis,historical},updatedAt:historical.status.updatedAt});render();
    const htfP=MarketData.fetchHigherTimeframes({...selection,interval:selection.timeframe}).catch(()=>[]);
    const auxP=MarketData.fetchAuxiliary({...selection,interval:selection.timeframe}).catch(e=>({live:{available:false,error:e.message},derivatives:{available:false,error:e.message}}));
    const [htfSets,aux]=await Promise.all([htfP,auxP]);if(!store.isCurrent(id))return;
    const htfAnalyses=(htfSets||[]).filter(x=>Array.isArray(x?.candles)&&x.candles.length).map(x=>Core.analyze(x)).filter(x=>x?.available);
    const enriched=Core.attachHigherFrames(analysis,htfAnalyses);
    if(aux?.meta?.available&&aux.meta.tickSize)historical.market.tickSize=Number(aux.meta.tickSize);
    store.patch({analysis:enriched,aux,lastGood:{key,analysis:enriched,historical}});render();Card.live(aux);Card.render(enriched,{aux});
  }catch(e){
    if(!store.isCurrent(id))return;const s=store.get(),same=s.lastGood?.key===key;
    Card.error(e?.message||String(e),{keep:same});if(same){store.patch({analysis:s.lastGood.analysis,historical:s.lastGood.historical});render()}else{store.patch({analysis:null,historical:null});const ctx=canvas().getContext('2d');ctx.clearRect(0,0,canvas().width,canvas().height);ctx.fillStyle='#07111d';ctx.fillRect(0,0,canvas().width,canvas().height);ctx.fillStyle='#ffabb4';ctx.font='20px system-ui';ctx.fillText('데이터를 불러오지 못했습니다.',36,54)}
  }
}
function init(){
  const q=new URLSearchParams(location.search);if(q.get('symbol'))$('symbol').value=Controls.cleanSymbol(q.get('symbol'));if(['spot','futures'].includes(q.get('market')))$('market').value=q.get('market');if(['1w','1d','4h','1h','15m','5m'].includes(q.get('tf')))$('timeframe').value=q.get('tf');
  Controls.bind({onAnalyze:analyze,onLayerChange:l=>{store.patch({layers:l});render()}});$('savePng')?.addEventListener('click',()=>Png?.save(canvas(),store.get().analysis));analyze(false);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();