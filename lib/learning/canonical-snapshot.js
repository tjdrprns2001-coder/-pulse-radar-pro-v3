'use strict';

const VERSION='RESEARCH_CANONICAL_SNAPSHOT_v2';
const TFS=Object.freeze(['1w','3d','1d','12h','4h','3h','2h','1h','15m','5m']);

function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function s(v){return v==null?null:String(v)}
function bool(v){return typeof v==='boolean'?v:null}
function clone(v){return v==null?null:JSON.parse(JSON.stringify(v))}

function tfSnapshot(item,tf){
  const stats=item?.stats?.[tf]||{};
  const state=item?.tfState?.[tf];
  return{
    available:bool(stats.available)??(state!=null?true:null),
    trend:s(stats.trend??state?.trend??state),
    rsi:n(stats.rsi??state?.rsi),
    macd:n(stats.macd??state?.macd),
    rvol:n(stats.rvol??state?.rvol),
    obvUp:bool(stats.obvUp??state?.obvUp),
    compression:n(stats.compression??state?.compression),
    close:n(stats.close??state?.close),
    bars:n(stats.bars??state?.bars),
    lastClosedAt:n(stats.lastClosedAt??state?.lastClosedAt)
  };
}
function canonicalize(item={},meta={}){
  const timeframes={};
  for(const tf of TFS)timeframes[tf]=tfSnapshot(item,tf);
  const book=item.bookEvidence||{};
  return{
    version:VERSION,
    symbol:s(item.symbol),
    asOf:n(item.asOf??item.updatedAt),
    capturedAt:n(meta.capturedAt??Date.now()),
    source:s(meta.source??item.source),
    market:{
      price:n(item.price??item.lastPrice),
      change24hPct:n(item.change24h??item.priceChange24h),
      quoteVolume24h:n(item.quoteVolume24h??item.futuresQuoteVolume24h??item.spotQuoteVolume24h),
      regime:s(item.regime),
      btcState:clone(meta.btcState??item.marketContext?.btc),
      ethState:clone(meta.ethState??item.marketContext?.eth),
      sector:s(item.sector??meta.sector)
    },
    derivatives:{
      oi4hPct:n(item.flow?.oi4hPct??item.oi4hChangePct),
      oi8hPct:n(item.oi8hChangePct),
      takerRatio:n(item.flow?.takerRatio??item.trueTakerRatio??item.takerRatio),
      fundingPct:n(item.flow?.funding8hPct??item.fundingRate)
    },
    structure:{
      direction:s(item.structure),
      liquidityPattern:s(item.liquidityPattern),
      bos:clone(item.structureSignals?.bos??item.bos),
      choch:clone(item.structureSignals?.choch??item.choch),
      mss:clone(item.structureSignals?.mss??item.bookEvidence?.smc?.mss),
      fvg:clone(item.structureSignals?.fvg??item.bookEvidence?.smc?.fvg),
      orderBlock:clone(item.structureSignals?.orderBlock??item.bookEvidence?.smc?.orderBlock),
      pdArray:clone(item.v3NearestPd??item.bookEvidence?.ict?.pdArray)
    },
    pattern:{
      setupType:s(item.setup?.type??item.v2Type),
      sampleArchetype:s(item.sampleArchetype),
      samplePhase:s(item.samplePhase),
      sampleScore:n(item.sampleScore),
      preSurge:clone(item.preSurge),
      samplePattern:clone(item.samplePattern)
    },
    evidence:{
      scannerScore:n(item.score??item.preIgnitionScore??item.candidateScore??item.tradeSignal?.confidence),
      bookScore:n(item.bookScore??book.book?.score),
      bookBias:s(item.bookBias??book.book?.bias),
      smartMoneyScore:n(item.smartMoneyScore??book.smartMoney?.score),
      smcBias:s(item.smcBias??book.smc?.bias),
      ictBias:s(item.ictBias??book.ict?.bias),
      bookRuleIds:Array.isArray(meta.bookRuleIds)?meta.bookRuleIds.slice():[],
      rawBookEvidence:clone(book)
    },
    execution:{
      setupValid:bool(item.setup?.valid),
      entry:n(item.plan?.entry),
      stop:n(item.plan?.stop),
      target:n(item.plan?.target),
      netRR:n(item.plan?.netRR)
    },
    timeframes,
    rawRef:{
      scannerVersion:s(item.version??item.scannerVersion),
      dataState:s(item.dataState??item.state),
      marketSource:s(item.dataAudit?.source??item.source)
    }
  };
}
function flattenFeatures(snapshot={}){
  const out={};
  const put=(k,v)=>{out[k]=v==null?null:v};
  put('price',snapshot.market?.price);put('change24hPct',snapshot.market?.change24hPct);put('quoteVolume24h',snapshot.market?.quoteVolume24h);
  put('oi4hPct',snapshot.derivatives?.oi4hPct);put('oi8hPct',snapshot.derivatives?.oi8hPct);put('takerRatio',snapshot.derivatives?.takerRatio);put('fundingPct',snapshot.derivatives?.fundingPct);
  put('scannerScore',snapshot.evidence?.scannerScore);put('bookScore',snapshot.evidence?.bookScore);put('smartMoneyScore',snapshot.evidence?.smartMoneyScore);
  put('sampleScore',snapshot.pattern?.sampleScore);put('netRR',snapshot.execution?.netRR);
  for(const tf of TFS){
    const x=snapshot.timeframes?.[tf]||{};
    put(tf+'.rsi',x.rsi);put(tf+'.macd',x.macd);put(tf+'.rvol',x.rvol);put(tf+'.compression',x.compression);
  }
  return out;
}

module.exports={VERSION,TFS,canonicalize,flattenFeatures,tfSnapshot};
