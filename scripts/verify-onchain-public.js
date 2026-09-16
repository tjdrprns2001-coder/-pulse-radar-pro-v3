const assert=require('assert');
const providers=require('../lib/onchain/providers');
const aggregate=require('../lib/onchain/aggregate');

const parsed=providers.parseAssets(['ethereum:0x1111111111111111111111111111111111111111~0x2222222222222222222222222222222222222222~UNI','solana:Mint111~Pool111~BONK']);
assert.equal(parsed[0].chain,'ethereum');
assert.equal(parsed[0].pairAddress.toLowerCase(),'0x2222222222222222222222222222222222222222');
assert.equal(parsed[0].symbol,'UNI');
assert.equal(parsed[1].chain,'solana');
const legacy=providers.parseAssets(['base:0x4444444444444444444444444444444444444444']);
assert.equal(legacy[0].chain,'base');
assert.equal(legacy[0].pairAddress,null,'legacy chain:token format must remain supported');

for(const chain of ['solana','ethereum','base','bsc'])assert(providers.publicRpcFor(chain),`missing keyless RPC for ${chain}`);

const topicAddress=a=>'0x'+a.toLowerCase().replace(/^0x/,'').padStart(64,'0');
const pool='0x2222222222222222222222222222222222222222';
const wallet='0x3333333333333333333333333333333333333333';
const token='0x1111111111111111111111111111111111111111';
const transferTopic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const outLog={transactionHash:'0xabc',logIndex:'0x1',blockNumber:'0x64',topics:[transferTopic,topicAddress(pool),topicAddress(wallet)],data:'0x0de0b6b3a7640000'};
const out=providers.parsePublicEvmLog(outLog,{chain:'ethereum',address:token,pairAddress:pool,symbol:'UNI'},{decimals:18,latestBlock:100,now:Date.now()});
assert(out,'expected parsed EVM transfer');
assert.equal(out.direction,'dex-outflow');
assert.equal(out.amountToken,1);
assert.equal(out.symbol,'UNI');
const inLog={...outLog,transactionHash:'0xdef',logIndex:'0x2',topics:[transferTopic,topicAddress(wallet),topicAddress(pool)]};
const incoming=providers.parsePublicEvmLog(inLog,{chain:'ethereum',address:token,pairAddress:pool,symbol:'UNI'},{decimals:18,latestBlock:100,now:Date.now()});
assert.equal(incoming.direction,'dex-inflow');

const solTx={
  blockTime:Math.floor(Date.now()/1000),
  transaction:{signatures:['sig1'],message:{accountKeys:[{pubkey:'FeePayer'},{pubkey:'TopTokenAcct'}]}},
  meta:{
    preTokenBalances:[{accountIndex:1,mint:'Mint111',owner:'WhaleOwner',uiTokenAmount:{uiAmount:10}}],
    postTokenBalances:[{accountIndex:1,mint:'Mint111',owner:'WhaleOwner',uiTokenAmount:{uiAmount:15}}]
  }
};
const sr=providers.parseSolanaWhaleDelta(solTx,{chain:'solana',address:'Mint111',symbol:'BONK'},'TopTokenAcct');
assert(sr,'expected Solana whale delta');
assert.equal(sr.direction,'wallet-inflow');
assert.equal(sr.amountToken,5);
assert.equal(sr.toAddress,'WhaleOwner');

const agg=aggregate.aggregateFlows([{...sr,amountUsd:250000,confidence:58}],{now:Date.now(),themeForToken:()=> 'MEME'});
assert.equal(agg.tokenFlows.length,1);
assert(agg.tokenFlows[0].netFlow1hUsd>0,'wallet inflow should contribute positive net flow');
assert(agg.tokenFlows[0].walletVolatility>=0&&agg.tokenFlows[0].walletVolatility<=100,'wallet volatility bounded');

console.log('keyless public onchain provider behavior PASS');
