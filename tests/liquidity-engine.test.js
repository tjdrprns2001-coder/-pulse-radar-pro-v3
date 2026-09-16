const test=require('node:test');
const assert=require('node:assert/strict');
const Liquidity=require('../ui/chart/liquidity-engine');
const SessionProfile=require('../ui/chart/session-profile');

function c(time,open,high,low,close){return{time:Date.parse(time),open,high,low,close};}

const candles=[
  c('2026-07-13T13:00:00Z',100,103,99,102),
  c('2026-07-13T20:00:00Z',102,105,101,104),
  c('2026-07-14T13:00:00Z',104,108,103,107),
  c('2026-07-14T20:00:00Z',107,109,102,103),
  c('2026-07-15T13:00:00Z',103,110,100,109),
  c('2026-07-15T16:00:00Z',109,112,108,111)
];

function input(cs=candles){return{
  candles:cs,timeframe:'1h',
  pivots:[{id:'pH',type:'H',price:109,index:3},{id:'pL',type:'L',price:102,index:3}],
  equalLevels:[{id:'eqh:1',type:'EQH',price:109,lastIndex:3},{id:'eql:1',type:'EQL',price:102,lastIndex:3}],
  sweeps:[],displacement:[],mss:[],fvg:[],orderBlocks:[],
  sessionProfile:SessionProfile.SESSION_PROFILE_v1
};}

test('classifies structural and equal liquidity by side while preserving source links',()=>{
  const out=Liquidity.analyzeLiquidity(input());
  const eqh=out.levels.find(x=>x.sourceId==='eqh:1');
  const eql=out.levels.find(x=>x.sourceId==='eql:1');
  assert.equal(eqh.side,'buy');
  assert.equal(eql.side,'sell');
  assert.ok(out.levels.some(x=>x.type==='SWING_HIGH'&&x.side==='buy'));
  assert.ok(out.levels.some(x=>x.type==='SWING_LOW'&&x.side==='sell'));
});

test('uses previous completed New York day only for PDH/PDL',()=>{
  const out=Liquidity.analyzeLiquidity(input());
  const pdh=out.levels.find(x=>x.type==='PDH');
  const pdl=out.levels.find(x=>x.type==='PDL');
  assert.equal(pdh.price,109);
  assert.equal(pdl.price,102);
  assert.notEqual(pdh.price,112);
  assert.notEqual(pdl.price,100);
});

test('emits only supported lifecycle states and version metadata',()=>{
  const out=Liquidity.analyzeLiquidity(input());
  const allowed=new Set(['active','probed','swept','consumed','expired']);
  assert.ok(out.levels.length>0);
  for(const level of out.levels)assert.ok(allowed.has(level.state),level.state);
  assert.equal(out.versions.liquidity,'LIQUIDITY_v1');
});

test('previous completed week levels never use current incomplete week extremes',()=>{
  const week=[
    c('2026-07-06T13:00:00Z',90,100,80,95),
    c('2026-07-10T20:00:00Z',95,110,85,105),
    c('2026-07-13T13:00:00Z',105,150,70,120),
    c('2026-07-15T16:00:00Z',120,160,60,130)
  ];
  const out=Liquidity.analyzeLiquidity({...input(week),pivots:[],equalLevels:[]});
  const pwh=out.levels.find(x=>x.type==='PWH'),pwl=out.levels.find(x=>x.type==='PWL');
  assert.equal(pwh.price,110);
  assert.equal(pwl.price,80);
  assert.notEqual(pwh.price,160);
  assert.notEqual(pwl.price,60);
});

test('prefix outputs do not change when future candles are appended',()=>{
  const prefix=candles.slice(0,5);
  const future=[...prefix,c('2026-07-16T13:00:00Z',111,200,50,180)];
  const a=Liquidity.analyzeLiquidity({...input(prefix),pivots:[],equalLevels:[]});
  const b=Liquidity.analyzeLiquidity({...input(future),pivots:[],equalLevels:[],asOfIndex:prefix.length-1});
  const shape=x=>x.levels.map(v=>({type:v.type,side:v.side,price:v.price,state:v.state,sourceId:v.sourceId}));
  assert.deepEqual(shape(a),shape(b));
});
