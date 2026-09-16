const test=require('node:test');
const assert=require('node:assert/strict');
const {selectNonCollidingMarkers,clusterDirectionalMarkers}=require('../ui/chart/collision-policy');

test('selectNonCollidingMarkers keeps higher priority marker within nearby bars',()=>{
  const items=[
    {i:10,priority:2,text:'HH'},
    {i:11,priority:0,text:'CHoCH'},
    {i:12,priority:1,text:'BOS'},
    {i:18,priority:2,text:'HL'}
  ];
  const out=selectNonCollidingMarkers(items,{minGapBars:2,maxItems:4});
  assert.deepEqual(out.map(x=>x.text),['CHoCH','HL']);
});

test('clusterDirectionalMarkers combines nearby same-direction sweeps',()=>{
  const items=[{i:20,dir:'down'},{i:21,dir:'down'},{i:27,dir:'up'}];
  const out=clusterDirectionalMarkers(items,{distanceBars:2});
  assert.equal(out.length,2);
  assert.equal(out[0].count,2);
  assert.equal(out[0].label,'S↓×2');
  assert.equal(out[1].label,'S↑');
});
