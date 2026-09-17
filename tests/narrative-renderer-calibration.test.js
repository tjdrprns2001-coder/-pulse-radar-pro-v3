const test=require('node:test');
const assert=require('node:assert/strict');
const {renderNarrative}=require('../lib/analysis/narrative-renderer.js');

test('pattern score is explicitly unverified and never labeled confidence',()=>{
  const out=renderNarrative({symbol:'FILUSDT',tf:'1d',scenario:{bias:'bullish',interestZone:null,invalidation:null,targets:[],htfConflict:false,warnings:[]},patternSet:{primary:{type:'falling_wedge',state:'FORMING',confidence:100}}});
  const text=out.lines.join(' ');
  assert.match(text,/패턴 점수 100/);
  assert.match(text,/검증확률 미확정/);
  assert.doesNotMatch(text,/신뢰도 100/);
});

test('weekly timeframe is named 주봉',()=>{
  const out=renderNarrative({symbol:'FILUSDT',tf:'1w',scenario:{bias:'neutral',interestZone:null,invalidation:null,targets:[],htfConflict:false,warnings:[]}});
  assert.match(out.lines[0],/주봉/);
});
