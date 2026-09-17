const test=require('node:test');
const assert=require('node:assert/strict');
const AnnotationModel=require('../ui/chart/annotation-model');
const AnnotationLayout=require('../ui/chart/annotation-layout');

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

function make(type,category,sourceId,extra={}){
  return AnnotationModel.normalizeAnnotationCandidate({type,category,barIndex:10,price:100,sourceId,tf:'1h',width:40,height:16,...extra},{mode:extra.mode||category,viewportLevel:extra.viewportLevel||'normal'});
}

function intersects(a,b){
  return !(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top);
}

test('resolves real bounding-box collisions with deterministic offsets or hiding',()=>{
  const candidates=[
    make('MSS','smc','mss:1',{priority:10}),
    make('BOS','smc','bos:1',{priority:1})
  ];
  const ctx={mode:'smc',viewportLevel:'normal',width:400,height:240,xForBar:()=>120,yForPrice:()=>100};
  const first=AnnotationLayout.layoutAnnotations(candidates,ctx);
  const second=AnnotationLayout.layoutAnnotations(candidates,ctx);
  assert.deepEqual(first,second);
  const boxes=Object.values(first.boundingBoxes);
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)assert.equal(intersects(boxes[i],boxes[j]),false);
  assert.ok(first.visibleIds.includes(candidates[0].id));
});

test('uses mode-aware effective priorities',()=>{
  const ict=[make('SEQUENCE','ict','seq:1'),make('SWEEP','liquidity','sw:1'),make('MSS','smc','mss:2')];
  const ictResult=AnnotationLayout.layoutAnnotations(ict,{mode:'ict',viewportLevel:'normal',width:400,height:240,xForBar:()=>120,yForPrice:()=>100});
  assert.equal(ictResult.priorityDecisions[0].type,'SEQUENCE');

  const liq=[make('IND','liquidity','ind:1'),make('GRAB','liquidity','grab:1'),make('PDH','liquidity','pdh:1')];
  const liqResult=AnnotationLayout.layoutAnnotations(liq,{mode:'liquidity',viewportLevel:'normal',width:400,height:240,xForBar:()=>120,yForPrice:()=>100});
  assert.equal(liqResult.priorityDecisions[0].type,'GRAB');
});

test('enforces compact viewport caps without changing global preset budgets',()=>{
  const structure=Array.from({length:8},(_,i)=>make('CHOCH','structure','s:'+i,{barIndex:i,price:100+i}));
  const mobile=AnnotationLayout.layoutAnnotations(structure,{mode:'structure',viewportLevel:'compact',width:390,height:300,xForBar:i=>i*42+20,yForPrice:p=>200-p});
  const four=AnnotationLayout.layoutAnnotations(structure,{mode:'structure',viewportLevel:'4-chart',width:300,height:220,xForBar:i=>i*35+10,yForPrice:p=>180-p});
  assert.ok(mobile.visibleIds.length<=4);
  assert.ok(four.visibleIds.length<=mobile.visibleIds.length);
  assert.equal(mobile.viewportBudget.structure,4);
});
