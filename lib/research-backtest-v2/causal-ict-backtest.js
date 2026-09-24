'use strict';
const Causal=require('../../ui/chart/causal-ict-engine.js');
const {buildPerformanceReport}=require('./performance-report.js');
const {regimePerformance,buyHold,emaCrossBaseline}=require('./baselines.js');
const {robustnessReport}=require('./robustness.js');

function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}
function pct(a,b){return a>0&&Number.isFinite(b)?((b/a)-1)*100:null}
function scaleSpec(spec,m=1){
  const x=JSON.parse(JSON.stringify(spec||Causal.DEFAULT_SPEC)),k=Number(m)||1;
  x.risk_and_execution.commission_bps_each_side=Number(x.risk_and_execution.commission_bps_each_side||0)*k;
  x.risk_and_execution.slippage_ticks_each_side=Number(x.risk_and_execution.slippage_ticks_each_side||0)*k;
  return x;
}
function adaptTrades(result){
  return (result?.trades||[]).map(t=>({status:'filled',entryIndex:t.entry_bar,exitIndex:t.exit_bar,entryTime:null,exitTime:null,entryPrice:t.entry_price,exitPrice:t.exit_price,netReturnPct:pct(t.entry_price,t.exit_price)*(t.side==='short'?-1:1),grossReturnPct:pct(t.entry_price,t.exit_price)*(t.side==='short'?-1:1),holdingBars:t.exit_bar-t.entry_bar+1,costs:{roundTripPct:null},exitReason:t.exit_reason,side:t.side,netPnl:t.net_pnl,feeTotal:t.fee_total}));
}
function runCausalIctBacktest({rows=[],spec=null,costMultipliers=[1,1.5,2]}={}){
  const stress={};for(const mult of costMultipliers){const result=Causal.run(rows,scaleSpec(spec||Causal.DEFAULT_SPEC,mult)),trades=adaptTrades(result);stress[String(mult)+'x']={multiplier:mult,result,trades,report:buildPerformanceReport(trades)}}
  const base=stress['1x'],contract=Causal.validateCausalContracts(base.result),prefix=Causal.prefixInvariant(rows,spec||Causal.DEFAULT_SPEC);
  return{engine:Causal.VERSION,setupId:(spec||Causal.DEFAULT_SPEC).setup_id,signal:'sweep reclaim → MSS → later FVG → first partial revisit in premium/discount',stress,contract,prefixInvariant:{pass:prefix.pass,checks:prefix.checks.slice(-5)},baselines:{buyHold:buyHold(rows),ema20x60:emaCrossBaseline(rows,{fast:20,slow:60})},regimes:regimePerformance(base.trades,rows),robustness:robustnessReport({trades:base.trades}),lookaheadSafe:contract.pass&&prefix.pass,executionPolicy:'CONFIRMED_CLOSE_SIGNAL_NEXT_OPEN_FILL_STOP_FIRST'};
}
module.exports={scaleSpec,adaptTrades,runCausalIctBacktest};