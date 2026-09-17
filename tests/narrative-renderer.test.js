const test=require('node:test');
const assert=require('node:assert/strict');
const {renderNarrative}=require('../lib/analysis/narrative-renderer.js');

test('names selected timeframe and only prints scenario prices',()=>{
  const out=renderNarrative({symbol:'JUPUSDT',tf:'4h',scenario:{bias:'bearish',confidence:'medium',interestZone:{low:0.252,high:0.256},invalidation:{price:0.2565},targets:[{price:0.2294}],htfConflict:false,warnings:[]},htfContext:null,btcContext:null});
  const text=[out.title,...out.lines].join(' ');
  assert.match(text,/4시간봉/);
  assert.match(text,/0\.2565/);
  assert.match(text,/0\.2294/);
  assert.doesNotMatch(text,/0\.2050/);
});

test('uses unconfirmed wording when levels are absent',()=>{
  const out=renderNarrative({symbol:'JUPUSDT',tf:'15m',scenario:{bias:'neutral',confidence:'low',interestZone:null,invalidation:null,targets:[],htfConflict:false,warnings:[]},htfContext:null,btcContext:null});
  assert.match(out.lines.join(' '),/미확정|부족|확인/);
});

test('htf context remains secondary',()=>{
  const out=renderNarrative({symbol:'BTCUSDT',tf:'1h',scenario:{bias:'bearish',confidence:'medium',interestZone:null,invalidation:null,targets:[],htfConflict:true,warnings:[]},htfContext:{bias:'bullish'},btcContext:null});
  assert.match(out.lines.join(' '),/상위 TF/);
  assert.match(out.lines[0],/1시간봉/);
});
