'use strict';
const assert=require('assert');
const {assignGroups,selectBaseline}=require('../lib/research-backtest-v2/bowl224/groups.js');
const {evaluateBowlOutcome}=require('../lib/research-backtest-v2/bowl224/outcomes.js');
assert.equal(assignGroups({bowlActive:false,intersectionActive:true}),'A');
assert.equal(assignGroups({bowlActive:true,intersectionActive:false}),'B');
assert.equal(assignGroups({bowlActive:true,intersectionActive:true}),'C');
assert.equal(assignGroups({bowlActive:false,intersectionActive:false}),null);

const signalTs=Date.UTC(2025,0,15),sameQ=[Date.UTC(2025,0,2),Date.UTC(2025,1,3),Date.UTC(2025,2,4)],otherQ=[Date.UTC(2025,4,1)];
const used=new Set();
const b1=selectBaseline({symbol:'AAAUSDT',signalEventId:'e1',signalTs,candidateTimestamps:[...sameQ,...otherQ],usedTimestamps:used,isValid:()=>true});
assert(sameQ.includes(b1.timestamp));used.add(b1.timestamp);
const b2=selectBaseline({symbol:'AAAUSDT',signalEventId:'e2',signalTs,candidateTimestamps:[...sameQ,...otherQ],usedTimestamps:used,isValid:()=>true});
assert.notEqual(b1.timestamp,b2.timestamp);
const again=selectBaseline({symbol:'AAAUSDT',signalEventId:'e1',signalTs,candidateTimestamps:[...sameQ,...otherQ],usedTimestamps:new Set(),isValid:()=>true});
assert.equal(again.timestamp,b1.timestamp,'baseline selection must be deterministic');

const H=3600000;
function bar(i,o,h,l,c){return[i*H,o,h,l,c,1,(i+1)*H-1,100,1,1,1,0]}
const event={eventId:'e',symbol:'AAAUSDT',signalCloseTs:0,entryPrice:100};
const rows=[];
for(let i=0;i<168;i++){
 let hi=102,lo=99,cl=100;
 if(i===5){hi=110;lo=98;cl=108} // exact +10% first hit inside 24H
 if(i===30){hi=115;lo=97;cl=112}
 if(i===50){hi=120;lo=96;cl=118}
 rows.push(bar(i+1,100,hi,lo,cl));
}
const out=evaluateBowlOutcome({event,futureBars:rows});
assert.equal(out.labels.Hit_24H_10pct,true);
assert.equal(out.labels.Hit_72H_10pct,true);
assert.equal(out.labels.Hit_7D_10pct,true);
assert.equal(out.labels.Hit_72H_15pct,true);
assert.equal(out.labels.Hit_72H_20pct,true);
assert.equal(out.labels.Hit_7D_15pct,true);
assert.equal(out.labels.Hit_7D_20pct,true);
assert.equal(out.hits.Hit_24H_10pct.time_to_hit_bars,6);
assert.equal(out.hits.Hit_24H_10pct.mae_before_hit_pct,-1);
assert.equal(out.hits.Hit_24H_10pct.mae_through_hit_bar_pct,-2);
assert.equal(out.horizons.h24.status,'evaluated');
assert.equal(out.horizons.h72.status,'evaluated');
assert.equal(out.horizons.d7.status,'evaluated');
assert(out.horizons.h72.mfe_pct>=20);
assert(out.horizons.h72.mae_pct<=-4);

// Signal candle must be excluded.
const withSignal=[bar(0,100,999,1,100),...rows];
const out2=evaluateBowlOutcome({event,futureBars:withSignal});
assert(out2.horizons.h24.mfe_pct<100);

// Incomplete 7D is unavailable, not a miss.
const partial=evaluateBowlOutcome({event,futureBars:rows.slice(0,72)});
assert.equal(partial.horizons.d7.status,'unavailable');
assert.equal(partial.labels.Hit_7D_10pct,null);
console.log('bowl224 groups outcomes PASS');