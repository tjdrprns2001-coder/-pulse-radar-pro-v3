const test=require('node:test');
const assert=require('node:assert/strict');
const ICT=require('../ui/chart/ict-context-engine');

function baseInput(){return{
  currentIndex:45,
  htf:{tf:'4h',bias:'up',swings:[
    {id:'swing-low',type:'L',price:90,index:10,confirmedAt:12},
    {id:'swing-high',type:'H',price:120,index:30,confirmedAt:32}
  ]},
  ltf:{tf:'1h',mss:[],displacements:[],mitigations:[]},
  smc:{
    orderBlocks:[{id:'OB-up-20',kind:'OB',dir:'up',state:'active',index:20,low:96,high:99,quality:85}],
    fvgs:[{id:'FVG-up-24',kind:'FVG',dir:'up',state:'active',index:24,low:100,high:102,quality:80}],
    breakers:[{id:'BRK-1',kind:'BREAKER',dir:'up',state:'active',index:18,low:94,high:96,quality:70}],
    pdOte:{available:true,low:90,high:120,equilibrium:105,oteLow:96.3,oteHigh:101.46,position:'discount'}
  },
  liquidity:{
    levels:[{id:'pdh',type:'PDH',side:'buy',price:125,sourceId:'pdh:2026-07-14',sourceTf:'4h',state:'active',quality:1}],
    sweeps:[],
    voids:[{id:'VOID-up-21-23',kind:'VOID',dir:'up',state:'active',low:99,high:103,startIndex:21,endIndex:23,definitionVersion:'VOID_v1'}]
  }
};}

test('builds deterministic dealing range, equilibrium and bullish OTE context from confirmed HTF endpoints',()=>{
  const out=ICT.buildIctContext(baseInput());
  assert.equal(out.dealingRange.low,90);
  assert.equal(out.dealingRange.high,120);
  assert.equal(out.dealingRange.equilibrium,105);
  assert.ok(Math.abs(out.dealingRange.oteLow-96.3)<1e-9);
  assert.ok(Math.abs(out.dealingRange.oteHigh-101.46)<1e-9);
  assert.deepEqual(out.dealingRange.sourceIds,['swing-low','swing-high']);
  assert.equal(out.dealingRange.sourceTf,'4h');
  assert.equal(out.dealingRange.definitionVersion,'ICT_CONTEXT_v1');
});

test('PD Array context references existing SMC/Liquidity objects without creating new analytical objects',()=>{
  const input=baseInput();
  const out=ICT.buildIctContext(input);
  const ids=out.pdArrays.map(x=>x.sourceId);
  for(const id of ['OB-up-20','FVG-up-24','BRK-1','VOID-up-21-23'])assert.ok(ids.includes(id),id);
  for(const x of out.pdArrays){
    assert.ok(x.sourceId);
    assert.ok(['OB','FVG','BREAKER','VOID'].includes(x.type));
    assert.equal(x.tf,'4h');
    assert.equal(Object.prototype.hasOwnProperty.call(x,'generatedObject'),false);
  }
  assert.equal(out.versions.context,'ICT_CONTEXT_v1');
  assert.equal(out.versions.pdArray,'PD_ARRAY_CONTEXT_v1');
});

test('same context input produces identical normalized output',()=>{
  const a=ICT.buildIctContext(baseInput());
  const b=ICT.buildIctContext(baseInput());
  assert.deepEqual(a,b);
});

test('standard sequence cannot start from MSS when no source Sweep or Grab exists',()=>{
  const input=baseInput();
  input.ltf.mss=[{id:'mss:40',index:40,dir:'up',quality:80}];
  const out=ICT.buildIctContext(input);
  assert.equal(out.sequences.length,0);
  assert.equal(out.narrative,null);
});

test('Sweep-only sequence remains forming and narrative says MSS is missing',()=>{
  const input=baseInput();
  input.liquidity.sweeps=[{id:'liq:sweep:38',sourceSweepId:'sweep:38',index:38,dir:'up',variant:'NORMAL',quality:65,definitionVersion:'SWEEP_v2'}];
  const out=ICT.buildIctContext(input);
  assert.equal(out.sequences.length,1);
  const seq=out.sequences[0];
  assert.equal(seq.state,'forming');
  assert.equal(seq.events.length,1);
  assert.equal(seq.events[0].type,'SWEEP');
  assert.ok(seq.events.every(e=>e.sourceId));
  assert.match(out.narrative.text,/MSS/);
  assert.match(out.narrative.text,/forming/);
  assert.equal(out.narrative.sourceIds.includes('sweep:38'),true);
});

test('minimum source-linked evidence confirms sequence without fabricating absent mitigation',()=>{
  const input=baseInput();
  input.liquidity.sweeps=[{id:'liq:sweep:38',sourceSweepId:'sweep:38',index:38,dir:'up',variant:'GRAB',quality:85,definitionVersion:'SWEEP_v2'}];
  input.ltf.mss=[{id:'mss:39',index:39,dir:'up',quality:82}];
  input.ltf.displacements=[{id:'disp:40',index:40,dir:'up',quality:88}];
  input.smc.fvgs=[...input.smc.fvgs,{id:'FVG-up-41',kind:'FVG',dir:'up',state:'active',index:41,low:106,high:108,quality:90,sourceTf:'1h'}];
  const out=ICT.buildIctContext(input);
  const seq=out.sequences[0];
  assert.equal(seq.state,'confirmed');
  assert.deepEqual(seq.events.map(x=>x.type),['SWEEP','MSS','DISPLACEMENT','FVG']);
  assert.equal(seq.events.some(x=>x.type==='MITIGATION'),false);
  for(const e of seq.events)assert.ok(e.sourceId);
  assert.ok(out.narrative.text.includes('FVG'));
  assert.equal(out.narrative.text.includes('mitigation'),false);
  assert.equal(seq.definitionVersion,'ICT_SEQUENCE_v1');
});

test('old sequence invalidates deterministically using fixed v1 age',()=>{
  const input=baseInput();
  input.currentIndex=200;
  input.liquidity.sweeps=[{id:'liq:sweep:20',sourceSweepId:'sweep:20',index:20,dir:'up',variant:'NORMAL',quality:60,definitionVersion:'SWEEP_v2'}];
  const out=ICT.buildIctContext(input);
  assert.equal(out.sequences[0].state,'invalidated');
  assert.equal(ICT.SEQUENCE_PARAMS_V1.version,'ICT_SEQUENCE_v1');
  assert.ok(ICT.SEQUENCE_PARAMS_V1.maxAgeBars>0);
});
