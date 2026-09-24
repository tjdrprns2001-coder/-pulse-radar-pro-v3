'use strict';
const assert=require('assert');
const C=require('../ui/chart/causal-ict-engine.js');
const demo=[
['2026-01-01T00:00:00Z',100,101,99,100,1000],['2026-01-01T00:01:00Z',100,103,99,102,1200],
['2026-01-01T00:02:00Z',102,104,100,101,1150],['2026-01-01T00:03:00Z',101,102,98,99,1300],
['2026-01-01T00:04:00Z',99,101,97,100,1250],['2026-01-01T00:05:00Z',100,104,100,103,1500],
['2026-01-01T00:06:00Z',103,106,102,105,1700],['2026-01-01T00:07:00Z',105,106,101,102,1450],
['2026-01-01T00:08:00Z',102,103,99,100,1400],['2026-01-01T00:09:00Z',100,101,96,98,1800],
['2026-01-01T00:10:00Z',98,100,95,99,1550],['2026-01-01T00:11:00Z',99,105,99,104,2100],
['2026-01-01T00:12:00Z',104,108,103,107,2200],['2026-01-01T00:13:00Z',107,109,105,106,1650],
['2026-01-01T00:14:00Z',106,107,101,102,1900],['2026-01-01T00:15:00Z',102,103,98,99,2000],
['2026-01-01T00:16:00Z',99,102,98,101,1700],['2026-01-01T00:17:00Z',101,106,101,105,2300],
['2026-01-01T00:18:00Z',105,110,104,109,2400],['2026-01-01T00:19:00Z',109,110,105,106,1750],
['2026-01-01T00:20:00Z',106,107,102,103,1800],['2026-01-01T00:21:00Z',103,104,99,100,1950],
['2026-01-01T00:22:00Z',100,104,99,103,2100],['2026-01-01T00:23:00Z',103,108,102,107,2350]
].map((x,i)=>({time:Date.parse(x[0]),open:x[1],high:x[2],low:x[3],close:x[4],volume:x[5]}));
const result=C.run(demo);
assert.equal(result.bars,24);
assert.equal(result.events.length,44,'JS demo event count must match Python R0.1 fixture');
assert.equal(result.zones.length,5,'JS demo zone count must match Python R0.1 fixture');
assert.equal(result.intents.length,0);
assert.equal(result.trades.length,0);
assert(C.validateCausalContracts(result).pass);

const spec=JSON.parse(JSON.stringify(C.DEFAULT_SPEC));spec.data_contract.tick_size=1;spec.features.atr_length=2;spec.features.swing_k=1;spec.features.fvg.minimum_gap_ticks=1;spec.features.fvg.minimum_atr_mult=0;
const bar=(i,o,h,l,c)=>({time:Date.parse('2026-01-01T00:'+String(i).padStart(2,'0')+':00Z'),open:o,high:h,low:l,close:c,volume:1});
let r=C.run([bar(0,8,10,7,9),bar(1,9,12,8,11),bar(2,10,11,7,8)],spec);
const ph=r.events.find(e=>e.event_type==='PIVOT_CONFIRMED'&&e.payload.kind==='high');assert(ph);assert.equal(ph.payload.origin_bar,1);assert.equal(ph.payload.known_bar,2);assert.equal(ph.payload.available_from_bar,3);
r=C.run([bar(0,100,101,99,100),bar(1,100,105,100,104),bar(2,105,108,103,107)],spec);
const f=r.events.filter(e=>e.event_type==='FVG_CREATED');assert.equal(f.length,1);assert.equal(f[0].payload.origin_bar,1);assert.equal(f[0].payload.known_bar,2);assert.equal(f[0].payload.available_from_bar,3);
const inv=C.prefixInvariant([
bar(0,10,11,9,10),bar(1,10,12,9,11),bar(2,11,11,8,9),bar(3,9,10,7,8),bar(4,8,10,7,9),bar(5,9,13,9,12),bar(6,12,14,11,13),bar(7,13,13,9,10),bar(8,10,11,8,9),bar(9,9,10,7,8),bar(10,8,11,8,10),bar(11,10,14,10,13),bar(12,13,15,12,14),bar(13,14,14,10,11),bar(14,11,12,9,10)
],spec);assert(inv.pass,'future bars must not mutate prefix event ledger');
for(const x of r.intents)assert(x.eligible_fill_bar>=x.signal_bar+1);
console.log('causal ICT R0.1 parity PASS');