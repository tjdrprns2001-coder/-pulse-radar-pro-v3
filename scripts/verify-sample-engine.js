const assert=require('assert');
const s=require('../lib/coin-scan/sample-engine.js');

const oiAB=s.deriveOiProfile([{sumOpenInterest:'100'},{sumOpenInterest:'102'},{sumOpenInterest:'104'}]);
assert(Math.abs(oiAB.changePct-4)<1e-9);
assert.equal(oiAB.drawdownPct,0);
const takerAB=s.deriveTakerProfile([{buySellRatio:'0.42'},{buySellRatio:'2.35'},{buySellRatio:'1.1'}]);
assert.equal(takerAB.spikes20,1);
assert.equal(s.classifyArchetype({priceProfile:{priceChange8hPct:1.2},oiProfile:oiAB,takerProfile:takerAB}).archetype,'A+B');

const oiB=s.deriveOiProfile([100,100.4,100.2]);
const takerB=s.deriveTakerProfile([.22,1.1,4.13,.7]);
assert.equal(s.classifyArchetype({priceProfile:{priceChange8hPct:-1},oiProfile:oiB,takerProfile:takerB}).archetype,'B');

const xoi=s.normalizeXoiProfile({available:true,exchanges:{bybit:{available:true,changePct:3.8,samples:32},okx:{available:true,changePct:2.1,samples:8}}});
assert.equal(xoi.positiveBreadth,2);
const xClass=s.classifyArchetype({priceProfile:{priceChange8hPct:.8},oiProfile:oiB,takerProfile:takerB,xoiProfile:xoi});
assert.equal(xClass.archetype,'X+B');
assert.equal(s.deriveSequenceTag({oiProfile:oiB,takerProfile:takerB,xoiProfile:xoi}),'XOI-B2+');

const oiC=s.deriveOiProfile([100,96,97]);
assert.equal(s.classifyArchetype({priceProfile:{priceChange8hPct:-1},oiProfile:oiC,takerProfile:s.deriveTakerProfile([.8,1.2])}).archetype,'C');

const rows=[];
for(let i=0;i<48;i++){
  const late=i>=24,base=10+i*.001;
  rows.push([i,base,late?11:10.2,late?9.5:9,base+.01,100+(late?50:0),0,0,0,0,0,0]);
}
const liq=s.deriveLiquidityPattern(rows);
assert.equal(liq.key,'BSL-EXPANSION');
assert.equal(liq.lowSweep,false);
assert.equal(liq.highSweep,true);

const sample=s.analyzeSamplePattern({
  frames:{'15m':rows},
  derivativesProfile:{oiProfile:oiAB,takerProfile:takerAB,xoiProfile:xoi}
});
assert.equal(sample.archetype,'X+A+B');
assert.equal(sample.sequenceTag,'XOI-A+B');
assert(sample.xoiProfile.available);
assert(sample.score>=50);
assert(['IGNITION-WAIT','IGNITION-EARLY','OBSERVE','PROGRESSED','REIGNITION'].includes(sample.phase));
assert(Array.isArray(sample.reasons));

console.log('sample DNA engine PASS');
