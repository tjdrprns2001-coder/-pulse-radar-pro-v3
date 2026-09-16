const assert=require('assert');
const providers=require('../lib/onchain/providers');
const labels=require('../lib/onchain/labels');

assert.equal(providers.windowMs('1h'),3600000);
assert.equal(providers.windowMs('4h'),14400000);
assert.equal(providers.windowMs('24h'),86400000);

const ethFrom=providers.estimatedFromBlock(20000000,'ethereum','24h');
assert.equal(ethFrom,19992800,'ethereum 24h should estimate 7200 blocks');
const baseFrom=providers.estimatedFromBlock(10000000,'base','4h');
assert.equal(baseFrom,9992800,'base 4h should estimate 7200 blocks');

const now=Date.now();
const recent=providers.filterRecordsToWindow([
  {timestamp:new Date(now-30*60*1000).toISOString()},
  {timestamp:new Date(now-5*60*60*1000).toISOString()},
  {timestamp:new Date(now-25*60*60*1000).toISOString()}
],'24h',now);
assert.equal(recent.length,2,'24h filter should reject older records');

const targets=providers.heliusTargets({address:'Mint111',pairAddress:'Pool111'});
assert.deepEqual(targets,['Mint111','Pool111']);
assert.deepEqual(providers.heliusTargets({address:'Same111',pairAddress:'Same111'}),['Same111']);

labels.reset();
const loaded=labels.loadTrustedLabels([
  {chain:'ethereum',address:'0xabc',label:'Example Exchange',type:'exchange',confidence:99},
  {chain:'solana',address:'Pool111',label:'Example DEX',type:'dex',confidence:95}
]);
assert.equal(loaded,2);
assert.equal(labels.classifyAddress('ethereum','0xAbC').type,'exchange');
assert.equal(labels.classifyAddress('solana','Pool111').type,'dex');

console.log('deep onchain provider behavior PASS');
