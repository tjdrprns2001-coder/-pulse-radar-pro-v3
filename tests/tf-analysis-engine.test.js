const test=require('node:test');
const assert=require('node:assert/strict');
const {buildTfScenario}=require('../lib/analysis/tf-analysis-engine.js');

test('selected timeframe stays authoritative when HTF conflicts',()=>{
  const out=buildTfScenario({symbol:'JUPUSDT',tf:'15m',currentPrice:0.24,candles:[{close:0.24}],structure:{bias:'bearish',sourceIds:['s-15m']},smc:{zones:[]},liquidity:{levels:[]},ictContext:null,htfContext:{bias:'bullish',sourceIds:['s-4h']}});
  assert.equal(out.tf,'15m');
  assert.equal(out.bias,'bearish');
  assert.equal(out.htfConflict,true);
});

test('does not synthesize zone invalidation or targets when sources are absent',()=>{
  const out=buildTfScenario({symbol:'JUPUSDT',tf:'4h',currentPrice:0.24,candles:[{close:0.24}],structure:{bias:'neutral',sourceIds:[]},smc:{zones:[]},liquidity:{levels:[]},ictContext:null,htfContext:null});
  assert.equal(out.interestZone,null);
  assert.equal(out.invalidation,null);
  assert.deepEqual(out.targets,[]);
});

test('uses active source-backed zone invalidation and de-duplicated targets',()=>{
  const out=buildTfScenario({symbol:'JUPUSDT',tf:'4h',currentPrice:0.2467,candles:[{close:0.2467}],structure:{bias:'bearish',sourceIds:['st']},smc:{zones:[{low:0.252,high:0.256,side:'bearish',type:'OB',active:true,sourceId:'ob-1'}]},liquidity:{levels:[{price:0.2294,type:'EQL',side:'sell',active:true,sourceId:'liq-1'},{price:0.2295,type:'SWING_LOW',side:'sell',active:true,sourceId:'liq-2'}]},ictContext:{invalidationCandidates:[{price:0.2565,side:'bearish',kind:'swing-high',confirmed:true,sourceId:'inv-1'}]},htfContext:null});
  assert.deepEqual(out.interestZone,{low:0.252,high:0.256,side:'bearish',sourceId:'ob-1',type:'OB'});
  assert.equal(out.invalidation.price,0.2565);
  assert.equal(out.targets.length,1);
  assert.equal(out.targets[0].sourceId,'liq-1');
  assert.ok(out.sourceIds.includes('ob-1'));
  assert.ok(out.sourceIds.includes('inv-1'));
});

test('filters future-dated candidates when asOfIndex is provided',()=>{
  const out=buildTfScenario({symbol:'BTCUSDT',tf:'1h',currentPrice:100,candles:[{close:100}],asOfIndex:10,structure:{bias:'bullish',sourceIds:['st']},smc:{zones:[{low:95,high:97,side:'bullish',type:'FVG',active:true,sourceId:'future-zone',barIndex:12}]},liquidity:{levels:[{price:110,type:'EQH',side:'buy',active:true,sourceId:'future-target',barIndex:11}]},ictContext:null,htfContext:null});
  assert.equal(out.interestZone,null);
  assert.deepEqual(out.targets,[]);
});
