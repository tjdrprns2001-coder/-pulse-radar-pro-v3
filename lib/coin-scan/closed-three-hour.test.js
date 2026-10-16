'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {HOUR_MS,THREE_HOUR_MS,synthesizeThreeHour}=require('./closed-three-hour.js');
const start=Date.UTC(2026,9,15,0,0,0);
function oneHour(i,{volume=100,partial=false}={}){
  const begin=start+i*HOUR_MS,p=100+i;
  const r=[begin,String(p),String(p+2),String(p-1),String(p+.5),String(volume),begin+HOUR_MS-1,
    String(volume*(p+.5)),10,String(volume*.6),String(volume*.6*(p+.5)),null];
  if(partial)r[6]=begin+HOUR_MS;
  return r;
}
test('3H UTC buckets are aggregated from exactly three complete closed 1H candles',()=>{
  const rows=Array.from({length:9},(_,i)=>oneHour(i));
  const out=synthesizeThreeHour(rows,{asOf:start+9*HOUR_MS});
  assert.equal(out.status,'OBSERVED');
  assert.equal(out.rows.length,3);
  assert.equal(out.rows._source,'SYNTHETIC_3H_FROM_CLOSED_1H');
  assert.equal(out.rows[0][0],start);
  assert.equal(out.rows[0][1],100);
  assert.equal(out.rows[0][2],104);
  assert.equal(out.rows[0][3],99);
  assert.equal(out.rows[0][4],102.5);
  assert.equal(out.rows[0][5],300);
  assert.equal(out.rows[0][6],start+THREE_HOUR_MS-1);
  assert.equal(out.rows[0][9],180);
  assert.equal(out.diagnostics.completeBuckets,3);
});
test('missing 1H and duplicate 1H never produce a fake 3H bar',()=>{
  const missing=[oneHour(0),oneHour(2),oneHour(3),oneHour(4),oneHour(5)];
  const out=synthesizeThreeHour(missing,{asOf:start+6*HOUR_MS});
  assert.equal(out.rows.length,1);
  assert.equal(out.rows[0][0],start+THREE_HOUR_MS);
  const dup=synthesizeThreeHour([oneHour(0),oneHour(1),oneHour(1),oneHour(2)],{asOf:start+THREE_HOUR_MS});
  assert.equal(dup.rows.length,0);
});
test('future/unclosed 1H bar cannot finalize a 3H bucket even when its price is supplied',()=>{
  const src=[oneHour(0),oneHour(1),oneHour(2)];
  assert.equal(synthesizeThreeHour(src,{asOf:start+THREE_HOUR_MS-1}).rows.length,0);
  assert.equal(synthesizeThreeHour(src,{asOf:start+THREE_HOUR_MS}).rows.length,1);
  const unclosed=synthesizeThreeHour([oneHour(0),oneHour(1),oneHour(2,{partial:true})],{asOf:start+THREE_HOUR_MS+1});
  assert.equal(unclosed.rows.length,0);
});
test('out-of-order input is sorted, invalid and missing quote fields are not fabricated',()=>{
  const arr=[oneHour(2),oneHour(0),oneHour(1)];delete arr[0][7];
  const out=synthesizeThreeHour(arr,{asOf:start+THREE_HOUR_MS});
  assert.equal(out.rows.length,1);
  assert.equal(out.rows[0][7],null);
  assert.equal(out.rows[0][1],100);
  assert.equal(out.rows[0][4],102.5);
});
