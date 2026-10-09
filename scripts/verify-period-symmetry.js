'use strict';
// Run: node scripts/verify-period-symmetry.js
const assert=require('node:assert/strict');
const handler=require('../api/period-symmetry');
const saved=global.fetch;
function candles(count=750){
 return Array.from({length:count},(_,i)=>{
  const base=i<300?140-i*.20:i<500?80+(i-300)*.02:84+Math.sin(i/9)*2;
  const open=base,close=base+(i%2?.2:-.2),h=Math.max(open,close)+.5,l=Math.min(open,close)-.5;
  let now=Date.now(),start=now-(count-i+1)*86400000;
  return [start,String(open),String(h),String(l),String(close),'1000',start+86399999,'5000'];
 });
}
async function run(){
 const chart=candles(),calls=[];
 global.fetch=async url=>{
  calls.push(url);
  let data=url.includes('exchangeInfo')?{symbols:[{symbol:'TESTUSDT',status:'TRADING',quoteAsset:'USDT',contractType:'PERPETUAL',underlyingType:'COIN'}]}:url.includes('ticker/24hr')?[{symbol:'TESTUSDT',priceChangePercent:'1',quoteVolume:'20000'}]:url.includes('klines')?chart: url.includes('openInterestHist')?[]:[];
  return {ok:true,json:async()=>data};
 };
 function request(query){return new Promise(resolve=>{const res={setHeader(){},status(code){this.code=code;return this},json(body){resolve({code:this.code,body});return this}};handler({query},res)})}
 try{
  const u=await request({mode:'universe'});assert.equal(u.code,200);assert.equal(u.body.symbols.length,1);
  const x=await request({symbols:'TESTUSDT',deep:'false'});assert.equal(x.code,200);assert.equal(x.body.results.length,1);
  assert.ok(['PRE','BREAKOUT','RETEST_WATCH','ABOVE_BOX_UNCONFIRMED','EXTENDED','WAIT','NO_PATTERN'].includes(x.body.results[0].stage));
  const bad=await request({symbols:'!!!'});assert.equal(bad.code,400);
  console.log('Period-symmetry mocked API checks passed (universe, daily scan, invalid symbol)');
 }finally{global.fetch=saved}
}
run().catch(e=>{console.error(e);process.exitCode=1});
