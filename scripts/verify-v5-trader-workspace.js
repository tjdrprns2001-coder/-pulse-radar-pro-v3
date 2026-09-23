'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const read=p=>fs.readFileSync(p,'utf8');
const shell=read('pulse-unified.html'),shellJs=read('ui/pulse-shell.js'),home=read('workspace-home.html');
const chart=read('unified-chart.html'),chartJs=read('ui/chart/unified-chart-v5.js');
const longTrend=read('long-trend-dashboard.html'),longTrendJs=read('ui/long-trend-dashboard.js'),longTrendCss=read('ui/long-trend-dashboard.css');
const snap=read('mtf-snapshot-pro.html'),snapJs=read('ui/trader/mtf-snapshot-pro.js'),snapshotRecord=require('../ui/trader/snapshot-record.js');
const dante=read('dante-lab.html'),methods=require('../ui/dante/dante-methods.js'),snapshotRendererApi=require('../ui/trader/snapshot-renderer.js');
const ictTrainer=read('ict-trainer.html'),ictTrainerJs=read('ui/ict-trainer/app.js'),ictTrainerEngine=require('../ui/ict-trainer/engine.js');
const trader=require('../ui/trader/analysis-engine.js'),scan=read('ui/coin-scan.js'),report=read('ui/coin-report.js');
const vercel=JSON.parse(read('vercel.json'));

assert(shell.includes('PulseRadar Pro v5'),'V5 branding missing');
assert.equal((shell.match(/class="mBtn/g)||[]).length,5,'V5 mobile nav must have exactly five roots');
for(const root of ['home','scan','analysis','dante','ai'])assert(shell.includes('data-root="'+root+'"'),'missing mobile root '+root);
assert(shell.includes('주식단테 실전 랩')&&shell.includes('8TF 스냅샷'),'V5 primary tools missing');
assert(shell.includes('ICT 전문 트레이너'),'ICT trainer navigation missing');
assert(shellJs.includes("ict:{title:'ICT 전문 트레이너'")&&shellJs.includes("path:'/ict-trainer.html'"),'ICT trainer route missing');
assert(shellJs.includes("mtfsnapshot:{title:'8TF 스냅샷'")&&shellJs.includes("dante:{title:'주식단테 실전 랩'"),'V5 routes missing');
assert(shell.includes('data-view="longtrend"')&&shell.includes('장기추세선'),'long-term trend menu missing');
assert(shellJs.includes("longtrend:{title:'장기추세선'")&&shellJs.includes("path:'/long-trend-dashboard.html'"),'long-term trend route missing');
assert(shellJs.includes("searchParams.set('build','20260921-v5')"),'V5 child cache-bust missing');
for(const page of ['dante-lab.html','mtf-snapshot-pro.html','unified-chart.html']){const src=read(page),sp=src.indexOf('/ui/chart/session-profile.js'),liq=src.indexOf('/ui/chart/liquidity-engine.js');assert(sp>=0&&liq>sp,'session profile must load before liquidity engine: '+page);}

assert(home.includes('REFRESH=3600000'),'home must refresh hourly');
for(const p of ['/api/market?','/api/coin-scan?','/api/pulse-ai?'])assert(home.includes(p),'market desk feed missing '+p);
assert(home.includes('AI 후보 코인')&&home.includes('1시간 시장 브리핑'),'market desk summary/candidates missing');
assert(home.includes('ai.aiGenerated')&&home.includes('규칙 기반'),'AI/rules provenance distinction missing');

for(const tf of ['28d','14d','1w','3d','1d','4h'])assert(longTrend.includes('data-tf="'+tf+'"'),'long trend card missing '+tf);
assert(longTrend.includes('평균치 최종 추세선')&&longTrend.includes('id="summaryChart"')&&longTrend.includes('id="matrix"'),'long trend summary/matrix UI missing');
for(const term of ['PulseLongTermTrendlineEngine.analyzeTrendlines','TF_WEIGHT','dailyLogSlope','levelAtRef','takeScreenshot','Promise.all([worker(),worker()])'])assert(longTrendJs.includes(term),'long trend dashboard logic missing '+term);
assert(longTrendJs.includes("['28d','14d','1w','3d','1d','4h']")||longTrendJs.includes("['28d','14d','1w','3d','1d','4h']"),'long trend TF order missing');
assert(longTrendCss.includes('grid-template-columns:repeat(3')&&longTrendCss.includes('@media(max-width:720px)'),'long trend responsive grid missing');

for(const id of ['structure','smc','ict','liquidity','volume-profile','moving-average','dante'])assert(chart.includes('data-overlay="'+id+'"'),'chart overlay missing '+id);
for(const p of ['rsi','macd','stoch','kdj','obv'])assert(chart.includes('data-pane="'+p+'"'),'indicator pane missing '+p);
for(const s of ['PulseIctPlugin','PulseVolumeProfilePlugin','PulseMovingAveragePlugin','buildIctContext','analyzeSmcV2','analyzeLiquidity'])assert(chartJs.includes(s),'chart V5 logic missing '+s);

for(const tf of ['1w','3d','1d','12h','4h','1h','15m','5m'])assert(snapJs.includes("'"+tf+"'"),'MTF snapshot missing '+tf);
assert(snap.includes('canvas id="snapshot"')&&snap.includes('현재 PNG')&&snap.includes('8TF PNG')&&snap.includes('이벤트 JSON'),'snapshot render/export missing');
for(const id of ['compareToggle','compareSection','compareEvent','compareGrid','compareOld','compareNow','compareTableCard','compareTable'])assert(snap.includes('id="'+id+'"'),'snapshot compare UI missing '+id);
for(const term of ['추세선','구조','핵심 PD Array','유동성'])assert(snap.includes(term),'minimal snapshot overlay missing '+term);
assert(!snap.includes('data-show="profile"')&&!snap.includes('data-show="ma"')&&!snap.includes('data-show="dante"'),'heavy snapshot overlays must not be enabled in V1');
assert(snap.includes('/ui/ict-trainer/engine.js')&&snap.includes('/ui/trader/snapshot-record.js'),'snapshot must reuse ICT engine and replay record module');
assert(snapJs.includes("source:'binance-original-kline'")&&snapJs.includes('for(let i=0;i<TF.length;i++){const tf=TF[i]'),'8TF snapshots must use direct intervals with sequential fetch');
assert(snapJs.includes('IntersectionObserver')&&snapJs.includes('ruleSummary'),'snapshot lazy rendering or rule-based summary missing');
assert(snapJs.includes('pdText')&&snapJs.includes('snapshotDisplay')&&snapJs.includes('confirmedText'),'snapshot friendly display helpers missing');
assert(snapJs.includes('ensureMarketContext')&&snapJs.includes('dolState')&&snapJs.includes('priceText'),'snapshot live DOL/tick-size display helpers missing');
assert(snapJs.includes('higherTfBias')&&snapJs.includes('mmxmAlignment'),'snapshot higher-TF MMXM alignment missing');
assert(snapJs.includes("row('DOL 상태'")&&snapJs.includes("row('MMXM 정렬'"),'snapshot summary must expose DOL status and MMXM alignment');
assert(!snapJs.includes("className='miniSummary'")&&!snapJs.includes("className='miniMeta'"),'8TF mini cards must be chart-only below the TF header');
assert(!/function miniCard[\s\S]{0,1200}ruleSummary\(/.test(snapJs),'8TF mini cards must not render descriptive summaries');
assert(!snapJs.includes("cv.dataset.labels='0'"),'live 8TF mini charts must keep overlay labels visible');
assert(/async function saveAll[\s\S]{0,1800}renderCanvas\(temp,tf,data,\{labels:false\}\)/.test(snapJs),'8TF PNG export must hide overlay label badges');
assert(snapJs.includes('opts.labels=labels'),'snapshot renderer bridge must pass label visibility explicitly');
assert(read('ui/trader/mtf-snapshot-pro.css').includes('safe-area-inset-bottom')&&read('ui/trader/mtf-snapshot-pro.css').includes('snapshotIdRow'),'mobile Safari safe-area or snapshot ID wrapping missing');
assert(read('ui/trader/mtf-snapshot-pro.css').includes('.compareGrid')&&read('ui/trader/mtf-snapshot-pro.css').includes('.compareRow'),'snapshot comparison responsive styles missing');
assert(snap.includes('id="compareGrid" class="compareGrid" hidden')&&snap.includes('id="compareTableCard" class="card compareTableCard" hidden'),'empty comparison canvases/table must start hidden');
assert(snapJs.includes("$('compareGrid').hidden=true")&&snapJs.includes("$('compareTableCard').hidden=true")&&snapJs.includes("$('compareGrid').hidden=false")&&snapJs.includes("$('compareTableCard').hidden=false"),'compare empty/loaded visibility contract missing');
assert(!/[,;]\s*s\s*=\s*document\.createElement/.test(snapJs),'snapshot DOM nodes must declare s explicitly for Safari strict mode');
assert(snapJs.includes("const s=document.createElement('span')"),'snapshot span declaration regression');
assert(!/[,;]\s*[on]\s*=\s*document\.createElement/.test(snapJs),'compare DOM nodes o/n must be explicitly declared for Safari strict mode');
assert(snapJs.includes("const o=document.createElement('span')")&&snapJs.includes("const n=document.createElement('span')"),'compare row declarations regression');
assert(snapJs.includes('fetchEventBundle')&&snapJs.includes('exportEventJson'),'server transition snapshot fetch/export missing');
for(const fn of ['fetchEventList','loadCompareEvents','renderCompare','replayCanvas','recordForTf'])assert(snapJs.includes(fn),'snapshot compare logic missing '+fn);
assert(snapJs.includes('RR.replayData(record)'),'archived comparison must replay immutable record data instead of recalculating ICT');
assert(!/replayCanvas[\s\S]{0,500}E\.analyzeTimeframe/.test(snapJs),'archived replay must not rerun current ICT engine');
assert(!snapJs.includes('RR.saveEventBundle({eventId:ev.eventId'),'snapshot UI must never relabel later live candles as the transition event');
assert(scan.includes('eventSnapshotId')&&scan.includes("searchParams.set('eventId'"),'scanner must link exact server-captured transition event');

for(const term of ['ERL/IRL','PD Array','CISD','IPDA','MMXM','1W → 3D → 1D → 12H → 4H → 1H → 15m → 5m'])assert(ictTrainer.includes(term),'ICT trainer UI missing '+term);
for(const group of ['OLD_HIGH_LOW','ORDER_BLOCK','REJECTION_BLOCK','FVG','LIQUIDITY_VOID','MITIGATION_BLOCK','BREAKER_BLOCK'])assert(read('ui/ict-trainer/engine.js').includes(group),'ICT PD Array group missing '+group);
assert(ictTrainer.includes('비공개 규칙은 복제하거나 추정해 공식 규칙처럼 표시하지 않습니다.'),'ICT provenance boundary missing');

assert(Array.isArray(methods.methods)&&methods.methods.length>=13,'Dante method library too small');
for(const id of ['bowl224','ma-hit','concrete','highheel','symmetry','share','kijun-scalp','256','reverse-wave','elliott','dead-dive','open-price','close-bet','force-balance'])assert(methods.methods.some(x=>x.id===id),'Dante method missing '+id);
assert(dante.includes('비공개/유료 세부 규칙은 임의로 공식화하지 않습니다.'),'Dante provenance boundary missing');
assert(dante.includes('멀티TF 검사')&&dante.includes('PNG 저장'),'Dante practice controls missing');
assert(dante.includes('format-detection')&&dante.includes('snapshotCaption'),'iPhone auto-link guard or dynamic snapshot caption missing');
const danteLabJs=read('ui/dante/dante-lab.js'),snapshotRenderer=read('ui/trader/snapshot-renderer.js');
assert(danteLabJs.includes('focusMethod:methodId'),'Dante snapshots must pass selected method into renderer');
assert(danteLabJs.includes('multi(false)'),'Dante method selection must auto-fill cached multi-TF comparison');
for(const id of ['bowl224','ma-hit','concrete','highheel','symmetry','share','kijun-scalp'])assert(snapshotRenderer.includes("method==='"+id+"'"),'method-specific snapshot geometry missing '+id);
assert(snapshotRenderer.includes('nearestZones')&&snapshotRenderer.includes('nearestLiquidity'),'focused snapshots must declutter SMC/liquidity overlays');
assert(snapshotRenderer.includes('layoutLabels')&&snapshotRenderer.includes('dedupeOverlayLabels'),'snapshot label collision manager missing');
assert(snapshotRenderer.includes('zoneStartX'),'PD zones must start from their originating candle');
assert(snapshotRenderer.includes("category:'structure'")&&snapshotRenderer.includes("text:'MSS '")&&snapshotRenderer.includes("text:'CISD '"),'MSS/CISD labels must participate in collision layout');
assert(snapshotRenderer.includes('show.labels!==false')&&snapshotRenderer.includes('enabled:show.labels!==false'),'snapshot renderer must preserve zones/lines while allowing badge text suppression');
assert(snapshotRenderer.includes('limitOverlayLabels'),'mobile snapshot label cap missing');
const capped=snapshotRendererApi.limitOverlayLabels([
  {text:'ERL High',priority:96,order:0},{text:'EQH/BSL',priority:88,order:1},{text:'EQL/SSL',priority:88,order:2},
  {text:'OB',priority:78,order:3},{text:'Rejection',priority:70,order:4},{text:'FVG',priority:62,order:5},{text:'Old High',priority:42,order:6}
],6);
assert.equal(capped.length,6,'mobile snapshot labels must cap at six');
assert(!capped.some(x=>x.text==='Old High'),'mobile cap must drop lowest-priority label first');
const clustered=snapshotRendererApi.layoutLabels([
  {text:'ERL High',x:900,y:100,width:86,height:20,priority:96},
  {text:'Old High',x:900,y:102,width:82,height:20,priority:42,optional:true},
  {text:'Rejection',x:900,y:104,width:92,height:20,priority:70},
  {text:'EQH/BSL',x:900,y:106,width:84,height:20,priority:88}
],{W:1000,H:400,top:40,bottom:360,gap:3}).filter(x=>!x.hidden);
for(let i=0;i<clustered.length;i++)for(let j=i+1;j<clustered.length;j++){const a=clustered[i],b=clustered[j],hit=a.left<b.right+3&&a.right+3>b.left&&a.top<b.bottom+3&&a.bottom+3>b.top;assert(!hit,'snapshot labels must not overlap')}
const deduped=snapshotRendererApi.dedupeOverlayLabels([
  {text:'ERL High',y:100,priority:96,order:0},
  {text:'Old High',y:104,priority:42,order:1},
  {text:'EQH/BSL',y:180,priority:88,order:2},
  {text:'EQH/BSL',y:187,priority:88,order:3}
]);
assert(deduped.some(x=>x.text==='ERL High')&&!deduped.some(x=>x.text==='Old High'),'ERL must suppress redundant Old High label');
assert.equal(deduped.filter(x=>x.text==='EQH/BSL').length,1,'near-duplicate liquidity labels must collapse');
const visibleCandles=Array.from({length:140},(_,i)=>({time:i+61}));
assert(snapshotRendererApi.zoneStartX({index:100},{candles:Array.from({length:200}),visible:visibleCandles,pad:58,step:5})>58,'visible PD zone must start after its origin candle');
assert.equal(snapshotRendererApi.zoneStartX({index:20},{candles:Array.from({length:200}),visible:visibleCandles,pad:58,step:5}),58,'offscreen PD origin must clamp to chart left edge');

const candles=Array.from({length:520},(_,i)=>{const base=100+i*.03+Math.sin(i/9)*2;return{time:(i+1)*3600000,open:base-.3,high:base+1,low:base-1,close:base+.3,volume:1000+(i%20)*30}});
const summary=trader.summarize({candles,analysis:{trendlines:{}},smc:{mss:[],sweeps:[],fvgs:[],orderBlocks:[]},liquidity:{levels:[],sweeps:[]}});
const ictTf=ictTrainerEngine.analyzeTimeframe({candles,tf:'1h',smc:{mss:[],canonicalEvents:[],breakers:[]},liquidity:{levels:[]}});
assert(ictTf.available&&ictTf.pdArrayGroups.length===7,'ICT trainer timeframe engine unavailable');
assert(ictTf.modules?.liquidity&&ictTf.modules?.pdArray&&ictTf.modules?.delivery&&ictTf.modules?.mmxm,'ICT trainer coaching modules incomplete');
const ictFractal=ictTrainerEngine.analyzeFractal({'1h':ictTf,'4h':{...ictTf,tf:'4h'}});
assert(ictFractal.available&&Number.isFinite(ictFractal.alignment),'ICT trainer fractal engine unavailable');
const replay=snapshotRecord.buildRecord({symbol:'BTCUSDT',tf:'1h',candles,analysis:{trendlines:{}},smc:{mss:[]},liquidity:{levels:[]},ict:ictTf,params:{overlays:{trend:true,structure:true,pd:true,liquidity:true}}});
assert(replay.snapshotId.includes('BTCUSDT_1H_')&&replay.engineVersion===ictTf.version,'snapshot ID must bind symbol/TF/engine');
assert.equal(replay.confirmedBarTime,candles.at(-1).time*1000,'snapshot ID time must come from last confirmed candle');
assert(replay.candles.length===candles.length&&replay.analysis.overlays.pdArrays.length<=5,'replay record must preserve candles and decluttered overlay coordinates');
const replayData=snapshotRecord.replayData(replay);
assert.equal(replayData.candles.length,candles.length,'replay data must use stored candles');
assert.strictEqual(replayData.ict,replay.analysis.ict,'replay data must use stored ICT analysis object');
assert(replayData.raw.source==='saved-transition','replay data provenance missing');
assert(Number.isFinite(summary.rsi),'trader RSI unavailable');
assert(summary.volumeProfile?.bins?.length===24,'volume profile bins invalid');
assert(Array.isArray(summary.dante)&&summary.dante.length>=10,'Dante scoring unavailable');
assert(summary.ma[20]!=null&&summary.ma[60]!=null&&summary.ma[112]!=null&&summary.ma[224]!=null&&summary.ma[448]!=null,'MA ladder incomplete');

assert(scan.includes('mtf-snapshot-pro.html'),'scanner must link V5 snapshot');
assert(report.includes('mtf-snapshot-pro.html')&&report.includes('dante-lab.html'),'report must link V5 pro tools');
assert.deepEqual(vercel.regions,['icn1'],'Vercel functions must remain in Seoul');
assert(!Object.keys(vercel.functions||{}).some(k=>/dante|snapshot|trader/i.test(k)),'V5 static features must not consume new Hobby serverless slots');

for(const f of ['ui/long-trend-dashboard.js','ui/trader/analysis-engine.js','ui/trader/snapshot-record.js','ui/trader/snapshot-renderer.js','ui/trader/mtf-snapshot-pro.js','ui/dante/dante-methods.js','ui/dante/dante-lab.js','ui/chart/unified-chart-v5.js','ui/chart/plugins/moving-average-plugin.js','ui/chart/plugins/volume-profile-plugin.js','ui/ict-trainer/engine.js','ui/ict-trainer/app.js'])new vm.Script(read(f),{filename:f});
console.log('PulseRadar V5 trader workspace PASS');
