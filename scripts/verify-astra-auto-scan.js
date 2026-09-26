'use strict';
const assert=require('assert');
const Astra=require('../lib/coin-scan/astra-auto-scanner.js');

function klineSeries({base=.1,count=160,step=.00005,volume=1000,lastVolume=4000,tfMs=300000}){
  const now=Date.now()-tfMs*(count+2);const out=[];let p=base;
  for(let i=0;i<count;i++){const o=p,h=p*1.002,l=p*.998,c=p+step,v=i===count-1?lastVolume:volume;out.push([now+i*tfMs,String(o),String(h),String(l),String(c),String(v),now+(i+1)*tfMs-1,'0',1,'0','0','0']);p=c}
  return out;
}
const universe={symbols:[
  {symbol:'AAAUSDT',status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT',baseAsset:'AAA'},
  {symbol:'BBBUSDT',status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT',baseAsset:'BBB'},
  {symbol:'CCCUSDT',status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT',baseAsset:'CCC'},
  {symbol:'AAABUSD',status:'TRADING',contractType:'PERPETUAL',quoteAsset:'BUSD',baseAsset:'AAA'}
]};
const tickers=[
  {symbol:'AAAUSDT',lastPrice:'0.1',priceChangePercent:'1.2',quoteVolume:'12000000',closeTime:Date.now()},
  {symbol:'BBBUSDT',lastPrice:'0.2',priceChangePercent:'11.2',quoteVolume:'90000000',closeTime:Date.now()},
  {symbol:'CCCUSDT',lastPrice:'0.3',priceChangePercent:'0.2',quoteVolume:'2500000',closeTime:Date.now()}
];
const provider={
  async getFuturesUniverse(){return universe},async getFuturesTickers(){return tickers},async getSpotTickers(){return[{symbol:'AAAUSDT',priceChangePercent:'1.1'}]},
  async getFundingMap(){return new Map([['AAAUSDT',.01]])},
  async getV2OiProfile(symbol){return symbol==='AAAUSDT'?{oi1hPct:.4,oi4hPct:1.5,oi8hPct:2.1,oi12hPct:2.4,oi24hPct:4}:{oi4hPct:.2}},
  async getV2TakerSeries(_symbol,period){const ms=period==='5m'?300000:900000,now=Date.now()-ms*8;return Array.from({length:8},(_,i)=>({timestamp:now+i*ms,buyVol:150,sellVol:100,ratio:1.5}))},
  async getFuturesKlines(_symbol,tf){const ms=({ '5m':300000,'15m':900000,'1h':3600000,'2h':7200000,'4h':14400000,'12h':43200000,'1d':86400000,'3d':259200000,'1w':604800000 })[tf];return klineSeries({tfMs:ms,lastVolume:4500})},
  async mapLimitWith(items,workers,fn){const src=[...items],out=[];for(let i=0;i<src.length;i++)out.push(await fn(src[i],i));return out}
};
(async()=>{
  const scan=Astra.createAstraAutoScanner({provider});
  const u=await scan.universe();
  assert.equal(u.universeCount,3,'USDT perpetual universe count');
  assert.equal(u.filteredCount,1,'Astra price/liquidity filter');
  assert.equal(u.items[0].symbol,'AAAUSDT');
  const o=await scan.oi(['AAAUSDT']);
  assert.equal(o.items[0].pass,true,'4H OI +1 gate');
  const d=await scan.deep(['AAAUSDT']);
  assert.equal(d.items.length,1);
  assert.equal(d.items[0].verdict.key,'IGNITION_CONFIRMED','strict RVOL+taker+OI ignition gate');
  assert(d.items[0].tf['15m'].rvol>=3,'15m confirmed-candle RVOL');
  assert(d.items[0].tf['5m'].rvol>=3,'5m confirmed-candle RVOL');
  assert.equal(Astra.CONFIG.minQuoteVolume,10_000_000);
  assert.equal(Astra.CONFIG.maxAbs24hPct,10);
  console.log('astra auto scan verification passed');
})().catch(e=>{console.error(e);process.exit(1)});
