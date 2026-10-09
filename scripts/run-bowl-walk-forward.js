'use strict';
// Usage: node scripts/run-bowl-walk-forward.js BTCUSDT ETHUSDT SOLUSDT --tf=1d
// Read-only study, never submits orders. Uses only Binance USDT futures direct klines.
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {evaluateBowlWalkForward}=require('../lib/research-backtest-v2/bowl-walk-forward.js');
const {summarizeWalkForwardCohort}=require('../lib/research-backtest-v2/bowl-portfolio-summary.js');
const {simulateSignalCloseToNextOpen,buildHypotheticalPortfolio}=require('../lib/research-backtest-v2/quantstyle-performance.js');
async function main(argv=process.argv.slice(2),{provider:injectedProvider=null,now=()=>Date.now(),write=console.log}={}){
 const tf=(argv.find(s=>s.startsWith('--tf='))||'--tf=1d').slice(5),symbols=argv.filter(x=>!x.startsWith('--')).map(s=>s.toUpperCase()).slice(0,8);
 const lim=Math.min(1500,Math.max(750,Number((argv.find(s=>s.startsWith('--limit='))||'--limit=1200').slice(8))||1200));
 if(!['1d','4h'].includes(tf)||!symbols.length||symbols.some(x=>!/^([A-Z0-9]{2,25})USDT$/.test(x)))
  throw new Error('Usage: node scripts/run-bowl-walk-forward.js BTCUSDT ETHUSDT --tf=1d --limit=1200');
 const provider=injectedProvider||createBinanceProvider({disableFuturesFallback:true}),asOf=now(),results=[],datasets=[];
 for(const symbol of [...new Set(symbols)]){
  try{
   const candles=await provider.getFuturesKlines(symbol,tf,lim);
   if(candles._source!=='BINANCE_FUTURES')throw new Error('PROVENANCE_MISMATCH');
   datasets.push({symbol,rows:candles,asOf,source:'BINANCE_FUTURES'});
   results.push(evaluateBowlWalkForward({symbol,rows:candles,asOf,timeframe:tf,source:'BINANCE_FUTURES'}));
  }catch(error){results.push({symbol,timeframe:tf,status:'UNAVAILABLE',reason:String(error?.message||error)})}
 }
 const risk=argv.includes('--risk')?{}:null;
 if(risk){
  for(const split of ['train','validation']){
   const matching=results.filter(r=>r.status==='READY');
   const exportIncomplete=matching.some(r=>r.bySplit?.[split]?.signals?.count!==r.events?.[split]?.length);
   if(exportIncomplete||results.some(r=>r.status!=='READY')||matching.length!==datasets.length||datasets.length!==[...new Set(symbols)].length){risk[split]={status:'INCOMPLETE_SOURCE_OR_EVENT_EXPORT'};continue}
   const audits=datasets.map((d,i)=>simulateSignalCloseToNextOpen({symbol:d.symbol,rows:d.rows,events:matching[i].events[split],asOf,timeframe:tf}));
   const portfolio=buildHypotheticalPortfolio({datasets,audits});
   risk[split]={status:portfolio.status,accepted:portfolio.acceptedCount??0,rejected:portfolio.rejectedCount??0,
     tradeStats:portfolio.tradeStats??null,dailyRisk:portfolio.dailyRisk??null,
     notes:'Estimated next-open to 7D-close, conservative single-position; funding unavailable; not realized PnL'};
  }
 }
 write(JSON.stringify({study:'BOWL_WALK_FORWARD_v1',requestedAt:new Date(asOf).toISOString(),
   testedUniverse:[...new Set(symbols)],selection:'user-supplied; not whole-market',
   results,cohortSummary:summarizeWalkForwardCohort(results),
   ...(risk?{hypotheticalCostRisk:{status:'RESEARCH_ONLY',splits:risk,holdout:'LOCKED_BY_DESIGN'}}:{}),
   notice:'Historical observational outcomes. Not a trade recommendation.'},null,2));
 if(require.main===module&&results.every(x=>x.status!=='READY'))process.exitCode=2;
 return results;
}
if(require.main===module)main().catch(e=>{console.error(String(e?.message||e));process.exitCode=1});
module.exports={main};
