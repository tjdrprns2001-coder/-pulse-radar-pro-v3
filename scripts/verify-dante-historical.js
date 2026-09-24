'use strict';
const assert=require('assert');
const H=require('../lib/dante/historical-data.js');
function k(open,price){return[open,String(price),String(price+2),String(price-2),String(price+1),'10',open+86399999,'100',10,'5','50','0']}
(async()=>{
  const day=86400000,start=Date.parse('2021-01-01T00:00:00Z'),end=start+5*day-1;
  let calls=0;
  const pages=[
    [k(start+3*day,103),k(start+4*day,104),k(start+5*day,105)],
    [k(start,100),k(start+day,101),k(start+2*day,102),k(start+3*day,103)]
  ];
  const provider={async getKlinesAt(symbol,tf,{endTime,rows}){calls++;assert.equal(symbol,'BTCUSDT');assert.equal(tf,'1d');assert.equal(rows,3);return pages[calls-1]||[]}};
  const r=await H.fetchHistoricalDaily(provider,{symbol:'btcusdt',startTs:start,endTs:end,pageSize:3,maxPages:4});
  assert.equal(calls,2);
  assert.equal(r.rows.length,5,'end boundary excludes candle closing after requested end');
  assert.deepEqual(r.rows.map(x=>x.openTime),[start,start+day,start+2*day,start+3*day,start+4*day]);
  assert.equal(r.complete,true);
  assert.equal(r.rows[0].partial,false);
  assert.throws(()=>H.normalizeKline([1,2]),/invalid Binance kline/);
  console.log('dante historical data PASS');
})().catch(e=>{console.error(e);process.exit(1)});