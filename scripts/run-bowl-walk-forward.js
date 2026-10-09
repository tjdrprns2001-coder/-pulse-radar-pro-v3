'use strict';
// Usage: node scripts/run-bowl-walk-forward.js BTCUSDT ETHUSDT SOLUSDT --tf=1d
// Read-only study, never submits orders. Uses only Binance USDT futures direct klines.
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {evaluateBowlWalkForward}=require('../lib/research-backtest-v2/bowl-walk-forward.js');
async function main(argv=process.argv.slice(2)){
 const tf=(argv.find(s=>s.startsWith('--tf='))||'--tf=1d').slice(5),symbols=argv.filter(x=>!x.startsWith('--')).map(s=>s.toUpperCase()).slice(0,8);
 const lim=Math.min(1500,Math.max(750,Number((argv.find(s=>s.startsWith('--limit='))||'--limit=1200').slice(8))||1200));
 if(!['1d','4h'].includes(tf)||!symbols.length||symbols.some(x=>!/^([A-Z0-9]{2,25})USDT$/.test(x)))
  throw new Error('Usage: node scripts/run-bowl-walk-forward.js BTCUSDT ETHUSDT --tf=1d --limit=1200');
 const provider=createBinanceProvider({disableFuturesFallback:true}),asOf=Date.now(),results=[];
 for(const symbol of [...new Set(symbols)]){
  try{
   const candles=await provider.getFuturesKlines(symbol,tf,lim);
   if(candles._source!=='BINANCE_FUTURES')throw new Error('PROVENANCE_MISMATCH');
   results.push(evaluateBowlWalkForward({symbol,rows:candles,asOf,timeframe:tf,source:'BINANCE_FUTURES'}));
  }catch(error){results.push({symbol,timeframe:tf,status:'UNAVAILABLE',reason:String(error?.message||error)})}
 }
 console.log(JSON.stringify({study:'BOWL_WALK_FORWARD_v1',requestedAt:new Date(asOf).toISOString(),
   testedUniverse:[...new Set(symbols)],selection:'user-supplied; not whole-market',
   results,notice:'Historical observational outcomes. Not a trade recommendation.'},null,2));
 if(results.every(x=>x.status!=='READY'))process.exitCode=2;
 return results;
}
if(require.main===module)main().catch(e=>{console.error(String(e?.message||e));process.exitCode=1});
module.exports={main};
