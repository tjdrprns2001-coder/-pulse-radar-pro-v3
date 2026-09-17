const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const CollisionPolicy=require('../ui/chart/collision-policy');
const AnnotationModel=require('../ui/chart/annotation-model');

function load(name){return JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures',name),'utf8'));}
function intersects(a,b){return !(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top);}
function runFixture(f,override={}){
  const xBase=override.xBase??f.xBase,xStep=override.xStep??f.xStep,yBase=override.yBase??f.yBase;
  const context={...f,...override};
  return CollisionPolicy.layoutMarkerCandidates(f.candidates,{
    mode:context.mode,
    viewportLevel:context.viewportLevel,
    width:context.width,
    height:context.height,
    xForBar:i=>xBase+i*xStep,
    yForPrice:p=>yBase-(Number(p)||0)
  });
}
function round(n){return Math.round(Number(n)*1000)/1000;}
function normalized(result){
  const boxes={};
  for(const [id,b] of Object.entries(result.boundingBoxes))boxes[id]={left:round(b.left),right:round(b.right),top:round(b.top),bottom:round(b.bottom),width:round(b.width),height:round(b.height)};
  return{visibleIds:result.visibleIds,hiddenIds:result.hiddenIds,offsets:result.offsets,boundingBoxes:boxes,priorityDecisions:result.priorityDecisions,viewportBudget:result.viewportBudget};
}
function idsFor(f,context={}){const out={};for(const c of f.candidates)out[c.sourceId]=AnnotationModel.normalizeAnnotationCandidate(c,{...f,...context}).id;return out;}
function assertNoOverlap(result){const boxes=Object.values(result.boundingBoxes);for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)assert.equal(intersects(boxes[i],boxes[j]),false);}

const compactBudget={structure:4,smc:3,liquidity:4,ict:3,sweepGrab:3,eq:2,pd:2,pw:2,void:2,inducement:1,ictSequence:1};
const fourBudget={structure:3,smc:2,liquidity:3,ict:2,sweepGrab:2,eq:1,pd:2,pw:1,void:1,inducement:1,ictSequence:1};
const focusedBudget={structure:6,smc:5,liquidity:6,ict:4,sweepGrab:4,eq:3,pd:2,pw:2,void:2,inducement:1,ictSequence:1};
const normalBudget={structure:999,smc:999,liquidity:999,ict:999,sweepGrab:999,eq:999,pd:999,pw:999,void:999,inducement:999,ictSequence:999};

test('UNI 1h 390px compact snapshot is exact, deterministic, and collision free',()=>{
  const f=load('annotation-dense-uni-1h.json'),id=idsFor(f),a=runFixture(f),b=runFixture(f);
  assert.deepEqual(a,b);assertNoOverlap(a);
  assert.deepEqual(normalized(a),{
    visibleIds:[id['uni:mss:5'],id['uni:choch:4'],id['uni:sweep:5'],id['uni:eqh:6']],
    hiddenIds:[id['uni:bos:4']],
    offsets:{[id['uni:mss:5']]:0,[id['uni:choch:4']]:-24,[id['uni:sweep:5']]:24,[id['uni:eqh:6']]:-24},
    boundingBoxes:{
      [id['uni:mss:5']]:{left:176,right:212,top:84.9,bottom:102.9,width:36,height:18},
      [id['uni:choch:4']]:{left:136,right:184,top:61,bottom:79,width:48,height:18},
      [id['uni:sweep:5']]:{left:179,right:209,top:108.85,bottom:126.85,width:30,height:18},
      [id['uni:eqh:6']]:{left:211,right:245,top:60.8,bottom:78.8,width:34,height:18}
    },
    priorityDecisions:[
      {id:id['uni:mss:5'],type:'MSS',category:'smc',effectivePriority:10000},
      {id:id['uni:choch:4'],type:'CHOCH',category:'structure',effectivePriority:9000},
      {id:id['uni:sweep:5'],type:'SWEEP',category:'liquidity',effectivePriority:5000},
      {id:id['uni:bos:4'],type:'BOS',category:'structure',effectivePriority:4000},
      {id:id['uni:eqh:6'],type:'EQH',category:'liquidity',effectivePriority:3000}
    ],viewportBudget:compactBudget
  });
});

test('HYPE 1d four-chart compact snapshot is exact and collision free',()=>{
  const f=load('annotation-dense-hype-1d.json'),id=idsFor(f),result=runFixture(f);assertNoOverlap(result);
  assert.deepEqual(normalized(result),{
    visibleIds:[id['hype:choch:2'],id['hype:bos:2'],id['hype:choch:3']],
    hiddenIds:[id['hype:bos:4'],id['hype:swing:5']],
    offsets:{[id['hype:choch:2']]:0,[id['hype:bos:2']]:-24,[id['hype:choch:3']]:24},
    boundingBoxes:{
      [id['hype:choch:2']]:{left:50,right:98,top:96,bottom:114,width:48,height:18},
      [id['hype:bos:2']]:{left:54,right:94,top:71.8,bottom:89.8,width:40,height:18},
      [id['hype:choch:3']]:{left:78,right:126,top:119.9,bottom:137.9,width:48,height:18}
    },
    priorityDecisions:[
      {id:id['hype:choch:2'],type:'CHOCH',category:'structure',effectivePriority:0},
      {id:id['hype:bos:2'],type:'BOS',category:'structure',effectivePriority:0},
      {id:id['hype:choch:3'],type:'CHOCH',category:'structure',effectivePriority:0},
      {id:id['hype:bos:4'],type:'BOS',category:'structure',effectivePriority:0},
      {id:id['hype:swing:5'],type:'SWING',category:'structure',effectivePriority:0}
    ],viewportBudget:fourBudget
  });
});

test('UNI desktop snapshot keeps all priority annotations without overlap',()=>{
  const f=load('annotation-dense-uni-1h.json'),ctx={viewportLevel:'normal',width:900,height:400,xStep:50,xBase:40,yBase:260},id=idsFor(f,ctx),result=runFixture(f,ctx);assertNoOverlap(result);
  const n=normalized(result);
  assert.deepEqual(n.visibleIds,[id['uni:mss:5'],id['uni:choch:4'],id['uni:sweep:5'],id['uni:bos:4'],id['uni:eqh:6']]);
  assert.deepEqual(n.hiddenIds,[]);
  assert.deepEqual(n.offsets,{[id['uni:mss:5']]:0,[id['uni:choch:4']]:0,[id['uni:sweep:5']]:-24,[id['uni:bos:4']]:-24,[id['uni:eqh:6']]:0});
  assert.deepEqual(n.boundingBoxes,{
    [id['uni:mss:5']]:{left:272,right:308,top:134.9,bottom:152.9,width:36,height:18},
    [id['uni:choch:4']]:{left:216,right:264,top:135,bottom:153,width:48,height:18},
    [id['uni:sweep:5']]:{left:275,right:305,top:110.85,bottom:128.85,width:30,height:18},
    [id['uni:bos:4']]:{left:220,right:260,top:110.8,bottom:128.8,width:40,height:18},
    [id['uni:eqh:6']]:{left:323,right:357,top:134.8,bottom:152.8,width:34,height:18}
  });
  assert.deepEqual(n.viewportBudget,normalBudget);
});

test('UNI two-chart focused snapshot uses focused budget and remains collision free',()=>{
  const f=load('annotation-dense-uni-1h.json'),ctx={viewportLevel:'focused',width:720,height:340,xStep:44,xBase:30,yBase:230},id=idsFor(f,ctx),result=runFixture(f,ctx);assertNoOverlap(result);
  const n=normalized(result);
  assert.deepEqual(n.visibleIds,[id['uni:mss:5'],id['uni:choch:4'],id['uni:sweep:5'],id['uni:bos:4'],id['uni:eqh:6']]);
  assert.deepEqual(n.hiddenIds,[]);
  assert.deepEqual(n.offsets,{[id['uni:mss:5']]:0,[id['uni:choch:4']]:0,[id['uni:sweep:5']]:-24,[id['uni:bos:4']]:-24,[id['uni:eqh:6']]:0});
  assert.deepEqual(n.boundingBoxes,{
    [id['uni:mss:5']]:{left:232,right:268,top:104.9,bottom:122.9,width:36,height:18},
    [id['uni:choch:4']]:{left:182,right:230,top:105,bottom:123,width:48,height:18},
    [id['uni:sweep:5']]:{left:235,right:265,top:80.85,bottom:98.85,width:30,height:18},
    [id['uni:bos:4']]:{left:186,right:226,top:80.8,bottom:98.8,width:40,height:18},
    [id['uni:eqh:6']]:{left:277,right:311,top:104.8,bottom:122.8,width:34,height:18}
  });
  assert.deepEqual(n.viewportBudget,focusedBudget);
});
