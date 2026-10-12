'use strict';
const assert=require('node:assert/strict');
const D=require('../lib/coin-scan/dna-preset-v2.js');
const start=Date.UTC(2026,9,1);
function candles(tf,size=160,pump=false){
 const ms={ '4h':14400000,'1h':3600000,'15m':900000,'5m':300000,'1d':86400000 }[tf];
 return Array.from({length:size},(_,i)=>{const price=pump&&i===size-1?104:100,volume=pump&&i===size-1?500:100;return [start+i*ms,price===104?100:100,price+.2,price-1,price,volume,start+(i+1)*ms-1,price*volume,1,volume/2,price*volume/2,0]});
}
const frames={'4h':candles('4h',160,true),'1h':candles('1h',160),'15m':candles('15m',160),'5m':candles('5m',180)};
const asOf=frames['4h'].at(-1)[6]+1;
const plain=D.evaluate({frames,asOf,row:{priceChange24h:6,spotPriceChange24h:5},market:{btc24hChange:2}});
assert.equal(plain.stage,'IGNITION_CONFIRM');
assert.equal(plain.type,'B','Missing OI must never block B flow breakout');
assert.equal(plain.indicators.breakout4h,true);
assert.equal(plain.indicators.emaWidthPct<5,true);
assert.equal(plain.indicators.btcRelative24hPp,4);
assert(plain.missing.includes('OI_OPTIONAL_UNAVAILABLE'));
assert.equal(plain.indicators.m5.notTradePermission,true);
const compressed=D.evaluate({frames:{...frames,'4h':candles('4h',160,false)},asOf,row:{priceChange24h:0},market:{btc24hChange:0}});
assert.equal(compressed.stage,'WAIT','Compression alone must never yield PRE watch');
const a=D.evaluate({frames,asOf,row:{oi4hPct:1.3,priceChange24h:6}});
assert.equal(a.type,'A+B','OI+flow coexist');
const c=D.evaluate({frames,asOf,row:{oi4hPct:-1,oi1hPct:.4,oiDrawdownPct:-2.5}});
assert.equal(c.type,'C','Cleanup needs both decrease and rebuild');
const prev=D.evaluate({frames,asOf:frames['4h'].at(-1)[0],row:{priceChange24h:2}});
assert.equal(prev.indicators.breakout4h,false,'Must not access future unclosed breakout candle');
const late=D.evaluate({frames,asOf,row:{priceChange24h:26,oi4hPct:-1}});
assert.equal(late.stage,'EXTENDED','Already-pumped must not be promoted');
const missing=D.evaluate({frames:{'4h':candles('4h',60)},asOf,row:{}});
assert.equal(missing.status,'INCOMPLETE');
assert.deepEqual(D.registry.active.map(x=>x.id),['BASE_RECLAIM','FLOW_BREAKOUT','OI_LEAD','CLEAN_REBUILD']);
assert(D.registry.retiredFromActive.some(x=>x.id==='EMA_COMPRESSION_ONLY'));
async function checkWiring(){
 const E=require('../lib/coin-scan/astra-auto-scanner.js');
 const p={
   getFuturesUniverse:async()=>({symbols:[{symbol:'RSRUSDT',baseAsset:'RSR',quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING'}]}),
   getFuturesTickers:async()=>[{symbol:'RSRUSDT',lastPrice:'104',quoteVolume:'12345000',priceChangePercent:'6',closeTime:asOf}],
   getFuturesKlines:async(_,tf)=>tf==='4h'?frames['4h']:tf==='1d'?candles('1d',500):frames[tf]||[],
   getV2OiProfile:async()=>({oi4hPct:null,oi1hPct:null,oiDrawdownPct:null,rows:[]}),
   getV2TakerSeries:async()=>[],getFundingMap:async()=>new Map(),
   getSpotTickers:async()=>[{symbol:'RSRUSDT',lastPrice:'104',quoteVolume:'12345000',priceChangePercent:'5'}]
 };
 const scan=E.createAstraAutoScanner({provider:p,now:()=>asOf});
 assert.equal(E.methodOf('dna'),'dna');
 const uni=await scan.universe({method:'dna',minQuoteVolume:0});
 assert.equal(uni.filteredCount,1);
 const pres=await scan.prescan(['RSRUSDT'],{asOf,method:'dna',market:{btc24hChange:2}});
 assert.equal(pres.items[0].status,'OK');
 const oi=await scan.oi(['RSRUSDT'],{asOf,method:'dna'});
 assert.equal(oi.items[0].pass,true,'Missing OI must not suppress DNA deep scan');
 const deep=await scan.deep(['RSRUSDT'],{asOf,method:'dna',market:{btc24hChange:2}});
 assert.equal(deep.items.length,1);
 assert.equal(deep.items[0].dnaPreset.type,'B');
 assert.equal(deep.items[0].verdict.dnaPreset.version,D.VERSION);
 console.log('DNA v2: evaluator & API prescan/oi/deep integration tests passed');
}
checkWiring().catch(e=>{console.error(e);process.exitCode=1});
