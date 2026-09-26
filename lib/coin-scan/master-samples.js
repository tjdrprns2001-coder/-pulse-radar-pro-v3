'use strict';

const path=require('path');
const Library=require('./sample-library.js');

const ROOT=path.join(__dirname,'..','..');
const RAW_JSON_PATHS=Object.freeze([
  "PRE_SURGE_V3_LIVE_REVERSE_BATCH_2026-09-27.json",
  "PRE_SURGE_V3_REVERSE_TRACE_2026-09-26.json",
  "PRE_SURGE_V3_SAMPLES_2026-09-26.json",
  "data/samples/post-surge/2026-09-26-top-gainers.json",
  "data/samples/pre-surge/2026-09-26-reverse-trace.json",
  "data/samples/pre-surge/2026-09-27-aggregate-stats.json",
  "data/samples/pre-surge/2026-09-27-reverse-trace.json",
  "research/surge-samples/2026-09-24-live-pump-batch.json",
  "research/surge-samples/2026-09-26-astra-deep-dive-ordi-dot-trump-atom-shib.json",
  "research/surge-samples/2026-09-26-live-surge-batch-rare-pha-ark-ena-aero-pump.json",
  "research/surge-samples/2026-09-27-live-surge-reverse-trace-q-2z-br-spell-fil-dash.json",
  "research/surge-samples/2026-09-27-surge-reverse-trace-q-rare-2z-fil-dash-rune-qnt-ace.json",
  "research/surge-samples/SURGE-BATCH-2026-09-23-binance-15pct.json",  "research/surge-samples/SURGE-REVERSE-TRACE-2026-09-26.json",  "research/surge-samples/SURGE-REVERSE-TRACE-2026-09-27.json",  "data/samples/pre-outcome/2026-09-27-live-candidates.json",



  "data/samples/learning/research-ai-state-latest.json"
]);
const PROVENANCE_MANIFEST='data/samples/MASTER_SAMPLES_MANIFEST.json';

function loadJson(rel){
  try{
    const full=path.join(ROOT,rel);
    delete require.cache[require.resolve(full)];
    return {path:rel,ok:true,data:require(full)};
  }catch(error){
    return {path:rel,ok:false,error:String(error&&error.message||error)};
  }
}

function loadAllRawSamples(){
  return RAW_JSON_PATHS.map(loadJson);
}

function collectSymbolRecords(value,source,out=[]){
  if(Array.isArray(value)){
    for(const item of value) collectSymbolRecords(item,source,out);
    return out;
  }
  if(value&&typeof value==='object'){
    if(typeof value.symbol==='string'){
      out.push({symbol:value.symbol.toUpperCase(),source,record:value});
    }
    for(const child of Object.values(value)) collectSymbolRecords(child,source,out);
  }
  return out;
}

function buildUnifiedSampleIndex(){
  const raw=loadAllRawSamples();
  const records=[];
  for(const item of raw){
    if(item.ok) collectSymbolRecords(item.data,item.path,records);
  }
  const bySymbol={};
  for(const row of records){
    (bySymbol[row.symbol]||(bySymbol[row.symbol]=[])).push(row);
  }
  return {
    generatedAt:Date.now(),
    runtimeLibraryCount:Library.SAMPLE_LIBRARY.length,
    negativeLibraryCount:Library.NEGATIVE_SAMPLE_LIBRARY.length,
    rawSourceCount:raw.length,
    loadedSourceCount:raw.filter(x=>x.ok).length,
    failedSources:raw.filter(x=>!x.ok),
    symbols:Object.keys(bySymbol).sort(),
    bySymbol,
    raw
  };
}

module.exports={
  ...Library,
  RAW_JSON_PATHS,
  PROVENANCE_MANIFEST,
  loadAllRawSamples,
  buildUnifiedSampleIndex
};
