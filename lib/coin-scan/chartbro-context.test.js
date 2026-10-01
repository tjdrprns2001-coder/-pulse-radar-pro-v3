'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('./chartbro-context.js');

const M15=15*60*1000,H1=3600000,H4=4*H1,D1=24*H1,W1=7*D1;
function k(ts,o,h,l,c,ms){return[ts,o,h,l,c,100,ts+ms-1,10000,10,50,5000]}
function ts(s){return Date.parse(s)}
function frames(){
  const asOf=ts('2026-10-01T12:30:00Z'),m15=[],start=ts('2026-09-30T23:00:00Z');
  for(let i=0;i<20;i++)m15.push(k(start+i*M15,100,101+(i===4?.2:0),99,100.2,M15));
  for(let i=0;i<20;i++)m15.push(k(ts('2026-10-01T06:00:00Z')+i*M15,100,102,98.5,101,M15));
  const h1=[];
  for(let i=0;i<40;i++){
    const t=ts('2026-09-29T00:00:00Z')+i*H1;
    const wave=[100,102,100.2,102.05,100.1,101.5,99.9,101.8][i%8];
    h1.push(k(t,wave,wave+1,wave-1,wave+.1,H1));
  }
  const h4=[];
  for(let i=0;i<30;i++){const b=95+(i%6);h4.push(k(ts('2026-09-26T00:00:00Z')+i*H4,b,b+2,b-1,b+.5,H4))}
  const d1=[
    k(ts('2026-09-29T00:00:00Z'),95,110,90,100,D1),
    k(ts('2026-09-30T00:00:00Z'),100,108,96,104,D1),
    k(ts('2026-10-01T00:00:00Z'),104,112,102,108,D1)
  ];
  const w1=[
    k(ts('2026-09-14T00:00:00Z'),90,115,85,100,W1),
    k(ts('2026-09-21T00:00:00Z'),100,120,92,105,W1),
    k(ts('2026-09-28T00:00:00Z'),105,125,100,110,W1)
  ];
  return{asOf,frames:{'15m':m15,'1h':h1,'4h':h4,'1d':d1,'1w':w1}};
}
test('buildLevels exposes session, prior-day/week, opens, swings, equal-liquidity and FVG context',()=>{
  const f=frames(),x=C.buildLevels(f);
  assert.equal(x.tradeDate,'2026-10-01');
  assert.equal(x.previousDay.high,108);
  assert.equal(x.previousWeek.high,120);
  assert.equal(x.opens.day,104);
  assert.equal(x.opens.week,105);
  assert.ok(x.sessions.asia&&x.sessions.asia.count===20);
  assert.ok(x.swings.h1High||x.swings.h1Low);
  assert.ok(Object.hasOwn(x.equalLiquidity,'high'));
  assert.ok(Array.isArray(x.fvg.h4.bullish));
});
test('macro review blocks only the high-impact event window and watches nearby events',()=>{
  const asOf=ts('2026-10-01T12:00:00Z'),calendar={available:true,items:[{event_type:'CPI',importance:'high',scheduled_at:asOf+20*60000,source_name:'BLS'}]};
  assert.equal(C.macroReview(calendar,asOf).status,'BLOCKED');
  assert.equal(C.macroReview({...calendar,items:[{...calendar.items[0],scheduled_at:asOf+2*H1}]},asOf).status,'WATCH');
  assert.equal(C.macroReview({...calendar,items:[{...calendar.items[0],scheduled_at:asOf+8*H1}]},asOf).status,'CLEAR');
});
test('derivatives review uses repository crowding bands and freshness',()=>{
  const asOf=ts('2026-10-01T12:00:00Z'),base={oi4hPct:2,oiObservationTime:asOf-15*60000,asOf};
  assert.equal(C.derivativesReview({...base,side:'long',fundingRatePct:.02}).status,'CLEAR');
  assert.equal(C.derivativesReview({...base,side:'long',fundingRatePct:.09}).status,'BLOCKED');
  assert.equal(C.derivativesReview({...base,side:'short',fundingRatePct:-.09}).status,'BLOCKED');
  assert.equal(C.derivativesReview({...base,side:'long',fundingRatePct:.02,oi4hPct:9}).status,'BLOCKED');
  assert.equal(C.derivativesReview({...base,side:'long',fundingRatePct:.02,oiObservationTime:asOf-2*H1}).status,'UNKNOWN');
});
test('execution review reuses existing hard spread/slippage/depth limits',()=>{
  const good={futures:{available:true,spreadBps:5,depthUsd:{bid10bps:100000,ask10bps:100000},slippage:{buy:[{notional:10000,slippageBps:8}],sell:[{notional:10000,slippageBps:8}]}}};
  const bad={futures:{available:true,spreadBps:30,depthUsd:{bid10bps:100000,ask10bps:100000},slippage:{buy:[{notional:10000,slippageBps:8}],sell:[{notional:10000,slippageBps:8}]}}};
  assert.equal(C.executionReview(good).status,'CLEAR');
  assert.equal(C.executionReview({marketType:'futures',...good.futures}).status,'CLEAR');
  assert.equal(C.executionReview(bad).status,'BLOCKED');
});
test('AMD stage maps manipulation and directional distribution explicitly',()=>{
  assert.equal(C.amdStage({status:'WAIT_RECLAIM'},'long'),'MANIPULATION_SELL_SIDE');
  assert.equal(C.amdStage({status:'WAIT_RECLAIM'},'short'),'MANIPULATION_BUY_SIDE');
  assert.equal(C.amdStage({status:'WAIT_MSS'},'long'),'DISTRIBUTION_UP');
  assert.equal(C.amdStage({status:'WAIT_MSS'},'short'),'DISTRIBUTION_DOWN');
});
