const assert=require('assert');
const S=require('../lib/coin-scan/assistant-v2-scanner.js');

assert.equal(S.PARAM_SET,'assistant_v2_research_2026-09');
assert.deepEqual(S.oiPath({h8_12:-2,h4_8:-1.2,h0_4:2.1}),['-','-','+']);
assert.deepEqual(S.oiPath({h8_12:.2,h4_8:.8,h0_4:1.01}),['0','0','+']);

const cleanRebuild=S.classify({
  price24hPct:.4,price1hPct:.2,oi4hPct:2.1,fundingRate:.01,range1wPct:20,range1dPct:55,
  oiBuckets:{h8_12:-2.1,h4_8:-1.4,h0_4:2.1},
  taker1h:[.9,1.31,1.33],taker15m:[1.1,1.25,1.6]
});
assert(cleanRebuild.type.startsWith('C 후보'));
assert.equal(cleanRebuild.direction,'long');

const pureBuild=S.classify({
  price24hPct:1.2,price1hPct:.4,oi4hPct:2.3,fundingRate:.01,range1wPct:22,range1dPct:60,
  oiBuckets:{h8_12:1.2,h4_8:1.4,h0_4:2.3},
  taker1h:[.95,1.02,1.1],taker15m:[1.0,1.1,1.05]
});
assert(pureBuild.type.startsWith('A ·'));
assert.equal(pureBuild.direction,'none');

const premium=S.classify({
  price24hPct:1.2,price1hPct:.4,oi4hPct:2.3,fundingRate:.01,range1wPct:22,range1dPct:91,
  oiBuckets:{h8_12:1.2,h4_8:1.4,h0_4:2.3},
  taker1h:[.95,1.02,1.1],taker15m:[1.0,1.1,1.05]
});
assert(premium.counterEvidence.some(x=>x.includes('1D 상단권')));

console.log('assistant v2 research scanner PASS');
