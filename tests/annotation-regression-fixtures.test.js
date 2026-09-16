const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const CollisionPolicy=require('../ui/chart/collision-policy');

function load(name){return JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures',name),'utf8'));}
function intersects(a,b){return !(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top);}
function runFixture(f){
  return CollisionPolicy.layoutMarkerCandidates(f.candidates,{
    mode:f.mode,
    viewportLevel:f.viewportLevel,
    width:f.width,
    height:f.height,
    xForBar:i=>f.xBase+i*f.xStep,
    yForPrice:p=>f.yBase-(Number(p)||0)
  });
}

test('dense UNI 1h fixture is deterministic and collision free',()=>{
  const f=load('annotation-dense-uni-1h.json');
  const a=runFixture(f),b=runFixture(f);
  assert.deepEqual(a,b);
  for(const key of ['visibleIds','hiddenIds','offsets','boundingBoxes','priorityDecisions','viewportBudget'])assert.ok(a[key]!==undefined,key);
  const boxes=Object.values(a.boundingBoxes);
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)assert.equal(intersects(boxes[i],boxes[j]),false);
});

test('dense HYPE 1d four-chart fixture obeys stricter structure budget',()=>{
  const f=load('annotation-dense-hype-1d.json');
  const result=runFixture(f);
  assert.ok(result.visibleIds.length<=3);
  assert.equal(result.viewportBudget.structure,3);
  const boxes=Object.values(result.boundingBoxes);
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)assert.equal(intersects(boxes[i],boxes[j]),false);
});
