'use strict';
const assert=require('assert');
const Intel=require('../lib/coin-scan/market-intelligence-provider.js');
const Cross=require('../lib/coin-scan/cross-indicator-provider.js');
const {createScanService}=require('../lib/coin-scan/scan-service.js');
const handler=require('../api/coin-scan.js');

assert.equal(Intel.normalizeSymbol('BTC-USDT-SWAP'),'BTCUSDT');
assert.equal(Intel.normalizeSymbol('BTC_USDT'),'BTCUSDT');
assert.equal(Intel.normalizeSymbol('XBTUSDTM'),'BTCUSDT');
assert.equal(Intel.normalizeSymbol('tBTCUSD'),'BTCUSDT');

const calls=[];
function resp(data,status=200){return{ok:status>=200&&status<300,status,json:async()=>data}}
function risingRows(n=140){
 const out=[];for(let i=0;i<n;i++){const p=100+i*.2;out.push([String(1700000000000+i*3600000),String(p-.1),String(p+.4),String(p-.4),String(p),String(1000+i*3)])}return out
}
const fetchImpl=async(url,opts={})=>{
 calls.push(String(url));const u=String(url);
 if(u.includes('bybit.com/v5/market/tickers?category=spot'))return resp({retCode:0,result:{list:[{symbol:'BTCUSDT',lastPrice:'100',turnover24h:'1000000',price24hPcnt:'0.01'}]}});
 if(u.includes('bybit.com/v5/market/tickers?category=linear'))return resp({retCode:0,result:{list:[{symbol:'BTCUSDT',lastPrice:'100.1',turnover24h:'2000000',price24hPcnt:'0.011',openInterest:'10',fundingRate:'0.0001'}]}});
 if(u.includes('okx.com/api/v5/market/tickers?instType=SPOT'))return resp({code:'0',data:[{instId:'BTC-USDT',last:'100.05',open24h:'99',volCcy24h:'900000'}]});
 if(u.includes('okx.com/api/v5/market/tickers?instType=SWAP'))return resp({code:'0',data:[{instId:'BTC-USDT-SWAP',last:'100.12',open24h:'99',volCcy24h:'1900000'}]});
 if(u.includes('gateio.ws/api/v4/spot/tickers'))return resp([]);
 if(u.includes('gateio.ws/api/v4/futures/usdt/tickers'))return resp([]);
 if(u.includes('bitget.com/api/v2/spot/market/tickers'))return resp({data:[]});
 if(u.includes('bitget.com/api/v2/mix/market/tickers'))return resp({data:[]});
 if(u.includes('api.mexc.com/api/v3/ticker/24hr'))return resp([]);
 if(u.includes('contract.mexc.com/api/v1/contract/ticker'))return resp({data:[]});
 if(u.includes('api.kucoin.com/api/v1/market/allTickers'))return resp({data:{ticker:[]}});
 if(u.includes('api-futures.kucoin.com/api/v1/contracts/active'))return resp({data:[]});
 if(u.includes('api.huobi.pro/market/tickers'))return resp({data:[]});
 if(u.includes('api-pub.bitfinex.com/v2/tickers'))return resp([]);
 if(u.includes('api.hyperliquid.xyz/info'))return resp([{universe:[]},[]]);
 if(u.includes('dexscreener.com/latest/dex/search'))return resp({pairs:[
  {chainId:'ethereum',dexId:'uni',pairAddress:'P1',baseToken:{symbol:'BTC',address:'0xbtc'},priceUsd:'100',liquidity:{usd:500000},volume:{h24:100000}},
  {chainId:'ethereum',dexId:'sushi',pairAddress:'P2',baseToken:{symbol:'BTC',address:'0xbtc'},priceUsd:'100.2',liquidity:{usd:300000},volume:{h24:50000}}
 ]});
 if(u.includes('cryptocompare.com/data/v2/news'))return resp({Data:[{id:'1',published_on:1700000000,title:'BTC network upgrade announced',body:'BTC upgrade',categories:'BTC|Blockchain',source_info:{name:'TestNews'},url:'https://example.com/news'}]});
 if(u.includes('bybit.com/v5/market/kline'))return resp({retCode:0,result:{list:risingRows().slice().reverse()}});
 if(u.includes('okx.com/api/v5/market/candles'))return resp({code:'0',data:risingRows().slice().reverse()});
 if(u.includes('gateio.ws/api/v4/futures/usdt/candlesticks'))return resp(risingRows().map(x=>({t:String(Number(x[0])/1000),o:x[1],h:x[2],l:x[3],c:x[4],v:x[5]})));
 return resp({},404);
};

(async()=>{
 const intel=Intel.createMarketIntelligenceProvider({fetchImpl,now:()=>1800000000000,env:{}});
 const c1=await intel.getCexCrossCheck('BTCUSDT',{binanceSpotTicker:{lastPrice:'100',quoteVolume:'5000000',priceChangePercent:'1'},binanceFuturesTicker:{lastPrice:'100.1',quoteVolume:'6000000',priceChangePercent:'1.1'}});
 assert(c1.available);assert(c1.exchangeCount>=3,'Binance + Bybit + OKX expected');assert(c1.spotCount>=3);assert(c1.derivativesCount>=3);assert(Number.isFinite(c1.maxPriceDispersionPct));
 const before=calls.filter(x=>x.includes('bybit.com/v5/market/tickers')).length;
 await intel.getCexCrossCheck('ETHUSDT');
 const after=calls.filter(x=>x.includes('bybit.com/v5/market/tickers')).length;
 assert.equal(after,before,'exchange snapshot must be shared/coalesced across symbols for TTL window');
 const dex=await intel.dex('BTCUSDT');assert(dex.available);assert.equal(dex.contractVerification.verified,true);assert.equal(dex.contractVerification.address,'0xbtc');
 const news=await intel.news('BTCUSDT');assert.equal(news.count,1);assert(intel.deriveNewsEvents(news).length===1);
 const events=await intel.scheduledEvents('BTCUSDT');assert.equal(events.available,false);assert.equal(events.reason,'API_KEY_NOT_CONFIGURED');
 const wallets=await intel.walletMovements('BTCUSDT');assert.equal(wallets.available,false);assert.equal(wallets.reason,'API_KEY_NOT_CONFIGURED');
 const verify=intel.walletVerification(wallets,dex);assert.equal(verify.tokenContractVerified,true);

 const cross=Cross.createCrossIndicatorProvider({fetchImpl});
 const ci=await cross.get('BTCUSDT');assert(ci.available);assert.equal(ci.summary.sourceCount,3);assert(ci.timeframes['1h'].rsiMedian>50);assert(ci.timeframes['1h'].emaBullBreadth>=2);assert(ci.timeframes['1h'].macdBullBreadth>=2);

 const ex={symbols:[{symbol:'BTCUSDT',baseAsset:'BTC',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true}]},tk=[{symbol:'BTCUSDT',lastPrice:'100',quoteVolume:'1000000',priceChangePercent:'1'}];
 const provider={
  async getSpotUniverse(){return ex},async getSpotTickers(){return tk},async getFuturesUniverse(){return{symbols:[]}},async getFuturesTickers(){return[]},
  async getDetailedMarketIntelligence(symbol){return{symbol,coverage:{cex:true}}}
 };
 const service=createScanService({provider,now:()=>1800000000000});
 const detail=await service.getMarketIntelligence('BTCUSDT');assert.equal(detail.binanceListed,true);assert.equal(detail.marketScope,'spot');
 let rejected=false;try{await service.getMarketIntelligence('NOTUSDT')}catch(e){rejected=e.statusCode===404}assert(rejected,'non-Binance symbol must be rejected');

 const apiService={async getMarketIntelligence(symbol){return{status:'ok',mode:'intelligence',symbol,intelligence:{coverage:{cex:true}}}}};
 let code=0,body=null,headers={};const res={setHeader(k,v){headers[k]=v},status(n){code=n;return this},json(v){body=v;return v}};
 await handler({query:{mode:'intelligence',symbol:'BTCUSDT'}},res,{service:apiService});
 assert.equal(code,200);assert.equal(body.mode,'intelligence');assert.equal(body.symbol,'BTCUSDT');
 console.log('market intelligence PASS');
})().catch(e=>{console.error(e);process.exit(1)});
