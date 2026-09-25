'use strict';

const VERSION='SETUP_EVENT_REPLAY_r0.1';

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function field(r,k,i){return finite(Array.isArray(r)?r[i]:r?.[k])}
function open(r){return field(r,'open',1)}
function high(r){return field(r,'high',2)}
function low(r){return field(r,'low',3)}
function close(r){return field(r,'close',4)}
function openTime(r){return finite(Array.isArray(r)?r[0]:r?.openTime??r?.time)}
function closeTime(r){return finite(Array.isArray(r)?r[6]:r?.closeTime)}
function assertBar(r,i){
  const o=open(r),h=high(r),l=low(r),c=close(r),ot=openTime(r);
  if([o,h,l,c,ot].some(x=>x==null))throw new Error('invalid OHLC/time at bar '+i);
  if(o<=0||h<=0||l<=0||c<=0||h<Math.max(o,c)||l>Math.min(o,c)||h<l)throw new Error('invalid OHLC at bar '+i);
}
function normalizedBars(rows=[]){
  if(!Array.isArray(rows)||rows.length<2)throw new Error('at least 2 bars required');
  let prev=null;
  return rows.map((r,i)=>{
    assertBar(r,i);const ot=openTime(r);if(prev!=null&&ot<=prev)throw new Error('bar timestamps must strictly increase');prev=ot;
    return{index:i,openTime:ot,closeTime:closeTime(r)??ot,open:open(r),high:high(r),low:low(r),close:close(r),raw:r};
  });
}
function normalizeSignals(signals=[],bars=[]){
  const byTime=new Map(bars.map(b=>[b.closeTime,b.index]));
  return (signals||[]).map((s,j)=>{
    let idx=Number.isInteger(s?.signalIndex)?s.signalIndex:null;
    if(idx==null&&finite(s?.signalCandleCloseTime)!=null)idx=byTime.get(finite(s.signalCandleCloseTime))??null;
    if(!(idx>=0&&idx<bars.length))throw new Error('signal '+j+' cannot be aligned to a bar');
    const state=String(s?.state||s?.toState||'').toUpperCase();
    if(!['BOTTOM_CONFIRMED','BREAKOUT_CONFIRMED'].includes(state))throw new Error('signal '+j+' is not a confirmed setup state');
    const stop=finite(s?.stopPrice),target=finite(s?.targetPrice);
    if(stop==null||target==null)throw new Error('signal '+j+' requires stopPrice and targetPrice');
    return{
      id:String(s?.id||s?.eventId||('sig-'+j+'-'+idx)),symbol:String(s?.symbol||'').toUpperCase(),
      state,setupType:String(s?.setupType||''),signalIndex:idx,signalCandleCloseTime:bars[idx].closeTime,
      stopPrice:stop,targetPrice:target,features:s?.features||null
    };
  }).sort((a,b)=>a.signalIndex-b.signalIndex||a.id.localeCompare(b.id));
}
function applyBuySlippage(price,rate){return price*(1+Math.max(0,Number(rate)||0))}
function applySellSlippage(price,rate){return price*(1-Math.max(0,Number(rate)||0))}
function commission(notional,rate){return Math.max(0,notional)*Math.max(0,Number(rate)||0)}
function qtyForFill({cash,fill,stop,riskFraction,maxPositionFraction,commissionRate}={}){
  const riskPerUnit=fill-stop;if(!(cash>0&&fill>0&&riskPerUnit>0))return 0;
  const riskBudget=cash*Math.max(0,Number(riskFraction)||0);
  const maxValue=cash*Math.max(0,Number(maxPositionFraction)||0);
  const qRisk=riskBudget/riskPerUnit,qValue=maxValue/fill,qCash=cash/(fill*(1+Math.max(0,Number(commissionRate)||0)));
  return Math.max(0,Math.floor(Math.min(qRisk,qValue,qCash)*1e8)/1e8);
}
function eventLog(){
  let seq=0;const events=[];
  function push(type,bar,payload={}){
    const e={sequence:++seq,eventType:type,timestamp:bar?.openTime??payload.timestamp??null,barIndex:bar?.index??null,...payload};
    events.push(e);return e;
  }
  return{events,push};
}
function processProtectiveExit({bar,position,priority='stop_first',slippageRate=0,commissionRate=0}={}){
  const stop=position.stopPrice,target=position.targetPrice,o=bar.open,h=bar.high,l=bar.low;
  if(o<=stop){
    const px=applySellSlippage(o,slippageRate);return{reason:'STOP_GAP',basePrice:o,fillPrice:px,fee:commission(px*position.quantity,commissionRate)};
  }
  if(o>=target){
    const px=applySellSlippage(o,slippageRate);return{reason:'TARGET_GAP',basePrice:o,fillPrice:px,fee:commission(px*position.quantity,commissionRate)};
  }
  const stopHit=l<=stop,targetHit=h>=target;
  if(!stopHit&&!targetHit)return null;
  let reason,basePrice;
  if(stopHit&&targetHit){
    if(String(priority)==='target_first'){reason='TAKE_PROFIT';basePrice=target}
    else{reason='STOP_LOSS';basePrice=stop}
  }else if(stopHit){reason='STOP_LOSS';basePrice=stop}
  else{reason='TAKE_PROFIT';basePrice=target}
  const fillPrice=applySellSlippage(basePrice,slippageRate);
  return{reason,basePrice,fillPrice,fee:commission(fillPrice*position.quantity,commissionRate),dualHit:stopHit&&targetHit};
}
function runEventReplay({rows=[],signals=[],config={}}={}){
  const bars=normalizedBars(rows),sigs=normalizeSignals(signals,bars);
  const initialCash=finite(config.initialCash)??100000;
  const commissionRate=Math.max(0,finite(config.commissionRate)??0.0005);
  const slippageRate=Math.max(0,finite(config.slippageRate)??0.0005);
  const riskFraction=Math.max(0,finite(config.riskPerTradeFraction)??0.01);
  const maxPositionFraction=Math.max(0,finite(config.maxPositionValueFraction)??0.25);
  const priority=String(config.stopTargetPriority||'stop_first');
  if(!['stop_first','target_first'].includes(priority))throw new Error('invalid stopTargetPriority');
  let cash=initialCash,position=null,pending=null;
  const closedTrades=[],equityCurve=[],audit=eventLog(),sigByIndex=new Map();
  for(const s of sigs){if(!sigByIndex.has(s.signalIndex))sigByIndex.set(s.signalIndex,[]);sigByIndex.get(s.signalIndex).push(s)}
  for(const bar of bars){
    audit.push('BarOpenEvent',bar,{symbol:position?.symbol||pending?.symbol||null});
    if(pending&&pending.fillIndex===bar.index&&!position){
      const base=bar.open,fill=applyBuySlippage(base,slippageRate);
      const qty=qtyForFill({cash,fill,stop:pending.stopPrice,riskFraction,maxPositionFraction,commissionRate});
      if(qty>0&&pending.stopPrice<fill&&pending.targetPrice>fill){
        const fee=commission(fill*qty,commissionRate),cost=fill*qty+fee;
        if(cost<=cash+1e-9){
          cash-=cost;
          position={symbol:pending.symbol,signalId:pending.id,setupType:pending.setupType,state:pending.state,quantity:qty,entryIndex:bar.index,entryTime:bar.openTime,entryBasePrice:base,entryPrice:fill,entryFee:fee,stopPrice:pending.stopPrice,targetPrice:pending.targetPrice};
          audit.push('FillEvent',bar,{side:'BUY',reason:'ENTRY_NEXT_OPEN',signalId:pending.id,basePrice:base,fillPrice:fill,quantity:qty,fee});
        }
      }else audit.push('OrderRejectedEvent',bar,{signalId:pending.id,reason:'INVALID_FILL_RISK_OR_SIZE'});
      pending=null;
    }
    audit.push('IntrabarRiskCheckEvent',bar,{symbol:position?.symbol||null});
    if(position){
      const exit=processProtectiveExit({bar,position,priority,slippageRate,commissionRate});
      if(exit){
        const proceeds=exit.fillPrice*position.quantity-exit.fee;cash+=proceeds;
        const entryCost=position.entryPrice*position.quantity+position.entryFee;
        const netPnl=proceeds-entryCost;
        const initialRisk=Math.max(0,(position.entryPrice-position.stopPrice)*position.quantity+position.entryFee);const trade={symbol:position.symbol,signalId:position.signalId,setupType:position.setupType,state:position.state,quantity:position.quantity,entryIndex:position.entryIndex,exitIndex:bar.index,entryTime:position.entryTime,exitTime:bar.openTime,entryPrice:position.entryPrice,exitPrice:exit.fillPrice,entryFee:position.entryFee,exitFee:exit.fee,netPnl,returnFraction:entryCost>0?netPnl/entryCost:null,initialRisk,realizedR:initialRisk>0?netPnl/initialRisk:null,exitReason:exit.reason,dualHit:Boolean(exit.dualHit),stopPrice:position.stopPrice,targetPrice:position.targetPrice};
        closedTrades.push(trade);
        audit.push('FillEvent',bar,{side:'SELL',reason:exit.reason,signalId:position.signalId,basePrice:exit.basePrice,fillPrice:exit.fillPrice,quantity:position.quantity,fee:exit.fee,dualHit:Boolean(exit.dualHit)});
        position=null;
      }
    }
    audit.push('BarCloseEvent',bar,{close:bar.close});
    for(const sig of sigByIndex.get(bar.index)||[]){
      audit.push('SignalEvent',bar,{signalId:sig.id,state:sig.state,setupType:sig.setupType,stopPrice:sig.stopPrice,targetPrice:sig.targetPrice});
      if(position||pending){audit.push('OrderRejectedEvent',bar,{signalId:sig.id,reason:'POSITION_OR_ORDER_ALREADY_ACTIVE'});continue}
      if(bar.index>=bars.length-1){audit.push('OrderRejectedEvent',bar,{signalId:sig.id,reason:'NO_NEXT_BAR_OPEN'});continue}
      pending={...sig,fillIndex:bar.index+1};
      audit.push('OrderEvent',bar,{signalId:sig.id,side:'BUY',orderType:'NEXT_OPEN',fillIndex:bar.index+1});
    }
    const mark=position?position.quantity*bar.close:0;
    equityCurve.push({timestamp:bar.closeTime,barIndex:bar.index,equity:cash+mark,cash,close:bar.close,openPosition:position?{symbol:position.symbol,quantity:position.quantity}:null});
    audit.push('EndOfBarEvent',bar,{equity:cash+mark,cash});
  }
  const finalMark=position?position.quantity*bars.at(-1).close:0,finalEquity=cash+finalMark;
  return{
    version:VERSION,
    config:{initialCash,commissionRate,slippageRate,riskPerTradeFraction:riskFraction,maxPositionValueFraction:maxPositionFraction,stopTargetPriority:priority},
    summary:{initialCash,finalEquity,netPnl:finalEquity-initialCash,returnFraction:initialCash>0?finalEquity/initialCash-1:null,closedTradeCount:closedTrades.length,openPosition:Boolean(position),pendingOrder:Boolean(pending),executionConvention:'confirmed-close signal -> next bar open fill; protective exits from OHLC; explicit gap and dual-hit policy'},
    closedTrades,equityCurve,events:audit.events,openPosition:position,pendingOrder:pending
  };
}
function signalsFromSetupTransitions(transitions=[]){
  return (transitions||[]).filter(x=>['BOTTOM_CONFIRMED','BREAKOUT_CONFIRMED'].includes(String(x?.toState||x?.state||''))).map((x,i)=>({
    id:x.eventId||('transition-'+i),symbol:x.symbol,setupType:x.setupType,state:x.toState||x.state,
    signalCandleCloseTime:finite(x.candleCloseTime),
    stopPrice:finite(x.stopPrice??x.features?.risk?.stopPrice??x.features?.evidence?.risk?.stop),
    targetPrice:finite(x.targetPrice??x.features?.risk?.targetPrice??x.features?.evidence?.risk?.target),
    features:x.features||null
  }));
}

module.exports={VERSION,normalizedBars,normalizeSignals,qtyForFill,processProtectiveExit,runEventReplay,signalsFromSetupTransitions};
