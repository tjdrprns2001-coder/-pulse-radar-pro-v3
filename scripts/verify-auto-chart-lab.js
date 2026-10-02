const fs=require('fs'),assert=require('assert');
const Normalize=require('../ui/auto-chart/data/normalize.js');
const State=require('../ui/auto-chart/state.js');
const MathX=require('../ui/auto-chart/analysis/math.js');
const Swings=require('../ui/auto-chart/analysis/swings.js');
const Levels=require('../ui/auto-chart/analysis/levels.js');
const LevelState=require('../ui/auto-chart/analysis/level-state.js');
const Ranges=require('../ui/auto-chart/analysis/ranges.js');
const Setup=require('../ui/auto-chart/analysis/setup-state.js');
const Volume=require('../ui/auto-chart/analysis/volume.js');
const Replay=require('../ui/auto-chart/analysis/replay.js');
const Advanced=require('../ui/auto-chart/analysis/advanced.js');
const MultiTf=require('../ui/auto-chart/analysis/multi-timeframe.js');
const Reference=require('../ui/auto-chart/analysis/reference-levels.js');
const Core=require('../ui/auto-chart/analysis/core.js');

function candles(n=120){
 const out=[];for(let i=0;i<n;i++){let base=100+Math.sin(i/6)*2;if(i>75)base=100+Math.sin(i/5)*1.4;out.push({time:1700000000000+i*3600000,open:base-.25,high:base+.8,low:base-.8,close:base+.15,volume:1000+i,partial:false})}return out;
}
const rawCandles=candles();
const rawSwings=[
 {swingId:'L1',type:'L',price:97.8,pivotIndex:18,confirmedAt:21,label:'L'},
 {swingId:'H1',type:'H',price:102.2,pivotIndex:30,confirmedAt:33,label:'H'},
 {swingId:'L2',type:'L',price:98.0,pivotIndex:45,confirmedAt:48,label:'HL'},
 {swingId:'H2',type:'H',price:102.1,pivotIndex:57,confirmedAt:60,label:'LH'},
 {swingId:'L3',type:'L',price:97.9,pivotIndex:72,confirmedAt:75,label:'LL'},
 {swingId:'H3',type:'H',price:102.25,pivotIndex:84,confirmedAt:87,label:'HH'},
 {swingId:'FUTURE',type:'H',price:110,pivotIndex:118,confirmedAt:125,label:'HH'}
];
const raw={ok:true,symbol:'TESTUSDT',interval:'1h',dataSource:'fixture',snapshotTime:rawCandles.at(-1).time+3600000,candles:rawCandles,canonicalSwings:rawSwings,provisionalPivots:[{type:'H',price:103,i:119}]};
const ds=Normalize.normalizeStructure(raw,{exchange:'binance',market:'futures',symbol:'TESTUSDT',interval:'1h'});
assert.equal(ds.schemaVersion,'AUTO_CHART_MARKET_v1');
assert(ds.candles.every(x=>Number.isFinite(x.openTime)&&Number.isFinite(x.closeTime)&&x.closed===true),'normalized closed candle contract');
assert.equal(ds.status.gaps.length,0,'fixture has no gaps');

const swings=Swings.extract(ds);
assert(!swings.some(x=>x.id==='FUTURE'),'future-confirmed pivot must not leak');
assert(swings.every(x=>x.knownAt>x.occurredAt),'confirmed swing must store later knownAt');
assert.equal(Swings.provisional(ds).length,1,'provisional swing remains separate');

const A=MathX.atr(ds.candles),levels=Levels.build(swings,{atrNow:A.at(-1),currentPrice:100,timeframe:'1h',zoneAtr:.3,minTouches:2,maxEachSide:3});
assert(levels.some(x=>x.type==='support'),'support cluster expected');
assert(levels.some(x=>x.type==='resistance'),'resistance cluster expected');
for(const z of levels)assert(z.knownAt>=Math.max(...z.sourceIds.map(id=>swings.find(s=>s.id===id).knownAt)),'zone knownAt cannot predate source swings');

const range=Ranges.detect(ds.candles,levels,{atrNow:A.at(-1),timeframe:'1h',minWidthAtr:1,minInsideRatio:.5,lookback:100});
assert(range&&range.low<range.high,'range expected');
assert(range.support&&range.resistance,'range must preserve original source zones');

function bar(i,close,low=close-.2,high=close+.2){return{openTime:i*3600000,closeTime:i*3600000+3599999,open:close-.05,high,low,close,volume:1000,closed:true}}
const top=100,bottom=95,ar=1,box={id:'R',kind:'range',timeframe:'1h',low:bottom,high:top,knownAt:bar(0,97).closeTime,status:'valid',generation:'automatic'};
let seq=[bar(0,97),bar(1,99.9,99.75,100.12),bar(2,99.8,99.7,100.08)];
let st=Setup.derive(seq,box,{atrNow:ar,atrSeries:[1,1,1]});assert.equal(st.state,'BOX_WATCH');
seq.push(bar(3,100.3,100.12,100.5));st=Setup.derive(seq,box,{atrNow:ar,atrSeries:Array(seq.length).fill(1)});assert.equal(st.state,'BREAKOUT_CONFIRMED','pre-breakout touches must not count as retest');
seq.push(bar(4,100.05,99.9,100.22));st=Setup.derive(seq,box,{atrNow:ar,atrSeries:Array(seq.length).fill(1)});assert.equal(st.state,'RETEST_IN_PROGRESS');
seq.push(bar(5,100.25,100.0,100.4));st=Setup.derive(seq,box,{atrNow:ar,atrSeries:Array(seq.length).fill(1)});assert.equal(st.state,'RETEST_CONFIRMED');
seq.push(bar(6,99.6,99.45,100.0));st=Setup.derive(seq,box,{atrNow:ar,atrSeries:Array(seq.length).fill(1)});assert.equal(st.state,'INVALIDATED');
assert(st.range.frozen&&st.range.high===top,'breakout must preserve original range boundary');

// SR lifecycle: origin resistance must not remain resistance forever after a confirmed role flip.
const rz={id:'Z-R',type:'resistance',timeframe:'1h',low:99.8,high:100.2,mid:100,touches:3,knownAt:bar(0,99).closeTime,sourceIds:['H1','H2']};
let lseq=[bar(0,99.3,99.1,99.6),bar(1,99.9,99.7,100.15),bar(2,100.5,100.3,100.7),bar(3,100.35,99.95,100.55)];
let life=LevelState.evolve(rz,lseq,{atrNow:1,atrSeries:Array(lseq.length).fill(1),breakoutAtr:.1,retestAtr:.25});
assert.equal(life.status,'SUPPORT_FLIP_CONFIRMED');
assert.equal(life.effectiveRole,'support','broken resistance must become support only after post-breakout retest confirmation');
assert(life.events.find(e=>e.state==='BREAKOUT_CONFIRMED').index<life.events.find(e=>e.state==='SUPPORT_FLIP_CONFIRMED').index,'flip confirmation must occur after breakout');
lseq.push(bar(4,99.4,99.2,99.8));
life=LevelState.evolve(rz,lseq,{atrNow:1,atrSeries:Array(lseq.length).fill(1),breakoutAtr:.1,retestAtr:.25});
assert.equal(life.status,'FLIP_FAILED');
assert.equal(life.effectiveRole,'resistance','re-loss after support flip must mark transition failure and restore resistance role');

// Overlapping zones merge only when their effective role agrees.
const merged=LevelState.mergeGroup([
 {...rz,effectiveRole:'support',role:'support',status:'SUPPORT_FLIP_CONFIRMED',statusLabel:'재테스트 후 지지 전환',low:99.8,high:100.2,timeframes:['1h']},
 {id:'S2',type:'support',effectiveRole:'support',role:'support',status:'SUPPORT_HOLD',statusLabel:'지지 유지',timeframe:'1h',timeframes:['1h'],low:100.15,high:100.45,mid:100.3,touches:2,knownAt:1},
 {id:'R2',type:'resistance',effectiveRole:'resistance',role:'resistance',status:'RESISTANCE_HOLD',statusLabel:'저항 유지',timeframe:'4h',timeframes:['4h'],low:100.1,high:100.5,mid:100.3,touches:2,knownAt:1}
],{atrNow:1,currentPrice:100.6});
assert.equal(merged.filter(x=>x.effectiveRole==='support').length,1,'overlapping supports should merge');
assert.equal(merged.filter(x=>x.effectiveRole==='resistance').length,1,'opposite-role overlap must not be merged into support');

// Core chart/card contract: displayLevels and keyLevels must point to the same lifecycle-aware objects.
// RVOL: current confirmed bar is excluded from its own denominator.
const rvBars=[];for(let i=0;i<21;i++)rvBars.push(bar(i,100,99.8,100.2));rvBars.forEach((b,i)=>b.volume=i===20?300:100);
assert.equal(Volume.rvol20(rvBars,20),3,'RVOL20 must be current / previous 20 average');

// Timestamp windows: 72h means 72 real hours on every timeframe, not a fixed bar count.
const fourH=[];for(let i=0;i<40;i++){const b={openTime:i*4*3600000,closeTime:(i+1)*4*3600000-1,open:100,high:101,low:99,close:100,volume:100,closed:true};fourH.push(b)}
fourH[18].volume=500; // ~84h before final close -> exclude from 72h
fourH[22].volume=700; // ~68h before final close -> include; remains >=3x even with older spike in denominator
const s72=Volume.spikes(fourH,{hours:72,threshold:3,period:5});
assert(!s72.some(x=>x.index===18),'72h search must exclude a 4H spike older than 72 real hours');
assert(s72.some(x=>x.index===22),'72h search must include a 4H spike inside 72 real hours');

// Missing values must remain N/A/null, never implicit zero.
assert.equal(Normalize.finite(null),false);assert.equal(Normalize.finite(undefined),false);assert.equal(Normalize.finite(''),false);assert.equal(MathX.finite(null),false);
const nd=Normalize.normalizeDerivatives({available:true,openInterestContracts:null,openInterestUsdApprox:null,openInterestChange1hPct:null,openInterestChange4hPct:null,openInterestChange24hPct:null,takerBuySellRatio:null,takerBuySellRatio4h:null,takerBuySellRatio24h:null,fundingRatePct:null});
assert.equal(nd.oi.available,false);assert.equal(nd.oi.change4hPct,null);assert.equal(nd.taker.available,false);assert.equal(nd.taker.ratio4h,null);assert.equal(nd.funding.available,false);assert.equal(nd.funding.ratePct,null);

// Replay must reconstruct the pre-breakout box and keep it locked even if a later higher resistance becomes known.
const rc=[];for(let i=0;i<30;i++){const close=i<20?97.5+(i%3)*.2:101.0+(i%2)*.1;rc.push({openTime:i*3600000,closeTime:i*3600000+3599999,open:close-.1,high:close+.25,low:close-.25,close,volume:100,closed:true})}
rc[20]={...rc[20],open:99.8,low:99.7,high:100.8,close:100.6};
for(let i=21;i<30;i++)rc[i]={...rc[i],open:101.0,low:100.75,high:i===22?105:101.5,close:101.2};
const rs=[
 {id:'RL',type:'L',label:'L',price:95,pivotIndex:2,confirmedAt:5,occurredAt:rc[2].openTime,knownAt:rc[5].closeTime},
 {id:'RH',type:'H',label:'H',price:100,pivotIndex:4,confirmedAt:7,occurredAt:rc[4].openTime,knownAt:rc[7].closeTime},
 {id:'FUTURE-H',type:'H',label:'HH',price:105,pivotIndex:22,confirmedAt:25,occurredAt:rc[22].openTime,knownAt:rc[25].closeTime}
];
const ra=MathX.atr(rc),settings={minTouches:1,zoneAtr:.2,minWidthAtr:1,minInsideRatio:.5,rangeLookback:80,rangeExcludeTail:0,breakoutAtr:.1,retestAtr:.25};
const replay=Replay.track({candles:rc,swings:rs,atrSeries:ra,timeframe:'1h',settings});
const breakoutEvent=replay.history.find(x=>x.state==='BREAKOUT_CONFIRMED');
assert(breakoutEvent&&breakoutEvent.range,'replay should reconstruct a breakout event');
assert(breakoutEvent.range.high<101,'breakout must lock the original ~100 resistance, not future 105 resistance');
assert(replay.setup.range&&Math.abs(replay.setup.range.high-breakoutEvent.range.high)<1e-9,'later resistance discovery must not move active setup boundary');
const rcPrefix=rc.slice(0,21),prefixReplay=Replay.track({candles:rcPrefix,swings:rs,atrSeries:MathX.atr(rcPrefix),timeframe:'1h',settings});
assert.equal(prefixReplay.setup.state,'BREAKOUT_CONFIRMED');
assert(Math.abs(prefixReplay.setup.range.high-breakoutEvent.range.high)<1e-9,'full replay and bar-by-bar prefix must agree at breakout time');

const a1=Core.analyze(ds,{minWidthAtr:1,minInsideRatio:.5,zoneAtr:.3}),a2=Core.analyze(ds,{minWidthAtr:1,minInsideRatio:.5,zoneAtr:.3});
assert.deepStrictEqual(a1,a2,'same data/settings must produce same analysis');
assert.equal(a1.version,'AUTO_CHART_CORE_v2_0');
assert(a1.advanced&&a1.advanced.ema&&a1.advanced.rsi&&a1.advanced.macd,'core must expose advanced indicators');
assert(Array.isArray(a1.displayLevels),'core must expose lifecycle displayLevels');
if(a1.keyLevels.support)assert(a1.displayLevels.some(x=>x.id===a1.keyLevels.support.id),'support card zone must come from chart displayLevels');
if(a1.keyLevels.resistance)assert(a1.displayLevels.some(x=>x.id===a1.keyLevels.resistance.id),'resistance card zone must come from chart displayLevels');
assert(a1.volume&&a1.volume.definition.includes('previous 20'),'core must expose strict RVOL definition');

// HTF attachment: current chart and card share the same merged higher-TF zones.
const htf4={available:true,timeframe:'4h',localDisplayLevels:[
 {id:'4S',effectiveRole:'support',role:'support',status:'SUPPORT_HOLD',statusLabel:'지지 유지',timeframe:'4h',timeframes:['4h'],low:96,high:97,mid:96.5,touches:3,knownAt:1},
 {id:'4R',effectiveRole:'resistance',role:'resistance',status:'RESISTANCE_HOLD',statusLabel:'저항 유지',timeframe:'4h',timeframes:['4h'],low:104,high:105,mid:104.5,touches:3,knownAt:1}
]};
const htf1d={available:true,timeframe:'1d',localDisplayLevels:[
 {id:'1DS',effectiveRole:'support',role:'support',status:'SUPPORT_HOLD',statusLabel:'지지 유지',timeframe:'1d',timeframes:['1d'],low:95.8,high:96.7,mid:96.2,touches:4,knownAt:1},
 {id:'1DR',effectiveRole:'resistance',role:'resistance',status:'RESISTANCE_HOLD',statusLabel:'저항 유지',timeframe:'1d',timeframes:['1d'],low:108,high:109,mid:108.5,touches:4,knownAt:1}
]};
const attached=Core.attachHigherFrames({...a1,currentPrice:100,atrNow:1},[htf4,htf1d]);
assert(attached.higherTimeframes.includes('4h')&&attached.higherTimeframes.includes('1d'),'higher timeframe sources must be recorded');
assert(attached.displayLevels.some(x=>x.scope==='htf'||x.scope==='mixed'),'at least one higher-TF overlay must be present');
assert(attached.displayLevels.length<=5,'default chart must stay sparse: local+HTF per side plus optional transition');
assert(attached.htfKeyLevels&&attached.htfKeyLevels.support&&attached.htfKeyLevels.resistance,'HTF key support/resistance must be available for the card');
if(attached.keyLevels.support){assert(attached.displayLevels.some(x=>x.id===attached.keyLevels.support.id),'selected-TF support card must use chart display zone object');assert(attached.keyLevels.support.hasLocal,'selected-TF support card must prefer a zone containing the selected timeframe')}
if(attached.keyLevels.resistance){assert(attached.displayLevels.some(x=>x.id===attached.keyLevels.resistance.id),'selected-TF resistance card must use chart display zone object');assert(attached.keyLevels.resistance.hasLocal,'selected-TF resistance card must prefer a zone containing the selected timeframe')}
assert((attached.htfKeyLevels.support.timeframes||[]).every(tf=>['4h','1d'].includes(String(tf).toLowerCase())),'1H view HTF support context must come from 4H/1D');
assert((attached.htfKeyLevels.resistance.timeframes||[]).every(tf=>['4h','1d'].includes(String(tf).toLowerCase())),'1H view HTF resistance context must come from 4H/1D');

// Advanced indicator maturity: long EMAs must not pretend to exist before enough bars.
const warm=Array.from({length:120},(_,i)=>bar(i,100+i*.05,99.7+i*.05,100.3+i*.05));
const pack=Advanced.emaPack(warm);
assert.equal(pack[142].at(-1),null,'EMA142 must remain N/A before 142 confirmed bars');
assert(Number.isFinite(pack[92].at(-1)),'EMA92 should mature after 92 confirmed bars');

// User-specific setup flags: 1D 92->142 approach and 4H long-EMA support/reclaim.
const dailyBars=Array.from({length:200},(_,i)=>bar(i,100+i*.01,99.7+i*.01,100.3+i*.01));
const emDaily={92:Array(200).fill(null),142:Array(200).fill(null)};emDaily[92][199]=100;emDaily[142][199]=103;
const dailySpecial=Advanced.specialSetups(dailyBars,emDaily,'1d',101);
assert.equal(dailySpecial.daily92142.ready,true,'1D EMA92->142 pre-breakout setup should be explicit');
const em4={224:Array(500).fill(null),268:Array(500).fill(null),378:Array(500).fill(null),448:Array(500).fill(null)};
em4[224][499]=100;em4[268][499]=98;em4[378][499]=95;em4[448][499]=90;
const fourSpecial=Advanced.specialSetups(Array(500).fill(warm.at(-1)),em4,'4h',100.5);
assert.equal(fourSpecial.fourHLongEmaSupport.reclaimed,true,'4H long EMA reclaim should be explicit');

// MTF role separation must be stable from weekly environment to 5m execution.
function mf(tf,biasKey,emaTrend,rsiVal,hist,rvol=1.5){return{available:true,timeframe:tf,structure:{key:biasKey},setup:{state:'BOX_WATCH'},advanced:{emaTrend,rsi:{value:rsiVal},macd:{histNow:hist,improving:hist>=0},compressionState:'COMPRESSED',sweeps:[]},volume:{rvol20:rvol}}}
const synth=MultiTf.synthesize({'1w':mf('1w','UPTREND','BULL',60,1),'1d':mf('1d','UPTREND','BULL',58,.5),'4h':mf('4h','UPTREND','BULL',57,.4),'1h':mf('1h','UPTREND','BULL',55,.3),'15m':mf('15m','UPTREND','BULL',56,.2),'5m':mf('5m','UPTREND','BULL',54,.1)});
assert.equal(synth.regime,'BULL');assert.equal(synth.rows.length,6);assert(['READY','WATCH'].includes(synth.execution.longState));

const fullStack=Core.attachTimeframeStack({...a1,timeframe:'1h',currentPrice:100,atrNow:1},{'1w':{...htf1d,timeframe:'1w'},'1d':htf1d,'4h':{...a1,timeframe:'4h'},'1h':a1,'15m':a1,'5m':a1});
assert(fullStack.multiTimeframe&&fullStack.timeframeStack,'core must expose full timeframe synthesis');
assert(fullStack.referenceLevels&&Array.isArray(fullStack.referenceLevels.lines),'core must expose reference liquidity');
assert(fullStack.referenceLevels.lines.some(x=>x.label==='PDH')&&fullStack.referenceLevels.lines.some(x=>x.label==='PDL'),'PDH/PDL must be derived from closed intraday bars');

// Liquidity sweep detector must not use a level before that level was confirmed.
const causalBars=[bar(0,100,99.5,100.2),bar(1,100,98.8,100.3),bar(2,100.1,99.7,100.4)];
const futureLevel=[{kind:'EQL',side:'sell-side',price:99,low:98.95,high:99.05,knownAt:causalBars[1].closeTime+1}];
assert(!Advanced.sweeps(causalBars,futureLevel,{lookback:3}).some(x=>x.kind==='SELL_SIDE_SWEEP'),'future-known EQ liquidity must not leak into prior sweep detection');
futureLevel[0].knownAt=causalBars[0].closeTime;
assert(Advanced.sweeps(causalBars,futureLevel,{lookback:3}).some(x=>x.kind==='SELL_SIDE_SWEEP'),'confirmed EQ liquidity may be swept after knownAt');

// Session/reference helpers must be deterministic in KST/NY time.
assert.equal(Reference.sessionOf(Date.parse('2026-10-02T00:00:00Z')),'ASIA'); // 09:00 KST
assert.equal(typeof Reference.weekKey(Date.parse('2026-10-02T00:00:00Z')),'string');

const store=State.createState();const r1=store.beginRequest(),r2=store.beginRequest();assert(!store.isCurrent(r1)&&store.isCurrent(r2),'stale request must be rejected');

const html=fs.readFileSync('auto-chart-lab.html','utf8'),app=fs.readFileSync('ui/auto-chart/app.js','utf8');
for(const k of['AUTO CHART LAB · MTF v2','표시 레이어','자동 구조 차트','현재 분석','cardInvalidation','cardVolume','cardHtf','cardEnvironment','cardExecutionTf','cardCompression','cardMomentum','cardLiquidity','cardReference','cardDealing','cardZones','cardVpvr','cardFib','cardIchimoku','cardVolumeEcho','cardSpecial','data-layer="sr"','data-layer="box"','data-layer="ema"','data-layer="liquidity"','data-layer="reference"','data-layer="dealing"','data-layer="zones"','data-layer="vpvr"','analysis/advanced.js','analysis/multi-timeframe.js','analysis/reference-levels.js','analysis/level-state.js','analysis/volume.js','analysis/replay.js'])assert(html.includes(k),'missing MTF UI '+k);
for(const k of['beginRequest','isCurrent','fetchHistorical','fetchTimeframeStack','fetchAuxiliary','attachTimeframeStack','lastGood'])assert(app.includes(k),'missing orchestration contract '+k);
assert(app.indexOf('fetchHistorical')<app.indexOf('fetchAuxiliary'),'historical data must be handled before auxiliary/live');
console.log('auto chart MTF v2 advanced/replay/RVOL/N-A PASS');