(()=>{'use strict';
const $=id=>document.getElementById(id),P=window.PulsePresets,D=window.PulseDataState,CD=window.PulseChartData,CP=window.PulseChartPlugins,CC=window.PulseChartCore,SE=window.PulseSmcEngine,LE=window.PulseLiquidityEngine,IE=window.PulseIctContextEngine,TA=window.PulseTraderAnalysis,ST=window.PulseSimpleTradingEngine,FB=window.PulseForexBookEngine,BC=window.PulseBookConfluenceEngine;
let core=null,registry=null,currentPreset=null,indicatorCache={},lastState=null,chartV1=null,viewportCleanup=null,viewportRaf=0,zoneClickCleanup=null;
const overlays={'structure':true,smc:false,ict:false,liquidity:false,'volume-profile':false,'moving-average':false,dante:false,'simple-trading':false,'forex-book':false,'book-confluence':false};
function clean(v){v=String(v||'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');return v||'BTCUSDT'}
function fmt(v,d=2){return Number.isFinite(Number(v))?Number(v).toLocaleString('ko-KR',{maximumFractionDigits:d}):'-'}
function htfFor(tf){return tf==='5m'?'1h':tf==='15m'?'1h':tf==='1h'?'4h':tf==='4h'?'1d':tf==='12h'?'1d':tf==='1d'?'1w':tf==='3d'?'1w':null}
function setState(id){if(!D)return;const m=D.formatDataState(id),el=$('dataState');el.dataset.pulseDataState=m.id;el.dataset.severity=m.severity;el.textContent=m.label}
function presetDefaults(id){Object.keys(overlays).forEach(k=>overlays[k]=false);overlays.structure=true;if(id==='structure')return;if(id==='smc'){overlays.smc=overlays.ict=overlays.liquidity=true;return}if(id==='dante'){overlays['moving-average']=overlays.dante=overlays['volume-profile']=true;return}if(id==='full'){Object.keys(overlays).forEach(k=>overlays[k]=true)}}
function syncOverlayButtons(){document.querySelectorAll('[data-overlay]').forEach(b=>b.classList.toggle('active',!!overlays[b.dataset.overlay]))}
function overlayEvidence(id,state){
  if(!state)return'데이터 대기';
  const t=state.technical||{},smc=state.smc||{},liq=state.liquidity||{},ict=state.ictContext||{};
  if(id==='structure')return '구조 '+stateText(state.analysis?.bias||state.analysis?.trend||t.state);
  if(id==='smc')return 'MSS '+(smc.mss?.length||0)+' · Sweep '+(smc.sweeps?.length||0)+' · FVG '+(smc.fvgs?.length||0)+' · OB '+(smc.orderBlocks?.length||0);
  if(id==='ict')return 'Sequence '+(ict.sequences?.at(-1)?.state||'없음')+(ict.narrative?.text?' · '+ict.narrative.text:'');
  if(id==='liquidity')return '레벨 '+(liq.levels?.length||0)+' · Sweep '+(liq.sweeps?.length||0);
  if(id==='volume-profile')return 'POC '+fmt(t.volumeProfile?.poc?.price,8)+' · bins '+(t.volumeProfile?.bins?.length||0);
  if(id==='moving-average')return 'EMA 5·10·20·60·120';
  if(id==='dante')return 'EMA 112·224·448 포함 단테 리본';
  if(id==='simple-trading')return state.classic?.best?(state.classic.best.label+' · '+state.classic.best.status):'현재 뚜렷한 클래식 패턴 없음';
  if(id==='forex-book')return state.forexBook?.confluence?('bias '+state.forexBook.confluence.bias+' · '+state.forexBook.confluence.score+'/100'):'Forex 근거 없음';
  if(id==='book-confluence')return state.bookConfluence?.scenario?('bias '+state.bookConfluence.scenario.bias+' · '+state.bookConfluence.scenario.score+'/100 · '+state.bookConfluence.scenario.state):'책 합성 근거 없음';
  return '활성';
}
function legendItem(shape,label){return '<span class="lgItem">'+shape+'<span>'+label+'</span></span>'}
function legendHtml(id){
  const title='<span class="lgTitle">'+({structure:'추세·구조',smc:'SMC',ict:'ICT',liquidity:'유동성','volume-profile':'매물대','moving-average':'이평선',dante:'단테','simple-trading':'클래식','forex-book':'Forex Book','book-confluence':'책 합성'}[id]||'오버레이')+'</span>';
  if(id==='liquidity')return title+legendItem('<i class="lgShape lgBand bsl"></i>','위 유동성')+legendItem('<i class="lgShape lgBand ssl"></i>','아래 유동성')+legendItem('<i class="lgShape lgDot sweep"></i>','스윕·반전');
  if(id==='ict')return title+legendItem('<span class="lgSteps"><i>1</i><i>2</i><i>3</i><i>4</i><i>5</i></span>','스윕→분출→FVG→리테스트→목표');
  if(id==='smc')return title+legendItem('<i class="lgShape lgBand ob"></i>','OB')+legendItem('<i class="lgShape lgBand fvg"></i>','FVG')+legendItem('<i class="lgShape lgBreak"></i>','구조 돌파');
  if(id==='structure')return title+legendItem('<i class="lgShape lgDot up"></i>','저점·상승')+legendItem('<i class="lgShape lgDot down"></i>','고점·하락')+legendItem('<i class="lgShape lgBreak"></i>','BOS/CHoCH');
  if(id==='volume-profile')return title+legendItem('<i class="lgShape lgProfile"></i>','거래 집중 + POC');
  if(id==='moving-average'||id==='dante')return title+legendItem('<i class="lgShape lgRibbon"></i>','이평 리본 정렬·압축');
  if(id==='simple-trading')return title+legendItem('<i class="lgShape lgZoneArrow"></i>','패턴 범위 + 돌파 방향');
  if(id==='forex-book')return title+legendItem('<i class="lgShape lgBand bull"></i>','지지')+legendItem('<i class="lgShape lgBand bear"></i>','저항')+legendItem('<i class="lgShape lgDot sweep"></i>','가짜돌파');
  if(id==='book-confluence')return title+legendItem('<i class="lgShape lgBand warn"></i>','근거 겹침 구역')+legendItem('<i class="lgShape lgZoneArrow"></i>','합성 방향');
  return title;
}
function updateOverlayLegend(id){const el=$('overlayLegend');if(el)el.innerHTML=legendHtml(id||'structure')}
function showError(title,text){$('fallbackTitle').textContent=title;$('fallbackText').textContent=text;$('fallback').classList.add('show');setState('api-degraded')}
function buildIct({smc,liquidity,htfSmc,htfTf,tf,currentIndex}){if(!IE?.buildIctContext)return null;return IE.buildIctContext({htf:{tf:htfTf||tf,bias:htfSmc?.htfBias||htfSmc?.bias||'neutral',swings:htfSmc?.canonicalSwings||[]},ltf:{tf,mss:smc?.mss||[],displacements:smc?.displacements||[],mitigations:smc?.mitigations||[]},smc,liquidity,currentIndex})}
function fact(k,v){const d=document.createElement('div');d.className='fact';const s=document.createElement('span');s.textContent=k;const b=document.createElement('b');b.textContent=v;d.append(s,b);return d}
function stateText(v){if(v==null)return'-';if(typeof v==='string'||typeof v==='number')return String(v);if(typeof v==='object'){const x=v.label??v.state??v.bias??v.trend??v.direction??v.dir??v.type;if(x!=null&&typeof x!=='object')return String(x);const up=Number(v.up??v.bull??v.bullish),down=Number(v.down??v.bear??v.bearish);if(Number.isFinite(up)||Number.isFinite(down)){if((up||0)>(down||0))return'상승';if((down||0)>(up||0))return'하락';return'중립'}return'구조 확인'}return String(v)}
function renderSummary(state){const t=state.technical,smc=state.smc,ict=state.ictContext;$('sumState').textContent=stateText(t.state);$('sumHtf').textContent=state.htfTf?state.htfTf.toUpperCase()+' · '+stateText(state.htfBias||'neutral'):'N/A';const trend=state.analysis?.bias||state.analysis?.trend||t.state;$('sumStructure').textContent=stateText(trend);$('sumMomentum').textContent='RSI '+fmt(t.rsi,0)+' · MACD '+(Number(t.macdHist)>0?'↑':Number(t.macdHist)<0?'↓':'→');$('sumPoc').textContent=fmt(t.volumeProfile?.poc?.price,6);const mss=smc?.mss?.at(-1),sw=smc?.sweeps?.at(-1);$('sumMss').textContent='MSS '+(mss?String(mss.dir).toUpperCase():'없음');$('sumSweep').textContent='Sweep '+(sw?(sw.source||sw.side||'-'):'없음');$('sumPd').textContent='P/D '+(smc?.pdOte?.available?smc.pdOte.position:'N/A');$('sumFvg').textContent='FVG '+String(t.smc?.fvgCount||0);$('sumOb').textContent='OB '+String(t.smc?.obCount||0);const best=t.dante?.filter(x=>x.score>0).slice(0,2).map(x=>x.label+' '+x.score).join(' · ');$('sumDante').textContent='단테 '+(best||'뚜렷함 없음');const classic=state.classic?.best;$('sumClassic').textContent='클래식 '+(classic?(classic.label+' · '+classic.status):'뚜렷함 없음');const fx=state.forexBook?.confluence;$('sumForex').textContent='Forex '+(fx?(fx.bias+' · '+fx.score+'/100'):'N/A');const books=state.bookConfluence?.scenario;$('sumBooks').textContent='책 합성 '+(books?(books.bias+' · '+books.score+'/100 · '+books.state):'N/A');$('technicalText').textContent=t.text+(ict?.narrative?.text?' · ICT '+ict.narrative.text:'');const f=$('technicalFacts');f.innerHTML='';f.append(fact('RSI 14',fmt(t.rsi,1)),fact('Stoch RSI',fmt(t.stochK,1)+' / '+fmt(t.stochD,1)),fact('KDJ',fmt(t.kdj?.k,1)+' / '+fmt(t.kdj?.d,1)+' / '+fmt(t.kdj?.j,1)),fact('RVOL 20',t.rvol==null?'-':fmt(t.rvol,2)+'x'),fact('OBV 5봉',fmt(t.obvDelta,0)),fact('POC',fmt(t.volumeProfile?.poc?.price,6)),fact('활성 유동성',String(t.liquidity?.levels?.length||0)),fact('ICT Sequence',ict?.sequences?.at(-1)?.state||'N/A'))}
function buildSmc(raw,htfBias){return SE.analyzeSmcV2({candles:raw.candles||[],canonicalSwings:raw.canonicalSwings||[],canonicalEvents:raw.events||[],htf:{bias:htfBias||null}})}
function buildLiquidity(raw,smc,tf){return LE.analyzeLiquidity({candles:raw.candles||[],timeframe:tf,pivots:smc.canonicalSwings||raw.canonicalSwings||[],equalLevels:smc.equalLevels||[],sweeps:smc.sweeps||[],displacement:smc.displacements||[],mss:smc.mss||[],fvgs:smc.fvgs||[],orderBlocks:smc.orderBlocks||[]})}
function applyPluginVisibility(){if(!registry)return;for(const [k,v] of Object.entries(overlays))registry.setVisible(k,v)}
function syncIndicators(){if(!core)return;document.querySelectorAll('[data-pane]').forEach(box=>{const name=box.dataset.pane;if(box.checked){core.setIndicatorData(name,indicatorCache[name]);core.setPaneVisibility(name,true)}else core.setPaneVisibility(name,false)})}
function toSec(v){const n=Number(v);return Number.isFinite(n)?Math.trunc(n>1e12?n/1000:n):null}
function stamp(v){const n=Number(v);if(!Number.isFinite(n))return'-';try{return new Date(n>1e12?n:n*1000).toLocaleString('ko-KR',{hour12:false})}catch{return'-'}}
function renderChartMeta(data,analysis){
  const q=data?.data_quality||{},chart=data?.chart||{},oi=data?.open_interest||{},fund=data?.funding||{};
  if($('metaCandles'))$('metaCandles').textContent=data?((chart.visible_candle_count??'-')+'/'+(chart.total_candle_count??'-')+' · W '+(chart.warmup_candle_count??'-')):((analysis?.candles?.length||0)+' loaded');
  if($('metaLastClosed'))$('metaLastClosed').textContent=data?stamp(q.last_closed_candle??data.as_of):stamp(analysis?.candles?.at(-1)?.time);
  if($('metaQuality'))$('metaQuality').textContent=data?((q.status||'unknown')+(Number.isFinite(Number(q.stale_seconds))?' · '+Math.round(q.stale_seconds)+'s':'')):'legacy';
  if($('metaMarket'))$('metaMarket').textContent=data?((q.requested_market||'-')+' → '+(q.actual_market||'-')):'-';
  if($('metaOi'))$('metaOi').textContent=data?((oi.status||'unavailable')+' · '+(oi.series?.length||0)):'-';
  if($('metaFunding'))$('metaFunding').textContent=data?((fund.status||'unavailable')+' · '+(fund.series?.length||0)):'-';
  if($('metaRepaint'))$('metaRepaint').textContent=data?(q.repaint_state||'unknown'):'-';
  if($('metaVersion'))$('metaVersion').textContent=data?((data.algorithm_version||'-')+' / '+(data.parameter_version||'-')):'legacy';
  if($('dataState')&&data)$('dataState').dataset.quality=q.status||'unknown';
}
function syncDerivatives(){
  if(!core)return;
  const oi=(chartV1?.open_interest?.series||[]).map(x=>({time:toSec(x.time),value:Number(x.open_interest)})).filter(x=>x.time!=null&&Number.isFinite(x.value));
  const funding=(chartV1?.funding?.series||[]).map(x=>({time:toSec(x.time),value:Number(x.funding_rate_pct)})).filter(x=>x.time!=null&&Number.isFinite(x.value));
  if(oi.length)core.setDerivativeData?.('oi',oi);
  if(funding.length)core.setDerivativeData?.('funding',funding);
  document.querySelectorAll('[data-derivative]').forEach(box=>{const name=box.dataset.derivative;core.setDerivativeVisibility?.(name,!!box.checked&&((name==='oi'?oi:funding).length>0))})
}
function zoneEvidenceText(z){
  const e=z?.evidence||{},parts=[];
  for(const [k,v] of Object.entries(e)){if(v?.known===false)continue;const detail=v?.detail==null?'':(' · '+String(v.detail));parts.push((v?.pass===true?'✓ ':v?.pass===false?'✕ ':'• ')+k+detail)}
  return parts.join('\n')||'근거 상세 없음'
}
function renderZoneDetail(z){
  const el=$('zoneDetail');if(!el)return;el.innerHTML='';if(!z){const s=document.createElement('span');s.className='ucMuted';s.textContent='구간을 선택하세요.';el.append(s);return}
  const item=(k,v,wide=false)=>{const d=document.createElement('div');d.className='zd'+(wide?' wide':'');const s=document.createElement('span');s.textContent=k;const b=document.createElement('b');b.textContent=v==null?'-':String(v);d.append(s,b);el.append(d)};
  item('유형',z.zone_type,true);item('가격',fmt(z.price_low,8)+' ~ '+fmt(z.price_high,8));item('상태',z.status||'-');item('신뢰도',(z.confidence||'-')+(z.strength_score!=null?' · '+fmt(z.strength_score,1)+'/100':''));item('리페인트',z.repaint_state||'-');item('생성',stamp(z.origin_time));item('확정',stamp(z.confirmed_at));item('무효화',z.invalidation_condition?(String(z.invalidation_condition.type||'')+' '+fmt(z.invalidation_condition.price,8)):'없음');item('결측',(z.missing_data||[]).join(' · ')||'없음',true);
  const pre=document.createElement('pre');pre.textContent=zoneEvidenceText(z);el.append(pre);
  document.querySelectorAll('.zoneBtn').forEach(b=>b.classList.toggle('active',b.dataset.zoneId===String(z.zone_id)))
}
function focusZone(z){
  if(!core?.chart?.timeScale||!z)return;const t=toSec(z.confirmed_at??z.origin_time);if(t==null)return;const tf=chartV1?.chart?.timeframe||'4h',step=({ '5m':300,'15m':900,'1h':3600,'4h':14400,'12h':43200,'1d':86400,'3d':259200,'1w':604800 })[tf]||14400;try{core.chart.timeScale().setVisibleRange({from:t-step*70,to:t+step*70})}catch{}
}
function renderZoneList(data){
  const wrap=$('zoneButtons'),count=$('zoneCount');if(!wrap)return;wrap.innerHTML='';const zones=(data?.zones||[]).slice(0,20);if(count)count.textContent=zones.length+' zones';
  for(const z of zones){const b=document.createElement('button');b.type='button';b.className='zoneBtn';b.dataset.zoneId=String(z.zone_id);b.textContent=(z.zone_type||'zone')+' · '+fmt(z.price_low,6)+'~'+fmt(z.price_high,6);b.onclick=()=>{renderZoneDetail(z);focusZone(z)};wrap.append(b)}
  renderZoneDetail(zones[0]||null)
}
function bindZoneClick(){
  try{zoneClickCleanup?.()}catch{}zoneClickCleanup=null;if(!core?.chart?.subscribeClick||!core?.candlesSeries||!chartV1?.zones?.length)return;
  const handler=param=>{if(!param?.point)return;let price=null;try{price=core.candlesSeries.coordinateToPrice(param.point.y)}catch{}if(!Number.isFinite(Number(price)))return;const p=Number(price),zones=chartV1.zones||[],inside=zones.filter(z=>p>=Number(z.price_low)&&p<=Number(z.price_high));const z=(inside.length?inside:zones.slice().sort((a,b)=>Math.min(Math.abs(p-Number(a.price_low)),Math.abs(p-Number(a.price_high)))-Math.min(Math.abs(p-Number(b.price_low)),Math.abs(p-Number(b.price_high))))).at(0);if(z)renderZoneDetail(z)};
  core.chart.subscribeClick(handler);zoneClickCleanup=()=>{try{core?.chart?.unsubscribeClick?.(handler)}catch{}}
}
function fitVisibleCandles(count=500){
  const n=lastState?.candles?.length||0;if(!core?.chart?.timeScale||!n)return;const visible=Math.max(50,Math.min(1000,Number(count)||500));try{core.chart.timeScale().setVisibleLogicalRange({from:Math.max(0,n-visible),to:n-1+5})}catch{}
}
function bindViewportRefresh(){
  try{viewportCleanup?.()}catch{}viewportCleanup=null;const ts=core?.chart?.timeScale?.();if(!ts)return;
  const refresh=()=>{if(typeof cancelAnimationFrame==='function'&&viewportRaf)cancelAnimationFrame(viewportRaf);const run=()=>{viewportRaf=0;if(lastState&&registry)registry.updateAll(lastState)};viewportRaf=typeof requestAnimationFrame==='function'?requestAnimationFrame(run):setTimeout(run,16)};
  const clean=[];if(typeof ts.subscribeVisibleLogicalRangeChange==='function'){ts.subscribeVisibleLogicalRangeChange(refresh);clean.push(()=>ts.unsubscribeVisibleLogicalRangeChange?.(refresh))}
  if(typeof ts.subscribeVisibleTimeRangeChange==='function'){ts.subscribeVisibleTimeRangeChange(refresh);clean.push(()=>ts.unsubscribeVisibleTimeRangeChange?.(refresh))}
  if(typeof window!=='undefined'){window.addEventListener('resize',refresh,{passive:true});clean.push(()=>window.removeEventListener('resize',refresh))}
  viewportCleanup=()=>{for(const fn of clean)try{fn()}catch{}};
}
async function run(){
  const symbol=clean($('symbol').value),tf=$('tf').value;$('symbol').value=symbol;$('fallback').classList.remove('show');setState('live');$('status').textContent='800봉 구조·SMC·ICT·매물대·파생 분석 중…';
  const q=new URLSearchParams(location.search);currentPreset=P?.getPreset(q.get('preset')||P?.loadPreset()?.id||'clean')||{id:'clean'};presetDefaults(currentPreset.id);syncOverlayButtons();
  try{
    if(!window.LightweightCharts||!CD||!CP||!CC||!SE||!LE||!TA||!ST||!FB||!BC)throw new Error('필수 차트 모듈 로드 실패');
    const htfTf=htfFor(tf),jobs=[CD.fetchStructure({symbol,interval:tf,limit:800}),htfTf?CD.fetchStructure({symbol,interval:htfTf,limit:800}):Promise.resolve(null),CD.fetchChartV1?CD.fetchChartV1({symbol,timeframe:tf,visible:500,warmup:300,total:800,market:'spot',priceBins:100}):Promise.resolve(null)];
    const rs=await Promise.allSettled(jobs);if(rs[0].status!=='fulfilled')throw rs[0].reason;
    const analysis=rs[0].value,htf=rs[1]?.status==='fulfilled'?rs[1].value:null;chartV1=rs[2]?.status==='fulfilled'?rs[2].value:null;
    const smc=buildSmc(analysis,htf?.bias||null),liquidity=buildLiquidity(analysis,smc,tf),htfSmc=htf?buildSmc(htf,null):null,technical=TA.summarize({candles:analysis.candles,analysis,smc,liquidity}),classic=ST.analyze({candles:analysis.candles}),ictContext=buildIct({smc,liquidity,htfSmc,htfTf,tf,currentIndex:(analysis.candles||[]).length-1}),forexBook=FB.analyze({candles:analysis.candles,smc,liquidity,ictContext}),bookConfluence=BC.analyze({candles:analysis.candles,forexBook,classic});
    const normalized=CD.normalizeCandles(analysis.candles||[]);indicatorCache={rsi:CD.rsiSeries(analysis.candles),macd:CD.macdSeries(analysis.candles),stoch:CD.stochRsiSeries(analysis.candles),kdj:CD.kdjSeries(analysis.candles),obv:CD.obvSeries(analysis.candles)};
    try{viewportCleanup?.()}catch{}viewportCleanup=null;try{zoneClickCleanup?.()}catch{}zoneClickCleanup=null;registry?.disposeAll();core?.dispose();
    core=CC.createUnifiedChart({container:$('unifiedChart'),library:window.LightweightCharts,preset:{id:'v5',panes:[]}});core.setData({...normalized,indicators:{}});
    registry=CP.createPluginRegistry();registry.register(window.PulseStructurePlugin.createStructurePlugin({maxItems:10}));registry.register(window.PulseSmcPlugin.createSmcPlugin());if(window.PulseIctPlugin)registry.register(window.PulseIctPlugin.createIctPlugin());registry.register(window.PulseLiquidityPlugin.createLiquidityPlugin());registry.register(window.PulseVolumeProfilePlugin.createVolumeProfilePlugin());registry.register(window.PulseMovingAveragePlugin.createMovingAveragePlugin());registry.register(window.PulseDantePlugin.createDantePlugin());if(window.PulseSimpleTradingPlugin)registry.register(window.PulseSimpleTradingPlugin.createSimpleTradingPlugin());if(window.PulseForexBookPlugin)registry.register(window.PulseForexBookPlugin.createForexBookPlugin());if(window.PulseBookConfluencePlugin)registry.register(window.PulseBookConfluencePlugin.createBookConfluencePlugin());registry.mountAll(core);applyPluginVisibility();
    lastState={analysis,smc,liquidity,ictContext,technical,classic,forexBook,bookConfluence,chartV1,rawCandles:analysis.candles,candles:normalized.candles,dataApi:CD,timeframe:tf,tf,preset:currentPreset,maMode:'standard',viewportLevel:innerWidth<=620?'compact':'normal',htfTf,htfBias:stateText(htf?.bias||'neutral'),overlayFocus:Object.keys(overlays).find(k=>overlays[k])||'structure'};
    registry.updateAll(lastState);updateOverlayLegend(lastState.overlayFocus);bindViewportRefresh();syncIndicators();syncDerivatives();renderSummary(lastState);renderChartMeta(chartV1,analysis);renderZoneList(chartV1);bindZoneClick();fitVisibleCandles(chartV1?.chart?.visible_candle_count||500);
    const loaded=analysis.candles?.length||0,visible=chartV1?.chart?.visible_candle_count||Math.min(500,loaded),quality=chartV1?.data_quality?.status||'legacy';$('status').textContent=symbol+' · '+tf.toUpperCase()+' · 로드 '+loaded+' · 표시 '+visible+' · '+quality+(htfTf?' · HTF '+htfTf.toUpperCase():'');
    setState(chartV1?.data_quality?.status==='stale'||chartV1?.data_quality?.status==='invalid'?'api-degraded':'confirmed');
    $('snapshotLink').href='/mtf-snapshot-pro.html?symbol='+encodeURIComponent(symbol)+'&tf='+encodeURIComponent(tf);$('ictTrainerLink').href='/ict-trainer.html?symbol='+encodeURIComponent(symbol);$('reportLink').href='/coin-report.html?symbol='+encodeURIComponent(symbol);$('danteLink').href='/dante-lab.html?symbol='+encodeURIComponent(symbol)+'&tf='+encodeURIComponent(tf);$('simpleTradingLink').href='/simple-trading-lab.html?symbol='+encodeURIComponent(symbol)+'&tf='+encodeURIComponent(tf);$('forexBookLink').href='/forex-book-lab.html?symbol='+encodeURIComponent(symbol)+'&tf='+encodeURIComponent(tf);$('bookConfluenceLink').href='/book-confluence-lab.html?symbol='+encodeURIComponent(symbol)+'&tf='+encodeURIComponent(tf);
    const u=new URL(location.href);u.searchParams.set('symbol',symbol);u.searchParams.set('tf',tf);u.searchParams.set('preset',currentPreset.id);history.replaceState(null,'',u);if(new URLSearchParams(location.search).get('shell')==='1'&&parent!==window)parent.postMessage({type:'pulse-symbol-sync',symbol},'*')
  }catch(e){console.error(e);chartV1=null;renderChartMeta(null,null);renderZoneList(null);showError('분석 데이터를 불러오지 못했습니다',e?.message||String(e));$('status').textContent='오류 · '+(e?.message||'unknown')}
}
function init(){const q=new URLSearchParams(location.search);$('symbol').value=clean(q.get('symbol')||'BTCUSDT');if(['5m','15m','1h','4h','12h','1d','3d','1w'].includes(q.get('tf')))$('tf').value=q.get('tf');updateOverlayLegend('structure');document.querySelectorAll('[data-overlay]').forEach(b=>b.onclick=()=>{const id=b.dataset.overlay;overlays[id]=!overlays[id];syncOverlayButtons();registry?.setVisible(id,overlays[id]);if(lastState){lastState.overlayFocus=overlays[id]?id:(Object.keys(overlays).find(k=>overlays[k])||null);registry?.updateAll(lastState);updateOverlayLegend(lastState.overlayFocus||id);$('status').textContent=(overlays[id]?'ON · ':'OFF · ')+b.textContent.trim()+(overlays[id]?' · '+overlayEvidence(id,lastState):'')}});document.querySelectorAll('[data-pane]').forEach(b=>b.onchange=syncIndicators);document.querySelectorAll('[data-derivative]').forEach(b=>b.onchange=syncDerivatives);$('run').onclick=run;$('tf').onchange=run;$('symbol').onkeydown=e=>{if(e.key==='Enter')run()};run()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();