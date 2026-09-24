'use strict';
const assert=require('assert');
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
function resp(data,status=200){return{ok:status>=200&&status<300,status,json:async()=>data}}
const calls=[];
const fetchImpl=async url=>{
 const u=String(url);calls.push(u);
 if(u.includes('/api/v3/ticker/bookTicker'))return resp({bidPrice:'99.99',askPrice:'100.01'});
 if(u.includes('/api/v3/depth'))return resp({bids:[['99.99','1000'],['99.95','1000']],asks:[['100.01','1000'],['100.05','1000']]});
 if(u.includes('/fapi/v1/ticker/bookTicker'))return resp({bidPrice:'100.04',askPrice:'100.06'});
 if(u.includes('/fapi/v1/depth'))return resp({bids:[['100.04','1000'],['100.00','1000']],asks:[['100.06','1000'],['100.10','1000']]});
 return resp({},404);
};
(async()=>{
 const p=createBinanceProvider({fetchImpl,now:()=>1800000000000,bases:['https://spot.test'],futuresBases:['https://futures.test']});
 const x=await p.getExecutionContext('BTCUSDT',{spotListed:true,futuresListed:true});
 assert(x.spot.available&&x.futures.available);
 assert(x.spot.spreadBps>0&&x.spot.spreadBps<5);
 assert(x.spot.depthUsd.bid10bps>100000);
 const buy50=x.spot.slippage.buy.find(y=>y&&y.notional===50000);assert(buy50&&buy50.slippageBps<10);
 assert(x.futures.depthUsd.ask10bps>100000);
 assert(calls.some(x=>x.includes('/api/v3/depth'))&&calls.some(x=>x.includes('/fapi/v1/depth')));
 console.log('execution context PASS');
})().catch(e=>{console.error(e);process.exit(1)});
