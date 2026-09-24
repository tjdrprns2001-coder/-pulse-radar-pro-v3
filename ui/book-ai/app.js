(()=>{'use strict';
const $=id=>document.getElementById(id);
const CD=window.PulseChartData,SE=window.PulseSmcEngine,LE=window.PulseLiquidityEngine,LM=window.PulseLiquidityMapEngine,TRE=window.PulseTrendlineRetestEngine,ICT=window.PulseIctTrainerEngine,BF=window.PulseForexBookEngine;
const Journal=window.PulseLiquidityEventJournal,Gate=window.PulseSampleReadinessGate,Live=window.PulseBookAiLiveEvidence,A=window.PulseBookAiAdapter,R=window.PulseBookAiRuleEngine,F=window.PulseBookAiFusionEngine,S=window.PulseBookAiSummaryTemplate,C=window.PulseBookAiSnapshotComposer,MTF=window.PulseBookAiMtfComposer,WL=window.PulseBookAiWatchlistSelector,Store=window.PulseBookAiStorage,SR=window.PulseSnapshotRenderer;
const RULE_LABEL={BREAKOUT_RETEST:'돌파 후 리테스트',SUPPORT_RESISTANCE_FLIP:'지지·저항 역할 전환',TRENDLINE_REACTION:'추세선 반응',LIQUIDITY_SWEEP_RECLAIM:'유동성 스윕 후 회복',VOLUME_CONTRACTION_BREAK:'거래량 수축 후 돌파',MOVING_AVERAGE_COMPRESSION:'이평 압축'};
let last=null;
function clean(v){v=String(v||'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(!v)return'BTCUSDT';if(!v.endsWith('USDT')&&v.length<=12)v+='USDT';return v}
function fmtTime(ms){return Number.isFinite(Number(ms))?new Date(Number(ms)).toLocaleString('ko-KR',{hour12:false}):'-'}
async function json(url){const r=await fetch(url,{cache:'no-store'}),d=await r.json().catch(()=>({}));if(!r.ok||d.status==='error')throw new Error(d.error||('HTTP '+r.status));return d}
function lastClosedTime(raw){const c=raw?.candles||[],x=c.at(-1);return Number(x?.closeTime??x?.closedAt??x?.time??raw?.lastClosedCloseTime)||null}
function gateReadOnly(){
  if(!Gate)return null;
  try{
    const db=Gate.createLocalStorageStore(localStorage).read(),round=db.rounds?.at(-1)||null,observations=Array.isArray(db.observations)?db.observations:[];
    if(!round&&!observations.length)return null;
    const times=[round?.decision?.decidedAt,round?.validation?.cutoffFrozenAt,round?.validationProgress?.updatedAt,round?.createdAt,...observations.flatMap(x=>[x.outcomeUpdatedAt,x.confirmedAt])].map(Number).filter(Number.isFinite);
    const observedAt=times.length?Math.max(...times):null;
    return{data:{version:Gate.VERSION,state:round?.status||'INSUFFICIENT',round,progress:{archiveN:observations.length,updatedAt:observedAt}},observedAt,version:Gate.VERSION};
  }catch{return null}
}
function journalReadOnly(){
  if(!Journal)return null;
  try{const data=Journal.createLocalStorageStore(localStorage).export();if(!(data.snapshots?.length||data.events?.length||data.outcomes?.length))return null;return{data,version:Journal.VERSION}}catch{return null}
}
function source(data,observedAt,version){return data==null?{data:null,reason:'NOT_AVAILABLE'}:{data,observedAt:observedAt||null,version:version||data.version||null}}
function closedCandlesForAsOf(rows,analysisAsOf){
  return (Array.isArray(rows)?rows:[]).filter(c=>{
    if(!c||c.partial===true||c.isClosed===false||c.confirmed===false)return false;
    const t=Number(c.closeTime??c.closedAt);
    return !Number.isFinite(t)||t<=analysisAsOf;
  });
}
function rawBias(raw){
  const last=Array.isArray(raw?.events)?raw.events.at(-1):null;if(last?.dir)return last.dir;
  const v=String(raw?.bias?.label||raw?.bias||'').toLowerCase();
  if(v.includes('up')||v.includes('bull')||v.includes('상승'))return'up';
  if(v.includes('down')||v.includes('bear')||v.includes('하락'))return'down';
  return'neutral';
}
function buildChart(raw,tf='4h',analysisAsOf=Date.now()){
  if(!LM||!TRE)throw new Error('LiquidityMap/TrendlineRetest engine unavailable');
  const sourceCandles=closedCandlesForAsOf(raw.candles||[],analysisAsOf);
  const model=LM.buildLiquidityMap({candles:sourceCandles,canonicalSwings:raw.canonicalSwings||[],canonicalEvents:raw.events||[],timeframe:tf,htfBias:rawBias(raw)});
  if(!model?.ok)throw new Error(model?.error||'Liquidity Map 생성 실패');
  const candles=model.candles,smc=model.smc,liquidity=model.liquidity;
  const trendRetest=TRE.analyzeTrendlineRetests({candles:sourceCandles,trendlines:raw.trendlines||{},timeframe:tf});
  const ict=ICT.analyzeTimeframe({candles,smc,liquidity,tf});
  const book=BF.analyze({candles,smc,liquidity,ictContext:ict});
  return{candles,smc,liquidity,ict,book,model,trendRetest};
}
function renderWatchlist(rows=[]){
  const box=$('watchlist');if(!box)return;box.innerHTML='';
  if(!rows.length){box.innerHTML='<div class="watchEmpty">현재 조건에 맞는 관찰 후보가 없습니다.</div>';return}
  for(const x of rows){
    const b=document.createElement('button');b.className='watchItem';b.type='button';b.dataset.symbol=x.symbol;
    const top=document.createElement('div');top.className='wTop';
    const sym=document.createElement('b');sym.textContent=x.symbol;
    const score=document.createElement('em');score.textContent='관찰 '+Math.round(x.watchScore);
    top.append(sym,score);
    const p=document.createElement('p');p.textContent=(x.reasons||[]).join(' · ')||'Scanner 관찰 후보';
    const s=document.createElement('small');s.textContent=[x.scanClass,x.v2Type,x.v3Tier,Number.isFinite(x.priceChange24h)?'24H '+(x.priceChange24h>=0?'+':'')+x.priceChange24h.toFixed(1)+'%':null].filter(Boolean).join(' · ');
    b.append(top,p,s);b.onclick=()=>{$('symbol').value=x.symbol;run()};box.append(b);
  }
}
async function refreshWatchlist(){
  const box=$('watchlist');if(box)box.innerHTML='<div class="watchEmpty">후보 스캔 중…</div>';
  try{
    if(!WL)throw new Error('Watchlist selector unavailable');
    const summary=await json('/api/coin-scan?mode=summary&limit=500');
    const rows=Array.isArray(summary.items)?summary.items:[];
    const seed=rows.filter(x=>x.dataState!=='failed'&&!['POST-SURGE','DISTRIBUTION-RISK','PUMP-RISK','STALE'].includes(String(x.scanClass?.key||''))).sort((a,b)=>(Number(b.candidateScore)||0)-(Number(a.candidateScore)||0)||Math.abs(Number(a.priceChange24h)||0)-Math.abs(Number(b.priceChange24h)||0)).slice(0,12).map(x=>x.symbol);
    if(!seed.length){renderWatchlist([]);return[]}
    const deep=await json('/api/coin-scan?mode=deep&limit=12&precision=1&symbols='+encodeURIComponent(seed.join(',')));
    const selected=WL.select(deep.items||[],8);renderWatchlist(selected);return selected;
  }catch(e){if(box)box.innerHTML='<div class="watchEmpty">후보 로드 실패 · '+String(e?.message||e)+'</div>';return[]}
}
function renderAggregate(symbol,charts,raws){
  if(!MTF)return;
  const panels={};
  for(const tf of ['1d','4h','1h','15m']){const ch=charts[tf];if(!ch)continue;panels[tf]={...ch,analysis:raws[tf],state:rawBias(raws[tf]).toUpperCase(),bias:rawBias(raws[tf])}}
  const r=MTF.compose({canvas:$('aggregateSnapshot'),panels,renderer:SR,symbol});
  $('mtfStatus').textContent=r.panelCount+'/4 TF';
}
function sourceCards(engineSources){
  const box=$('sources');box.innerHTML='';
  for(const [name,x] of Object.entries(engineSources||{})){
    const d=document.createElement('div');d.className='source '+x.status;
    const b=document.createElement('b');b.textContent=name+' · '+x.status;
    const p=document.createElement('p');p.textContent=[x.version||'version N/A',x.reason||'',x.observedAt?'관측 '+fmtTime(x.observedAt):'관측시각 N/A'].filter(Boolean).join(' · ');
    d.append(b,p);box.append(d);
  }
}
function ruleCards(rows){
  const box=$('rules');box.innerHTML='';
  for(const x of rows||[]){
    const d=document.createElement('div');d.className='rule';
    const b=document.createElement('b');b.textContent=RULE_LABEL[x.ruleId]||x.ruleId;
    const st=document.createElement('span');st.className='status state-'+(x.status==='CONFIRMED'?'CONFIRMED':x.status==='CANDIDATE'?'WATCH':'NO_SETUP');st.textContent=x.status;
    const p=document.createElement('p');p.textContent='facts '+(x.evidenceFactIds?.length||0)+' · persisted '+(x.trustedEvidenceEventIds?.length||0)+' · live '+(x.ephemeralEvidenceEventIds?.length||0)+(x.sequenceId?' · '+x.sequenceId:'');
    d.append(b,st,p);box.append(d);
  }
}
function summaryView(s){
  const box=$('summary');box.innerHTML='';
  for(const [k,v] of [['한 줄',s.headline],['HTF',s.htf],['Setup',s.setup],['근거',s.evidence],['데이터',s.dataQuality],['반증',s.counterEvidence],['다음 확인',s.nextConfirmation]]){
    const d=document.createElement('div');d.className='summaryLine';const strong=document.createElement('strong');strong.textContent=k+' · ';d.append(strong,document.createTextNode(v));box.append(d);
  }
}
function render(result,chart,charts=null,raws=null){
  const f=result.fusion,s=result.summary,a=f.evidenceAudit||{};
  $('setupState').textContent=f.setupState;$('setupState').className='state-'+f.setupState;
  $('transitionReason').textContent=f.setupLifecycle?.transition?.reason||'-';$('stage').textContent=f.stage?.code||'N/A';$('bias').textContent=f.bias?.value||'N/A';
  $('score').textContent=(f.bookEvidence?.normalizedScore??0)+'/100';$('alignment').textContent=f.htfAlignment||'UNKNOWN';$('dataQuality').textContent=f.dataQuality?.state||'-';$('asOf').textContent='as-of '+fmtTime(f.analysisAsOf);
  $('factCount').textContent=String(a.uniqueFactCount??0)+' · P '+String(a.persistedFactCount??0)+' / L '+String(a.ephemeralFactCount??0);$('eventCount').textContent=String(a.uniqueEventCount??0)+' · P '+String(a.persistedEventCount??0)+' / L '+String(a.ephemeralEventCount??0);$('sharedCount').textContent=String(a.sharedEventIds?.length??0);$('sharedRatio').textContent=Number.isFinite(Number(a.sharedEvidenceRatio))?(Number(a.sharedEvidenceRatio)*100).toFixed(1)+'%':'-';
  summaryView(s);ruleCards(f.bookSetups);sourceCards(f.engineSources);
  S.assertCanonicalSummaryGrounded(s,f);
  C.compose({canvas:$('snapshot'),symbol:f.symbol,timeframe:'4h',candles:chart.candles,analysis:result.raw,smc:chart.smc,liquidity:chart.liquidity,ict:chart.ict,summary:s,renderer:SR});
  if(charts&&raws)renderAggregate(f.symbol,charts,raws);
  $('savePng').disabled=false;
}
async function run(){
  const symbol=clean($('symbol').value);$('symbol').value=symbol;$('status').classList.remove('error');$('status').textContent='분석 중…';$('run').disabled=true;$('savePng').disabled=true;
  try{
    const now=Date.now(),tfList=['1d','4h','1h','15m'];
    const [scan,...rawList]=await Promise.all([json('/api/coin-scan?mode=deep&limit=1&precision=1&symbols='+encodeURIComponent(symbol)),...tfList.map(tf=>CD.fetchStructure({symbol,interval:tf,limit:560}))]);
    const item=scan.items?.[0];if(!item)throw new Error('Scanner deep result 없음');
    const raws=Object.fromEntries(tfList.map((tf,i)=>[tf,rawList[i]])),charts={};
    for(const tf of tfList)charts[tf]=buildChart(raws[tf],tf,now);
    const raw=raws['4h'],chart=charts['4h'],closed=lastClosedTime({candles:chart.candles});
    const journal=journalReadOnly(),gate=gateReadOnly();
    if(!Live)throw new Error('Book AI LiveEvidence engine unavailable');
    const liveEvidence=Live.createLiveEvidence({journal:Journal,symbol,timeframe:'4h',model:chart.model,trendRetest:chart.trendRetest,now,analysisAsOf:now});
    const adapter=A.adaptBookAiInput({
      analysisAsOf:now,symbol,exchange:'BINANCE',marketType:'perpetual',liveEvidence,
      sources:{
        scanner:source(item,item.updatedAt,scan.scannerVersion||'v3'),
        presurge:source(item.preSurge,item.updatedAt,'PRE_SURGE_v2'),
        ict:source(chart.ict,closed,chart.ict?.version||'ICT'),
        structure:source(raw,closed,raw.version||'structure'),
        forexBook:source(chart.book,closed,chart.book?.version),
        journal:journal||{data:null,reason:'LOCAL_JOURNAL_EMPTY'},
        gate:gate||{data:null,reason:'LOCAL_GATE_EMPTY'},
        trendline:source(chart.trendRetest,closed,chart.trendRetest?.version||raw.trendlineVersion||null)
      }
    });
    const rules=R.evaluate(adapter),storage=Store.create(localStorage),previous=storage.get(symbol)?.lifecycle||null;
    const fusion=F.fuse({adapter,ruleResult:rules,previousLifecycle:previous});
    if(!fusion.resultReady)throw new Error('Scanner stage/bias 불완전 · '+fusion.incompleteReasons.join(', '));
    const summary=S.buildCanonicalSummary(fusion);S.assertCanonicalSummaryGrounded(summary,fusion);
    storage.set(symbol,fusion.setupLifecycle);
    last={fusion,summary,raw,chart,charts,raws};render(last,chart,charts,raws);
    $('status').textContent=symbol+' · '+fusion.setupState+' · 완료';
    try{parent.postMessage({type:'pulse-symbol-sync',symbol},'*')}catch{}
    const u=new URL(location.href);u.searchParams.set('symbol',symbol);history.replaceState(null,'',u);
  }catch(e){$('status').textContent='오류 · '+(e.message||e);$('status').classList.add('error')}finally{$('run').disabled=false}
}
function save(){
  if(!last)return;
  const a=document.createElement('a');const agg=$('aggregateSnapshot');a.href=agg?.dataset?.bookAiMtfRendered==='1'?MTF.pngDataUrl(agg):C.pngDataUrl($('snapshot'));a.download=last.fusion.symbol+'-book-ai-mtf.png';document.body.append(a);a.click();a.remove();
}
$('run').onclick=run;$('savePng').onclick=save;$('refreshCandidates').onclick=refreshWatchlist;$('symbol').addEventListener('keydown',e=>{if(e.key==='Enter')run()});
const q=new URLSearchParams(location.search);$('symbol').value=clean(q.get('symbol')||'BTCUSDT');run();refreshWatchlist();
})();