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

test('enriches every source sweep and upgrades only qualifying sweeps to GRAB',()=>{
  const src={...input(),
    sweeps:[
      {index:3,dir:'down',side:'high',level:109,excessAtr:.28,source:'EQH'},
      {index:4,dir:'up',side:'low',level:100,excessAtr:.08,source:'swing'}
    ],
    displacement:[{index:4,dir:'down',quality:82}],
    mss:[{index:4,dir:'down',quality:80}]
  };
  const out=Liquidity.analyzeLiquidity(src);
  assert.equal(out.sweeps.length,2);
  for(const sw of out.sweeps){
    assert.equal(sw.baseType,'SWEEP');
    assert.ok(['NORMAL','GRAB'].includes(sw.variant));
    assert.equal(sw.definitionVersion,'SWEEP_v2');
    assert.equal(typeof sw.penetrationAtr,'number');
    assert.equal(typeof sw.reclaimBars,'number');
    assert.equal(typeof sw.displacementConfirmed,'boolean');
    assert.ok(sw.sourceSweepId);
  }
  const grabs=out.sweeps.filter(x=>x.variant==='GRAB');
  assert.equal(grabs.length,1);
  assert.equal(grabs[0].sourceSweepId,out.sweeps[0].sourceSweepId);
  assert.equal(grabs[0].grabDefinitionVersion,'GRAB_v1');
});

test('never creates a Grab when there is no source Sweep',()=>{
  const out=Liquidity.analyzeLiquidity({...input(),sweeps:[],displacement:[{index:4,dir:'down',quality:99}],mss:[{index:4,dir:'down'}]});
  assert.equal(out.sweeps.length,0);
  assert.equal(out.sweeps.filter(x=>x.variant==='GRAB').length,0);
});

test('Sweep/Grab classification is deterministic and ignores evidence beyond the fixed window',()=>{
  const sourceSweep={index:2,dir:'down',side:'high',level:108,excessAtr:.25,source:'EQH'};
  const base={...input(),sweeps:[sourceSweep],displacement:[],mss:[]};
  const a=Liquidity.analyzeLiquidity(base);
  const b=Liquidity.analyzeLiquidity(base);
  assert.deepEqual(a.sweeps,b.sweeps);
  const late=Liquidity.analyzeLiquidity({...base,displacement:[{index:9,dir:'down',quality:99}],mss:[{index:9,dir:'down'}]});
  assert.equal(a.sweeps[0].variant,late.sweeps[0].variant);
});

test('exports fixed deterministic Sweep/Grab v1 parameters',()=>{
  assert.equal(Liquidity.SWEEP_PARAMS_V1.sweepVersion,'SWEEP_v2');
  assert.equal(Liquidity.SWEEP_PARAMS_V1.grabVersion,'GRAB_v1');
  assert.ok(Liquidity.SWEEP_PARAMS_V1.confirmationWindowBars>=1);
});

test('detects multi-candle low-overlap displacement as Liquidity Void',()=>{
  const voidCandles=[
    c('2026-07-20T13:00:00Z',100,103,99.5,102.8),
    c('2026-07-20T14:00:00Z',103.2,107,103.1,106.8),
    c('2026-07-20T15:00:00Z',107.3,112,107.2,111.8),
    c('2026-07-20T16:00:00Z',111.8,113,111,112)
  ];
  const out=Liquidity.analyzeLiquidity({...input(voidCandles),pivots:[],equalLevels:[],fvg:[{id:'FVG-up-2',kind:'FVG',low:103,high:107}]});
  assert.ok(out.voids.length>=1);
  const v=out.voids[0];
  assert.equal(v.kind,'VOID');
  assert.equal(v.definitionVersion,'VOID_v1');
  assert.notEqual(v.id,'FVG-up-2');
});

test('an isolated three-candle FVG does not automatically become a Liquidity Void',()=>{
  const fvgOnly=[
    c('2026-07-21T13:00:00Z',100,102,99,101),
    c('2026-07-21T14:00:00Z',101,102.2,100.5,101.5),
    c('2026-07-21T15:00:00Z',103,105,103,104)
  ];
  const out=Liquidity.analyzeLiquidity({...input(fvgOnly),pivots:[],equalLevels:[],fvg:[{id:'FVG-up-2',kind:'FVG',low:102,high:103}]});
  assert.equal(out.voids.length,0);
});

test('Inducement remains conservative candidate-only IND? with source links',()=>{
  const indCandles=[
    c('2026-07-22T13:00:00Z',104,106,102,103),
    c('2026-07-22T14:00:00Z',103,104,98.5,100),
    c('2026-07-22T15:00:00Z',100,106,99,105),
    c('2026-07-22T16:00:00Z',105,112,104,111)
  ];
  const src={...input(indCandles),
    pivots:[{id:'majorH',type:'H',price:120,index:0}],
    equalLevels:[{id:'smallEql',type:'EQL',price:99,lastIndex:1}],
    sweeps:[{id:'smallSweep',index:1,dir:'up',side:'low',level:99,excessAtr:.2,source:'EQL'}],
    displacement:[{index:2,dir:'up',quality:80}],mss:[]
  };
  const out=Liquidity.analyzeLiquidity(src);
  assert.ok(out.inducements.length>=1);
  for(const ind of out.inducements){
    assert.equal(ind.label,'IND?');
    assert.equal(ind.confidence,'candidate');
    assert.equal(ind.definitionVersion,'INDUCEMENT_CANDIDATE_v1');
    assert.notEqual(ind.confirmed,true);
    assert.ok(ind.sourceIds.length>=3);
  }
});
