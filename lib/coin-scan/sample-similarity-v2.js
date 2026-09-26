'use strict';

const Dataset=require('./master-sample-dataset-v2.js');

let CACHE=null;
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function avg(xs){const a=xs.map(finite).filter(v=>v!=null);return a.length?a.reduce((s,v)=>s+v,0)/a.length:null}
function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,v))}
function dataset(){if(!CACHE)CACHE=Dataset.buildMasterSampleDatasetV2();return CACHE}
function resetCache(){CACHE=null}

const SPECS=Object.freeze([
  ['price.pre6hPct',8,0.7],
  ['price.change24hPct',15,0.5],
  ['oi.h1Pct',6,1.0],
  ['oi.h4Pct',10,1.25],
  ['oi.h6Pct',12,0.7],
  ['oi.h24Pct',25,0.55],
  ['taker.pre',0.7,1.1],
  ['taker.preMax',1.2,0.8],
  ['taker.ignition',0.8,0.9],
  ['volume.rvol1h',8,1.25],
  ['volume.rvol15m',8,0.65],
  ['volume.probeRvol',12,0.75],
  ['volume.probeAgeH',18,0.45],
  ['indicators.rsi1h',30,0.45],
  ['indicators.rsi15m',35,0.35],
  ['crossMarket.funding',0.05,0.3],
  ['crossMarket.basisPct',0.5,0.35]
]);

function get(obj,path){return path.split('.').reduce((v,k)=>v==null?null:v[k],obj)}
function numericScore(a,b,tol){
  a=finite(a);b=finite(b);if(a==null||b==null)return null;
  const d=Math.abs(a-b),scale=Math.max(Math.abs(a),Math.abs(b),tol);
  return clamp(100*(1-d/(scale+tol)));
}
function boolScore(a,b){
  if(typeof a!=='boolean'||typeof b!=='boolean')return null;
  return a===b?100:0;
}
function textTokens(v){
  if(Array.isArray(v))return new Set(v.map(String).map(x=>x.toUpperCase()));
  if(v==null)return new Set();
  return new Set(String(v).toUpperCase().split(/[^A-Z0-9+_-]+/).filter(Boolean));
}
function overlapScore(a,b){
  const A=textTokens(a),B=textTokens(b);if(!A.size||!B.size)return null;
  let inter=0;for(const x of A)if(B.has(x))inter++;
  return 100*(2*inter/(A.size+B.size));
}

function candidateFeatures(input={}){
  const taker1=Array.isArray(input.taker1h)?input.taker1h:[];
  const taker15=Array.isArray(input.taker15m)?input.taker15m:[];
  const t1=taker1.map(finite).filter(v=>v!=null),t15=taker15.map(finite).filter(v=>v!=null);
  const maxT=t1.length||t15.length?Math.max(...t1,...t15):null;
  return {
    price:{pre6hPct:finite(input.price6hPct),change24hPct:finite(input.price24hPct)},
    oi:{h1Pct:finite(input.oi1hPct),h4Pct:finite(input.oi4hPct),h6Pct:finite(input.oi6hPct),h24Pct:finite(input.oi24hPct)},
    taker:{pre:avg(t1.slice(-6)),preMax:maxT,ignition:finite(t1.at(-1)),h1:finite(t1.at(-1)),m15:finite(t15.at(-1))},
    volume:{rvol1h:finite(input.rvol1h),rvol15m:finite(input.rvol15m),probeRvol:finite(input.probeRvol),probeAgeH:finite(input.probeAgeH)},
    indicators:{rsi1h:finite(input.rsi1h),rsi15m:finite(input.rsi15m),macd1h:Boolean(input.macd1hPositive)?'POSITIVE':null,ma1h:Boolean(input.maAligned1h)?'BULL':null},
    structure:{
      bos1h:Boolean(input.bosUp),
      sweepLow:Boolean(input.sslSweep||input.sslSweepReclaim),
      sweepHigh:Boolean(input.bslSweepFail),
      route:[input.sampleSubtype,input.dnaPrimary,...(input.dnaTags||[])].filter(Boolean),
      dna:input.dnaPrimary||input.sampleSubtype||null,
      stage:input.dnaStage||input.stageLabel||null
    },
    crossMarket:{spotConfirmed:input.spotConfirmed, funding:finite(input.fundingRate), basisPct:finite(input.basisPct)}
  };
}

function compare(features,event){
  const parts=[];
  let weighted=0,weights=0;
  for(const [path,tol,w] of SPECS){
    const s=numericScore(get(features,path),get(event.features,path),tol);
    if(s==null)continue;weighted+=s*w;weights+=w;parts.push({feature:path,score:Math.round(s)});
  }
  for(const path of ['structure.bos1h','structure.sweepLow','structure.sweepHigh','crossMarket.spotConfirmed']){
    const s=boolScore(get(features,path),get(event.features,path));
    if(s==null)continue;weighted+=s*.35;weights+=.35;parts.push({feature:path,score:Math.round(s)});
  }
  for(const path of ['structure.route','structure.dna','structure.stage']){
    const s=overlapScore(get(features,path),get(event.features,path));
    if(s==null)continue;weighted+=s*.7;weights+=.7;parts.push({feature:path,score:Math.round(s)});
  }
  const coverage=Math.min(1,weights/7);
  const raw=weights?weighted/weights:0;
  return {score:Math.round(raw*(0.65+0.35*coverage)),coverage:Number(coverage.toFixed(2)),matchedFeatures:parts.sort((a,b)=>b.score-a.score).slice(0,8)};
}

function cohort(labels){
  const set=new Set(labels);
  return dataset().events.filter(e=>set.has(e.label));
}
function topMatches(features,labels,n){
  return cohort(labels).map(event=>({event,...compare(features,event)}))
    .filter(x=>x.coverage>=.18)
    .sort((a,b)=>b.score-a.score||b.coverage-a.coverage).slice(0,n)
    .map(x=>({
      symbol:x.event.symbol,eventTime:x.event.eventTime,label:x.event.label,score:x.score,coverage:x.coverage,
      path:x.event.features?.structure?.dna||x.event.features?.structure?.route?.[0]||x.event.features?.structure?.stage||null,
      sources:(x.event.sources||[]).slice(0,3),matchedFeatures:x.matchedFeatures
    }));
}
function ignitionPath(input={},success=[]){
  if(input.dnaPrimary)return input.dnaPrimary;
  if(input.sampleSubtype)return input.sampleSubtype;
  if(Array.isArray(input.dnaTags)&&input.dnaTags.length)return input.dnaTags[0];
  return success.find(x=>x.path)?.path||'UNCLASSIFIED';
}
function conflicts(success,negative){
  const out=[];
  const s=success[0],n=negative[0];
  if(s&&n&&Math.abs(s.score-n.score)<=8)out.push('성공/실패 샘플 유사도가 근접');
  if(n&&n.score>=70)out.push('실패·대조군 고유사도');
  if(s&&s.coverage<.35)out.push('성공 샘플 비교 데이터 커버리지 낮음');
  if(!s)out.push('성공 샘플 유사도 근거 부족');
  return out;
}
function evaluate(input={}){
  const features=candidateFeatures(input);
  const success=topMatches(features,['SURGE','REIGNITION'],5);
  const negative=topMatches(features,['FAILED_BOS','CONTROL','NO_TRIGGER','PRE_OUTCOME'],3);
  const successScore=success[0]?.score||0,negativeScore=negative[0]?.score||0;
  const net=Math.round(clamp(successScore-negativeScore*.55));
  return {
    version:'SAMPLE_SIMILARITY_v2',
    successTop5:success,
    negativeTop3:negative,
    ignitionPath:ignitionPath(input,success),
    successScore,
    negativeScore,
    netEvidenceScore:net,
    conflictEvidence:conflicts(success,negative),
    interpretation:negativeScore>=successScore?'실패/대조군 유사도 우세':successScore>=75&&negativeScore<65?'성공 DNA 우세':'혼합 근거',
    disclaimer:'유사도는 과거 표본과의 근접도이며 수익 확률이 아니다.'
  };
}

module.exports={SPECS,candidateFeatures,compare,topMatches,evaluate,resetCache};
