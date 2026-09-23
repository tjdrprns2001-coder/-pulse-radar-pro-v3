'use strict';
const assert=require('assert');
const E=require('../ui/chart/trendline-retest-engine.js');
const Trend=require('../lib/trendline-engine.js');

function linePrice(line,i){return line.intercept+line.slope*i}
function candle(i,line,{closeOffset=-.8,openOffset=-.9,highOffset=-.2,lowOffset=-1.2,atr=2}={}){
  const lp=linePrice(line,i),open=lp+openOffset,close=lp+closeOffset;
  return{time:(i+1)*3600000,open,close,high:Math.max(open,close,lp+highOffset),low:Math.min(open,close,lp+lowOffset),atr,volume:1000,partial:false};
}
function baseLine(){
  return{id:'res-0-2',side:'resistance',slope:-.2,intercept:110,normalizedSlope:-.1,scale:'linear-price',availableAt:3,confirmedBarIndex:3,touchCount:3,anchorA:{barIndex:0,time:3600000,price:110},anchorB:{barIndex:2,time:10800000,price:109.6}};
}
function build(n=12,line=baseLine()){return Array.from({length:n},(_,i)=>candle(i,line))}
function setBar(rows,i,line,opts){rows[i]=candle(i,line,opts);return rows}

// 1. Rejection is an event, not a terminal state.
{
  const L=baseLine(),rows=build(8,L);
  setBar(rows,4,L,{closeOffset:-.3,openOffset:-.4,highOffset:.05,lowOffset:-.7,atr:2});
  const out=E.evaluateLineLifecycle({candles:rows,line:L,side:'resistance'});
  assert(out.ok&&out.state==='ACTIVE','rejection must keep line ACTIVE');
  assert(out.events.some(x=>x.type==='REJECTION'),'REJECTION event required');
  assert(out.rejectionCount>=1,'rejection count must accumulate');
}

// 2. A close penetration before confirmedBarIndex discards the line.
{
  const L=baseLine(),rows=build(8,L);
  setBar(rows,2,L,{closeOffset:.7,openOffset:-.2,highOffset:.9,lowOffset:-.4,atr:2});
  const out=E.evaluateLineLifecycle({candles:rows,line:L,side:'resistance'});
  assert(!out.ok&&out.reason==='PRE_CONFIRMATION_CLOSE_PENETRATION','pre-confirmation penetration must discard');
}

// 3. BROKEN must fail even before a retest touch.
{
  const L=baseLine(),rows=build(10,L);
  setBar(rows,5,L,{closeOffset:.7,openOffset:-.2,highOffset:.9,lowOffset:-.3,atr:2});
  setBar(rows,6,L,{closeOffset:-.6,openOffset:.8,highOffset:1,lowOffset:-.8,atr:8});
  const out=E.evaluateLineLifecycle({candles:rows,line:L,side:'resistance'});
  assert(out.state==='FAILED','BROKEN must transition to FAILED on buffered close back below line');
  assert(out.failedAt?.barIndex===6,'failed bar must be frozen');
  assert(out.breakout?.frozenAtr===2,'breakout ATR must freeze');
}

// 4. Dead-zone close keeps RETESTING and timeout continues.
{
  const L=baseLine(),rows=build(8,L);
  setBar(rows,5,L,{closeOffset:.7,openOffset:-.2,highOffset:.9,lowOffset:-.3,atr:2});
  setBar(rows,6,L,{closeOffset:0,openOffset:.3,highOffset:.35,lowOffset:-.1,atr:9});
  setBar(rows,7,L,{closeOffset:0,openOffset:.05,highOffset:.2,lowOffset:-.15,atr:12});
  const out=E.evaluateLineLifecycle({candles:rows,line:L,side:'resistance'});
  assert(out.state==='RETESTING','dead-zone must explicitly keep RETESTING');
  assert(out.deadZonePolicy.includes('timeout'),'dead-zone policy must be documented');
  assert(out.current.atrBasis==='frozen'&&out.current.atr===2,'live ATR must not move retest bands');
}

// 5. sameBarConfirmAllowed is explicit and deterministic.
{
  const L=baseLine(),rows=build(7,L);
  setBar(rows,5,L,{closeOffset:.7,openOffset:-.2,highOffset:.9,lowOffset:-.3,atr:2});
  setBar(rows,6,L,{closeOffset:.25,openOffset:.3,highOffset:.4,lowOffset:-.1,atr:10});
  const yes=E.evaluateLineLifecycle({candles:rows,line:L,side:'resistance',params:{sameBarConfirmAllowed:true}});
  const no=E.evaluateLineLifecycle({candles:rows,line:L,side:'resistance',params:{sameBarConfirmAllowed:false}});
  assert(yes.state==='CONFIRMED'&&yes.retest.sameBarConfirm===true,'same-bar confirmation should work when enabled');
  assert(no.state==='RETESTING','same-bar confirmation should not occur when disabled');
}

// 6. No-touch expansion expires with one canonical state name.
{
  const L=baseLine(),rows=build(30,L);
  setBar(rows,5,L,{closeOffset:.7,openOffset:-.2,highOffset:.9,lowOffset:-.3,atr:2});
  for(let i=6;i<30;i++)setBar(rows,i,L,{closeOffset:1.2,openOffset:1.0,highOffset:1.5,lowOffset:.8,atr:4});
  const out=E.evaluateLineLifecycle({candles:rows,line:L,side:'resistance'});
  assert(out.state==='NO_RETEST_EXPIRED','no-retest timeout must use NO_RETEST_EXPIRED only');
}

// 7. Event snapshot keeps bar indices, moving line and formula/current invalidation.
{
  const L=baseLine(),rows=build(10,L);
  setBar(rows,5,L,{closeOffset:.7,openOffset:-.2,highOffset:.9,lowOffset:-.3,atr:2});
  setBar(rows,6,L,{closeOffset:.25,openOffset:.3,highOffset:.4,lowOffset:-.1,atr:7});
  const out=E.evaluateLineLifecycle({candles:rows,line:L,side:'resistance'});
  assert(Number.isInteger(out.line.anchor1.barIndex)&&Number.isInteger(out.line.anchor2.barIndex),'anchors must freeze barIndex');
  assert(out.line.scale==='linear-price','phase-1 scale must be explicit');
  assert(out.current.linePrice!==out.breakout.linePrice,'diagonal line price must be recomputed at current bar');
  assert(/frozenATR/.test(out.current.invalidationFormula),'UI invalidation must expose formula');
  assert(/^tlr1-/.test(out.paramsHash)&&out.line.paramsHash===out.paramsHash,'paramsHash must freeze with event');
  assert(out.quality.max===100&&out.quality.phase1Max===80&&out.quality.note.includes('승률'),'quality schema must reserve phase-2 fields and say not win rate');
}

// 8. Support break mirrors resistance logic.
{
  const L={id:'sup',side:'support',slope:.2,intercept:90,normalizedSlope:.1,scale:'linear-price',availableAt:3,confirmedBarIndex:3,touchCount:3,anchorA:{barIndex:0,time:1,price:90},anchorB:{barIndex:2,time:3,price:90.4}};
  const rows=Array.from({length:9},(_,i)=>{const lp=linePrice(L,i);return{time:i+1,open:lp+.9,close:lp+.8,high:lp+1.2,low:lp+.2,atr:2,partial:false}});
  rows[5]={...rows[5],open:linePrice(L,5)+.2,close:linePrice(L,5)-.7,high:linePrice(L,5)+.3,low:linePrice(L,5)-.9};
  rows[6]={...rows[6],open:linePrice(L,6)-.3,close:linePrice(L,6)-.25,high:linePrice(L,6)+.1,low:linePrice(L,6)-.4,atr:9};
  const out=E.evaluateLineLifecycle({candles:rows,line:L,side:'support'});
  assert(out.state==='CONFIRMED'&&out.breakDirection==='DOWN'&&out.roleAfterBreak==='RESISTANCE','support break must retest as resistance');
}

// Shared server trendline engine must expose broken-capable event candidates without changing display primaries.
{
  const candles=[];for(let i=0;i<80;i++)candles.push({time:i+1,open:100,high:105-i*.08+(i%7===0?.1:0),low:95+i*.02,close:100,atr:2,volume:1000});
  const swings=[];for(const i of [5,15,25,35,45,55])swings.push({index:i,pivotIndex:i,confirmedAt:i+3,type:'H',price:105-i*.08});
  for(const i of [8,18,28,38,48,58])swings.push({index:i,pivotIndex:i,confirmedAt:i+3,type:'L',price:95+i*.02});
  const out=Trend.buildTrendlines({candles,swings,interval:'1h'});
  assert(out.eventCandidates&&Array.isArray(out.eventCandidates.support)&&Array.isArray(out.eventCandidates.resistance),'server trendline engine must expose eventCandidates');
  assert(out.parameters.eventCandidatesIncludeBroken===true&&out.parameters.barIndexAnchors===true,'server contract flags missing');
}

console.log('trendline break-retest state machine PASS');