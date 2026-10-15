'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {MARKET_ROW_FIELDS,summarizeRow,summarizeMarket}=require('../lib/market-summary');

const symbols=['BTCUSDT','XPINUSDT','QUSDT'];
const fixture=symbols.map((symbol,i)=>({
 symbol,baseAsset:symbol.slice(0,-4),
 market:i===0?'spot':'futures',
 price:i===0?81000:0.14,
 change24:i===0?1.23:-4.5,quoteVol24:i===0?500000000:3000000,
 preScore:37.6,surgeScore:51,preRank:i+1,preTopPct:10,
 pass:true,exchangeCount:3,exchanges:['binance','bybit','okx'],
 primaryExchange:'binance',hasFutures:true,futuresExchangeCount:3,
 deepSupported:i!==2,detailSymbol:symbol,
 dataStatus:i===1?'symbol-only':'live',
 candles:Array(600).fill({open:1,close:2,volume:300}),
 overDetailedStructure:{fvg:Array(90).fill({start:123,stop:456})}
}));
fixture[2].price=null;
fixture[2].preRank=null;
const input={ok:true,total:3,updatedAt:'2026-10-15T08:00:00.000Z',futuresFeedOk:true,results:fixture};
const original=JSON.stringify(input);
const result=summarizeMarket(input);
assert.notEqual(result,input,'summary is a copy');
assert.equal(JSON.stringify(input),original,'full market response is not mutated');
assert.equal(result.ok,true);
assert.equal(result.view,'summary');
assert.equal(result.total,3);
assert.equal(result.updatedAt,input.updatedAt);
assert.equal(result.futuresFeedOk,true);
assert.equal(result.results.length,3);
for(let i=0;i<3;i++){
  const a=result.results[i],b=fixture[i];
  for(const key of MARKET_ROW_FIELDS){
    assert.deepEqual(a[key],b[key],key+' should preserve list field');
  }
  assert.equal(a.candles,undefined,'raw historical candles must not leak into list');
  assert.equal(a.overDetailedStructure,undefined,'extended structure must remain for full endpoint');
}
assert.equal(result.results[2].price,null,'unknown price must remain null');
assert.equal(result.results[2].preRank,null,'unknown rank must remain null');
assert.ok(JSON.stringify(result).length<JSON.stringify(input).length*0.25,'summary should substantially reduce typical extended rows');
assert.deepEqual(summarizeRow({symbol:'DOGEUSDT',surgeScore:null}),{symbol:'DOGEUSDT',surgeScore:null});
assert.equal(summarizeMarket({ok:false,error:'rate limit'}).ok,false);

const root=path.resolve(__dirname,'..');
const handler=fs.readFileSync(path.join(root,'handlers/market.js'),'utf8');
const home=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.ok(handler.includes("req.query?.view==='summary'?summarizeMarket(response):response"),'full market consumers unaffected without opt-in');
assert.ok(home.includes('/api/market?minVolume=500000&view=summary'),'dashboard opts in explicitly');
assert.ok(home.includes("fmtUsd(r.quoteVol24)"),'dashboard marks unknown volume rather than fake zero');
console.log('PASS opt-in lightweight market payload: default untouched, row contract, null-safe, significant fixture payload savings');
