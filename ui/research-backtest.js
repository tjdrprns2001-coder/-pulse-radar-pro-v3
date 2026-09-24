(()=>{'use strict';
const $=id=>document.getElementById(id);
const H=[['h3','3시간'],['h6','6시간'],['h12','12시간'],['h24','24시간'],['d3','3일']];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const valid=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const pct=v=>valid(v)?(Number(v)*100).toFixed(1)+'%':'-';
const num=(v,d=2)=>valid(v)?Number(v).toFixed(d):'-';
async function get(url){const r=await fetch(url,{cache:'no-store'}),j=await r.json();if(!r.ok||j.status!=='ok')throw new Error(j.error||('HTTP '+r.status));return j}
function labelCard(x){return x?(String(x.hitCount)+'/'+String(x.evaluatedCount)+' · '+pct(x.hitRate)):'-'}
function integrity(status,stats){
 const manifest=(status.manifests||[])[0],warn=Boolean(stats.survivorshipWarning||status.survivorshipWarning);
 const rows=[['임계값 동결',manifest&&manifest.frozen?'동결됨':'확인 필요'],['규칙 명세 버전',manifest&&manifest.manifestVersion||'-'],['표본',stats.sampleCount??0],['편향 제외 표본',stats.unbiasedSampleCount??0],['생존편향',warn?'생존편향 경고':'경고 없음'],['가설용 샘플','정식 통계에서 제외']];
 return rows.map(function(row){const a=row[0],b=row[1],cl=a==='생존편향'&&warn?'warn':'';return '<article class="'+cl+'"><b>'+esc(a)+'</b><span>'+esc(b)+'</span></article>'}).join('')
}
function horizonCards(stats){return H.map(function(pair){const k=pair[0],label=pair[1],h=(stats.horizons||{})[k]||{};return '<article><h3>'+label+'</h3><p>수익률 P50 <b>'+num(h.returnPct&&h.returnPct.p50)+'%</b></p><p>MFE P50 <b>'+num(h.mfePct&&h.mfePct.p50)+'%</b></p><p>MAE P50 <b>'+num(h.maePct&&h.maePct.p50)+'%</b></p><p>RR P50 <b>'+num(h.rr&&h.rr.p50)+'</b></p></article>'}).join('')}
function featureRows(stats){
 const rows=Object.entries(stats.features||{}).sort((a,b)=>(a[1].missingRate||0)-(b[1].missingRate||0)).slice(0,30);
 if(!rows.length)return'<div class="empty">아직 숫자 피처 표본이 없습니다.</div>';
 return '<div class="thead"><span>피처</span><span>P50</span><span>결측률</span><span>성공-실패 P50 차이</span></div>'+rows.map(function(pair){const k=pair[0],v=pair[1],c=(stats.featureComparison||{})[k];return '<div class="trow"><b>'+esc(k)+'</b><span>'+num(v.p50)+'</span><span>'+pct(v.missingRate)+'</span><span>'+num(c&&c.medianDifference)+'</span></div>'}).join('')
}
function eventRows(items){if(!items.length)return'<div class="empty">저장된 이벤트가 없습니다.</div>';return items.slice(0,30).map(function(x){return '<article><b>'+esc(x.symbol)+'</b><span>'+esc(String(x.datasetSplit||'').toUpperCase())+'</span><small>'+new Date(Number(x.signalCandleCloseTs)).toLocaleString('ko-KR',{hour12:false})+'</small><small>진입가 '+esc(x.entryPrice)+'</small></article>'}).join('')}
function engineCards(status){
 const e=status.dataEngine||{},u=e.universe||{},session=status.sessionPolicy||{},lineage=status.lineagePolicy||{};
 const rows=[['엔진',e.engineVersion||'-'],['거래소',e.exchange||'-'],['시장',e.marketType||'-'],['세션',e.session||session.label||'-'],['앵커',e.sessionAnchor||session.anchor||'-'],['데이터',e.marketSource||'-'],['결측 정책',e.missingPolicy||'-'],['상장 이력 처리',Array.isArray(lineage.events)?lineage.events.join(' · '):'-']];
 return rows.map(r=>'<article><b>'+esc(r[0])+'</b><span>'+esc(r[1])+'</span></article>').join('')
}
function presetCards(data){
 const rows=Object.values(data||{}),causal={id:'causal-ict-r0.1',label:'인과성 ICT R0.1',engine:'CAUSAL_ICT_R0_1_JS',sourceBoundary:'공개 ICT 방식 인과성 연구 프록시 · 다음 봉 시가 체결'};
 const all=[...rows,causal];
 return all.map(x=>'<article><b>'+esc(x.label||x.id)+'</b><span>'+esc(x.engine||'-')+'</span><small>'+esc(x.sourceBoundary||'연구용 프록시')+'</small></article>').join('')
}
function reportRows(items){
 if(!items.length)return'<div class="empty">아직 저장된 Dante 연구 리포트가 없습니다.</div>';
 return items.slice(0,20).map(x=>{
  const r=x.result||{},base=r.stress&&r.stress['1x']&&r.stress['1x'].report,walk=r.summary,rob=r.robustness||{},ci=rob.bootstrapMeanReturnPct||{},bh=r.baselines&&r.baselines.buyHold,ema=r.baselines&&r.baselines.ema20x60;
  let line='',detail='';
  if(x.type==='walk-forward'){
    line='구간 '+esc(walk&&walk.foldCount||0)+' · 수익계수 '+num(walk&&walk.meanProfitFactor)+' · 평균 '+num(walk&&walk.meanNetReturnPct)+'%';
    detail='과최적화확률 근사 '+num(rob.pboApprox,3)+' · 구간 신뢰범위 '+num(rob.walkForwardFoldMeanCI&&rob.walkForwardFoldMeanCI.low)+'~'+num(rob.walkForwardFoldMeanCI&&rob.walkForwardFoldMeanCI.high)+'%';
  }else{
    const s15=r.stress&&r.stress['1.5x']&&r.stress['1.5x'].report,s2=r.stress&&r.stress['2x']&&r.stress['2x'].report;
    line='신호 '+esc(r.signalCount||0)+' · 수익계수 '+num(base&&base.profitFactor)+' · 최대낙폭 '+num(base&&base.maxDrawdownPct)+'%';
    detail='연환산성장률 '+num(base&&base.cagrPct)+'% · 샤프 '+num(base&&base.sharpe)+' · 소르티노 '+num(base&&base.sortino)+' · 칼마 '+num(base&&base.calmar);
    detail+='<br>비용 1× '+num(base&&base.meanNetReturnPct)+'% · 1.5× '+num(s15&&s15.meanNetReturnPct)+'% · 2× '+num(s2&&s2.meanNetReturnPct)+'%';
    detail+='<br>단순보유 '+num(bh&&bh.returnPct)+'% · EMA20×60 '+num(ema&&ema.returnPct)+'%';
    detail+='<br>부트스트랩 평균 신뢰범위 '+num(ci.low)+'~'+num(ci.high)+'% · 포트폴리오 '+num(r.portfolio&&r.portfolio.totalReturnPct)+'%';
  }
  return '<article><b>'+esc(x.symbol)+' · '+esc(x.presetId)+'</b><span>'+esc(x.type)+'</span><small>'+line+'</small><small class="reportDetail">'+detail+'</small><small>'+new Date(Number(x.createdAt)).toLocaleString('ko-KR',{hour12:false})+'</small></article>'
 }).join('')
}
function paperStatCards(s){
 const rows=[['전체',s.total??0],['진행 중',s.open??0],['종료',s.closed??0],['승률',valid(s.winRate)?(Number(s.winRate)*100).toFixed(1)+'%':'-'],['평균 수익률',valid(s.meanReturnPct)?Number(s.meanReturnPct).toFixed(2)+'%':'-']];
 return rows.map(r=>'<article><b>'+esc(r[0])+'</b><span>'+esc(r[1])+'</span></article>').join('')
}
function paperRows(items){
 if(!items.length)return'<div class="empty">모의매매 기록이 없습니다.</div>';
 return items.slice(0,30).map(x=>{
  const ret=x.state==='CLOSED'?x.realizedReturnPct:x.unrealizedReturnPct;
  return '<article><b>'+esc(x.symbol)+' · '+esc(x.presetId)+'</b><span>'+esc(x.state==='OPEN'?'진행 중':x.state==='CLOSED'?'종료':x.state)+'</span><small>진입가 '+num(x.entryPrice)+' · 현재가 '+num(x.lastMarkPrice)+'</small><small>수익률 '+num(ret)+'%</small></article>'
 }).join('')
}
async function load(){
 $('refresh').disabled=true;$('status').textContent='정식 데이터셋 확인 중…';const split=$('split').value;
 try{
  const result=await Promise.all([
    get('/api/research-backtest?action=status'),
    get('/api/research-backtest?action=stats&split='+encodeURIComponent(split)),
    get('/api/research-backtest?action=events&split='+encodeURIComponent(split)+'&limit=50'),
    get('/api/research-backtest?action=presets'),
    get('/api/research-backtest?action=reports&limit=30'),
    get('/api/research-backtest?action=paper-stats'),
    get('/api/research-backtest?action=paper&limit=50')
  ]);
  const status=result[0].data||{},stats=result[1].data||{},ev=result[2],presets=result[3].data||{},reports=result[4],paperStats=result[5].data||{},paper=result[6];
  $('engine').innerHTML=engineCards(status);$('dantePresets').innerHTML=presetCards(presets);
  $('integrity').innerHTML=integrity(status,stats);$('hit6').textContent=labelCard(stats.labels&&stats.labels.Hit_6H_8pct);$('hit24').textContent=labelCard(stats.labels&&stats.labels.Hit_24H_12pct);$('horizons').innerHTML=horizonCards(stats);$('features').innerHTML=featureRows(stats);$('events').innerHTML=eventRows(ev.items||[]);
  $('researchReports').innerHTML=reportRows(reports.items||[]);$('paperStats').innerHTML=paperStatCards(paperStats);$('paperTrades').innerHTML=paperRows(paper.items||[]);
  $('status').textContent=(split==='train'?'학습 구간':'검증 구간')+' · 표본 '+String(stats.sampleCount||0)+' · '+(stats.validationIntegrity==='biased-universe-present'?'생존편향 경고':'데이터 무결성 확인');
 }catch(err){$('status').textContent='백테스트 데이터를 불러오지 못했습니다 · '+String(err&&err.message||err);['engine','dantePresets','integrity','horizons','features','events','researchReports','paperStats','paperTrades'].forEach(id=>$(id).innerHTML='<div class="empty">데이터를 다시 불러와 주세요.</div>');$('hit6').textContent='-';$('hit24').textContent='-'}finally{$('refresh').disabled=false}
}
function init(){$('refresh').addEventListener('click',load);$('split').addEventListener('change',load);load()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();