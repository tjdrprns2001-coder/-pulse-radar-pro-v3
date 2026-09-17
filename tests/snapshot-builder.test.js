const test=require('node:test');
const assert=require('node:assert/strict');
const {buildSnapshotModel}=require('../lib/analysis/snapshot-builder.js');

test('keeps selected tf and preserves source ids on annotations',()=>{
  const out=buildSnapshotModel({tf:'1h',candles:[{close:1}],structure:{annotations:[{id:'m1',type:'MSS',category:'structure',barIndex:0,price:1,sourceId:'mss-1'}]},smc:{zones:[]},liquidity:{annotations:[]},scenario:{interestZone:null,invalidation:null,targets:[]},viewportLevel:'focused'});
  assert.equal(out.tf,'1h');
  assert.equal(out.annotations[0].sourceId,'mss-1');
});

test('enforces curated annotation budgets before layout',()=>{
  const anns=Array.from({length:7},(_,i)=>({id:'s'+i,type:'BOS',category:'structure',barIndex:i,price:100+i,sourceId:'src-'+i}));
  const out=buildSnapshotModel({tf:'15m',candles:Array.from({length:8},(_,i)=>({close:100+i})),structure:{annotations:anns},smc:{zones:[]},liquidity:{annotations:[]},scenario:{interestZone:null,invalidation:null,targets:[]},viewportLevel:'normal'});
  assert.ok(out.annotations.filter(a=>a.category==='structure').length<=3);
});

test('scenario overlays retain their source ids',()=>{
  const out=buildSnapshotModel({tf:'4h',candles:[{close:100}],structure:{annotations:[]},smc:{zones:[]},liquidity:{annotations:[]},scenario:{interestZone:{low:95,high:97,sourceId:'zone-1',type:'OB'},invalidation:{price:105,sourceId:'inv-1'},targets:[{price:90,sourceId:'t1'}]},viewportLevel:'focused'});
  const ids=out.overlays.map(x=>x.sourceId);
  assert.ok(ids.includes('zone-1'));
  assert.ok(ids.includes('inv-1'));
  assert.ok(ids.includes('t1'));
});
