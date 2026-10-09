'use strict';
// QuantStats-inspired research-only equity analytics. This is independent code.
// Futures funding is UNKNOWN unless separately supplied, so PnL here is not fully net.
const {toClosedCandles}=require('../coin-scan/pattern-evidence.js');
const DAY=86400000;
const STEPS=Object.freeze({'1d':DAY,'4h':4*3600000});
const FINITE=x=>typeof x==='number'&&Number.isFinite(x);
const pct=x=>Number.isFinite(x)?Math.round(x*1e8)/1e8:null;
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
function stdev(xs){if(xs.length<2)return null;const m=mean(xs);return Math.sqrt(xs.reduce((a,b)=>a+(b-m)**2,0)/(xs.length-1))}
function costSettings(raw={}){
 const config={feeBps:raw.feeBps??5,slippageBps:raw.slippageBps??5,spreadBps:raw.spreadBps??2};
 if(!Object.values(config).every(x=>FINITE(x)&&x>=0&&x<=100))return null;
 return config;
}
function simulateSignalCloseToNextOpen({symbol,rows,events,asOf,timeframe='4h',costs={}}={}){
 const tf=String(timeframe).toLowerCase(),step=STEPS[tf],config=costSettings(costs);
 const header={version:'BOWL_EXECUTION_AUDIT_v1',source:'BINANCE_FUTURES',symbol:String(symbol||'').toUpperCase(),
   timeframe:tf,shadowOnly:true,kind:'HYPOTHETICAL_REPLAY',funding:'UNAVAILABLE',
   tradeFillPolicy:'next candle OPEN entry, 7-day candle CLOSE exit; full candle coverage required'};
 if(!step||!config||!Number.isFinite(Number(asOf))||Number(asOf)<=0||
    !/^[A-Z0-9]{2,25}USDT$/.test(header.symbol)||!Array.isArray(events))
   return {...header,status:'INVALID_INPUT',trades:[]};
 const closed=toClosedCandles(rows,asOf),byClose=new Map(closed.map((x,i)=>[x.closeTime,i]));
 const bars=7*DAY/step;
 const result=[],rejected=[];
 for(const e of events){
  const idx=byClose.get(e?.at);
  if(!Number.isInteger(idx)){rejected.push({at:e?.at??null,reason:'SIGNAL_BAR_NOT_FOUND'});continue}
  if(idx+bars>=closed.length){rejected.push({at:e.at,reason:'NO_COMPLETE_FUTURE_7D'});continue}
  let continuous=true;
  for(let j=idx+1;j<=idx+bars;j++)if(closed[j].openTime-closed[j-1].openTime!==step){continuous=false;break}
  if(!continuous){rejected.push({at:e.at,reason:'MISSING_CANDLE_IN_HOLD'});continue}
  const next=closed[idx+1],end=closed[idx+bars];
  const halfSpread=config.spreadBps/2;
  const entryFactor=1+(config.slippageBps+halfSpread)/10000;
  const exitFactor=1-(config.slippageBps+halfSpread)/10000;
  const fee=config.feeBps/10000;
  const refEntry=next.open,refExit=end.close;
  if(!(refEntry>0&&refExit>0)){rejected.push({at:e.at,reason:'INVALID_FILL_PRICE'});continue}
  const filledEntry=refEntry*entryFactor,filledExit=refExit*exitFactor;
  const gross=(refExit/refEntry-1)*100;
  const afterCost=(filledExit*(1-fee)/(filledEntry*(1+fee))-1)*100;
  result.push({symbol:header.symbol,signalCloseTime:e.at,entryTime:next.openTime,exitTime:end.closeTime,
   signalPrice:e.price??null,entryReferencePrice:refEntry,exitReferencePrice:refExit,
   entryFillEstimate:filledEntry,exitFillEstimate:filledExit,
   grossReturnPct:pct(gross),estimatedAfterCostsExFundingPct:pct(afterCost),
   estimatedCostDragPct:pct(gross-afterCost),feeBpsPerSide:config.feeBps,
   slippageBpsPerSide:config.slippageBps,spreadBps:config.spreadBps,
   fundingCostPct:null,realTrade:false,status:'SIMULATED'});}
 return {...header,status:'READY',asOf:Number(asOf),closedBars:closed.length,assumptions:config,
   trades:result,rejected,missingCoverageCount:rejected.length};
}
function riskFromDailyEquity(series,{annualRiskFreePct=0,minDays=30}={}){
 const err={status:'UNAVAILABLE',sharpe:null,sortino:null,cagrPct:null,annualizedVolPct:null,
    maxDrawdownPct:null,recoveryDays:null,totalReturnPct:null};
 if(!Array.isArray(series)||series.length<2||!FINITE(annualRiskFreePct)||Math.abs(annualRiskFreePct)>100||!Number.isInteger(minDays)||minDays<2)return err;
 if(series.some((v,i)=>!(FINITE(v?.time)&&FINITE(v?.equity)&&v.equity>0)&&i>=0))return err;
 for(let i=1;i<series.length;i++)if(series[i].time-series[i-1].time!==DAY)return err;
 const daily=series.slice(1).map((v,i)=>v.equity/series[i].equity-1);
 // QuantStats 0.0.86 convention: deannualize rf geometrically, not rf / 365.25.
 const dailyRiskFree=Math.pow(1+annualRiskFreePct/100,1/365.25)-1;
 const p=daily.map(x=>x-dailyRiskFree);
 const st=stdev(p),down=Math.sqrt(mean(p.map(x=>Math.min(0,x)**2)));
 let peak=series[0].equity,mdd=0,troughTime=null,peakTime=null,recoverTime=null;
 for(const x of series){
   if(x.equity>peak){peak=x.equity;peakTime=x.time}
   const dd=x.equity/peak-1;
   if(dd<mdd){mdd=dd;troughTime=x.time;recoverTime=null}
   if(troughTime!==null&&recoverTime===null&&x.time>troughTime&&x.equity>=peak){recoverTime=x.time}
 }
 const years=(series.at(-1).time-series[0].time)/(365.25*DAY);
 const total=series.at(-1).equity/series[0].equity-1;
 const volatility=st!==null?st*Math.sqrt(365.25)*100:null;
 return {status:daily.length>=minDays?'READY':'INSUFFICIENT_DAILY_MARKS',
    observationDays:daily.length,totalReturnPct:pct(total*100),
    cagrPct:years>0?pct(((1+total)**(1/years)-1)*100):null,
    annualizedVolPct:daily.length>=minDays?pct(volatility):null,
    sharpe:daily.length>=minDays&&st>0?pct(mean(p)/st*Math.sqrt(365.25)):null,
    sortino:daily.length>=minDays&&down>0?pct(mean(p)/down*Math.sqrt(365.25)):null,
    maxDrawdownPct:pct(mdd*100),
    recoveryDays:recoverTime!==null&&troughTime!==null?(recoverTime-troughTime)/DAY:null,
    methodology:'daily close mark-to-market including estimated unwind fees/slippage; funding excluded'};
}
function buildHypotheticalPortfolio({datasets=[],audits=[],initialEquity=10000,annualRiskFreePct=0,minDays=30}={}){
 const header={version:'QUANTSTYLE_RESEARCH_RISK_v1',kind:'HYPOTHETICAL_SINGLE_POSITION',
   shadowOnly:true,source:'BINANCE_FUTURES',funding:'NOT_INCLUDED',portfolioPolicy:'100% equity, at most one long position; same-time events resolved by symbol; no leverage'};
 if(!FINITE(initialEquity)||initialEquity<=0||!Array.isArray(datasets)||!Array.isArray(audits)||datasets.length!==audits.length||
   datasets.some(d=>d.source!=='BINANCE_FUTURES'||!Array.isArray(d.rows))||
   audits.some((a,i)=>a.status!=='READY'||a.source!=='BINANCE_FUTURES'||a.funding!=='UNAVAILABLE'||a.symbol!==datasets[i]?.symbol)||
   datasets.some(d=>!(Number.isFinite(Number(d.asOf))&&Number(d.asOf)>0)))return {...header,status:'INVALID_INPUT'};
 const bySymbol=new Map(datasets.map(d=>[d.symbol,toClosedCandles(d.rows,d.asOf)]));
 if(new Set(datasets.map(d=>d.symbol)).size!==datasets.length)return {...header,status:'DUPLICATE_SYMBOL'};
 const all=audits.flatMap(a=>a.trades).sort((a,b)=>a.entryTime-b.entryTime||a.symbol.localeCompare(b.symbol));
 const accepted=[],rejected=[],day=DAY;
 let endAt=-Infinity;
 for(const t of all){
  if(t.entryTime<=endAt){rejected.push({...t,reason:'SINGLE_POSITION_CONFLICT'});continue}
  if(!bySymbol.has(t.symbol)||!bySymbol.get(t.symbol).length){rejected.push({...t,reason:'MISSING_SOURCE'});continue}
  accepted.push(t);endAt=t.exitTime;
 }
 if(!accepted.length)return {...header,status:'INSUFFICIENT_TRADES',acceptedCount:0,rejectedCount:rejected.length,
   tradeStats:{winRate:null,profitFactor:null,avgReturnPct:null},dailyRisk:riskFromDailyEquity([])};
 // Start with liquid, full capital; each accepted trade compounds after estimated costs.
 let equity=initialEquity;
 const positions=accepted.map(t=>{
  const before=equity,ratio=1+t.estimatedAfterCostsExFundingPct/100;
  if(!FINITE(ratio)||ratio<=0)throw Error('invalid simulated trade return');
  const fee=t.feeBpsPerSide/10000,friction=(t.slippageBpsPerSide+t.spreadBps/2)/10000;
  const quantity=before/(t.entryReferencePrice*(1+friction)*(1+fee));
  equity=quantity*t.exitReferencePrice*(1-friction)*(1-fee);
  return {...t,equityBefore:before,equityAfter:equity,quantity};
 });
 const startTime=Math.floor(positions[0].entryTime/DAY)*DAY-1;
 const lastTime=Math.floor(positions.at(-1).exitTime/DAY)*DAY+DAY-1;
 const series=[{time:startTime,equity:initialEquity}];
 let incomplete=false;
 for(let d=startTime+DAY;d<=lastTime;d+=DAY){
  let value=initialEquity,active=null;
  for(const p of positions){
   if(p.exitTime<=d){value=p.equityAfter;continue}
   if(p.entryTime<=d){active=p;break}
   break;
  }
  if(active){
   const candles=bySymbol.get(active.symbol),marks=candles.filter(x=>x.closeTime<=d&&x.closeTime>=active.entryTime);
   const mark=marks.at(-1);
   if(!mark){incomplete=true;break}
   // Exit-cost estimated liquidation mark, never high/low lookahead.
   const fee=active.feeBpsPerSide/10000,slip=(active.slippageBpsPerSide+active.spreadBps/2)/10000;
   value=active.quantity*mark.close*(1-fee)*(1-slip);
  }
  series.push({time:d,equity:value});
 }
 const valid=series.length>1&&!incomplete;
 const returns=positions.map(p=>p.estimatedAfterCostsExFundingPct);
 const wins=returns.filter(x=>x>0),losses=returns.filter(x=>x<0);
 const gains=wins.reduce((s,x)=>s+x,0),lossAbs=losses.reduce((s,x)=>s+Math.abs(x),0);
 const tradeStats={trades:positions.length,winRate:positions.length?wins.length/positions.length:null,
   avgReturnPct:pct(mean(returns)),profitFactor:lossAbs>0?pct(gains/lossAbs):null,
   medianReturnPct:returns.length?pct(returns.slice().sort((a,b)=>a-b)[Math.floor(returns.length/2)]):null,
   estimatedCostDragPct:pct(positions.reduce((s,x)=>s+x.estimatedCostDragPct,0)),
   capitalEnding:equity,returnPct:pct((equity/initialEquity-1)*100)};
 return {...header,status:valid?'READY':'INCOMPLETE_DAILY_MARKS',
   acceptedCount:positions.length,rejectedCount:rejected.length,accepted:positions,rejected,
   tradeStats,dailyRisk:valid?riskFromDailyEquity(series,{annualRiskFreePct,minDays}):riskFromDailyEquity([]),
   dailyEquity:valid?series:[],assumptionWarnings:['Funding, liquidations, margin, borrow costs, market impact and minimum fill quantities are not modeled',
     '100% allocated single long avoids double-counting overlapping multi-coin trades but is not a real execution policy',
     'Outputs are hypothetical and must never be presented as realized trades']};
}
module.exports={costSettings,simulateSignalCloseToNextOpen,riskFromDailyEquity,buildHypotheticalPortfolio};
