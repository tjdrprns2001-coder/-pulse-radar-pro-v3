const assert=require('assert');
const cex=require('../lib/market-flow/cex');

const a=cex.normalizeCexTicker({symbol:'BTCUSDT',lastPrice:'100',quoteVolume:'1000000',priceChangePercent:'2'},'Binance','spot');
assert.equal(a.baseAsset,'BTC');assert.equal(a.quoteAsset,'USDT');assert.equal(a.quoteVolumeUsd,1000000);assert.equal(a.change24hPct,2);
const b=cex.normalizeCexTicker({market:'KRW-BTC',trade_price:145000000,acc_trade_price_24h:50000000000,signed_change_rate:.01},'Upbit','spot',{usdKrw:1450});
assert.equal(b.baseAsset,'BTC');assert.equal(b.quoteAsset,'KRW');assert(Math.abs(b.priceUsd-100000)<1);assert(b.quoteVolumeUsd>0);assert.equal(b.change24hPct,1);
const direct=cex.normalizeCexTicker({instId:'SOL-USDT',last:'200',quoteVolume:'500000',change24h:'3.5'},'OKX','spot');
assert.equal(direct.change24hPct,3.5);
const bybit=cex.normalizeCexTicker({symbol:'SOLUSDT',lastPrice:'200',turnover24h:'500000',price24hPcnt:'0.025'},'Bybit','spot');
assert.equal(bybit.change24hPct,2.5);
const c=cex.normalizeCexTicker({market:'KRW-XRP',trade_price:4000},'Upbit','spot',{});assert.equal(c.quoteVolumeUsd,null);assert.equal(c.priceUsd,null);
const cmp=cex.compareCexMarkets([
 {...a,priceUsd:100,quoteVolumeUsd:1000},
 {...a,venue:'OKX',priceUsd:101,quoteVolumeUsd:3000}
]);
assert.equal(cmp.length,1);assert.equal(cmp[0].venueCount,2);assert.equal(cmp[0].venueVolumeShares.OKX,.75);assert(Math.abs(cmp[0].priceSpreadPct-.995)<.01);
console.log('market flow cex PASS');
