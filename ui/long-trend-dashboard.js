(function(){
'use strict';
if(window.__pulseLongTrendDashboardV2)return;window.__pulseLongTrendDashboardV2=true;

const TF=['28d','14d','1w','3d','1d','4h'];
const META={
  '28d':{label:'28D',desc:'초장기 구조'},'14d':{label:'14D',desc:'장기 구조'},'1w':{label:'1W',desc:'주봉 구조'},
  '3d':{label:'3D',desc:'중장기 구조'},'1d':{label:'1D',desc:'일봉 구조'},'4h':{label:'4H',desc:'실행 전환 구조'}
};
const LIMIT={'28d':260,'14d':320,'1w':420,'3d':500,'1d':620,'4h':760};
const CARD_POLICY=Object.freeze({
  minBars:40,minConfirmedSwings:6,pivotLeft:3,pivotRight:3,
  slopeNeutralDailyPct:.02,closeToleranceAtr:.35,structureLookbackPerSide:2,
  neutralOnBreakCandidate:true,confirmedBreakStages:['BREAK_CONFIRMED','ROLE_FLIP']
});
const AGG_POLICY=Object.freeze({
  directionThreshold:.15,r2Weight:.70,slopeWeight:.30,slopeFullScaleDailyPct:.50,
  minCompositeFrames:2,structureAnchorTf:'1d'
});
const C={green:'#35d69a',red:'#ff6577',blue:'#4f8cff',amber:'#ffc45f'};
const $=id=>document.getElementById(id);
const CE=window.PulseLongTrendCardEngine,AE=window.PulseLongTrendAggregateEngine,LTE=window.PulseLongTermTrendlineEngine;
const finite=v=>Number.isFinite(Number(v));
const sec=t=>{const n=Number(t);return Math.trunc(n>1e12?n/1000:n)};
const pct=(v,d=2)=>finite(v)?((Number(v)>=0?'+':'')+Number(v).toFixed(d)+'%'):'-';
const fmt=(v,d=4)=>{if(!finite(v))return'-';const n=Number(v),a=Math.abs(n),max=a>=1000?2:a>=1?4:8;return n.toLocaleString('ko-KR',{maximumFractionDigits:Math.min(d,max)})};
const badgeDir=k=>k==='UP'?'up':k==='DOWN'?'down':k==='NEUTRAL'?'neutral':'na';
const polarityKo=s=>({BREAK_CANDIDATE:'돌파 후보',BREAK_CONFIRMED:'돌파 확인',ROLE_FLIP:'역할 전환',ACTIVE:'유효'}[s]||s||'-');
const sideKo=s=>s==='support'?'지지':s==='resistance'?'저항':'-';
let runSeq=0,rawByTf={},analysisByTf={},cardResults={},chartByTf={},summaryCore=null,lastSummary=null;
let lazyObserver=null,summaryVisible=false;
const visibleTf=new Set(),pendingTf=new Map();

function cleanSymbol(v){v=String(v||'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(!v)return'BTCUSDT';if(!v.endsWith('USDT')&&v.length<=12)v+='USDT';return v}
function setState(label,state){$('dataState').textContent=label;$('dataState').dataset.state=state}
function latest(rows){return Array.isArray(rows)&&rows.length?rows.at(-1):null}
function lineAt(L,i){return Math.exp(Number(L.interceptLog)+Number(L.logSlopePerBar)*i)}
function metric(label,value){return '<div><small>'+label+'</small><b>'+value+'</b></div>'}
function tfCard(tf){
  const m=META[tf],el=document.createElement('article');el.className='tfCard';el.dataset.tf=tf;
  el.innerHTML='<div class="tfHead"><div><b>'+m.label+'</b><small>'+m.desc+'</small></div><span class="trendBadge" id="badge-'+tf+'" data-dir="na">대기</span></div>'+
    '<div class="ohlc" id="ohlc-'+tf+'">-</div><div class="miniChart" id="chart-'+tf+'"><div class="lazyHint">화면 진입 시 차트 렌더링</div></div>'+
    '<div class="tfStats" id="stats-'+tf+'"><span>분석 전</span></div>';
  return el;
}
function buildBoard(){
  const grid=$('tfGrid');grid.innerHTML='';TF.forEach(tf=>grid.appendChild(tfCard(tf)));
  if('IntersectionObserver'in window){
    lazyObserver=new IntersectionObserver(entries=>{for(const e of entries){if(!e.isIntersecting)continue;if(e.target.id==='summaryCard'){summaryVisible=true;if(lastSummary)drawSummary(lastSummary);continue}const tf=e.target.dataset.tf;if(tf){visibleTf.add(tf);flushTf(tf)}}},{rootMargin:'180px 0px'});
    grid.querySelectorAll('.tfCard').forEach(el=>lazyObserver.observe(el));lazyObserver.observe($('summaryCard'));
  }else{TF.forEach(tf=>visibleTf.add(tf));summaryVisible=true}
}
function resetCard(tf,label='불러오는 중…'){
  const el=document.querySelector('.tfCard[data-tf="'+tf+'"]'),b=$('badge-'+tf),s=$('stats-'+tf),o=$('ohlc-'+tf);
  if(el)delete el.dataset.disabled;if(b){b.textContent='대기';b.dataset.dir='na'}if(s)s.innerHTML='<span>'+label+'</span>';if(o)o.textContent='-';
  if(chartByTf[tf]){try{chartByTf[tf].dispose()}catch{}delete chartByTf[tf]}
  pendingTf.delete(tf);const host=$('chart-'+tf);if(host)host.innerHTML='<div class="lazyHint">분석 중…</div>';
}
function volumeData(rows){
  return(rows||[]).filter(x=>finite(x.time)&&finite(x.volume)).map(x=>({time:sec(x.time),value:Number(x.volume),color:Number(x.close)>=Number(x.open)?'rgba(53,214,154,.40)':'rgba(255,101,119,.40)'}));
}
function trendData(line,rows){
  if(!line||!rows?.length)return[];const touches=(line.touchBars||[]).filter(Number.isInteger),start=Math.max(0,touches.length?Math.min(...touches):Math.max(0,rows.length-80)),out=[];
  for(let i=start;i<rows.length;i++){const t=sec(rows[i]?.time),v=lineAt(line,i);if(finite(t)&&finite(v)&&v>0)out.push({time:t,value:v})}return out;
}
function drawTfChart(tf,raw,analysis){
  const host=$('chart-'+tf);if(!host)return;host.innerHTML='';
  if(!window.LightweightCharts||!window.PulseChartCore||!window.PulseChartData)throw new Error('차트 모듈 미로딩');
  if(chartByTf[tf]){try{chartByTf[tf].dispose()}catch{}}
  const core=PulseChartCore.createUnifiedChart({container:host,library:LightweightCharts,preset:{id:'longtrend',panes:['rsi']}});chartByTf[tf]=core;
  const rows=raw.candles||[],norm=PulseChartData.normalizeCandles(rows);
  core.setData({candles:norm.candles,volume:volumeData(rows),indicators:{rsi:PulseChartData.rsiSeries(rows,14)}});
  const add=(line,color,dashed=false)=>{if(!line)return;const opts={color,lineWidth:line.state==='candidate'?1:2,crosshairMarkerVisible:false,lastValueVisible:false,priceLineVisible:false};if(dashed&&LightweightCharts.LineStyle)opts.lineStyle=LightweightCharts.LineStyle.Dashed;const s=core.addLineSeries(opts,0);s.setData(trendData(line,rows))};
  add(analysis.support,analysis.support?.effectiveSide==='resistance'?C.amber:C.green);add(analysis.resistance,analysis.resistance?.effectiveSide==='support'?C.amber:C.red);
  add(analysis.secondary?.support?.[0],'rgba(53,214,154,.48)',true);add(analysis.secondary?.resistance?.[0],'rgba(255,101,119,.48)',true);
  try{core.chart.timeScale().fitContent()}catch{}
}
function queueTf(tf,raw,analysis){pendingTf.set(tf,{raw,analysis});if(visibleTf.has(tf))flushTf(tf)}
function flushTf(tf){const x=pendingTf.get(tf);if(!x)return;pendingTf.delete(tf);try{drawTfChart(tf,x.raw,x.analysis)}catch(e){const host=$('chart-'+tf);if(host)host.innerHTML='<div class="lazyHint">'+e.message+'</div>'}}
function renderTf(tf,raw,analysis,card){
  const el=document.querySelector('.tfCard[data-tf="'+tf+'"]'),badge=$('badge-'+tf),last=latest(raw.candles||[]);
  if(last)$('ohlc-'+tf).textContent='시 '+fmt(last.open)+'  고 '+fmt(last.high)+'  저 '+fmt(last.low)+'  종 '+fmt(last.close)+' · '+(raw.dataSource||raw.market||'market');
  badge.textContent=card.badge;badge.dataset.dir=badgeDir(card.badgeKey);
  if(!card.available){
    if(el)el.dataset.disabled='1';
    $('stats-'+tf).innerHTML=metric('데이터',String(card.bars||0)+' / '+String(card.requiredBars||CARD_POLICY.minBars)+'봉')+metric('확정 Swing',String(card.confirmedSwings||0)+' / '+String(card.requiredSwings||CARD_POLICY.minConfirmedSwings)+'개')+metric('상태',card.reason||'비활성');
  }else{
    if(el)delete el.dataset.disabled;
    $('stats-'+tf).innerHTML=metric('일일 로그기울기',pct(card.slopeDailyPct,3))+metric('현재가 거리',pct(card.distancePct,2))+metric('회귀/품질',String(card.regressionScore||0)+' / '+String(card.quality||0))+metric('구조',card.structure?.label||'-')+metric('Polarity',polarityKo(card.polarityStage))+metric('판정 근거',card.reason);
  }
  queueTf(tf,raw,analysis);
}
function renderTfError(tf,e){
  const el=document.querySelector('.tfCard[data-tf="'+tf+'"]'),badge=$('badge-'+tf);if(el)el.dataset.disabled='1';badge.textContent='오류';badge.dataset.dir='down';
  $('ohlc-'+tf).textContent=e?.message||'데이터 로드 실패';$('stats-'+tf).innerHTML=metric('상태','로드 실패')+metric('재시도','6TF 분석')+metric('TF',META[tf].label);
}
async function fetchTf(symbol,tf){
  const r=await fetch('/api/structure?symbol='+encodeURIComponent(symbol)+'&interval='+encodeURIComponent(tf)+'&limit='+LIMIT[tf],{cache:'no-store'});
  let raw;try{raw=await r.json()}catch{throw new Error(META[tf].label+' 응답 파싱 실패')}if(!r.ok||!raw?.ok)throw new Error(raw?.error||META[tf].label+' HTTP '+r.status);
  const confirmed=CE.confirmedCandles(raw.candles||[]),swings=CE.extractLogCloseCanonicalSwings(confirmed,CARD_POLICY);
  const clean={...raw,candles:confirmed,canonicalSwings:swings,canonicalSwingSource:'confirmed-log-close',sourceCanonicalSwings:raw.canonicalSwings||[]};
  const analysis=LTE.analyzeTrendlines(confirmed,{timeframe:tf,canonicalSwings:swings});
  const card=CE.buildCardResult({tf,raw:clean,analysis,params:CARD_POLICY});
  return{raw:clean,analysis,card};
}
function renderMatrix(){
  const box=$('matrix');box.innerHTML='';
  for(const tf of TF){
    const x=cardResults[tf],d=document.createElement('div');d.className='matrixRow';
    if(!x){d.innerHTML='<b>'+META[tf].label+'</b><span>-</span><span>-</span><span>-</span><span>-</span><span>로드 실패</span><span>-</span>';box.append(d);continue}
    if(!x.available){d.innerHTML='<b>'+META[tf].label+'</b><span>-</span><span>-</span><span>-</span><span>-</span><span>'+x.reason+'</span><span>'+String(x.confirmedSwings||0)+' swings</span>';box.append(d);continue}
    const dc=x.badgeKey==='UP'?'up':x.badgeKey==='DOWN'?'down':'flat';
    d.innerHTML='<b>'+META[tf].label+'</b><span class="'+dc+'">'+x.badge+'</span><span>'+sideKo(x.lineSide)+'</span><span>'+pct(x.distancePct,2)+'</span><span>'+pct(x.slopeDailyPct,3)+'</span><span>'+polarityKo(x.polarityStage)+'</span><span><b>'+Math.round(x.quality)+'</b><div class="qualityBar"><i style="width:'+Math.max(0,Math.min(100,x.quality||0))+'%"></i></div></span>';
    box.append(d);
  }
}
function drawSummary(summary){
  const host=$('summaryChart');if(!host)return;host.innerHTML='';if(summaryCore){try{summaryCore.dispose()}catch{}summaryCore=null}
  const rows=rawByTf['1d']?.candles||[];if(!rows.length){host.innerHTML='<div class="lazyHint">1D 기준 캔들 데이터 부족</div>';return}
  summaryCore=PulseChartCore.createUnifiedChart({container:host,library:LightweightCharts,preset:{id:'summary',panes:[]}});
  const norm=PulseChartData.normalizeCandles(rows);summaryCore.setData({candles:norm.candles,volume:volumeData(rows)});
  const c=summary.composite;if(c){
    const avg=summaryCore.addLineSeries({color:C.blue,lineWidth:3,lastValueVisible:true,priceLineVisible:false,crosshairMarkerVisible:false},0),data=[];
    for(const r of rows){const t=sec(r.time),days=(t-c.refTime)/86400,v=c.levelAtRef*Math.exp(c.dailyLogSlope*days);if(finite(v)&&v>0)data.push({time:t,value:v})}avg.setData(data);
    const px=summaryCore.addLineSeries({color:C.green,lineWidth:1,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false,lineStyle:LightweightCharts.LineStyle?.Dashed??2},0);
    if(rows.length>1)px.setData([{time:sec(rows[0].time),value:c.price},{time:sec(rows.at(-1).time),value:c.price}]);
  }
  try{summaryCore.chart.timeScale().fitContent()}catch{}
}
function renderSummary(){
  const baseRows=rawByTf['1d']?.candles||[],s=AE.buildSummary(cardResults,baseRows,AGG_POLICY);lastSummary=s;
  const dd=s.direction.key==='UP'?'up':s.direction.key==='DOWN'?'down':'neutral';$('directionBox').dataset.direction=dd;$('direction').textContent=s.direction.label;
  $('directionMeta').textContent='장기 60% · 단기 40% · RESEARCH ONLY';$('strength').textContent=Math.round(s.strength.score)+'/100';$('alignment').textContent=Math.round(s.alignment)+'/100';
  $('avgSlope').textContent=s.composite?pct(s.composite.dailySlopePct,3)+'/일':'-';$('avgDistance').textContent=s.composite?pct(s.composite.distancePct,2):'-';$('htfState').textContent=s.htf.label;$('integrity').textContent=Math.round(s.avgIntegrity)+'/100';$('sourceCount').textContent='유효 TF '+s.validCount+'/'+s.totalFrames;
  $('htfFact').textContent=s.htf.label;$('htfFactMeta').textContent='28D · 1W · 3D 배지 '+(s.htf.active?'동일':'비동일/부족');$('htfFact').parentElement.dataset.state=s.htf.active?'good':'neutral';
  $('slopeFact').textContent=s.composite?pct(s.composite.dailySlopePct,3)+'/일':'판정 불가';$('slopeFact').parentElement.dataset.state=s.composite?(Math.abs(s.composite.dailySlopePct)>.02?'good':'neutral'):'neutral';
  $('structureFact').textContent=s.structure.label;$('structureFactMeta').textContent=(s.structure.anchorTf||'1d').toUpperCase()+' 주요 지지선 · 확정 종가 기준';$('structureFact').parentElement.dataset.state=s.structure.maintained?'good':'neutral';
  const alignText=s.alignment>=80?'높은 정렬':s.alignment>=50?'부분 정렬':'낮은 정렬',comp=s.composite?'표시용 합성선 '+pct(s.composite.dailySlopePct,3)+'/일':'합성선 데이터 부족';
  $('summaryText').textContent='종합 방향성은 TF 가중 배지 합으로 '+s.direction.label+'입니다. 정렬도는 '+alignText+'('+Math.round(s.alignment)+'/100), 추세 강도는 회귀 R² 70% + 일일 로그기울기 30%로 '+Math.round(s.strength.score)+'/100입니다. '+comp+'이며 실제 가격 평균이 아닙니다. 역사적 층화표본·Precision@K 검증 전이므로 실전 신호로 승격하지 않습니다.';
  if(summaryVisible)drawSummary(s);else{const host=$('summaryChart');if(host)host.innerHTML='<div class="lazyHint">화면 진입 시 1D 기준 합성 차트 렌더링</div>'}
}
async function run(){
  const seq=++runSeq,symbol=cleanSymbol($('symbol').value);$('symbol').value=symbol;try{parent.postMessage({type:'pulse-symbol-sync',symbol},'*')}catch{}
  setState('6TF 분석 중','loading');$('run').disabled=true;rawByTf={};analysisByTf={};cardResults={};TF.forEach(tf=>resetCard(tf));let cursor=0,errors=0;
  async function worker(){while(true){const i=cursor++;if(i>=TF.length)return;const tf=TF[i];try{const x=await fetchTf(symbol,tf);if(seq!==runSeq)return;rawByTf[tf]=x.raw;analysisByTf[tf]=x.analysis;cardResults[tf]=x.card;renderTf(tf,x.raw,x.analysis,x.card)}catch(e){errors++;if(seq===runSeq)renderTfError(tf,e)}}}
  await Promise.all([worker(),worker()]);if(seq!==runSeq)return;renderMatrix();renderSummary();$('updatedAt').textContent='업데이트 '+new Date().toLocaleString('ko-KR');setState(errors?'부분 완료 '+(TF.length-errors)+'/'+TF.length:'실시간 구조 완료',errors?'error':'ok');$('run').disabled=false;
}
function saveSummary(){
  try{if(!summaryCore&&lastSummary)drawSummary(lastSummary);const c=summaryCore?.chart?.takeScreenshot?.();if(!c)throw new Error('현재 브라우저에서 차트 캡처를 지원하지 않습니다.');c.toBlob(blob=>{if(!blob)return;const a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=cleanSymbol($('symbol').value)+'_long-trend-display-composite.png';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1200)},'image/png')}catch(e){setState(e.message,'error')}
}
function init(){
  if(!CE||!AE||!LTE||!window.PulseChartData||!window.PulseChartCore){setState('장기추세 모듈 로드 실패','error');return}
  buildBoard();const q=new URLSearchParams(location.search);$('symbol').value=cleanSymbol(q.get('symbol')||'BTCUSDT');$('run').onclick=run;$('saveSummary').onclick=saveSummary;$('symbol').addEventListener('keydown',e=>{if(e.key==='Enter')run()});run();
}
window.addEventListener('load',init,{once:true});
})();