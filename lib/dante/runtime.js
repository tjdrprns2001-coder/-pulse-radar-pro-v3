'use strict';
const {createBinanceProvider}=require('../coin-scan/binance-provider.js');
const {fetchHistoricalDaily,createResilientDailyProvider}=require('./historical-data.js');
const {runWalkForward,summarize,assertSignalPrefixParity}=require('./walk-forward.js');
const {runSensitivity}=require('./sensitivity.js');

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function createDanteBacktestRuntime({fetchImpl=globalThis.fetch,now=()=>Date.now()}={}){
  const futuresProvider=createBinanceProvider({fetchImpl,now});
  const provider=createResilientDailyProvider({futuresProvider,fetchImpl});
  async function run({
    symbol='BTCUSDT',
    startTs=Date.parse('2021-01-01T00:00:00Z'),
    endTs=now(),
    frictionPct=.2,
    sensitivity=false,
    riceParams={},
    d256Params={}
  }={}){
    const s=String(symbol||'BTCUSDT').toUpperCase(),start=finite(startTs),end=finite(endTs);
    if(start==null||end==null||end<=start)throw new Error('invalid Dante backtest window');
    const hist=await fetchHistoricalDaily(provider,{symbol:s,startTs:start,endTs:end});
    if(hist.rows.length<300)throw new Error('insufficient Dante daily history');
    const wf=runWalkForward({symbol:s,candles:hist.rows,analysisStartTs:start,analysisEndTs:end,riceParams,d256Params,frictionPct});
    const parity=assertSignalPrefixParity({symbol:s,candles:hist.rows,causalResult:wf,riceParams,d256Params});
    const summary=summarize(wf.events,wf.horizons);
    const sensitivityRows=sensitivity===true?runSensitivity({symbol:s,candles:hist.rows,baseRiceParams:riceParams,baseD256Params:d256Params,frictionPct}):null;
    return{
      ok:true,version:'DANTE_BACKTEST_RUNTIME_v1',symbol:s,interval:'1d',
      history:{bars:hist.rows.length,start:hist.historyStart,end:hist.historyEnd,pages:hist.pages,complete:hist.complete,sourceInfo:hist.sourceInfo},
      assumptions:{
        signalData:'CLOSED_ONLY',
        entry:'NEXT_ELIGIBLE_BAR_OPEN',
        longOnly:true,
        frictionPct:Number(frictionPct)||0,
        survivorshipWarning:'Single-symbol historical validation; delisted-universe coverage not represented',
        priceSourcePolicy:'BINANCE_USDT_PERPETUAL_FIRST_THEN_SPOT_FALLBACK',
        split:'train=2021-01-01..2024-12-31; validation>=2025-01-01'
      },
      walkForward:wf,
      parity,
      summary,
      sensitivity:sensitivityRows
    };
  }
  return{provider,futuresProvider,run};
}
module.exports={finite,createDanteBacktestRuntime};
