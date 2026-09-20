const assert=require('assert');
const m=require('../lib/multi-futures-data.js');

assert.equal(m.cleanBase('XBT'),'BTC','XBT must normalize to BTC');
assert.equal(m.cleanBase('1000PEPE'),'PEPE','multiplier perp must normalize to underlying');
assert.equal(m.userBase('BTC-USDT-SWAP'),'BTC');
assert.equal(m.userBase('XBTUSDTM'),'BTC');
assert.equal(m.classifyAssetClass('TradFi','EQUITY'),'tradfi');
assert.equal(m.classifyAssetClass('Crypto','COIN'),'crypto');
assert.equal(m.obviousTradfiBase('XAG'),true);

const markets=[
  m.standard('binance',{symbol:'BTCUSDT',baseAsset:'BTC',lastPrice:80000,priceChangePercent:2,quoteVolume24h:100000000}),
  m.standard('bybit',{symbol:'BTCUSDT',baseAsset:'BTC',lastPrice:80010,priceChangePercent:2.1,quoteVolume24h:90000000}),
  m.standard('okx',{symbol:'BTC-USDT-SWAP',baseAsset:'BTC',lastPrice:79990,priceChangePercent:1.9,quoteVolume24h:80000000}),
  m.standard('kucoin',{symbol:'XBTUSDTM',baseAsset:'XBT',lastPrice:80005,priceChangePercent:2.0,quoteVolume24h:40000000}),
  m.standard('binance',{symbol:'1000PEPEUSDT',baseAsset:'1000PEPE',lastPrice:.007,priceChangePercent:5,quoteVolume24h:20000000}),
  m.standard('gate',{symbol:'PEPE_USDT',baseAsset:'PEPE',lastPrice:.000007,priceChangePercent:5.2,quoteVolume24h:10000000}),
  m.standard('bybit',{symbol:'ALTUSDT',baseAsset:'ALT',lastPrice:.25,priceChangePercent:1,quoteVolume24h:8000000}),
  m.standard('okx',{symbol:'ALT-USDT-SWAP',baseAsset:'ALT',lastPrice:.251,priceChangePercent:1.2,quoteVolume24h:7000000}),
  m.standard('hyperliquid',{symbol:'HYPE',baseAsset:'HYPE',quoteAsset:'USDC',lastPrice:40,priceChangePercent:3,quoteVolume24h:50000000}),
  m.standard('okx',{symbol:'SKHYNIX-USDT-SWAP',baseAsset:'SKHYNIX',lastPrice:1300,priceChangePercent:.1,quoteVolume24h:20000000,assetClass:'tradfi'}),
  m.standard('gate',{symbol:'SKHYNIX_USDT',baseAsset:'SKHYNIX',lastPrice:1301,priceChangePercent:.2,quoteVolume24h:10000000}),
  m.standard('gate',{symbol:'XAG_USDT',baseAsset:'XAG',lastPrice:66,priceChangePercent:.3,quoteVolume24h:9000000})
].filter(Boolean);

const merged=m.mergeMarkets(markets);
assert.equal(merged.length,4,'crypto contracts should dedupe while tradfi groups are excluded');
assert(!merged.some(x=>x.baseAsset==='SKHYNIX'||x.baseAsset==='XAG'),'tradfi perps must not inflate crypto universe');
const btc=merged.find(x=>x.baseAsset==='BTC');
assert(btc,'BTC must exist');
assert.equal(btc.exchangeCount,4,'BTC exchange coverage should merge');
assert.equal(btc.symbol,'BTCUSDT','Binance contract should be preferred for deep analysis');
assert.equal(btc.deepSupported,true);
assert.equal(btc.contracts.length,4);
assert(btc.quoteVol24>=310000000,'cross-exchange quote volume should aggregate');

const pepe=merged.find(x=>x.baseAsset==='PEPE');
assert(pepe&&pepe.exchangeCount===2,'1000PEPE and PEPE contracts should dedupe');
assert.equal(pepe.symbol,'1000PEPEUSDT','Binance native contract stays usable for detail');

const alt=merged.find(x=>x.baseAsset==='ALT');
assert(alt&&alt.exchangeCount===2);
assert.equal(alt.deepSupported,false,'external-only asset must not claim Binance deep support');

const hype=merged.find(x=>x.baseAsset==='HYPE');
assert(hype&&hype.deepSupported===false,'Hyperliquid-only asset remains catalogued but external-only');

const ranked=m.rankRows(merged,1_000_000);
assert.equal(ranked.length,4);
assert(ranked.every(x=>typeof x.preScore==='number'&&typeof x.surgeScore==='number'));
assert(ranked.filter(x=>x.pass).length===4);

console.log('multi futures universe PASS');
