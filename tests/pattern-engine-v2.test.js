const test=require('node:test');
const assert=require('node:assert/strict');
const {analyzePatternSet}=require('../lib/pattern-set-engine.js');
const {buildSnapshotModel}=require('../lib/analysis/snapshot-builder.js');
const {renderNarrative}=require('../lib/analysis/narrative-renderer.js');

function line(id,slope,price){return{id,normalizedSlope:slope,slope,intercept:price,totalScore:80,currentLinePrice:price,breakStatus:{confirmed:false}}}

test('maps trendline v2 falling wedge into unified pattern state with source ids',()=>{
  const trendlines={support:line('sup',-.08,90),resistance:line('res',-.16,110),pair:{convergencePct:45,parallelScore:30,widthNowAtr:2,barsToApex:12},patterns:{type:'falling_wedge',subtype:null,confirmed:true,confidence:78,reasons:['converging']}};
  const out=analyzePatternSet({trendlines,candles:[{close:100,atr:2},{close:101,atr:2}],tf:'4h'});
  assert.equal(out.primary.type,'falling_wedge');
  assert.equal(out.primary.state,'FORMING');
  assert.equal(out.primary.confidence,78);
  assert.deepEqual(out.primary.sourceIds,['sup','res']);
});

test('maps triangle breakout confirmation without inventing sources',()=>{
  const trendlines={support:{...line('sup',.08,95),breakStatus:{confirmed:false}},resistance:{...line('res',-.08,105),breakStatus:{confirmed:true,direction:'up'}},pair:{convergencePct:50,parallelScore:20,widthNowAtr:1.5,barsToApex:8},patterns:{type:'triangle',subtype:'symmetrical',confirmed:true,confidence:82,reasons:['converging-boundaries']}};
  const out=analyzePatternSet({trendlines,candles:[{close:104,atr:2},{close:107,atr:2}],tf:'1h'});
  assert.equal(out.primary.type,'triangle');
  assert.equal(out.primary.subtype,'symmetrical');
  assert.equal(out.primary.state,'BREAKOUT_CONFIRMED');
  assert.deepEqual(out.primary.sourceIds,['sup','res']);
});

test('snapshot and narrative expose pattern state when source-linked pattern exists',()=>{
  const patternSet={primary:{type:'channel',subtype:'ascending',state:'PRE_BREAKOUT',confidence:71,sourceIds:['sup','res']}};
  const snap=buildSnapshotModel({tf:'15m',candles:[{high:10,low:8,close:9}],patternSet});
  assert.equal(snap.pattern.type,'channel');
  const text=renderNarrative({symbol:'BTCUSDT',tf:'15m',scenario:{bias:'neutral'},patternSet}).lines.join(' ');
  assert.match(text,/상승 채널/);
  assert.match(text,/돌파 관찰/);
});
