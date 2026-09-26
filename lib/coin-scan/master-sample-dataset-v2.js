'use strict';

const Master=require('./master-samples.js');

const VERSION='MASTER_SAMPLE_DATASET_v2';

function finite(v){
  if(v===null||v===undefined||v==='')return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function first(...values){
  for(const v of values) if(v!==undefined&&v!==null&&v!=='') return v;
  return null;
}
function upperSymbol(v){
  if(!v)return null;
  const s=String(v).toUpperCase();
  return s.endsWith('USDT')?s:`${s}USDT`;
}
function isoish(v){
  if(!v)return null;
  const d=new Date(v);
  return Number.isNaN(d.getTime())?String(v):d.toISOString();
}
function median(values){
  const a=values.map(finite).filter(v=>v!=null).sort((x,y)=>x-y);
  if(!a.length)return null;
  const m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function mean(values){
  const a=values.map(finite).filter(v=>v!=null);
  return a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
}
function pctTrue(values){
  const a=values.filter(v=>v===true||v===false);
  return a.length?(a.filter(Boolean).length/a.length)*100:null;
}

function inferLabel({name='',source='',record={}}={}){
  const explicit=String(record.label||record.labelStatus||'').toUpperCase().replace(/[- ]/g,'_');
  if(['SURGE','REIGNITION','PRE_OUTCOME','FAILED_BOS','NO_TRIGGER','CONTROL','POST_SURGE','UNLABELED'].includes(explicit))return explicit;
  const text=[name,source,record.stage,record.status,record.outcome,record.dna]
    .filter(Boolean).join(' ').toUpperCase();
  if(/CONTROL|대조군/.test(text))return 'CONTROL';
  if(/FAILED_BOS|FAILED|BROKEN|FAIL/.test(text))return 'FAILED_BOS';
  if(/NO_TRIGGER|UNRESOLVED|PENDING/.test(text))return 'NO_TRIGGER';
  if(/POST[_ -]?SURGE|이미진행|PROGRESSED/.test(text))return 'POST_SURGE';
  if(/REIGNITION|재점화/.test(text))return 'REIGNITION';
  if(/LIVE-CANDIDATE|PRE_OUTCOME|WATCH|WAIT/.test(text))return 'PRE_OUTCOME';
  if(/SURGE|IGNITION|BREAKOUT|EXPANSION|점화|급등/.test(text))return 'SURGE';
  return 'UNLABELED';
}

function eventTime(record={}){
  return isoish(first(
    record.t0,record.event_time,record.eventTime,record.historicalT0,
    record.first15mIgnition,record.capturedAt,record.asOf,record.sampledAt
  ));
}
function eventKey(symbol,time,record={}){
  const stable=first(record.key,record.id,record.sampleId,record.name);
  return [symbol||'UNKNOWN',time||stable||'UNDATED'].join('@');
}

function normalizeFeatures(record={}){
  const tf4h=record.tf4h||{};
  const tf1h=record.tf1h||{};
  const tf15m=record.tf15m||{};
  return {
    price:{
      pre6hPct:finite(first(record.pre6h_change_pct,record.pre6hChangePct,record.pre6hPricePct)),
      pre24hPct:finite(first(record.pre24hPricePct,record.pre24h_change_pct)),
      change24hPct:finite(first(record.change24hPct,record.change_24h_pct,record.futures24hPct)),
      breakout1hPct:finite(first(record.breakout_1h_pct,record.breakout1hPct,record.bodyPct,record.t0BarPct))
    },
    oi:{
      m15Pct:finite(first(record.oi_pre_15m_pct,record.oi15_pct,record.oi15mPct)),
      h1Pct:finite(first(record.oi_pre_1h_pct,record.oi1h_pct,record.oi1hPct)),
      h4Pct:finite(first(record.oi_pre_4h_pct,record.oi4h_pct,record.oi4hPct,record.oi4hLatestPct)),
      h6Pct:finite(first(record.oi6Pct,record.pre6hOiPct)),
      h24Pct:finite(first(record.oi24Pct,record.pre24hOiPct)),
      post3hPct:finite(record.oiPost3Pct)
    },
    taker:{
      pre:finite(first(record.taker_pre_1h,record.taker_pre,record.takerPre,record.pre6hTakerAvg,record.pre24hTakerAvg)),
      preMax:finite(record.takerPreMax),
      ignition:finite(first(record.taker_break_1h,record.taker_break,record.takerBreak,record.takerT0)),
      m5:finite(record.taker5m),
      m15:finite(record.taker15m),
      h1:finite(record.taker1h)
    },
    volume:{
      rvol1h:finite(first(record.breakout_rvol,record.breakout_1h_rvol,record.rvol1h,record.t0Rvol,record.t0Rvol20,tf1h.rvol)),
      rvol4h:finite(tf4h.rvol),
      rvol15m:finite(first(record.m15Rvol,tf15m.rvol)),
      probeRvol:finite(record.probeRvol),
      probeAgeH:finite(record.probeAgeH),
      postProbeVolRatio:finite(record.postProbeVolRatio)
    },
    indicators:{
      rsi4h:finite(first(record.h4Rsi,tf4h.rsi)),
      rsi1h:finite(first(record.h1Rsi,tf1h.rsi)),
      rsi15m:finite(first(record.m15Rsi,tf15m.rsi)),
      macd4h:first(tf4h.macd,record.macd4h),
      macd1h:first(tf1h.macd,record.macd1h),
      ma4h:first(tf4h.ma_align,record.ma4h),
      ma1h:first(tf1h.ma_align,record.ma1h)
    },
    structure:{
      bos4h:first(tf4h.bos,record.bos4h),
      bos1h:first(tf1h.bos,record.bos1h),
      sweepLow:Boolean(first(tf1h.sweep_low,tf15m.sweep_low,false)),
      sweepHigh:Boolean(first(tf1h.sweep_high,tf15m.sweep_high,false)),
      route:Array.isArray(record.route)?record.route:[],
      dna:first(record.dna,record.path,record.lane),
      stage:first(record.stage,record.status,record.scannerState)
    },
    crossMarket:{
      spotConfirmed:first(record.spotConfirmed,record.spotSupported),
      funding:finite(first(record.funding_at_event,record.fundingPct)),
      basisPct:finite(first(record.basisT0Pct,record.basisPct))
    },
    outcomes:{
      h1Pct:finite(first(record.outcome1hPct,record?.outcomeV2?.horizons?.h1?.returnPct)),
      h3Pct:finite(first(record.outcome3hPct,record?.outcomeV2?.horizons?.h3?.returnPct)),
      h6Pct:finite(first(record.outcome6hPct,record?.outcomeV2?.horizons?.h6?.returnPct)),
      h12Pct:finite(first(record.outcome12hPct,record?.outcomeV2?.horizons?.h12?.returnPct)),
      h24Pct:finite(first(record.outcome24hPct,record?.outcomeV2?.horizons?.h24?.returnPct)),
      h72Pct:finite(first(record.outcome72hPct,record?.outcomeV2?.horizons?.h72?.returnPct)),
      mfePct:finite(first(record.mfe72hPct,record?.outcomeV2?.mfePct)),
      maePct:finite(first(record.mae72hPct,record?.outcomeV2?.maePct))
    }
  };
}

function mergeDeep(target,source){
  if(source===null||source===undefined)return target;
  if(Array.isArray(source))return source.length?source:target;
  if(typeof source!=='object')return target===null||target===undefined?source:target;
  const out={...(target&&typeof target==='object'?target:{})};
  for(const [k,v] of Object.entries(source)){
    if(v===null||v===undefined||v==='')continue;
    out[k]=mergeDeep(out[k],v);
  }
  return out;
}

function normalizeRecord({record={},source,name=null,kind='raw'}){
  const symbol=upperSymbol(first(record.symbol,name&&String(name).split('-')[0]));
  if(!symbol)return null;
  const time=eventTime(record);
  const label=inferLabel({name:name||symbol,source,record});
  return {
    id:eventKey(symbol,time,record),
    symbol,
    eventTime:time,
    label,
    kind,
    features:normalizeFeatures(record),
    sources:[source],
    rawNames:name?[name]:[],
    provenance:[{source,kind}]
  };
}

function runtimeRecords(){
  const rows=[];
  for(const row of Master.SAMPLE_LIBRARY||[]){
    const rec=normalizeRecord({record:row.observed||{},source:'lib/coin-scan/sample-library.js',name:row.name,kind:'runtime-positive'});
    if(rec){
      rec.expected=row.expected||{};
      rec.displayLabel=row.label||row.name;
      rows.push(rec);
    }
  }
  for(const row of Master.NEGATIVE_SAMPLE_LIBRARY||[]){
    const rec=normalizeRecord({record:row.observed||{},source:'lib/coin-scan/sample-library.js#negative',name:row.name,kind:'runtime-control'});
    if(rec){
      rec.label='CONTROL';
      rec.expected=row.expected||{};
      rec.displayLabel=row.label||row.name;
      rows.push(rec);
    }
  }
  return rows;
}

function rawRecords(){
  const out=[];
  for(const src of Master.loadAllRawSamples()){
    if(!src.ok)continue;
    const found=[];
    Master.collectSymbolRecords(src.data,src.path,found);
    for(const x of found){
      const rec=normalizeRecord({record:x.record,source:src.path,name:x.symbol,kind:'raw-archive'});
      if(rec)out.push(rec);
    }
  }
  return out;
}

function dedupe(records=[]){
  const map=new Map();
  for(const row of records){
    const existing=map.get(row.id);
    if(!existing){map.set(row.id,row);continue;}
    existing.features=mergeDeep(existing.features,row.features);
    existing.expected=mergeDeep(existing.expected,row.expected);
    existing.sources=[...new Set([...(existing.sources||[]),...(row.sources||[])])];
    existing.rawNames=[...new Set([...(existing.rawNames||[]),...(row.rawNames||[])])];
    existing.provenance=[...(existing.provenance||[]),...(row.provenance||[])];
    if(existing.label==='UNLABELED'&&row.label!=='UNLABELED')existing.label=row.label;
    if(existing.label==='NO_TRIGGER'&&['SURGE','REIGNITION','CONTROL','FAILED_BOS'].includes(row.label))existing.label=row.label;
  }
  return [...map.values()].sort((a,b)=>(a.eventTime||'').localeCompare(b.eventTime||'')||a.symbol.localeCompare(b.symbol));
}

function statBlock(rows=[]){
  const f=k=>rows.map(r=>{
    const parts=k.split('.');
    let v=r.features;
    for(const p of parts)v=v?.[p];
    return v;
  });
  return {
    n:rows.length,
    medians:{
      pre6hPricePct:median(f('price.pre6hPct')),
      oi4hPct:median(f('oi.h4Pct')),
      oi1hPct:median(f('oi.h1Pct')),
      takerPre:median(f('taker.pre')),
      takerPreMax:median(f('taker.preMax')),
      rvol1h:median(f('volume.rvol1h')),
      probeRvol:median(f('volume.probeRvol')),
      probeAgeH:median(f('volume.probeAgeH'))
    },
    means:{
      pre6hPricePct:mean(f('price.pre6hPct')),
      oi4hPct:mean(f('oi.h4Pct')),
      takerPre:mean(f('taker.pre')),
      rvol1h:mean(f('volume.rvol1h'))
    },
    rates:{
      spotConfirmedPct:pctTrue(f('crossMarket.spotConfirmed')),
      sweepLowPct:pctTrue(f('structure.sweepLow')),
      sweepHighPct:pctTrue(f('structure.sweepHigh'))
    }
  };
}

function buildMasterSampleDatasetV2(){
  const all=dedupe([...runtimeRecords(),...rawRecords()]);
  const byLabel={};
  for(const r of all)(byLabel[r.label]||(byLabel[r.label]=[])).push(r);
  const stats={all:statBlock(all),byLabel:{}};
  for(const [label,rows] of Object.entries(byLabel))stats.byLabel[label]=statBlock(rows);
  return {
    version:VERSION,
    generatedAt:new Date().toISOString(),
    dedupeRule:'symbol + eventTime (fallback stable record id/name); merge duplicate evidence and preserve sources[]',
    labelOrder:['SURGE','REIGNITION','PRE_OUTCOME','FAILED_BOS','NO_TRIGGER','CONTROL','POST_SURGE','UNLABELED'],
    summary:{
      events:all.length,
      symbols:new Set(all.map(x=>x.symbol)).size,
      sourceFiles:new Set(all.flatMap(x=>x.sources)).size,
      labels:Object.fromEntries(Object.entries(byLabel).map(([k,v])=>[k,v.length]))
    },
    stats,
    events:all
  };
}

module.exports={
  VERSION,
  normalizeRecord,
  dedupe,
  statBlock,
  buildMasterSampleDatasetV2
};
