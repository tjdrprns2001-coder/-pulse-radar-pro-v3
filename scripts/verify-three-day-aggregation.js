'use strict';
const assert=require('node:assert/strict');
const {DAY,D3,aggregateThreeDay}=require('../lib/coin-scan/three-day-aggregation.js');
const ANCHOR=DAY,BASE=20000*DAY,asOf=BASE+400*DAY;
function day(i,over={}){const t=BASE+i*DAY,p=100+i;return[t,String(p),String(p+5),String(p-5),String(p+1),'10',t+DAY-1,'1000'].map((x,k)=>over[k]!==undefined?over[k]:x)}
const series=(a,b)=>Array.from({length:b-a+1},(_,k)=>day(a+k));
const agg=rows=>aggregateThreeDay(rows,{asOf,anchorMs:ANCHOR});
const opens=r=>r.rows.map(x=>x[0]);
let n=0;function ok(name,fn){fn();n++;console.log('ok - '+name)}
ok('anchor required',()=>assert.throws(()=>aggregateThreeDay(series(0,5),{asOf}),/anchorMs/));
ok('anchor validated',()=>{for(const a of [-1,1,DAY/2,D3,'bad'])assert.throws(()=>aggregateThreeDay(series(0,5),{asOf,anchorMs:a}),/anchorMs/)});
ok('aligned buckets',()=>{const r=agg(series(0,30));assert(r.rows.length);for(const x of r.rows)assert.equal((x[0]-ANCHOR)%D3,0)});
ok('same bars regardless of start',()=>{const all=agg(series(0,60));const m=new Map(all.rows.map(x=>[x[0],JSON.stringify(x)]));for(let start=1;start<=8;start++)for(const row of agg(series(start,60)).rows)assert.equal(m.get(row[0]),JSON.stringify(row))});
ok('OHLCV math',()=>{const b=agg(series(0,20)).rows[0],i=(b[0]-BASE)/DAY;assert.equal(Number(b[1]),100+i);assert.equal(Number(b[2]),100+i+7);assert.equal(Number(b[3]),100+i-5);assert.equal(Number(b[4]),100+i+3);assert.equal(Number(b[5]),30);assert.equal(Number(b[7]),3000)});
ok('unfinished candles excluded',()=>{const t=BASE+30*DAY+3600000,r=aggregateThreeDay(series(0,30),{asOf:t,anchorMs:ANCHOR});assert(r.dropped.unclosed>=1);assert(r.rows.every(x=>x[0]+D3<=t))});
ok('missing day drops bucket',()=>{const b=ANCHOR+Math.floor((BASE+10*DAY-ANCHOR)/D3)*D3;assert(!opens(agg(series(0,30).filter((_,i)=>i!==10))).includes(b))});
ok('conflicting duplicate drops bucket',()=>{const b=ANCHOR+Math.floor((BASE+12*DAY-ANCHOR)/D3)*D3;assert(!opens(agg([...series(0,30),day(12,{2:'999',4:'900'})])).includes(b));assert(opens(agg([...series(0,30),day(12)])).includes(b))});
ok('invalid duplicate poisons bucket',()=>{const b=ANCHOR+Math.floor((BASE+12*DAY-ANCHOR)/D3)*D3;assert(!opens(agg([...series(0,30),day(12,{4:'999'})])).includes(b))});
ok('invalid OHLC and off-midnight rejected',()=>{const broken=series(0,30);broken[10]=day(10,{2:'1',3:'500'});assert(agg(broken).dropped.invalid>=1);const shifted=series(0,30);shifted[10]=day(10,{0:BASE+10*DAY+60000});assert.equal(agg(shifted).dropped.offMidnight,1)});
ok('input unchanged',()=>{const a=series(0,12),s=JSON.stringify(a);agg(a);assert.equal(JSON.stringify(a),s)});
console.log(n+' checks passed');
