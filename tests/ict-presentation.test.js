const test=require('node:test');
const assert=require('node:assert/strict');
const Presentation=require('../ui/multi-chart/ict-presentation');

function context(events,state='confirmed'){
  const sourceIds=events.map(e=>e.sourceId);
  return{
    dealingRange:{low:90,high:120,equilibrium:105,premiumRange:[105,120],discountRange:[90,105],oteLow:96.3,oteHigh:101.46,sourceTf:'4h',sourceIds:['lo','hi']},
    sequences:[{id:'seq:1',direction:'up',state,events,sourceIds,sourceTfs:['1h'],definitionVersion:'ICT_SEQUENCE_v1'}],
    narrative:{text:'source-linked narrative',state,sourceIds,definitionVersion:'ICT_NARRATIVE_v1'}
  };
}

test('derives Premium Discount OTE visuals only from dealingRange',()=>{
  const p=Presentation.buildIctPresentation(context([]));
  assert.deepEqual(p.bands.map(x=>x.kind),['PREMIUM','DISCOUNT','OTE']);
  assert.deepEqual(p.bands.find(x=>x.kind==='PREMIUM').range,[105,120]);
  assert.deepEqual(p.bands.find(x=>x.kind==='DISCOUNT').range,[90,105]);
  assert.deepEqual(p.bands.find(x=>x.kind==='OTE').range,[96.3,101.46]);
  assert.equal(p.equilibrium,105);
});

test('sequence markers are numbered only for present source-linked events',()=>{
  const events=[
    {type:'SWEEP',sourceId:'sweep:1',index:10,tf:'1h',direction:'up'},
    {type:'MSS',sourceId:'mss:1',index:11,tf:'1h',direction:'up'},
    {type:'FVG',sourceId:'fvg:1',index:13,tf:'1h',direction:'up'}
  ];
  const p=Presentation.buildIctPresentation(context(events,'forming'));
  assert.deepEqual(p.annotations.map(x=>x.label),['① SWP','② MSS','④ FVG']);
  assert.equal(p.annotations.some(x=>x.label.includes('③')),false);
  assert.equal(p.annotations.some(x=>x.label.includes('⑤')),false);
  for(const a of p.annotations)assert.ok(a.sourceId);
});

test('narrative model is passed through from context without inference',()=>{
  const ctx=context([{type:'SWEEP',sourceId:'sweep:1',index:10,tf:'1h'}],'forming');
  ctx.narrative.text='Sweep 확인 → MSS 미확인 → forming 상태';
  const p=Presentation.buildIctPresentation(ctx);
  assert.equal(p.narrative.text,ctx.narrative.text);
  assert.deepEqual(p.narrative.sourceIds,['sweep:1']);
});
