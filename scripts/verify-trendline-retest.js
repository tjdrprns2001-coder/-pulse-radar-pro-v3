'use strict';
const assert=require('assert');
const E=require('../ui/chart/trendline-retest-engine.js');
const Trend=require('../lib/trendline-engine.js');

function linePrice(line,i){return line.intercept+line.slope*i}
function candle(i,line,{closeOffset=-.8,openOffset=-.9,highOffset=-.2,lowOffset=-1.2,atr=2}={}){
  const lp=linePrice(line,i),open=lp+openOffset,close=lp+closeOffset;
  return{time:(i+1)*3600000,open,close,high:Math.max(open,close,lp+highOffset),low:Math.min(open,close,lp+lowOffset),atr,volume:1000,partial:false};
}
function baseLine(){return{id:'res-0-2',side:'resistance',slope:-.2,intercept:110,normalizedSlope:-.1,scale:'linear-price',availableAt:3,confirmedBarIndex:3,touchCount:3,anchorA:{barIndex:0,time:3600000,price:110},anchorB:{barIndex:2,time:10800000,price:109.6}}}
function build(n=12,line=baseLine()){return Array.from({length:n},(_,i)=>candle(i,line))}
function setBar(rows,i,line,opts){rows[i]=candle(i,line,opts);return rows}
function path(out){return out.transitionPath.join('>')}
function epsAt(line,i,threshold,params={}){const P=E.mergeParams(params);return E.comparisonEpsilon(linePrice(line,i),threshold,P)}
function finiteTelemetry(t){return t&&Number.isFinite(t.deadZoneBars)&&Number.isFinite(t.comparisonEpsilonRel)}

// REJECTION remains an event, not lifecycle state.
{
  const L=baseLine(),rows=build(8,L);setBar(rows,4,L,{closeOffset:-.3,openOffset:-.4,highOffset:.05,lowOffset:-.7,atr:2});
  const out=E.evaluateLineLifecycle({candles:rows,line:L,side:'resistance'});
  assert(out.ok&&out.state==='ACTIVE');assert(out.events.some(x=>x.type==='REJECTION'));assert.equal(out.transitions.length,0);
}
// confirmedBarIndex guard / pre-confirmation close penetration.
{
  const L=baseLine(),rows=build(8,L);setBar(rows,2,L,{closeOffset:.7,openOffset:-.2,highOffset:.9,lowOffset:-.4,atr:2});
  const out=E.evaluateLineLifecycle({candles:rows,line:L,side:'resistance'});
  assert(!out.ok&&out.reason==='PRE_CONFIRMATION_CLOSE_PENETRATION');
}
// BROKEN -> FAILED direct path before any retest.
{
  const L=baseLine(),rows=build(10,L);setBar(rows,5,L,{closeOffset:.7,openOffset:-.2,highOffset:.9,lowOffset:-.3,atr:2});setBar(rows,6,L,{closeOffset:-.6,openOffset:.8,highOffset:1,lowOffset:-.8,atr:8});
  const out=E.evaluateLineLifecycle({candles:rows,line:L,side:'resistance'});
  assert.equal(out.state,'FAILED');assert.equal(path(out),'ACTIVE>BROKEN>FAILED');assert.equal(out.telemetry.failedBeforeRetest,true);assert.equal(out.breakout.frozenAtr,2);
}
// Healthy full path.
{
  const L=baseLine(),rows=build(8,L);setBar(rows,5,L,{closeOffset:.7,openOffset:-.2,highOffset:.9,lowOffset:-.3,atr:2});setBar(rows,6,L,{closeOffset:0,openOffset:.25,highOffset:.30,lowOffset:-.10,atr:9});setBar(rows,7,L,{closeOffset:.25,openOffset:.05,highOffset:.35,lowOffset:-.10,atr:12});
  const out=E.evaluateLineLifecycle({candles:rows,line:L,side:'resistance',params:{sameBarConfirmAllowed:false}});
  assert.equal(out.state,'CONFIRMED');assert.equal(path(out),'ACTIVE>BROKEN>RETESTING>CONFIRMED');assert.equal(out.telemetry.confirmationBarsAfterTouch,1);assert(out.telemetry.deadZoneBars>=1);
}
// sameBar=false observes the opportunity without promotion.
{
  const L=baseLine(),rows=build(7,L);setBar(rows,5,L,{closeOffset:.7,openOffset:-.2,highOffset:.9,lowOffset:-.3,atr:2});setBar(rows,6,L,{closeOffset:.25,openOffset:.3,highOffset:.4,lowOffset:-.1,atr:10});
  const yes=E.evaluateLineLifecycle({candles:rows,line:L,side:'resistance',params:{sameBarConfirmAllowed:true}}),no=E.evaluateLineLifecycle({candles:rows,line:L,side:'resistance',params:{sameBarConfirmAllowed:false}});
  assert.equal(yes.state,'CONFIRMED');assert.equal(yes.telemetry.sameBarConfirmed,true);assert.equal(no.state,'RETESTING');assert.equal(no.telemetry.sameBarWouldConfirm,true);assert.equal(no.telemetry.sameBarConfirmed,false);assert.equal(path(no),'ACTIVE>BROKEN>RETESTING');
}
// sameBar=false -> next bar CONFIRMED.
{
  const L=baseLine(),rows=build(8,L);setBar(rows,5,L,{closeOffset:.7,openOffset:-.2,highOffset:.9,lowOffset:-.3,atr:2});setBar(rows,6,L,{closeOffset:.25,openOffset:.3,highOffset:.4,lowOffset:-.1,atr:10});setBar(rows,7,L,{closeOffset:.25,openOffset:.1,highOffset:.35,lowOffset:-.08,atr:12});
  const out=E.evaluateLineLifecycle({candles:rows,line:L,side:'resistance',params:{sameBarConfirmAllowed:false}});
  assert.equal(out.state,'CONFIRMED');assert.equal(out.telemetry.confirmationBarsAfterTouch,1);
}
// sameBar=false -> next bar FAILED, and RETESTING must remain in path.
{
  const L=baseLine(),rows=build(8,L);setBar(rows,5,L,{closeOffset:.7,openOffset:-.2,highOffset:.9,lowOffset:-.3,atr:2});setBar(rows,6,L,{closeOffset:.25,openOffset:.3,highOffset:.4,lowOffset:-.1,atr:10});setBar(rows,7,L,{closeOffset:-.6,openOffset:.1,highOffset:.25,lowOffset:-.8,atr:12});
  const out=E.evaluateLineLifecycle({candles:rows,line:L,side:'resistance',params:{sameBarConfirmAllowed:false}});
  assert.equal(out.state,'FAILED');assert.equal(path(out),'ACTIVE>BROKEN>RETESTING>FAILED');assert.equal(out.telemetry.failedBeforeRetest,false);
}
// Dead-zone persists and expires as RETEST_EXPIRED with frozen ATR.
{
  const L=baseLine(),rows=build(12,L);setBar(rows,5,L,{closeOffset:.7,openOffset:-.2,highOffset:.9,lowOffset:-.3,atr:2});for(let i=6;i<12;i++)setBar(rows,i,L,{closeOffset:0,openOffset:.05,highOffset:.2,lowOffset:-.15,atr:20+i});
  const out=E.evaluateLineLifecycle({candles:rows,line:L,side:'resistance',params:{sameBarConfirmAllowed:false,retestMaxBars:4}});
  assert.equal(out.state,'RETEST_EXPIRED');assert.equal(out.telemetry.retestExpired,true);assert(out.telemetry.deadZoneBars>=1);assert.equal(out.current.atr,2);assert.equal(out.current.atrBasis,'frozen');assert.equal(path(out),'ACTIVE>BROKEN>RETESTING>RETEST_EXPIRED');
}
// No touch expires as NO_RETEST_EXPIRED only.
{
  const L=baseLine(),rows=build(12,L);setBar(rows,5,L,{closeOffset:.7,openOffset:-.2,highOffset:.9,lowOffset:-.3,atr:2});for(let i=6;i<12;i++)setBar(rows,i,L,{closeOffset:1.2,openOffset:1.0,highOffset:1.5,lowOffset:.8,atr:8});
  const out=E.evaluateLineLifecycle({candles:rows,line:L,side:'resistance',params:{retestMaxBars:4}});
  assert.equal(out.state,'NO_RETEST_EXPIRED');assert.equal(out.telemetry.noRetestExpired,true);assert.equal(path(out),'ACTIVE>BROKEN>NO_RETEST_EXPIRED');
}
// breakBuffer floating boundary: exact and +0.5eps do not break, +2eps does.
{
  const L=baseLine(),P=E.mergeParams({comparisonEpsilonRel:1e-10}),i=5,lp=linePrice(L,i),threshold=lp+2*P.breakBufferAtr,eps=epsAt(L,i,threshold,P);
  for(const off of [2*P.breakBufferAtr,2*P.breakBufferAtr+eps*.5]){const rows=build(7,L);setBar(rows,i,L,{closeOffset:off,openOffset:-.2,highOffset:off+.1,lowOffset:-.3,atr:2});const out=E.evaluateLineLifecycle({candles:rows,line:L,side:'resistance',params:P});assert.equal(out.breakout,null)}
  const rows=build(7,L);setBar(rows,i,L,{closeOffset:2*P.breakBufferAtr+eps*2,openOffset:-.2,highOffset:2*P.breakBufferAtr+eps*3,lowOffset:-.3,atr:2});const out=E.evaluateLineLifecycle({candles:rows,line:L,side:'resistance',params:P});assert(out.breakout);
}
// reclaim boundary: exact/+0.5eps stays RETESTING, +2eps confirms.
{
  const L=baseLine(),P=E.mergeParams({sameBarConfirmAllowed:false,comparisonEpsilonRel:1e-10}),rows=build(8,L);setBar(rows,5,L,{closeOffset:.7,openOffset:-.2,highOffset:.9,lowOffset:-.3,atr:2});setBar(rows,6,L,{closeOffset:0,openOffset:.1,highOffset:.25,lowOffset:-.1,atr:9});
  const lp7=linePrice(L,7),threshold=lp7+2*P.reclaimBufferAtr,eps=E.comparisonEpsilon(lp7,threshold,P);
  setBar(rows,7,L,{closeOffset:2*P.reclaimBufferAtr+eps*.5,openOffset:0,highOffset:2*P.reclaimBufferAtr+eps*2,lowOffset:-.1,atr:12});assert.equal(E.evaluateLineLifecycle({candles:rows,line:L,side:'resistance',params:P}).state,'RETESTING');
  setBar(rows,7,L,{closeOffset:2*P.reclaimBufferAtr+eps*2,openOffset:0,highOffset:2*P.reclaimBufferAtr+eps*3,lowOffset:-.1,atr:12});assert.equal(E.evaluateLineLifecycle({candles:rows,line:L,side:'resistance',params:P}).state,'CONFIRMED');
}
// fail boundary: exact/-0.5eps stays RETESTING, below -2eps fails.
{
  const L=baseLine(),P=E.mergeParams({sameBarConfirmAllowed:false,comparisonEpsilonRel:1e-10}),base=build(8,L);setBar(base,5,L,{closeOffset:.7,openOffset:-.2,highOffset:.9,lowOffset:-.3,atr:2});setBar(base,6,L,{closeOffset:0,openOffset:.1,highOffset:.25,lowOffset:-.1,atr:9});
  const lp7=linePrice(L,7),threshold=lp7-2*P.breakBufferAtr,eps=E.comparisonEpsilon(lp7,threshold,P);
  const near=base.map(x=>({...x}));setBar(near,7,L,{closeOffset:-2*P.breakBufferAtr-eps*.5,openOffset:0,highOffset:.1,lowOffset:-2*P.breakBufferAtr-eps*2,atr:12});assert.equal(E.evaluateLineLifecycle({candles:near,line:L,side:'resistance',params:P}).state,'RETESTING');
  const beyond=base.map(x=>({...x}));setBar(beyond,7,L,{closeOffset:-2*P.breakBufferAtr-eps*2,openOffset:0,highOffset:.1,lowOffset:-2*P.breakBufferAtr-eps*3,atr:12});assert.equal(E.evaluateLineLifecycle({candles:beyond,line:L,side:'resistance',params:P}).state,'FAILED');
}
// Snapshot immutability + telemetry.
{
  const L=baseLine(),rows=build(10,L);setBar(rows,5,L,{closeOffset:.7,openOffset:-.2,highOffset:.9,lowOffset:-.3,atr:2});setBar(rows,6,L,{closeOffset:.25,openOffset:.3,highOffset:.4,lowOffset:-.1,atr:7});
  const out=E.evaluateLineLifecycle({candles:rows,line:L,side:'resistance'});
  assert(Number.isInteger(out.line.anchor1.barIndex)&&Number.isInteger(out.line.anchor2.barIndex));assert.equal(out.line.scale,'linear-price');assert.notEqual(out.current.linePrice,out.breakout.linePrice);assert(/frozenATR/.test(out.current.invalidationFormula));assert(/^tlr1-/.test(out.paramsHash)&&out.line.paramsHash===out.paramsHash);assert(out.quality.max===100&&out.quality.phase1Max===80&&out.quality.note.includes('승률'));assert(finiteTelemetry(out.telemetry));
}
// Support side mirrors resistance and preserves transition order.
{
  const L={id:'sup',side:'support',slope:.2,intercept:90,normalizedSlope:.1,scale:'linear-price',availableAt:3,confirmedBarIndex:3,touchCount:3,anchorA:{barIndex:0,time:1,price:90},anchorB:{barIndex:2,time:3,price:90.4}};
  const rows=Array.from({length:9},(_,i)=>{const lp=linePrice(L,i);return{time:i+1,open:lp+.9,close:lp+.8,high:lp+1.2,low:lp+.2,atr:2,partial:false}});rows[5]={...rows[5],open:linePrice(L,5)+.2,close:linePrice(L,5)-.7,high:linePrice(L,5)+.3,low:linePrice(L,5)-.9};rows[6]={...rows[6],open:linePrice(L,6)-.3,close:linePrice(L,6)-.25,high:linePrice(L,6)+.1,low:linePrice(L,6)-.4,atr:9};
  const out=E.evaluateLineLifecycle({candles:rows,line:L,side:'support'});assert.equal(out.state,'CONFIRMED');assert.equal(out.breakDirection,'DOWN');assert.equal(out.roleAfterBreak,'RESISTANCE');assert.equal(path(out),'ACTIVE>BROKEN>RETESTING>CONFIRMED');
}
// Shared server trendline engine contract.
{
  const candles=[];for(let i=0;i<80;i++)candles.push({time:i+1,open:100,high:105-i*.08+(i%7===0?.1:0),low:95+i*.02,close:100,atr:2,volume:1000});
  const swings=[];for(const i of [5,15,25,35,45,55])swings.push({index:i,pivotIndex:i,confirmedAt:i+3,type:'H',price:105-i*.08});for(const i of [8,18,28,38,48,58])swings.push({index:i,pivotIndex:i,confirmedAt:i+3,type:'L',price:95+i*.02});
  const out=Trend.buildTrendlines({candles,swings,interval:'1h'});assert(out.eventCandidates&&Array.isArray(out.eventCandidates.support)&&Array.isArray(out.eventCandidates.resistance));assert(out.parameters.eventCandidatesIncludeBroken===true&&out.parameters.barIndexAnchors===true);
}
console.log('trendline break-retest second-pass audit PASS');