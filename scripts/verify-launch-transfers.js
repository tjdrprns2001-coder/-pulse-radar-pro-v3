'use strict';const assert=require('node:assert/strict'),M=require('../lib/onchain/launch-token-transfers.js');
const token='0x'+'a'.repeat(40),from='0x'+'b'.repeat(40),to='0x'+'c'.repeat(40),hash='0x'+'d'.repeat(64);
(async()=>{
 const ok=await M.readRecent({network:'ethereum',token,fetchImpl:async()=>({ok:true,json:async()=>({items:[{from:{hash:from},to:{hash:to},tx_hash:hash,token:{address_hash:token,decimals:'18'},total:{value:'1000000000000000000',decimals:'18'},timestamp:'2025-01-01T00:00:00Z'},{from:{hash:from},to:{hash:to},tx_hash:hash,token:{address_hash:'0x'+'e'.repeat(40)}}],next_page_params:{block_number:1}})})});
 assert.equal(ok.status,'RECENT_SAMPLE_ONLY');assert.equal(ok.items.length,1);assert.equal(ok.stats.uniqueRecipients,1);assert.equal(ok.hasOlderPages,true);assert(ok.items[0].explorerUrl.startsWith('https://eth.blockscout.com/tx/'));
 const bad=await M.readRecent({network:'solana',token});assert.equal(bad.status,'NOT_SUPPORTED');
 const fail=await M.readRecent({network:'base',token,fetchImpl:async()=>{throw Error('timeout')}});assert.equal(fail.status,'UNAVAILABLE');
 console.log('blockscout recent transfer sample verification passed');
})().catch(e=>{console.error(e);process.exitCode=1});
