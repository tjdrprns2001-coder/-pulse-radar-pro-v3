'use strict';const assert=require('node:assert/strict'),L=require('../lib/onchain/launch-origin.js');
const addr='0x'+'a'.repeat(40),pool='0x'+'b'.repeat(40);
function fake(url){let body;
 if(url.includes('/tokens/')&&url.includes('/pools?'))body={data:[{id:'eth_'+pool,relationships:{base_token:{data:{id:'eth_'+addr}},quote_token:{data:{id:'eth_0x'+'c'.repeat(40)}}},attributes:{address:pool,pool_created_at:'2024-01-01T00:00:00Z',reserve_in_usd:'350000',volume_usd:{h24:'42000'}}}]};
 else if(url.includes('/ohlcv/day?'))body={data:{attributes:{ohlcv_list:[[1704153600,2,3,1.8,2.5,110],[1704067200,1,2,0.8,1.7,100]]}}};
 else body=[{pairAddress:pool,liquidity:{usd:330000},volume:{h24:38000},pairCreatedAt:1704067200000}];
 return Promise.resolve({ok:true,json:async()=>body});
}
(async()=>{
 const d=await L.analyze({network:'ethereum',token:addr,fetchImpl:fake,now:1234000});
 assert.equal(d.status,'PARTIAL_VERIFIED_HISTORY');
 assert.equal(d.summary.firstObservedOpen,1);
 assert.equal(d.summary.earliestObservedLow,.8);
 assert.equal(d.summary.highestObservedHigh,3);
 assert.equal(d.pools.length,1);
 assert.equal(d.selectedPool.baseTokenAddress,addr.toLowerCase());
 assert.equal(d.source.smartMoneyWallets,'NOT_VERIFIED');
 assert.equal(d.summary.observationCount,2);
 assert.equal(d.earlyMarketFootprint.observedDays,2);
 assert.equal(d.earlyMarketFootprint.firstObservedDayVolumeBase,100);
 assert.equal(d.earlyMarketFootprint.firstDayVsFollowingVolumeMultiple,100/110);
 const bad=await L.analyze({network:'ethereum',token:'not a valid address',fetchImpl:fake});assert.equal(bad.status,'INVALID_INPUT');
 const fail=await L.analyze({network:'base',token:addr,fetchImpl:async()=>{throw Error('unavailable')},now:2234000});
 assert.equal(fail.status,'POOLS_ONLY');assert.equal(fail.summary.firstObservedOpen,null);assert(fail.warnings.some(x=>x.includes('조회 실패')));
 console.log('launch origin mock validation passed: earliest close, non-zero origin, missing data, source provenance');
})().catch(e=>{console.error(e);process.exitCode=1});
