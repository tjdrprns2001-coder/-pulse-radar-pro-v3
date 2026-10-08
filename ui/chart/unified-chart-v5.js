(()=>{'use strict';
const $=id=>document.getElementById(id),P=window.PulsePresets,D=window.PulseDataState,CD=window.PulseChartData,CP=window.PulseChartPlugins,CC=window.PulseChartCore,SE=window.PulseSmcEngine,LE=window.PulseLiquidityEngine,IE=window.PulseIctContextEngine,TA=window.PulseTraderAnalysis,ST=window.PulseSimpleTradingEngine,FB=window.PulseForexBookEngine,BC=window.PulseBookConfluenceEngine;
let core=null,registry=null,currentPreset=null,indicatorCache={},lastState=null,chartV1=null,viewportCleanup=null,viewportRaf=0,zoneClickCleanup=null,marketWs=null,marketWsRetry=null,closedRefreshTimer=null,streamGeneration=0,mtfToken=0;
const overlays={'structure':true,smc:false,ict:false,liquidity:false,'volume-profile':false,microstructure:true,'moving-average':false,dante:false,'simple-trading':false,'forex-book':false,'book-confluence':false};
function clean(v){v=String(v||'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');return v||'BTCUSDT'}
function fmt(v,d=2){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v).toLocaleString('ko-KR',{maximumFractionDigits:d}):'-'}
function htfFor(tf){return tf==='5m'?'1h':tf==='15m'?'1h':tf==='1h'?'4h':tf==='4h'?'1d':tf==='12h'?'1d':tf==='1d'?'1w':tf==='3d'?'1w':null}
function setState(id){if(!D)return;const m=D.formatDataState(id),el=$('dataState');el.dataset.pulseDataState=m.id;el.dataset.severity=m.severity;el.textContent=m.label}
function presetDefaults(id){Object.keys(overlays).forEach(k=>overlays[k]=false);overlays.structure=true;overlays.microstructure=true;if(id==='structure')return;if(id==='smc'){overlays.smc=overlays.ict=overlays.liquidity=true;return}if(id==='dante'){overlays['moving-average']=overlays.dante=overlays['volume-profile']=true;return}if(id==='full'){Object.keys(overlays).forEach(k=>overlays[k]=true)}}
function syncOverlayButtons(){document.querySelectorAll('[data-overlay]').forEach(b=>b.classList.toggle('active',!!overlays[b.dataset.overlay]))}
function overlayEvidence(id,state){
  if(!state)return'데이터 대기';
  const t=state.technical||{},smc=state.smc||{},liq=state.liquidity||{},ict=state.ictContext||{};
  if(id==='structure')return '구조 '+stateText(state.analysis?.bias||state.analysis?.trend||t.state);
  if(id==='smc')return 'MSS '+(smc.mss?.length||0)+' · Sweep '+(smc.sweeps?.length||0)+' · FVG '+(smc.fvgs?.length||0)+' · OB '+(smc.orderBlocks?.length||0);
  if(id==='ict')return 'Sequence '+(ict.sequences?.at(-1)?.state||'없음')+(ict.narrative?.text?' · '+ict.narrative.text:'');
  if(id==='liquidity')return '레벨 '+(liq.levels?.length||0)+' · Sweep '+(liq.sweeps?.length||0);
  if(id==='volume-profile')return 'POC '+fmt(state.chartV1?.trade_volume_profile?.poc?.price??t.volumeProfile?.poc?.price,8)+' · '+(state.chartV1?.trade_volume_profile?.available?'체결 기반':'OHLCV 근사');
  if(id==='microstructure')return 'WS '+(state.chartV1?.live_stream?.status||'N/A')+' · 청산 '+(state.chartV1?.liquidations?.series?.length||0)+' · 지속벽 '+(state.chartV1?.orderbook?.wall_state?.persistent_walls?.length||0);
  if(id==='moving-average')return 'EMA 5·10·20·60·120';
  if(id==='dante')return 'EMA 112·224·448 포함 단테 리본';
  if(id==='simple-trading')return state.classic?.best?(state.classic.best.label+' · '+state.classic.best.status):'현재 뚜렷한 클래식 패턴 없음';
  if(id==='forex-book')return state.forexBook?.confluence?('bias '+state.forexBook.confluence.bias+' · '+state.forexBook.confluence.score+'/100'):'Forex 근거 없음';
  if(id==='book-confluence')return state.bookConfluence?.scenario?('bias '+state.bookConfluence.scenario.bias+' · '+state.bookConfluence.scenario.score+'/100 · '+state.bookConfluence.scenario.state):'책 합성 근거 없음';
  return '활성';
}
function legendItem(shape,label){return '<span class="lgItem">'+shape+'<span>'+label+'</span></span>'}
function legendHtml(id){
  const title='<span class="lgTitle">'+({structure:'추세·구조',smc:'SMC',ict:'ICT',liquidity:'유동성','volume-profile':'매물대',microstructure:'실시간 수급','moving-average':'이평선',dante:'단테','simple-trading':'클래식','forex-book':'Forex Book','book-confluence':'책 합성'}[id]||'오버레이')+'</span>';
  if(id==='liquidity')return title+legendItem('<i class="lgShape lgBand bsl"></i>','위 유동성')+legendItem('<i class="lgShape lgBand ssl"></i>','아래 유동성')+legendItem('<i class="lgShape lgDot sweep"></i>','스윕·반전');
  if(id==='ict')return title+legendItem('<span class="lgSteps"><i>1</i><i>2</i><i>3</i><i>4</i><i>5</i></span>','스윕→분출→FVG→리테스트→목표');
  if(id==='smc')return title+legendItem('<i class="lgShape lgBand ob"></i>','OB')+legendItem('<i class="lgShape lgBand fvg"></i>','FVG')+legendItem('<i class="lgShape lgBreak"></i>','구조 돌파');
  if(id==='structure')return title+legendItem('<i class="lgShape lgDot up"></i>','저점·상승')+legendItem('<i class="lgShape lgDot down"></i>','고점·하락')+legendItem('<i class="lgShape lgBreak"></i>','BOS/CHoCH');
  if(id==='volume-profile')return title+legendItem('<i class="lgShape lgProfile"></i>','체결 VP 우선 + POC');
  if(id==='microstructure')return title+legendItem('<i class="lgShape lgBand bull"></i>','지속 Bid wall')+legendItem('<i class="lgShape lgBand bear"></i>','지속 Ask wall')+legendItem('<i class="lgShape lgDot sweep"></i>','실제 청산 이벤트');
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
  if($('metaQuality'))$('metaQuality').textContent=data?((q.status||'unknown')+(q.stale_seconds!=null&&Number.isFinite(Number(q.stale_seconds))?' · '+Math.round(q.stale_seconds)+'s':'')):'legacy';
  if($('metaMarket'))$('metaMarket').textContent=data?((q.requested_market||'-')+' → '+(q.actual_market||'-')):'-';
  if($('metaOi'))$('metaOi').textContent=data?((oi.status||'unavailable')+' · '+(oi.series?.length||0)):'-';
  if($('metaFunding'))$('metaFunding').textContent=data?((fund.status||'unavailable')+' · '+(fund.series?.length||0)):'-';
  if($('metaRepaint'))$('metaRepaint').textContent=data?(q.repaint_state||'unknown'):'-';
  if($('metaVersion'))$('metaVersion').textContent=data?((data.algorithm_version||'-')+' / '+(data.parameter_version||'-')):'legacy';
  if($('dataState')&&data)$('dataState').dataset.quality=q.status||'unknown';
}
function renderMtf(report,error=null){
 const root=$('mtfFrames'),badge=$('mtfConsensus');if(!root||!badge)return;
 root.textContent='';
 if(error||!report){badge.textContent='조회 제한';const d=document.createElement('span');d.className='ucMuted';d.textContent='MTF 자료 조회 제한 · 기존 차트는 계속 사용할 수 있습니다.';root.append(d);return}
 const c=report.consensus||{};badge.textContent=(c.bias||'unknown')+' · '+(c.observed??0)+' / '+(c.expected??6)+'TF';
 const label={bullish_alignment:'상승 정렬',bearish_alignment:'하락 정렬',transition:'전환 관찰',range_or_unclear:'횡보·혼재',insufficient_data:'자료 부족'};
 for(const x of report.frames||[]){
  const card=document.createElement('div');card.className='mtfItem';card.dataset.stage=x.stage||'insufficient_data';card.dataset.status=x.status||'unavailable';
  const name=document.createElement('strong');name.textContent=(x.timeframe||'-').toUpperCase();
  const stage=document.createElement('b');stage.textContent=label[x.stage]||'자료 부족';
  const meta=document.createElement('small');meta.textContent=(x.trend||'unknown')+' · EMA14/28 '+(x.ema14_above_ema28===null?'N/A':x.ema14_above_ema28?'14 > 28':'14 ≤ 28')+' · RVOL '+(x.rvol20==null?'N/A':fmt(x.rvol20,2)+'x');
  const source=document.createElement('span');source.textContent=(x.status||'unavailable')+' · '+(x.source||'자료 없음')+' · '+(x.as_of!=null?stamp(x.as_of):'기준시각 없음');
  card.append(name,stage,meta,source);root.append(card)
 }
}
async function loadMtf(symbol,token){
 const el=$('mtfFrames'),badge=$('mtfConsensus');if(el)el.textContent='확정봉 구조 비교 조회 중…';if(badge)badge.textContent='분석 중';
 try{const res=await fetch('/api/v1/assets/'+encodeURIComponent(assetBase(symbol))+'/analysis/mtf',{cache:'no-store'});const body=await res.json();if(!res.ok||body.error)throw Error(body.error?.message||'MTF unavailable');if(token!==mtfToken)return;renderMtf(body.data)}
 catch(e){if(token===mtfToken)renderMtf(null,e)}
}
function displaySnapshot(normalized,data){
  const candles=[...(normalized?.candles||[])],volume=[...(normalized?.volume||[])],live=data?.current_candle;
  if(live&&live.is_closed===false){
    const time=toSec(live.open_time),row={time,open:Number(live.open),high:Number(live.high),low:Number(live.low),close:Number(live.close)};
    if(time!=null&&[row.open,row.high,row.low,row.close].every(Number.isFinite)){if(candles.at(-1)?.time===time)candles[candles.length-1]=row;else if(!candles.length||Number(candles.at(-1).time)<time)candles.push(row)}
    const vv=Number(live.volume_base);if(time!=null&&Number.isFinite(vv)){const vr={time,value:vv};if(volume.at(-1)?.time===time)volume[volume.length-1]=vr;else if(!volume.length||Number(volume.at(-1).time)<time)volume.push(vr)}
  }
  return{candles,volume}
}
function syncDerivatives(){
  if(!core)return;
  const latest=(rows=[])=>[...new Map(rows.map(x=>[x.time,x])).values()].sort((a,b)=>a.time-b.time);
  const oi=latest((chartV1?.open_interest?.series||[]).filter(x=>x.open_interest!==null&&x.open_interest!==undefined&&x.open_interest!=='').map(x=>({time:toSec(x.time),value:Number(x.open_interest)})).filter(x=>x.time!=null&&Number.isFinite(x.value)));
  const funding=latest((chartV1?.funding?.series||[]).filter(x=>x.funding_rate_pct!==null&&x.funding_rate_pct!==undefined&&x.funding_rate_pct!=='').map(x=>({time:toSec(x.time),value:Number(x.funding_rate_pct)})).filter(x=>x.time!=null&&Number.isFinite(x.value)));
  const liqMap=new Map();for(const x of chartV1?.liquidations?.series||[]){if(x.notional_usd===null||x.notional_usd===undefined||x.notional_usd==='')continue;const time=toSec(x.event_time),v=Number(x.notional_usd)*(String(x.side)==='long'?-1:1);if(time!=null&&Number.isFinite(v))liqMap.set(time,(liqMap.get(time)||0)+v)}const liquidation=[...liqMap.entries()].sort((a,b)=>a[0]-b[0]).map(([time,value])=>({time,value}));
  if(oi.length)core.setDerivativeData?.('oi',oi);
  if(funding.length)core.setDerivativeData?.('funding',funding);
  if(liquidation.length)core.setDerivativeData?.('liquidation',liquidation);
  document.querySelectorAll('[data-derivative]').forEach(box=>{const name=box.dataset.derivative,data=name==='oi'?oi:name==='funding'?funding:liquidation;core.setDerivativeVisibility?.(name,!!box.checked&&data.length>0)})
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
function downloadCsv(){
  const rows=chartV1?.candles||[];if(!rows.length){$('status').textContent='CSV · 내보낼 차트 데이터 없음';return}
  const head=['open_time','close_time','open','high','low','close','volume_base','volume_quote','is_closed'],lines=[head.join(',')];
  for(const x of rows)lines.push(head.map(k=>x[k]==null?'':String(x[k])).join(','));
  if(chartV1?.current_candle){const x=chartV1.current_candle;lines.push(head.map(k=>x[k]==null?'':String(x[k])).join(','))}
  const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(chartV1.asset?.symbol||'chart')+'-'+(chartV1.chart?.timeframe||'tf')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);$('status').textContent='CSV 저장 완료 · '+(rows.length+(chartV1.current_candle?1:0))+' rows'
}
async function shareChart(){
  const url=new URL(location.href);if(chartV1?.algorithm_version)url.searchParams.set('algo',chartV1.algorithm_version);if(chartV1?.parameter_version)url.searchParams.set('params',chartV1.parameter_version);
  try{if(navigator.share)await navigator.share({title:'PulseRadar 차트',url:url.toString()});else if(navigator.clipboard)await navigator.clipboard.writeText(url.toString());$('status').textContent=navigator.share?'공유 완료':'공유 링크 복사 완료'}catch(e){if(e?.name!=='AbortError')$('status').textContent='공유 실패 · '+(e?.message||e)}
}
function savePng(){
  try{const shot=core?.chart?.takeScreenshot?.();if(!shot)throw new Error('스크린샷 기능 미지원');const done=blob=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(chartV1?.asset?.symbol||clean($('symbol').value))+'-'+($('tf').value||'4h')+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);$('status').textContent='PNG 저장 완료'};if(shot.toBlob)shot.toBlob(done,'image/png');else throw new Error('스크린샷 변환 실패')}catch(e){$('status').textContent='PNG 저장 실패 · '+(e?.message||e)}
}
function bindZoneClick(){
  try{zoneClickCleanup?.()}catch{}zoneClickCleanup=null;if(!core?.chart?.subscribeClick||!core?.candlesSeries||!chartV1?.zones?.length)return;
  const handler=param=>{if(!param?.point)return;let price=null;try{price=core.candlesSeries.coordinateToPrice(param.point.y)}catch{}if(!Number.isFinite(Number(price)))return;const p=Number(price),zones=chartV1.zones||[],inside=zones.filter(z=>p>=Number(z.price_low)&&p<=Number(z.price_high));const z=(inside.length?inside:zones.slice().sort((a,b)=>Math.min(Math.abs(p-Number(a.price_low)),Math.abs(p-Number(a.price_high)))-Math.min(Math.abs(p-Number(b.price_low)),Math.abs(p-Number(b.price_high))))).at(0);if(z)renderZoneDetail(z)};
  core.chart.subscribeClick(handler);zoneClickCleanup=()=>{try{core?.chart?.unsubscribeClick?.(handler)}catch{}}
}
function fitVisibleCandles(count=500){
  const n=(lastState?.candles?.length||0)+(chartV1?.current_candle?.is_closed===false?1:0);if(!core?.chart?.timeScale||!n)return 0;const base=Math.max(50,Math.min(1000,Number(count)||500)),visible=innerWidth<=600?Math.min(base,300):innerWidth<=1000?Math.min(base,500):innerWidth>=1400?Math.min(n,Math.max(base,700)):Math.min(base,500);try{core.chart.timeScale().setVisibleLogicalRange({from:Math.max(0,n-visible),to:n-1+5})}catch{}return visible
}
function assetBase(symbol){return String(symbol||'BTCUSDT').toUpperCase().replace(/USDT$/,'')}
function money(v){const n=Number(v);if(!Number.isFinite(n))return'-';if(Math.abs(n)>=1e9)return'$'+fmt(n/1e9,2)+'B';if(Math.abs(n)>=1e6)return'$'+fmt(n/1e6,2)+'M';if(Math.abs(n)>=1e3)return'$'+fmt(n/1e3,1)+'K';return'$'+fmt(n,2)}
function pctText(v,d=2){return Number.isFinite(Number(v))?fmt(Number(v)*100,d)+'%':'-'}
function renderMicro(data=chartV1){
  const tp=data?.trade_volume_profile||{},ob=data?.orderbook||{},walls=ob?.wall_state||{},liq=data?.liquidations||{},s1=liq?.summary_1h||{};
  if($('microTradeVp'))$('microTradeVp').textContent=tp.available?((tp.precision||'trade')+' · '+(tp.trade_count||0)+'건'):'N/A';
  if($('microTradePoc'))$('microTradePoc').textContent=fmt(tp.poc?.price,8);
  if($('microSpread'))$('microSpread').textContent=ob.spread_bps!=null&&Number.isFinite(Number(ob.spread_bps))?fmt(ob.spread_bps,2)+' bps':'N/A';
  if($('microDepth'))$('microDepth').textContent=ob.depth_usd?('B '+money(ob.depth_usd.bid_0_5_pct)+' / A '+money(ob.depth_usd.ask_0_5_pct)):'N/A';
  if($('microWalls'))$('microWalls').textContent=walls.persistent_walls?String(walls.persistent_walls.length):'N/A';
  if($('microCancel'))$('microCancel').textContent=walls.cancel_rate_estimated!=null&&Number.isFinite(Number(walls.cancel_rate_estimated))?pctText(walls.cancel_rate_estimated,1)+' · 추정':'N/A';
  if($('microLongLiq'))$('microLongLiq').textContent=money(s1.long_usd);
  if($('microShortLiq'))$('microShortLiq').textContent=money(s1.short_usd);
  if($('microWarning'))$('microWarning').textContent=walls.warning||((tp.available&&tp.coverage?.complete!==true)?'체결 매물대는 현재 수집 가능한 체결 구간 기준이며 전체 800봉 구간 정밀값이 아닙니다.':'체결/호가 데이터 상태를 확인하세요.');
  const badge=$('liveStreamBadge'),status=data?.live_stream?.status||'unavailable';if(badge){badge.textContent='WS '+status;badge.dataset.live=status}
}
function researchBox(rows){
  const el=$('researchResult');if(!el)return;el.innerHTML='';const wrap=document.createElement('div');wrap.className='rrGrid';
  for(const [k,v] of rows){const d=document.createElement('div'),s=document.createElement('span'),b=document.createElement('b');s.textContent=k;b.textContent=v;d.append(s,b);wrap.append(d)}el.append(wrap)
}
async function runReplay(){
  const symbol=clean($('symbol').value),tf=$('tf').value,raw=$('replayAt')?.value;if(!raw){$('status').textContent='리플레이 기준 시각을 선택하세요.';return}
  const asOf=new Date(raw).toISOString();$('replayState').textContent='loading';$('status').textContent='리플레이 계산 중…';
  try{const res=await fetch('/api/v1/assets/'+encodeURIComponent(assetBase(symbol))+'/replay?timeframe='+encodeURIComponent(tf)+'&as_of='+encodeURIComponent(asOf)+'&bars=800',{cache:'no-store'}),j=await res.json();if(!res.ok||j.error)throw new Error(j?.error?.message||'replay failed');const d=j.data||{};$('replayState').textContent=d.available?'causal ✓':'N/A';researchBox([['기준 시각',stamp(d.as_of)],['확정봉',String(d.bar_count??'-')],['당시 가격',fmt(d.current_price,8)],['구조',stateText(d.market_structure?.trend)],['POC',fmt(d.volume_profile?.poc?.price,8)],['BOS',d.market_structure?.last_bos?String(d.market_structure.last_bos.side):'없음'],['CHoCH',d.market_structure?.last_choch?String(d.market_structure.last_choch.side):'없음'],['미래 데이터','차단']]);$('status').textContent='리플레이 완료 · '+asOf}
  catch(e){$('replayState').textContent='error';$('status').textContent='리플레이 실패 · '+(e?.message||e)}
}
async function runBacktest(){
  const symbol=clean($('symbol').value),tf=$('tf').value;$('replayState').textContent='testing';$('status').textContent='구조 백테스트 계산 중…';
  try{const res=await fetch('/api/v1/assets/'+encodeURIComponent(assetBase(symbol))+'/backtest?timeframe='+encodeURIComponent(tf)+'&bars=1500&horizon_bars=10&fee_bps=4&slippage_bps=2',{cache:'no-store'}),j=await res.json();if(!res.ok||j.error)throw new Error(j?.error?.message||'backtest failed');const d=j.data||{},s=d.summary||{};$('replayState').textContent='lookahead-safe';researchBox([['표본',String(d.sample_size??0)],['중앙 순수익',Number.isFinite(Number(s.net?.median))?fmt(s.net.median,2)+'%':'-'],['양수 비율',Number.isFinite(Number(s.net?.positive_rate))?pctText(s.net.positive_rate,1):'-'],['MFE 중앙',Number.isFinite(Number(s.mfe?.median))?fmt(s.mfe.median,2)+'%':'-'],['MAE 중앙',Number.isFinite(Number(s.mae?.median))?fmt(s.mae.median,2)+'%':'-'],['진입','다음 봉 시가'],['수수료+슬리피지',fmt(d.assumptions?.round_trip_friction_pct,3)+'%'],['미래 데이터','차단']]);$('status').textContent='백테스트 완료 · 표본 '+(d.sample_size||0)}
  catch(e){$('replayState').textContent='error';$('status').textContent='백테스트 실패 · '+(e?.message||e)}
}
async function loadAlerts(){
  const el=$('alertsList');if(!el)return;const symbol=clean($('symbol').value);el.innerHTML='<span class="ucMuted">불러오는 중…</span>';
  try{const r=await fetch('/api/v1/assets/'+encodeURIComponent(assetBase(symbol))+'/alerts?limit=30',{cache:'no-store'}),j=await r.json();if(!r.ok||j.error)throw new Error(j?.error?.message||'alerts failed');const rows=j.data||[];el.innerHTML='';if(!rows.length){el.innerHTML='<span class="ucMuted">저장된 확정 후보 알림이 없습니다.</span>';return}for(const a of rows){const row=document.createElement('div');row.className='alertRow';const t=document.createElement('div');t.className='alertType';t.textContent=String(a.alert_type||'alert');const body=document.createElement('div');body.className='alertBody';body.textContent=(a.direction?String(a.direction).toUpperCase()+' · ':'')+(a.status||'')+(a.price_low!=null?' · '+fmt(a.price_low,8)+'~'+fmt(a.price_high,8):'');const tm=document.createElement('time');tm.textContent=stamp(a.captured_at);row.append(t,body,tm);el.append(row)}}
  catch(e){el.innerHTML='<span class="ucMuted">알림 조회 실패 · '+String(e?.message||e)+'</span>'}
}
function closeMarketStream(){
  streamGeneration++;clearTimeout(marketWsRetry);marketWsRetry=null;try{marketWs?.close()}catch{}marketWs=null;const badge=$('liveStreamBadge');if(badge){badge.textContent='WS closed';badge.dataset.live='unavailable'}
}
function connectMarketStream(symbol,tf){
  closeMarketStream();const generation=streamGeneration,s=clean(symbol),base=assetBase(s),proto=location.protocol==='https:'?'wss:':'ws:',url=proto+'//'+location.host+'/ws/v1/market',badge=$('liveStreamBadge');
  let ws;try{ws=new WebSocket(url)}catch{return}marketWs=ws;if(badge){badge.textContent='WS connecting';badge.dataset.live='connecting'}
  ws.onopen=()=>{if(generation!==streamGeneration||marketWs!==ws)return;if(badge){badge.textContent='WS live';badge.dataset.live='live'};ws.send(JSON.stringify({op:'subscribe',channels:[{name:'candles',instrument_id:'perp:'+s,timeframe:tf},{name:'funding',instrument_id:'perp:'+s},{name:'open_interest',instrument_id:'perp:'+s},{name:'liquidations',instrument_id:'perp:'+s},{name:'orderbook',instrument_id:'perp:'+s},{name:'analysis_events',asset_id:'asset:'+base,timeframe:tf}]}))};
  ws.onmessage=ev=>{if(generation!==streamGeneration)return;let m;try{m=JSON.parse(ev.data)}catch{return}const d=m?.data||{};
    if(m.event==='market.snapshot'){chartV1=chartV1||{};if(d.orderbook)chartV1.orderbook=d.orderbook;if(d.trade_profile)chartV1.trade_volume_profile=d.trade_profile;if(d.liquidations){chartV1.liquidations=chartV1.liquidations||{series:[]};chartV1.liquidations.summary_1h=d.liquidations};chartV1.live_stream={status:d.status||'live',last_message_at:m.occurred_at};renderMicro(chartV1)}
    else if(m.event==='candle.update'&&String(d.interval||tf)===tf){const time=toSec(d.open_time),row={time,open:Number(d.open),high:Number(d.high),low:Number(d.low),close:Number(d.close)},vol={time,value:Number(d.volume_base)};if(time!=null&&[row.open,row.high,row.low,row.close].every(Number.isFinite)){try{core?.candlesSeries?.update(row)}catch{}}if(time!=null&&Number.isFinite(vol.value)){try{core?.volumeSeries?.update(vol)}catch{}}if(d.is_closed){clearTimeout(closedRefreshTimer);closedRefreshTimer=setTimeout(()=>{if(generation===streamGeneration&&clean($('symbol').value)===s&&$('tf').value===tf)run()},1200)}}
    else if(m.event==='funding'){chartV1=chartV1||{};chartV1.funding=chartV1.funding||{series:[]};chartV1.funding.current_rate_pct=Number(d.funding_rate_pct);const point={time:Number(d.time||m.occurred_at),funding_rate_pct:Number(d.funding_rate_pct)};const arr=chartV1.funding.series||[];if(Number.isFinite(point.funding_rate_pct)){arr.push(point);chartV1.funding.series=arr.slice(-200);syncDerivatives()}renderChartMeta(chartV1,lastState?.analysis)}
    else if(m.event==='open_interest'&&d){chartV1=chartV1||{};chartV1.open_interest=chartV1.open_interest||{series:[]};const arr=chartV1.open_interest.series||[];if(d.time!=null&&d.open_interest!=null){arr.push(d);chartV1.open_interest.series=arr.slice(-200);syncDerivatives()}renderChartMeta(chartV1,lastState?.analysis)}
    else if(m.event==='liquidation'){chartV1=chartV1||{};chartV1.liquidations=chartV1.liquidations||{status:'available',series:[]};chartV1.liquidations.status='available';chartV1.liquidations.series=[...(chartV1.liquidations.series||[]),d].slice(-500);if(lastState)lastState.chartV1=chartV1;syncDerivatives();renderMicro(chartV1);if(overlays.microstructure)registry?.updateAll(lastState)}
    else if(m.event==='orderbook'){chartV1=chartV1||{};chartV1.orderbook=d.book?{...d.book,wall_state:d.wall_state}:d;if(lastState)lastState.chartV1=chartV1;renderMicro(chartV1);if(overlays.microstructure)registry?.updateAll(lastState)}
    else if(m.event==='analysis.snapshot'){if($('status'))$('status').textContent=s+' · '+tf.toUpperCase()+' · 실시간 분석 '+(d.confidence||'')+' · '+stamp(d.as_of)}
  };
  ws.onerror=()=>{if(badge){badge.textContent='WS error';badge.dataset.live='error'}};
  ws.onclose=()=>{if(generation!==streamGeneration||marketWs!==ws)return;if(badge){badge.textContent='WS reconnect';badge.dataset.live='reconnect_wait'};marketWsRetry=setTimeout(()=>{if(generation===streamGeneration&&clean($('symbol').value)===s&&$('tf').value===tf)connectMarketStream(s,tf)},2000)}
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
  const mtfRunToken=++mtfToken;
  const symbol=clean($('symbol').value),tf=$('tf').value;$('symbol').value=symbol;$('fallback').classList.remove('show');setState('live');$('status').textContent='800봉 구조·SMC·ICT·매물대·파생 분석 중…';
  const q=new URLSearchParams(location.search);currentPreset=P?.getPreset(q.get('preset')||P?.loadPreset()?.id||'clean')||{id:'clean'};presetDefaults(currentPreset.id);syncOverlayButtons();
  try{
    if(!window.LightweightCharts||!CD||!CP||!CC||!SE||!LE||!TA||!ST||!FB||!BC)throw new Error('필수 차트 모듈 로드 실패');
    const htfTf=htfFor(tf),jobs=[CD.fetchStructure({symbol,interval:tf,limit:800}),htfTf?CD.fetchStructure({symbol,interval:htfTf,limit:800}):Promise.resolve(null),CD.fetchChartV1?CD.fetchChartV1({symbol,timeframe:tf,visible:500,warmup:300,total:800,market:'spot',priceBins:100}):Promise.resolve(null)];
    const rs=await Promise.allSettled(jobs);if(rs[0].status!=='fulfilled')throw rs[0].reason;
    const analysis=rs[0].value,htf=rs[1]?.status==='fulfilled'?rs[1].value:null;chartV1=rs[2]?.status==='fulfilled'?rs[2].value:null;
    const smc=buildSmc(analysis,htf?.bias||null),liquidity=buildLiquidity(analysis,smc,tf),htfSmc=htf?buildSmc(htf,null):null,technical=TA.summarize({candles:analysis.candles,analysis,smc,liquidity}),classic=ST.analyze({candles:analysis.candles}),ictContext=buildIct({smc,liquidity,htfSmc,htfTf,tf,currentIndex:(analysis.candles||[]).length-1}),forexBook=FB.analyze({candles:analysis.candles,smc,liquidity,ictContext}),bookConfluence=BC.analyze({candles:analysis.candles,forexBook,classic});
    const normalized=CD.normalizeCandles(analysis.candles||[]),display=displaySnapshot(normalized,chartV1);indicatorCache={rsi:CD.rsiSeries(analysis.candles),macd:CD.macdSeries(analysis.candles),stoch:CD.stochRsiSeries(analysis.candles),kdj:CD.kdjSeries(analysis.candles),obv:CD.obvSeries(analysis.candles)};
    try{viewportCleanup?.()}catch{}viewportCleanup=null;try{zoneClickCleanup?.()}catch{}zoneClickCleanup=null;registry?.disposeAll();core?.dispose();
    core=CC.createUnifiedChart({container:$('unifiedChart'),library:window.LightweightCharts,preset:{id:'v5',panes:[]}});core.setData({...display,indicators:{}});
    registry=CP.createPluginRegistry();registry.register(window.PulseStructurePlugin.createStructurePlugin({maxItems:10}));registry.register(window.PulseSmcPlugin.createSmcPlugin());if(window.PulseIctPlugin)registry.register(window.PulseIctPlugin.createIctPlugin());registry.register(window.PulseLiquidityPlugin.createLiquidityPlugin());registry.register(window.PulseVolumeProfilePlugin.createVolumeProfilePlugin());if(window.PulseMicrostructurePlugin)registry.register(window.PulseMicrostructurePlugin.createMicrostructurePlugin());registry.register(window.PulseMovingAveragePlugin.createMovingAveragePlugin());registry.register(window.PulseDantePlugin.createDantePlugin());if(window.PulseSimpleTradingPlugin)registry.register(window.PulseSimpleTradingPlugin.createSimpleTradingPlugin());if(window.PulseForexBookPlugin)registry.register(window.PulseForexBookPlugin.createForexBookPlugin());if(window.PulseBookConfluencePlugin)registry.register(window.PulseBookConfluencePlugin.createBookConfluencePlugin());registry.mountAll(core);applyPluginVisibility();
    lastState={analysis,smc,liquidity,ictContext,technical,classic,forexBook,bookConfluence,chartV1,rawCandles:analysis.candles,candles:normalized.candles,dataApi:CD,timeframe:tf,tf,preset:currentPreset,maMode:'standard',viewportLevel:innerWidth<=620?'compact':'normal',htfTf,htfBias:stateText(htf?.bias||'neutral'),overlayFocus:Object.keys(overlays).find(k=>overlays[k])||'structure'};
    registry.updateAll(lastState);updateOverlayLegend(lastState.overlayFocus);bindViewportRefresh();syncIndicators();syncDerivatives();renderSummary(lastState);renderChartMeta(chartV1,analysis);renderMicro(chartV1);renderZoneList(chartV1);bindZoneClick();connectMarketStream(symbol,tf);loadAlerts();loadMtf(symbol,mtfRunToken);const viewportCount=fitVisibleCandles(chartV1?.chart?.visible_candle_count||500);if($('metaCandles')&&chartV1)$('metaCandles').textContent+=(viewportCount?' · 화면 '+viewportCount:'');
    const loaded=analysis.candles?.length||0,visible=chartV1?.chart?.visible_candle_count||Math.min(500,loaded),quality=chartV1?.data_quality?.status||'legacy';$('status').textContent=symbol+' · '+tf.toUpperCase()+' · 로드 '+loaded+' · 표시 '+visible+' · '+quality+(htfTf?' · HTF '+htfTf.toUpperCase():'');
    setState(chartV1?.data_quality?.status==='stale'||chartV1?.data_quality?.status==='invalid'?'api-degraded':'confirmed');
    $('snapshotLink').href='/mtf-snapshot-pro.html?symbol='+encodeURIComponent(symbol)+'&tf='+encodeURIComponent(tf);$('ictTrainerLink').href='/ict-trainer.html?symbol='+encodeURIComponent(symbol);$('reportLink').href='/coin-report.html?symbol='+encodeURIComponent(symbol);$('danteLink').href='/dante-lab.html?symbol='+encodeURIComponent(symbol)+'&tf='+encodeURIComponent(tf);$('simpleTradingLink').href='/simple-trading-lab.html?symbol='+encodeURIComponent(symbol)+'&tf='+encodeURIComponent(tf);$('forexBookLink').href='/forex-book-lab.html?symbol='+encodeURIComponent(symbol)+'&tf='+encodeURIComponent(tf);$('bookConfluenceLink').href='/book-confluence-lab.html?symbol='+encodeURIComponent(symbol)+'&tf='+encodeURIComponent(tf);
    const u=new URL(location.href);u.searchParams.set('symbol',symbol);u.searchParams.set('tf',tf);u.searchParams.set('preset',currentPreset.id);history.replaceState(null,'',u);if(new URLSearchParams(location.search).get('shell')==='1'&&parent!==window)parent.postMessage({type:'pulse-symbol-sync',symbol},'*')
  }catch(e){console.error(e);chartV1=null;renderChartMeta(null,null);renderZoneList(null);showError('분석 데이터를 불러오지 못했습니다',e?.message||String(e));$('status').textContent='오류 · '+(e?.message||'unknown')}
}
function init(){const q=new URLSearchParams(location.search);$('symbol').value=clean(q.get('symbol')||'BTCUSDT');if(['5m','15m','1h','4h','12h','1d','3d','1w'].includes(q.get('tf')))$('tf').value=q.get('tf');updateOverlayLegend('structure');document.querySelectorAll('[data-overlay]').forEach(b=>b.onclick=()=>{const id=b.dataset.overlay;overlays[id]=!overlays[id];syncOverlayButtons();registry?.setVisible(id,overlays[id]);if(lastState){lastState.overlayFocus=overlays[id]?id:(Object.keys(overlays).find(k=>overlays[k])||null);registry?.updateAll(lastState);updateOverlayLegend(lastState.overlayFocus||id);$('status').textContent=(overlays[id]?'ON · ':'OFF · ')+b.textContent.trim()+(overlays[id]?' · '+overlayEvidence(id,lastState):'')}});document.querySelectorAll('[data-pane]').forEach(b=>b.onchange=syncIndicators);document.querySelectorAll('[data-derivative]').forEach(b=>b.onchange=syncDerivatives);$('run').onclick=run;$('exportCsv').onclick=downloadCsv;$('shareChart').onclick=shareChart;$('savePng').onclick=savePng;$('runReplay').onclick=runReplay;$('runBacktest').onclick=runBacktest;$('refreshAlerts').onclick=loadAlerts;$('tf').onchange=run;$('symbol').onkeydown=e=>{if(e.key==='Enter')run()};run()}
if(typeof window!=='undefined')window.addEventListener('beforeunload',closeMarketStream);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();