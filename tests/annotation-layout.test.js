const test=require('node:test');
const assert=require('node:assert/strict');
const AnnotationModel=require('../ui/chart/annotation-model');

test('normalizes annotation candidates with stable ids',()=>{
  const input={type:'CHOCH',category:'structure',barIndex:12,price:100,sourceId:'structure:12',tf:'1h'};
  const a=AnnotationModel.normalizeAnnotationCandidate(input,{mode:'structure',viewportLevel:'normal'});
  const b=AnnotationModel.normalizeAnnotationCandidate(input,{mode:'structure',viewportLevel:'normal'});
  assert.equal(a.type,'CHOCH');
  assert.equal(a.category,'structure');
  assert.equal(a.viewportLevel,'normal');
  assert.equal(a.sourceId,'structure:12');
  assert.equal(a.tf,'1h');
  assert.ok(a.id);
  assert.equal(a.id,b.id);
  assert.equal(typeof a.priority,'number');
  assert.equal(typeof a.allowOffset,'boolean');
  assert.equal(typeof a.maxOffset,'number');
  assert.equal(typeof a.width,'number');
  assert.equal(typeof a.height,'number');
  assert.ok(a.metadata&&typeof a.metadata==='object');
});

test('different source ids yield different stable ids',()=>{
  const base={type:'CHOCH',category:'structure',barIndex:12,price:100,tf:'1h'};
  const a=AnnotationModel.normalizeAnnotationCandidate({...base,sourceId:'structure:12'},{mode:'structure',viewportLevel:'normal'});
  const b=AnnotationModel.normalizeAnnotationCandidate({...base,sourceId:'structure:13'},{mode:'structure',viewportLevel:'normal'});
  assert.notEqual(a.id,b.id);
});

test('rejects missing required fields',()=>{
  assert.throws(()=>AnnotationModel.normalizeAnnotationCandidate({type:'CHOCH',category:'structure',barIndex:12,price:100,tf:'1h'},{mode:'structure',viewportLevel:'normal'}),/sourceId/);
});
