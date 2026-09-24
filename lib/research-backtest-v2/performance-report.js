'use strict';

function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}
function mean(a){const x=a.filter(Number.isFinite);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null}
function stdev(a){const x=a.filter(Number.isFinite);if(x.length<2)return null;const m=mean(x);return Math.sqrt(x.reduce((s,v)=>s+(v-m)**2,0)/(x.length-1))}
function maxDrawdown(equity){let peak=-Infinity,mdd=0,peakIndex=0,troughIndex=0,recoveryIndex=null;for(let i=0;i<equity.length;i++){const e=equity[i];if(e>peak){peak=e;peakIndex=i}const dd=peak>0?(e/peak-1):0;if(dd<mdd){mdd=dd;troughIndex=i;recoveryIndex=null}if(recoveryIndex==null&&i>troughIndex&&e>=peak)recoveryIndex=i}return{maxDrawdownPct:mdd*100,peakIndex,troughIndex,recoveryIndex,recoveryBars:recoveryIndex==null?null:recoveryIndex-troughIndex}}
function buildPerformanceReport(trades=[],opts={}){
  const filled=(trades||[]).filter(x=>x?.status==='filled'&&Number.isFinite(Number(x.netReturnPct))).sort((a,b)=>(a.entryTime||0)-(b.entryTime||0));
  let equity=Number(opts.initialEquity)||1,peakEq=equity;const curve=[equity],rets=[],wins=[],losses=[];let grossProfit=0,grossLoss=0;
  for(const t of filled){const r=Number(t.netReturnPct)/100;rets.push(r);equity*=1+r;curve.push(equity);if(r>0){wins.push(r);grossProfit+=r}else if(r<0){losses.push(r);grossLoss+=Math.abs(r)}}
  const years=filled.length>1&&filled[0].entryTime&&filled.at(-1).exitTime?Math.max((filled.at(-1).exitTime-filled[0].entryTime)/(365.25*86400000),1/365.25):null;
  const cagr=years&&equity>0?((equity/(Number(opts.initialEquity)||1))**(1/years)-1)*100:null;
  const vol=stdev(rets),avg=mean(rets),down=stdev(rets.filter(x=>x<0).map(Math.abs));
  const annualFactor=Math.sqrt(Number(opts.periodsPerYear)||365);
  const sharpe=vol&&vol>0?avg/vol*annualFactor:null;
  const sortino=down&&down>0?avg/down*annualFactor:null;
  const dd=maxDrawdown(curve),calmar=cagr!=null&&dd.maxDrawdownPct<0?cagr/Math.abs(dd.maxDrawdownPct):null;
  const turnover=filled.reduce((s,t)=>s+2,0);
  const costDrag=filled.reduce((s,t)=>s+Number(t.costs?.roundTripPct||0),0);
  return{
    sampleCount:filled.length,winRate:filled.length?wins.length/filled.length:null,
    meanNetReturnPct:avg==null?null:avg*100,medianNetReturnPct:filled.length?[...filled.map(x=>Number(x.netReturnPct))].sort((a,b)=>a-b)[Math.floor(filled.length/2)]:null,
    profitFactor:grossLoss>0?grossProfit/grossLoss:null,expectancyPct:avg==null?null:avg*100,
    cagrPct:cagr,annualizedVolatilityPct:vol==null?null:vol*annualFactor*100,sharpe,sortino,calmar,
    maxDrawdownPct:dd.maxDrawdownPct,recoveryBars:dd.recoveryBars,averageHoldingBars:mean(filled.map(x=>Number(x.holdingBars))),
    maxHoldingBars:filled.length?Math.max(...filled.map(x=>Number(x.holdingBars)||0)):null,
    turnoverCount:turnover,totalCostDragPct:costDrag,endingEquity:equity,
    unfilledCount:(trades||[]).filter(x=>x?.status!=='filled').length
  };
}
function stressMatrix(tradesByMultiplier={}){
  const out={};for(const [k,trades] of Object.entries(tradesByMultiplier||{}))out[k]=buildPerformanceReport(trades);return out
}
module.exports={mean,stdev,maxDrawdown,buildPerformanceReport,stressMatrix};
