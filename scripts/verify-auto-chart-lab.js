const fs=require('fs'),assert=require('assert');
const Normalize=require('../ui/auto-chart/data/normalize.js');
const State=require('../ui/auto-chart/state.js');
const MathX=require('../ui/auto-chart/analysis/math.js');
const Swings=require('../ui/auto-chart/analysis/swings.js');
const Levels=require('../ui/auto-chart/analysis/levels.js');
const Ranges=require('../ui/auto-chart/analysis/ranges.js');
const Setup=require('../ui/auto-chart/analysis/setup-state.js');
const Volume=require('../ui/auto-chart/analysis/volume.js');
const Replay=require('../ui/auto-chart/analysis/replay.js');
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

// RVOL: current confirmed bar is excluded from its own denominator.
const rvBars=[];for(let i=0;i<21;i++)rvBars.push(bar(i,100,99.8,100.2));rvBars.forEach((b,i)=>b.volume=i===20?300:100);
assert.equal(Volume.rvol20(rvBars,20),3,'RVOL20 must be current / previous 20 average');

// Timestamp windows: 72h means 72 real hours on every timeframe, not a fixed bar count.
const fourH=[];for(let i=0;i<40;i++){const b={openTime:i*4*3600000,closeTime:(i+1)*4*3600000-1,open:100,high:101,low:99,close:100,volume:100,closed:true};fourH.push(b)}
fourH[18].volume=500; // ~84h before final close -> exclude from 72h
fourH[22].volume=500; // ~68h before final close -> include
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
assert.equal(a1.version,'AUTO_CHART_CORE_v1_1');
assert(a1.volume&&a1.volume.definition.includes('previous 20'),'core must expose strict RVOL definition');

const store=State.createState();const r1=store.beginRequest(),r2=store.beginRequest();assert(!store.isCurrent(r1)&&store.isCurrent(r2),'stale request must be rejected');

const html=fs.readFileSync('auto-chart-lab.html','utf8'),app=fs.readFileSync('ui/auto-chart/app.js','utf8');
for(const k of['AUTO CHART LAB · CORE v1','표시 레이어','자동 구조 차트','현재 분석','cardInvalidation','cardVolume','data-layer="sr"','data-layer="box"','analysis/volume.js','analysis/replay.js'])assert(html.includes(k),'missing core UI '+k);
for(const k of['beginRequest','isCurrent','fetchHistorical','fetchAuxiliary','lastGood'])assert(app.includes(k),'missing orchestration contract '+k);
assert(app.indexOf('fetchHistorical')<app.indexOf('fetchAuxiliary'),'historical data must be handled before auxiliary/live');
console.log('auto chart core replay/RVOL/N-A PASS');