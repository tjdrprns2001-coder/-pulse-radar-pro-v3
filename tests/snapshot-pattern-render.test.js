const test=require('node:test');
const assert=require('node:assert/strict');
const {buildSnapshotModel}=require('../lib/analysis/snapshot-builder.js');
const fs=require('node:fs');
const path=require('node:path');

test('snapshot model exposes source-backed pattern boundaries and breakout level',()=>{
  const candles=Array.from({length:20},(_,i)=>({open:100+i*.2,high:103+i*.2,low:97+i*.2,close:101+i*.2}));
  const trendlines={
    support:{id:'sup-1',slope:.15,intercept:96,startIndex:2,endIndex:19,currentLinePrice:98.85},
    resistance:{id:'res-1',slope:-.1,intercept:106,startIndex:2,endIndex:19,currentLinePrice:104.1}
  };
  const patternSet={primary:{type:'triangle',subtype:'symmetrical',state:'PRE_BREAKOUT',confidence:82,sourceIds:['sup-1','res-1']}};
  const model=buildSnapshotModel({tf:'1h',candles,patternSet,trendlines});
  assert.equal(model.patternGeometry.boundaries.length,2);
  assert.deepEqual(model.patternGeometry.boundaries.map(x=>x.sourceId),['sup-1','res-1']);
  assert.equal(model.patternGeometry.breakout.sourceId,'res-1');
  assert.match(model.patternGeometry.label,/대칭 삼각형/);
  assert.match(model.patternGeometry.label,/돌파 관찰/);
});

test('snapshot renderer contains pattern-boundary and breakout drawing paths',()=>{
  const src=fs.readFileSync(path.join(__dirname,'../ui/snapshot/snapshot-analysis.js'),'utf8');
  assert.match(src,/patternGeometry/);
  assert.match(src,/pattern-boundary/);
  assert.match(src,/pattern-breakout/);
});

test('no pattern geometry is emitted without source-linked pattern',()=>{
  const model=buildSnapshotModel({tf:'4h',candles:[{open:1,high:2,low:.5,close:1.5}],patternSet:{primary:null},trendlines:{}});
  assert.equal(model.patternGeometry,null);
});
