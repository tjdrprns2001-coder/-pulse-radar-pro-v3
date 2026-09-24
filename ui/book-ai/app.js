(()=>{'use strict';
const $=id=>document.getElementById(id);
const CD=window.PulseChartData,SE=window.PulseSmcEngine,LE=window.PulseLiquidityEngine,LM=window.PulseLiquidityMapEngine,TRE=window.PulseTrendlineRetestEngine,ICT=window.PulseIctTrainerEngine,BF=window.PulseForexBookEngine,TA=window.PulseTraderAnalysis;
const Journal=window.PulseLiquidityEventJournal,Gate=window.PulseSampleReadinessGate,Live=window.PulseBookAiLiveEvidence,A=window.PulseBookAiAdapter,R=window.PulseBookAiRuleEngine,F=window.PulseBookAiFusionEngine,S=window.PulseBookAiSummaryTemplate,C=window.PulseBookAiSnapshotComposer,Store=window.PulseBookAiStorage,SR=window.PulseSnapshotRenderer;
const RULE_LABEL={BREAKOUT_RETEST:'돌파 후 리테스트',SUPPORT_RESISTANCE_FLIP:'지지·저항 역할 전환',TRENDLINE_REACTION:'추세선 반응',LIQUIDITY_SWEEP_RECLAIM:'유동성 스윕 후 회복',VOLUME_CONTRACTION_BREAK:'거래량 수축 후 돌파',MOVING_AVERAGE_COMPRESSION:'이평 압축'};
const MINI_TFS=['1d','4h','1h','15m'];
let last=null,runSeq=0;
function clean(v){v=String(v||'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(!v)return'BTCUSDT';if(!v.endsWith('USDT')&&v.length<=12)v+='USDT';return v}
function fmtTime(ms){return Number.isFinite(Number(ms))?new Date(Number(ms)).toLocaleString('ko-KR',{hour12:false}):'-'}
function fmtPrice(v){const n=Number(v);if(!Number.isFinite(n))return'N/A';const d=n>=100?2:n>=1?4:n>=.01?5:8;return n.toLocaleString('en-US',{maximumFractionDigits:d})}
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
  const ev=Array.isArray(raw?.events)?raw.events.at(-1):null;if(ev?.dir)return ev.dir;
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
  const technical=TA?.summarize?TA.summarize({candles,analysis:raw,smc,liquidity,timeframe:tf}):null;
  return{raw,candles,smc,liquidity,ict,book,model,trendRetest,technical};
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
function danteSignal(technical,id){return(technical?.dante||[]).find(x=>x.id===id)||{id,score:0,matched:false,reasons:[]}}
function liquidPrices(chart,current){
  const rows=[...(chart?.liquidity?.levels||[]),...(chart?.ict?.liquidity?.bsl||[]),...(chart?.ict?.liquidity?.ssl||[])];
  const out=[];for(const x of rows){const p=Number(x?.price??x?.level??x?.p);if(!Number.isFinite(p))continue;if(!out.some(v=>Math.abs(v-p)<=Math.max(1e-12,Math.abs(p)*1e-7)))out.push(p)}
  return out.sort((a,b)=>a-b);
}
function recentRange(candles,n=28){const c=(candles||[]).slice(-n);if(!c.length)return{high:null,low:null};return{high:Math.max(...c.map(x=>Number(x.high)).filter(Number.isFinite)),low:Math.min(...c.map(x=>Number(x.low)).filter(Number.isFinite))}}
function overviewModel(result,chart){
  const f=result.fusion,t=chart.technical||{},current=Number(t.price??chart.candles?.at(-1)?.close),ma224=Number(t.ma?.[224]),levels=liquidPrices(chart,current),range=recentRange(chart.candles);
  const above=levels.find(x=>x>current)??range.high,bArr=levels.filter(x=>x<current),below=bArr.length?bArr.at(-1):range.low;
  const bowl=danteSignal(t,'bowl224'),concrete=danteSignal(t,'concrete');
  let trigger='최근 구조 돌파 + 리테스트 확인';
  if(Number.isFinite(ma224)&&Number.isFinite(current)){
    trigger=current<ma224?'4H 종가 EMA224 '+fmtPrice(ma224)+' 회복·안착':'EMA224 '+fmtPrice(ma224)+' 지지 유지 + 최근 고점 '+fmtPrice(range.high)+' 확인';
  }
  const invalid=Number.isFinite(below)?'하단 유동성/구조 '+fmtPrice(below)+' 종가 이탈':'하단 구조 저점 이탈';
  const target=Number.isFinite(above)?'상단 유동성 '+fmtPrice(above):'상단 DOL 확인';
  return{
    current,bowl,concrete,trigger,invalid,target,
    bias:f.htfAlignment||f.bias?.value||'UNKNOWN',
    state:[f.setupState,f.stage?.code].filter(Boolean).join(' · '),
    score:(f.bookEvidence?.normalizedScore??0)+'/100'
  };
}
function renderOverview(result,chart){
  const f=result.fusion,m=overviewModel(result,chart);
  $('oneLine').textContent=[f.symbol,f.setupState,f.bias?.value||'N/A','HTF '+(f.htfAlignment||'UNKNOWN'),'근거 '+m.score].join(' · ');
  $('overviewBias').textContent=m.bias;$('overviewState').textContent=m.state||'-';$('overviewTrigger').textContent=m.trigger;$('overviewInvalid').textContent=m.invalid;$('overviewTarget').textContent=m.target;$('overviewScore').textContent=m.score;
  $('overviewBowl').textContent=(m.bowl.matched?'조건 일치':'관찰')+' · '+(m.bowl.score||0)+'점';
  $('overviewConcrete').textContent=(m.concrete.matched?'조건 일치':'관찰')+' · '+(m.concrete.score||0)+'점';
}
function ema224Event(technical,candles){
  const s=technical?.ma?.series224||[],c=candles||[],off=Math.max(0,s.length-c.length),from=Math.max(1,c.length-12);
  for(let i=c.length-1;i>=from;i--){const m=Number(s[off+i]),pm=Number(s[off+i-1]);if(!Number.isFinite(m)||!Number.isFinite(pm))continue;
    if(Number(c[i].close)>m&&Number(c[i-1].close)<=pm)return'EMA224 reclaim';
    if(Number(c[i].low)<=m*1.006&&Number(c[i].close)>m)return'EMA224 retest 유지';
  }
  const p=Number(technical?.price),m=Number(technical?.ma?.[224]);if(Number.isFinite(p)&&Number.isFinite(m))return p>=m?'EMA224 위 유지':'EMA224 아래';return'N/A';
}
function miniStage(chart){
  const t=chart.technical||{},b=danteSignal(t,'bowl224'),c=danteSignal(t,'concrete');
  if(b.matched)return'밥그릇 조건 일치';
  if(c.matched)return'공구리 조건 일치';
  if((b.score||0)>=(c.score||0)&&b.score)return'밥그릇 관찰 '+b.score+'점';
  if(c.score)return'공구리 관찰 '+c.score+'점';
  return t.state||'근거 부족';
}
function miniTrigger(chart){
  const t=chart.technical||{},m=t?.smc?.mss;if(m?.dir)return'MSS '+String(m.dir).toUpperCase();
  const b=danteSignal(t,'bowl224'),c=danteSignal(t,'concrete'),x=(b.score||0)>=(c.score||0)?b:c;
  return x.score?(x.id==='bowl224'?'밥그릇':'공구리')+' '+x.score+'점':'대기';
}
function makeMiniCard(tf){
  const d=document.createElement('div');d.className='tfMini';d.dataset.tf=tf;
  const h=document.createElement('div');h.className='tfMiniHead';const b=document.createElement('b');b.textContent=tf.toUpperCase();const st=document.createElement('span');st.textContent='불러오는 중';h.append(b,st);d.append(h);
  for(const label of['편향','단계','트리거','현재가 vs EMA224','reclaim / retest']){const r=document.createElement('div');r.className='tfMiniRow';const s=document.createElement('span');s.textContent=label;const v=document.createElement('b');v.textContent='-';r.append(s,v);d.append(r)}
  return d;
}
function fillMini(card,chart){
  const t=chart.technical||{},rows=card.querySelectorAll('.tfMiniRow b'),p=Number(t.price),m=Number(t.ma?.[224]),relation=Number.isFinite(p)&&Number.isFinite(m)?(p>=m?'위 +'+((p/m-1)*100).toFixed(2)+'%':'아래 '+((p/m-1)*100).toFixed(2)+'%'):'N/A';
  card.querySelector('.tfMiniHead span').textContent=t.state||rawBias(chart.raw);
  const vals=[rawBias(chart.raw),miniStage(chart),miniTrigger(chart),relation,ema224Event(t,chart.candles)];rows.forEach((x,i)=>x.textContent=vals[i]||'N/A');
}
function failMini(card,e){card.querySelector('.tfMiniHead span').textContent='데이터 오류';const rows=card.querySelectorAll('.tfMiniRow b');rows.forEach(x=>x.textContent='N/A');if(rows[0])rows[0].title=String(e?.message||e||'error')}
async function loadMtfBoard(symbol,chart4h,analysisAsOf,token){
  const box=$('mtfBoard');box.innerHTML='';const cards={};for(const tf of MINI_TFS){cards[tf]=makeMiniCard(tf);box.append(cards[tf])}
  const jobs=MINI_TFS.map(async tf=>{try{const chart=tf==='4h'?chart4h:buildChart(await CD.fetchStructure({symbol,interval:tf,limit:520}),tf,analysisAsOf);if(token!==runSeq)return;fillMini(cards[tf],chart)}catch(e){if(token===runSeq)failMini(cards[tf],e)}});
  await Promise.allSettled(jobs);
}
function render(result,chart){
  const f=result.fusion,s=result.summary,a=f.evidenceAudit||{};
  $('setupState').textContent=f.setupState;$('setupState').className='state-'+f.setupState;
  $('transitionReason').textContent=f.setupLifecycle?.transition?.reason||'-';$('stage').textContent=f.stage?.code||'N/A';$('bias').textContent=f.bias?.value||'N/A';
  $('score').textContent=(f.bookEvidence?.normalizedScore??0)+'/100';$('alignment').textContent=f.htfAlignment||'UNKNOWN';$('dataQuality').textContent=f.dataQuality?.state||'-';$('asOf').textContent='as-of '+fmtTime(f.analysisAsOf);
  $('factCount').textContent=String(a.uniqueFactCount??0)+' · P '+String(a.persistedFactCount??0)+' / L '+String(a.ephemeralFactCount??0);$('eventCount').textContent=String(a.uniqueEventCount??0)+' · P '+String(a.persistedEventCount??0)+' / L '+String(a.ephemeralEventCount??0);$('sharedCount').textContent=String(a.sharedEventIds?.length??0);$('sharedRatio').textContent=Number.isFinite(Number(a.sharedEvidenceRatio))?(Number(a.sharedEvidenceRatio)*100).toFixed(1)+'%':'-';
  renderOverview(result,chart);summaryView(s);ruleCards(f.bookSetups);sourceCards(f.engineSources);
  S.assertCanonicalSummaryGrounded(s,f);
  C.compose({canvas:$('snapshot'),symbol:f.symbol,timeframe:'4h',candles:chart.candles,analysis:result.raw,smc:chart.smc,liquidity:chart.liquidity,ict:chart.ict,technical:chart.technical,summary:s,renderer:SR});
  $('savePng').disabled=false;
}
async function run(){
  const token=++runSeq,symbol=clean($('symbol').value);$('symbol').value=symbol;$('status').classList.remove('error');$('status').textContent='분석 중…';$('run').disabled=true;$('savePng').disabled=true;
  try{
    const [scan,raw]=await Promise.all([json('/api/coin-scan?mode=deep&limit=1&precision=1&symbols='+encodeURIComponent(symbol)),CD.fetchStructure({symbol,interval:'4h',limit:560})]);
    if(token!==runSeq)return;const item=scan.items?.[0];if(!item)throw new Error('Scanner deep result 없음');
    const now=Date.now(),chart=buildChart(raw,'4h',now),closed=lastClosedTime({candles:chart.candles});
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
    last={fusion,summary,raw,chart};render(last,chart);
    $('status').textContent=symbol+' · 차트 완료 · 4TF 확인 중…';
    await loadMtfBoard(symbol,chart,now,token);if(token!==runSeq)return;
    $('status').textContent=symbol+' · '+fusion.setupState+' · 완료';
    try{parent.postMessage({type:'pulse-symbol-sync',symbol},'*')}catch{}
    const u=new URL(location.href);u.searchParams.set('symbol',symbol);history.replaceState(null,'',u);
  }catch(e){if(token===runSeq){$('status').textContent='오류 · '+(e.message||e);$('status').classList.add('error')}}finally{if(token===runSeq)$('run').disabled=false}
}
function save(){
  if(!last)return;
  const a=document.createElement('a');a.href=C.pngDataUrl($('snapshot'));a.download=last.fusion.symbol+'-book-ai-4h-overview.png';document.body.append(a);a.click();a.remove();
}
$('run').onclick=run;$('savePng').onclick=save;$('symbol').addEventListener('keydown',e=>{if(e.key==='Enter')run()});
const q=new URLSearchParams(location.search);$('symbol').value=clean(q.get('symbol')||'BTCUSDT');run();
})();