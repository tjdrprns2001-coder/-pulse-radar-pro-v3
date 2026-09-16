const assert=require('assert');
const labels=require('../lib/onchain/labels.js');
const evm=require('../lib/onchain/evm.js');
const sol=require('../lib/onchain/solana.js');
const agg=require('../lib/onchain/aggregate.js');

labels.registerTrusted('ethereum','0xexchange','Example Exchange','exchange');
labels.registerTrusted('ethereum','0xdex','Example DEX','dex');

const e=evm.normalizeEvmTransfer({hash:'0xabc',blockTimestamp:'2026-09-16T12:00:00Z',contractAddress:'0xtoken',from:'0xwallet',to:'0xexchange',value:200000,asset:'TOK',usdValue:250000,logIndex:1},{chain:'ethereum'});
assert.equal(e.chain,'ethereum');assert.equal(e.toType,'exchange');assert.equal(e.direction,'exchange-inflow');assert.equal(e.amountUsd,250000);
const s=sol.normalizeSolanaTransfer({signature:'sig1',timestamp:'2026-09-16T12:00:00Z',mint:'mint1',from:'wallet1',to:'wallet2',amount:10,symbol:'SOLX',usdValue:120000,index:0},{chain:'solana'});
assert.equal(s.chain,'solana');assert.equal(s.amountUsd,120000);

const now=Date.parse('2026-09-16T12:30:00Z');
const records=[e,s,{...e,txHash:'0xdef',eventIndex:2,timestamp:'2026-09-16T12:10:00Z',fromAddress:'0xexchange',toAddress:'0xwallet2',fromType:'exchange',toType:'unlabeled-wallet',direction:'exchange-outflow',amountUsd:50000}];
const out=agg.aggregateFlows(records,{now,themeForToken:()=> 'DeFi'});
assert(out.tokenFlows.length>=2);
const tok=out.tokenFlows.find(x=>x.tokenAddress==='0xtoken');
assert(tok.netFlow1hUsd!==undefined);assert(tok.largeWalletNetFlowUsd!==undefined);assert(tok.walletVolatility>=0&&tok.walletVolatility<=100);
assert(out.themeFlows.some(x=>x.theme==='DeFi'));
assert.equal(agg.isLargeTransfer({amountUsd:100000}),true);assert.equal(agg.isVeryLargeTransfer({amountUsd:1000000}),true);
console.log('onchain core behavior PASS');
