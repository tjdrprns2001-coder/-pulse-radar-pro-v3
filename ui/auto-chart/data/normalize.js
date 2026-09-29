(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartNormalize=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const SCHEMA='AUTO_CHART_MARKET_v1';
const missing=v=>v==null||(typeof v==='string'&&v.trim()==='');
const finite=v=>!missing(v)&&Number.isFinite(Number(v));
const tfMs=tf=>({ '5m':300000,'15m':900000,'1h':3600000,'4h':14400000,'12h':43200000,'1d':86400000,'3d':259200000,'1w':604800000 })[String(tf||'').toLowerCase()]||null;
function num(v){return finite(v)?Number(v):null}
function gaps(candles,interval){
  const step=tfMs(interval);if(!step||candles.length<2)return[];
  const out=[];for(let i=1;i<candles.length;i++){const diff=candles[i].openTime-candles[i-1].openTime;if(diff>step*1.5)out.push({from:candles[i-1].closeTime,to:candles[i].openTime,missingApprox:Math.max(1,Math.round(diff/step)-1)})}
  return out;
}
function normalizeCandles(raw,interval){
  const step=tfMs(interval),rows=Array.isArray(raw?.candles)?raw.candles:[],lastClose=num(raw?.lastClosedCloseTime);
  return rows.filter(x=>x&&finite(x.time??x.openTime)&&finite(x.open)&&finite(x.high)&&finite(x.low)&&finite(x.close)).map((x,i)=>{
    const openTime=Number(x.openTime??x.time),closeTime=num(x.closeTime)??(step?openTime+step-1:(i===rows.length-1?lastClose:null));
    return{openTime,closeTime,open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close),volume:num(x.volume),quoteVolume:num(x.quoteVolume),takerBuyQuote:num(x.takerBuyQuote),closed:x.partial!==true,sourceIndex:i};
  }).filter(x=>x.closed);
}
function normalizeStructure(raw,{exchange='binance',market='spot',symbol,interval,meta=null}={}){
  const candles=normalizeCandles(raw,interval),last=candles.at(-1);
  const updatedAt=num(raw?.snapshotTime)??num(raw?.lastClosedCloseTime)??last?.closeTime??Date.now();
  return{
    schemaVersion:SCHEMA,
    market:{exchange,requestedExchange:exchange,sourceExchange:raw?.exchange||exchange,marketType:market,symbol:String(symbol||raw?.symbol||'').toUpperCase(),interval:String(interval||raw?.interval||''),tickSize:num(meta?.tickSize),dataSource:raw?.dataSource||null,fallback:Boolean(raw?.fallback),fallbackReason:raw?.fallbackReason||null,structureRuntime:raw?.structureRuntime||null},
    candles,
    rawStructure:raw,
    structureInput:{canonicalSwings:Array.isArray(raw?.canonicalSwings)?raw.canonicalSwings:[],provisionalPivots:Array.isArray(raw?.provisionalPivots)?raw.provisionalPivots:[]},
    status:{available:!!candles.length,updatedAt,gaps:gaps(candles,interval),currentCandleExcluded:raw?.currentCandleExcluded!==false,error:null}
  };
}
function normalizeDerivatives(raw){
  const available=raw?.available===true;
  return{available,source:raw?.source||null,updatedAt:raw?.updatedAt||null,
    oi:{available:available&&(finite(raw?.openInterestContracts)||finite(raw?.openInterestUsdApprox)||finite(raw?.openInterestChange4hPct)),unit:'contracts',contracts:num(raw?.openInterestContracts),notionalUsd:num(raw?.openInterestUsdApprox),change1hPct:num(raw?.openInterestChange1hPct),change4hPct:num(raw?.openInterestChange4hPct),change24hPct:num(raw?.openInterestChange24hPct)},
    taker:{available:available&&(finite(raw?.takerBuySellRatio)||finite(raw?.takerBuySellRatio4h)),ratioNow:num(raw?.takerBuySellRatio),ratio4h:num(raw?.takerBuySellRatio4h),ratio24h:num(raw?.takerBuySellRatio24h)},
    funding:{available:available&&finite(raw?.fundingRatePct),ratePct:num(raw?.fundingRatePct)}
  };
}
return{SCHEMA,tfMs,missing,finite,normalizeCandles,normalizeStructure,normalizeDerivatives};
});