'use strict';
const Deep=require('../coin-scan/deep-scan.js');
const {FEATURE_SCHEMA_VERSION,OUTCOME_SCHEMA_VERSION,eventId,splitForTimestamp,finite,deepFreeze}=require('./contracts.js');

function openTs(row){return finite(Array.isArray(row)?row[0]:row?.openTime)}
function closeTs(row){return finite(Array.isArray(row)?row[6]:row?.closeTime)}
function close(row){return finite(Array.isArray(row)?row[4]:row?.close)}
function high(row){return finite(Array.isArray(row)?row[2]:row?.high)}
function low(row){return finite(Array.isArray(row)?row[3]:row?.low)}
function quote(row){return finite(Array.isArray(row)?row[7]:row?.quoteVolume)}
function trimClosedFrames(frames,signalCandleCloseTs){
  const cutoff=finite(signalCandleCloseTs);if(cutoff==null)throw new Error('signalCandleCloseTs required');
  const out={};
  for(const [tf,rows] of Object.entries(frames||{}))out[tf]=(Array.isArray(rows)?rows:[]).filter(r=>{
    const o=openTs(r),c=closeTs(r);return o!=null&&c!=null&&o<=cutoff&&c<=cutoff;
  });
  return out;
}
function pctReturn(rows,barsBack=1){
  const xs=(Array.isArray(rows)?rows:[]).map(close).filter(v=>v!=null);
  if(xs.length<=barsBack)return null;const a=xs[xs.length-1-barsBack],b=xs[xs.length-1];return a?((b/a)-1)*100:null;
}
function ema(values,p){
  const xs=values.filter(v=>v!=null);if(!xs.length)return null;const a=2/(p+1);let e=xs[0];for(let i=1;i<xs.length;i++)e=xs[i]*a+e*(1-a);return e;
}
function atr(rows,period=14){
  const xs=Array.isArray(rows)?rows:[];if(xs.length<period+1)return null;const tr=[];
  for(let i=xs.length-period;i<xs.length;i++){const h=high(xs[i]),l=low(xs[i]),pc=close(xs[i-1]);if(h==null||l==null||pc==null)return null;tr.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)))}
  return tr.reduce((a,b)=>a+b,0)/tr.length;
}
function structureCode(s){return s==='bullish'?1:s==='bearish'?-1:0}
function availability(features){return Object.fromEntries(Object.entries(features).map(([k,v])=>[k,v!==null&&v!==undefined&&Number.isFinite(v)]))}
function buildFeatureSnapshot({symbol,frames,signalCandleCloseTs,manifest,universe={},scannerItem={},validationEndTs}={}){
  if(!manifest?.frozen)throw new Error('frozen manifest required');
  const cutoff=finite(signalCandleCloseTs);if(cutoff==null)throw new Error('signalCandleCloseTs required');
  const closed=trimClosedFrames(frames,cutoff),m15=closed['15m']||[];
  if(!m15.length)throw new Error('closed signal timeframe data required');
  const last=m15[m15.length-1],entryPrice=close(last),signalOpen=openTs(last),signalClose=closeTs(last);
  if(entryPrice==null||entryPrice<=0||signalClose==null||signalClose>cutoff)throw new Error('invalid signal candle');
  const deep=Deep.analyzeDeep({symbol,frames:closed,dataState:'live'});
  const i15=Deep.indicatorSnapshot(m15);
  const closes15=m15.map(close).filter(v=>v!=null),atr15=atr(m15,14),ema9=ema(closes15,9),ema21=ema(closes15,21);
  const q24=m15.length>=96?m15.slice(-96).map(quote).every(v=>v!=null)?m15.slice(-96).reduce((s,r)=>s+quote(r),0):null:null;
  const kdj=deep.momentumSignals?.kdj15m||{};
  const numericFeatures={
    return5mPct:pctReturn(closed['5m'],1),
    return15mPct:pctReturn(m15,1),
    return1hPct:deep.priceChange1h??pctReturn(closed['1h'],1),
    return4hPct:pctReturn(closed['4h'],1),
    return24hPct:m15.length>=97?pctReturn(m15,96):null,
    quoteVolume24h:q24,
    volumeAcceleration:finite(deep.volumeAcceleration),
    volumeAcceleration4h:finite(deep.volumeAcceleration4h),
    volumeAcceleration1h:finite(deep.volumeAcceleration1h),
    volumeAcceleration15m:finite(deep.volumeAcceleration15m),
    takerRatio:finite(deep.takerRatio),
    rsi15m:finite(i15.rsi),
    macdHist15m:finite(i15.macdHist),
    stochRsi15m:finite(i15.stochRsi),
    kdjK15m:finite(kdj.k),
    kdjD15m:finite(kdj.d),
    kdjJ15m:finite(kdj.j),
    atr15m:finite(atr15),
    ribbonWidthAtr15m:atr15&&ema9!=null&&ema21!=null?Math.abs(ema9-ema21)/atr15:null,
    structureCode:structureCode(deep.structure),
    breakout:deep.breakout?1:0,
    candidateScore:finite(scannerItem.candidateScore),
    rawConfidence:finite(scannerItem.tradeSignal?.confidence)
  };
  const out={
    eventId:eventId({symbol,signalCandleCloseTs:signalClose,screenerConfigVersion:manifest.screenerConfigVersion}),
    symbol:String(symbol||'').toUpperCase(),
    signalCandleOpenTs:signalOpen,
    signalCandleCloseTs:signalClose,
    entryPrice,
    datasetSplit:splitForTimestamp(signalClose,validationEndTs),
    universeVersion:String(universe.universeVersion||'unknown'),
    universeMode:String(universe.universeMode||'unknown'),
    survivorshipSafe:Boolean(universe.survivorshipSafe),
    featureSchemaVersion:String(manifest.featureSchemaVersion||FEATURE_SCHEMA_VERSION),
    screenerConfigVersion:String(manifest.screenerConfigVersion),
    outcomeSchemaVersion:String(manifest.outcomeSchemaVersion||OUTCOME_SCHEMA_VERSION),
    thresholdManifestVersion:String(manifest.manifestVersion),
    source:'historical-replay',
    numericFeatures,
    featureAvailability:availability(numericFeatures),
    explanatoryTags:{
      scanClassKey:scannerItem.scanClass?.key||scannerItem.scanClassKey||null,
      sector:scannerItem.sector||null
    }
  };
  return deepFreeze(out);
}
module.exports={trimClosedFrames,buildFeatureSnapshot,pctReturn,atr};
