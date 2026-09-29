const fs=require('fs'),assert=require('assert');
const Normalize=require('../ui/auto-chart/data/normalize.js');
const State=require('../ui/auto-chart/state.js');
const MathX=require('../ui/auto-chart/analysis/math.js');
const Swings=require('../ui/auto-chart/analysis/swings.js');
const Levels=require('../ui/auto-chart/analysis/levels.js');
const Ranges=require('../ui/auto-chart/analysis/ranges.js');
const Setup=require('../ui/auto-chart/analysis/setup-state.js');
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

function bar(i,close,low=close-.2,high=close+.2){return{openTime:i*3600000,closeTime:i*3600000+3599999,open:close-.05,high,low,close,volume:1000,closed:true}}
const top=100,bottom=95,ar=1,box={id:'R',kind:'range',timeframe:'1h',low:bottom,high:top,knownAt:bar(0,97).closeTime,status:'valid',generation:'automatic'};
let seq=[bar(0,97),bar(1,98),bar(2,99.7,99.4,100.2)];
let st=Setup.derive(seq,box,{atrNow:ar});assert.equal(st.state,'BOX_WATCH');
seq.push(bar(3,100.3,100.05,100.5));st=Setup.derive(seq,box,{atrNow:ar});assert.equal(st.state,'BREAKOUT_CONFIRMED');assert(st.range.frozen&&st.range.high===top,'breakout freezes original boundary');
seq.push(bar(4,100.05,99.9,100.22));st=Setup.derive(seq,box,{atrNow:ar});assert.equal(st.state,'RETEST_IN_PROGRESS');
seq.push(bar(5,100.25,100.0,100.4));st=Setup.derive(seq,box,{atrNow:ar});assert.equal(st.state,'RETEST_CONFIRMED');
seq.push(bar(6,99.6,99.45,100.0));st=Setup.derive(seq,box,{atrNow:ar});assert.equal(st.state,'INVALIDATED');

const a1=Core.analyze(ds,{minWidthAtr:1,minInsideRatio:.5,zoneAtr:.3}),a2=Core.analyze(ds,{minWidthAtr:1,minInsideRatio:.5,zoneAtr:.3});
assert.deepStrictEqual(a1,a2,'same data/settings must produce same analysis');
assert.equal(a1.version,'AUTO_CHART_CORE_v1');

const store=State.createState();const r1=store.beginRequest(),r2=store.beginRequest();assert(!store.isCurrent(r1)&&store.isCurrent(r2),'stale request must be rejected');

const html=fs.readFileSync('auto-chart-lab.html','utf8'),app=fs.readFileSync('ui/auto-chart/app.js','utf8');
for(const k of['AUTO CHART LAB · CORE v1','표시 레이어','자동 구조 차트','현재 분석','cardInvalidation','data-layer="sr"','data-layer="box"'])assert(html.includes(k),'missing core UI '+k);
for(const k of['beginRequest','isCurrent','fetchHistorical','fetchAuxiliary','lastGood'])assert(app.includes(k),'missing orchestration contract '+k);
assert(app.indexOf('fetchHistorical')<app.indexOf('fetchAuxiliary'),'historical data must be handled before auxiliary/live');
console.log('auto chart core skeleton PASS');