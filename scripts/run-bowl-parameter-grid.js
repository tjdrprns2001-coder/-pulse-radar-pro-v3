'use strict';
// Read-only, deterministic grid study. No trade execution and no LLM-driven selection.
// Example: node scripts/run-bowl-parameter-grid.js BTCUSDT ETHUSDT SOLUSDT DOGEUSDT ONDOUSDT --tf=4h
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {runBowlParameterGrid}=require('../lib/research-backtest-v2/bowl-parameter-grid.js');
const DEFAULT_SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT','DOGEUSDT','ONDOUSDT','NEARUSDT','SEIUSDT','LINKUSDT'];
async function main(args=process.argv.slice(2),{provider=null,now=()=>Date.now(),write=console.log}={}){
 const symbols=args.filter(x=>!String(x).startsWith('--')).map(x=>String(x).toUpperCase());
 const universe=[...new Set(symbols.length?symbols:DEFAULT_SYMBOLS)];
 const tf=(args.find(x=>x.startsWith('--tf='))||'--tf=4h').slice(5);
 const n=Number((args.find(x=>x.startsWith('--limit='))||'--limit=1200').slice(8));
 const asOf=now();
 if(!['1d','4h'].includes(tf)||!Number.isInteger(n)||n<600||n>1500||universe.length<2||universe.length>12||
    universe.some(s=>!/^([A-Z0-9]{2,25})USDT$/.test(s)))throw Error('2-12 Binance USDT symbols, --tf=1d|4h, --limit=600..1500 required');
 const market=provider||createBinanceProvider({disableFuturesFallback:true});
 const inputs=[],unavailable=[];
 for(const symbol of universe){
  try{
   const rows=await market.getFuturesKlines(symbol,tf,n);
   if(!Array.isArray(rows)||rows._source!=='BINANCE_FUTURES')throw Error('PRIMARY_FUTURES_PROVENANCE_REQUIRED');
   inputs.push({symbol,rows,source:'BINANCE_FUTURES'});
  }catch(e){unavailable.push({symbol,reason:String(e?.message||e).slice(0,160)})}
 }
 // Never silently report partial-universe results as if all requested markets were studied.
 if(unavailable.length||inputs.length!==universe.length){
  const bad={study:'BOWL_PARAMETER_GRID_v1',status:'INCOMPLETE_UNIVERSE',requested:universe,unavailable,
    note:'No partial-universe parameter selection. Missing symbols must be investigated.'};
  write(JSON.stringify(bad,null,2));return bad;
 }
 const report=runBowlParameterGrid({datasets:inputs,asOf,timeframe:tf});
 const response={study:'BOWL_PARAMETER_GRID_v1',requestedAt:new Date(asOf).toISOString(),
   source:'BINANCE_FUTURES',requestedUniverse:universe,limit:n,report,
   notice:'Research only, no automated positions; training/validation selection does not use holdout outcomes.'};
 write(JSON.stringify(response,null,2));return response;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={main,DEFAULT_SYMBOLS};
