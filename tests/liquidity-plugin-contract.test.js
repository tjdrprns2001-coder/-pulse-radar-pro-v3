const test=require('node:test');
const assert=require('node:assert/strict');
const LiquidityPlugin=require('../ui/chart/plugins/liquidity-plugin');

const sample={
  levels:[
    {id:'pdh1',type:'PDH',side:'buy',price:110,sourceId:'pdh:1',startIndex:1,state:'active'},
    {id:'pdl1',type:'PDL',side:'sell',price:90,sourceId:'pdl:1',startIndex:1,state:'active'},
    {id:'pwh1',type:'PWH',side:'buy',price:120,sourceId:'pwh:1',startIndex:0,state:'active'},
    {id:'pwl1',type:'PWL',side:'sell',price:80,sourceId:'pwl:1',startIndex:0,state:'active'},
    {id:'eqh1',type:'EQH',side:'buy',price:108,sourceId:'eqh:1',startIndex:2,state:'active'},
    {id:'eql1',type:'EQL',side:'sell',price:92,sourceId:'eql:1',startIndex:2,state:'active'}
  ],
  sweeps:[
    {id:'sw1',sourceSweepId:'sw:1',variant:'NORMAL',dir:'down',index:3,level:108,sourceId:'sw:1'},
    {id:'sw2',sourceSweepId:'sw:2',variant:'GRAB',dir:'up',index:4,level:92,sourceId:'sw:2'}
  ],
  voids:[{id:'VOID-up-1-3',kind:'VOID',dir:'up',low:96,high:103,startIndex:1,endIndex:3,definitionVersion:'VOID_v1'}],
  inducements:[{id:'ind1',label:'IND?',confidence:'candidate',direction:'up',sourceIds:['eql:1','sw:2','pdh:1'],smallLevelId:'eql1',targetLevelId:'pdh1'}]
};

test('builds compact liquidity labels as annotation candidates with source ids',()=>{
  const p=LiquidityPlugin.buildLiquidityPresentation(sample,{tf:'1h'});
  const labels=p.annotations.map(x=>x.label);
  for(const expected of ['PDH','PDL','PWH','PWL','EQH','EQL','S↓','G↑','IND?'])assert.ok(labels.includes(expected),expected);
  for(const a of p.annotations){assert.equal(a.category,'liquidity');assert.ok(a.sourceId);assert.equal(typeof a.barIndex,'number');assert.equal(typeof a.price,'number');}
});

test('emits Void as region distinct from FVG and delegates caps externally',()=>{
  const p=LiquidityPlugin.buildLiquidityPresentation(sample,{tf:'1h'});
  assert.equal(p.regions.length,1);
  assert.equal(p.regions[0].kind,'VOID');
  assert.equal(p.regions[0].definitionVersion,'VOID_v1');
  assert.equal(p.annotations.some(x=>x.type==='FVG'),false);
  assert.equal(Object.prototype.hasOwnProperty.call(p,'maxItems'),false);
  assert.equal(Object.prototype.hasOwnProperty.call(p,'fullCap'),false);
});

test('plugin factory satisfies chart plugin contract',()=>{
  const plugin=LiquidityPlugin.createLiquidityPlugin();
  assert.equal(plugin.id,'liquidity');
  assert.ok(plugin.version);
  assert.ok(Array.isArray(plugin.requiredData));
  for(const fn of ['mount','update','setVisible','dispose'])assert.equal(typeof plugin[fn],'function');
});
