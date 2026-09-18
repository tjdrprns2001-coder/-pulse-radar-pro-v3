'use strict';
const assert=require('assert');
const {buildDailySeries,buildBowlFeatureAt}=require('../lib/research-backtest-v2/bowl224/daily-features.js');
const {classifyBowlUniverse}=require('../lib/research-backtest-v2/bowl224/universe.js');
const DAY=86400000;
function k(i,c,closed=true){return[i*DAY,c,c+1,c-1,c,1,(i+1)*DAY-1+(closed?0:DAY),100,1,1,1,0]}
const rows=Array.from({length:230},(_,i)=>k(i,i+1));
const series=buildDailySeries(rows,{cutoffTs:230*DAY-1});
assert.equal(series[222].ma224,null);
assert.equal(series[223].ma224,(1+224)/2);
assert.equal(classifyBowlUniverse(series,222).universe,'N');
assert.equal(classifyBowlUniverse(series,223).universe,'L');
const withFuture=[...rows,k(230,999,false)];
const trimmed=buildDailySeries(withFuture,{cutoffTs:230*DAY-1});
assert.equal(trimmed.length,230,'future/unclosed daily candle leaked');

// Build precomputed contemporaneous MA history for strict gate tests.
const synthetic=Array.from({length:350},(_,i)=>({openTime:i*DAY,closeTime:(i+1)*DAY-1,close:90,high:91,low:89,ma224:100,atr14:5}));
synthetic[349]={...synthetic[349],close:105,ma224:100};
let f=buildBowlFeatureAt(synthetic,349);
assert.equal(f.below224_days,120);
assert.equal(f.below224_ratio_120d,1);
assert.equal(f.max_consecutive_below224_days_120d,120);
assert.equal(f.strict_bowl_120d,true);
assert.equal(f.original_bowl_4m_80pct,true);

const oneAbove=synthetic.map(x=>({...x}));oneAbove[300].close=101;
f=buildBowlFeatureAt(oneAbove,349);
assert.equal(f.below224_ratio_120d,119/120);
assert.equal(f.strict_bowl_120d,false);

const eighty=synthetic.map(x=>({...x}));
for(let i=229;i<253;i++)eighty[i].close=101; // 24 above, 96 below
f=buildBowlFeatureAt(eighty,349);
assert.equal(f.below224_ratio_120d,96/120);
assert.equal(f.original_bowl_4m_80pct,true);
assert.equal(f.strict_bowl_120d,false);
assert.equal(typeof f.distance_to_ma224_pct,'number');
assert.equal(typeof f.distance_to_ma224_atr,'number');
console.log('bowl224 daily PASS');