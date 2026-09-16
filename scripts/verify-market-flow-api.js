const assert=require('assert');
const fs=require('fs');
const api=require('../api/market-flow');
const payload=api._buildFrom({providerHealth:{dexscreener:'live',geckoterminal:'down',binance:'live'},dexFlows:[{baseAsset:'BTC',volume1hUsd:100}],cexFlows:[{baseAsset:'BTC',venue:'Binance',quoteAsset:'USDT',quoteVolumeUsd:1000,priceUsd:100}],onchainThemeFlows:[]});
assert(payload.updatedAt);assert.equal(payload.stale,false);assert(Array.isArray(payload.dexFlows));assert(Array.isArray(payload.cexFlows));assert(Array.isArray(payload.tokenFlows));assert(Array.isArray(payload.themeFlows));assert(payload.providerHealth.geckoterminal==='down');assert(payload.coverage);
assert(fs.readFileSync('netlify.toml','utf8').includes('/api/market-flow'));
assert(fs.readFileSync('vercel.json','utf8').includes('market-flow'));
assert(fs.existsSync('netlify/functions/market-flow.js'));
console.log('market flow api PASS');