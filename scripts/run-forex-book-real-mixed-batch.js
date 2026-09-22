'use strict';

const fs=require('fs');
const path=require('path');
const Replay=require('../lib/research-backtest-v2/forex-book-replay.js');

const OUT_DIR=path.join(process.cwd(),'artifacts','forex-book-replay');
const START_TS=Date.parse(process.env.REPLAY_START||'2026-07-01T23:59:59.999Z');
const END_TS=Date.parse(process.env.REPLAY_END||'2026-09-15T23:59:59.999Z');
const STEP_MS=24*60*60*1000;
const FUTURE_MS=72*60*60*1000;
const BASE='https://fapi.binance.com';

const SYMBOLS=Object.freeze([
  'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','DOGEUSDT','ADAUSDT',
  'LINKUSDT','AVAXUSDT','SUIUSDT','1000PEPEUSDT','WIFUSDT','1000BONKUSDT',
  '1000SHIBUSDT','1000FLOKIUSDT','FETUSDT','ENAUSDT','ONDOUSDT','NEARUSDT',
  'APTUSDT','TAOUSDT'
]);
const TF_MS=Object.freeze({
  '15m':15*60*1000,'1h':60*60*1000,'4h':4*60*60*1000,'1d':24*60*60*1000,'1w':7*24*60*60*1000
});
const PRE_ROLL=Object.freeze({
  '15m':260,'1h':180,'4h':140,'1d':110,'1w':65
});

function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}
function ensureDir(p){fs.mkdirSync(p,{recursive:true})}
function median(vals){
  const a=vals.filter(Number.isFinite).slice().sort((x,y)=>x-y);
  if(!a.length)return null;
  const m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function avg(vals){
  const a=vals.filter(Number.isFinite);return a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
}
function rank(values){
  const indexed=values.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v);
  const out=Array(values.length).fill(null);
  let i=0;
  while(i<indexed.length){
    let j=i+1;while(j<indexed.length&&indexed[j].v===indexed[i].v)j++;
    const r=(i+j-1)/2+1;
    for(let k=i;k<j;k++)out[indexed[k].i]=r;
    i=j;
  }
  return out;
}
function pearson(a,b){
  if(a.length!==b.length||a.length<3)return null;
  const ma=avg(a),mb=avg(b);
  let num=0,da=0,db=0;
  for(let i=0;i<a.length;i++){
    const x=a[i]-ma,y=b[i]-mb;num+=x*y;da+=x*x;db+=y*y;
  }
  return da>0&&db>0?num/Math.sqrt(da*db):null;
}
function spearman(rows,xFn,yFn){
  const pairs=rows.map(r=>[finite(xFn(r)),finite(yFn(r))]).filter(([x,y])=>x!=null&&y!=null);
  if(pairs.length<3)return{n:pairs.length,rho:null};
  return{n:pairs.length,rho:pearson(rank(pairs.map(x=>x[0])),rank(pairs.map(x=>x[1])))};
}
function csvEscape(v){
  if(v==null)return'';
  const s=typeof v==='object'?JSON.stringify(v):String(v);
  return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
function writeCsv(file,rows){
  if(!rows.length){fs.writeFileSync(file,'');return}
  const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];
  fs.writeFileSync(file,[keys.join(','),...rows.map(r=>keys.map(k=>csvEscape(r[k])).join(','))].join('\n'));
}
function klineClose(r){return finite(r?.[6])}
function futureRows(rows,cutoff){
  return (rows||[]).filter(r=>{
    const o=finite(r?.[0]),c=klineClose(r);
    return o!=null&&c!=null&&o>cutoff&&c<=cutoff+FUTURE_MS;
  });
}
async function fetchJson(url,attempt=0){
  const res=await fetch(url,{headers:{'user-agent':'PulseRadar-Research/1.0'}});
  if(res.status===429||res.status===418){
    if(attempt>=6)throw new Error('rate limited '+res.status);
    await sleep(1200*Math.pow(2,attempt));return fetchJson(url,attempt+1);
  }
  if(!res.ok){
    const txt=await res.text().catch(()=> '');
    throw new Error('HTTP '+res.status+' '+txt.slice(0,160));
  }
  return res.json();
}
async function fetchKlines(symbol,tf,startTime,endTime){
  const out=[];let cursor=startTime,guard=0;
  while(cursor<=endTime&&guard++<100){
    const url=BASE+'/fapi/v1/klines?symbol='+encodeURIComponent(symbol)+'&interval='+encodeURIComponent(tf)+
      '&startTime='+Math.floor(cursor)+'&endTime='+Math.floor(endTime)+'&limit=1500';
    const rows=await fetchJson(url);
    if(!Array.isArray(rows)||!rows.length)break;
    out.push(...rows);
    const last=rows.at(-1),next=finite(last?.[6]);
    if(next==null||next<cursor)break;
    cursor=next+1;
    if(rows.length<1500)break;
    await sleep(35);
  }
  const seen=new Set();
  return out.filter(r=>{
    const key=String(r?.[0]);if(seen.has(key))return false;seen.add(key);return true;
  }).sort((a,b)=>Number(a[0])-Number(b[0]));
}
function cutoffGrid(){
  const out=[];
  for(let ts=START_TS;ts<=END_TS;ts+=STEP_MS)out.push(ts);
  return out;
}
function coverageOk(frames,cutoff){
  const mins={'15m':80,'1h':80,'4h':60,'1d':50,'1w':35};
  return Object.entries(mins).every(([tf,min])=>{
    const rows=(frames[tf]||[]).filter(r=>klineClose(r)!=null&&klineClose(r)<=cutoff);
    return rows.length>=min;
  });
}
function stageStats(records){
  const groups={};
  for(const r of records){
    const k=r.stage_label||'UNKNOWN';
    if(!groups[k])groups[k]=[];
    groups[k].push(r);
  }
  const out={};
  for(const [stage,rows] of Object.entries(groups)){
    const evals=rows.filter(r=>r.outcome_class==='SURGE'||r.outcome_class==='CONTROL');
    const surge=evals.filter(r=>r.outcome_class==='SURGE').length;
    const control=evals.filter(r=>r.outcome_class==='CONTROL').length;
    out[stage]={
      count:rows.length,evaluated:evals.length,surge,control,
      surgeRate:evals.length?surge/evals.length:null,
      stateScoreMedian:median(rows.map(r=>finite(r.state_score))),
      mtfScoreMedian:median(rows.map(r=>finite(r.mtf_score))),
      localQualityMedian:median(rows.map(r=>finite(r.local_quality))),
      h6MfeMedian:median(evals.map(r=>finite(r.h6_mfe_pct))),
      h24MfeMedian:median(evals.map(r=>finite(r.h24_mfe_pct))),
      h24ReturnMedian:median(evals.map(r=>finite(r.h24_return_pct))),
      h24MaeMedian:median(evals.map(r=>finite(r.h24_mae_pct)))
    };
  }
  return out;
}
function outcomeStats(records){
  const evals=records.filter(r=>r.outcome_class==='SURGE'||r.outcome_class==='CONTROL');
  const surge=evals.filter(r=>r.outcome_class==='SURGE').length;
  const control=evals.filter(r=>r.outcome_class==='CONTROL').length;
  return{
    count:records.length,evaluated:evals.length,surge,control,pending:records.length-evals.length,
    surgeRate:evals.length?surge/evals.length:null,
    classBalanceReady:surge>=20&&control>=20,
    minimumNReady:evals.length>=50,
    formalGate:evals.length>=50&&surge>=20&&control>=20
  };
}
async function loadSymbol(symbol){
  const frames={};const fetchMeta={};
  for(const tf of ['1w','1d','4h','1h','15m']){
    const pre=PRE_ROLL[tf]*TF_MS[tf];
    const start=START_TS-pre;
    const end=END_TS+FUTURE_MS+TF_MS[tf];
    const t0=Date.now();
    const rows=await fetchKlines(symbol,tf,start,end);
    frames[tf]=rows;
    fetchMeta[tf]={rows:rows.length,start:rows[0]?.[0]??null,end:rows.at(-1)?.[6]??null,ms:Date.now()-t0};
    await sleep(40);
  }
  return{frames,fetchMeta};
}
async function main(){
  ensureDir(OUT_DIR);
  const cutoffs=cutoffGrid(),allRecords=[],transitionRecords=[],symbolReports=[],errors=[];
  console.log('Frozen cohort',JSON.stringify({start:new Date(START_TS).toISOString(),end:new Date(END_TS).toISOString(),cutoffs:cutoffs.length,symbols:SYMBOLS}));
  for(let si=0;si<SYMBOLS.length;si++){
    const symbol=SYMBOLS[si];
    console.log('['+(si+1)+'/'+SYMBOLS.length+'] fetch '+symbol);
    try{
      const {frames,fetchMeta}=await loadSymbol(symbol);
      let previousStage=null,observations=0,transitions=0,skipped=0;
      for(const cutoff of cutoffs){
        if(!coverageOk(frames,cutoff)){skipped++;continue}
        const decision=Replay.buildReplayDecision({
          symbol,frames,cutoff,selectedTf:'1h',previousStage,historicalContext:null
        });
        previousStage=decision.stage_label;
        const future=futureRows(frames['15m'],cutoff);
        const outcome=Replay.evaluateNextOpenOutcome({decision,futureBars:future});
        const flat=Replay.flattenReplayRecord(decision,outcome);
        allRecords.push(flat);observations++;
        if(decision.is_stage_transition){transitionRecords.push(flat);transitions++}
      }
      symbolReports.push({symbol,observations,transitions,skipped,fetchMeta});
      console.log('  observations='+observations+' transitions='+transitions);
    }catch(e){
      const err={symbol,error:String(e?.stack||e)};
      errors.push(err);console.error('  FAILED',err.error.slice(0,500));
    }
  }
  const all=outcomeStats(allRecords),transitions=outcomeStats(transitionRecords);
  const summary={
    schemaVersion:'FOREX_BOOK_REAL_MIXED_BATCH_v1',
    generatedAt:new Date().toISOString(),
    cohort:{
      frozen:true,selection:'fixed-symbol-list x daily UTC cutoff grid; outcome-blind',
      startTs:START_TS,startIso:new Date(START_TS).toISOString(),
      endTs:END_TS,endIso:new Date(END_TS).toISOString(),
      cutoffCount:cutoffs.length,symbolCount:SYMBOLS.length,symbols:SYMBOLS,
      selectedTf:'1h',historicalDerivativeContext:'not supplied in v1 batch'
    },
    allObservations:all,
    stageTransitions:transitions,
    byStageAll:stageStats(allRecords),
    byStageTransitions:stageStats(transitionRecords),
    correlations:{
      all:{
        stateScore_vs_h24Mfe:spearman(allRecords,r=>r.state_score,r=>r.h24_mfe_pct),
        localQuality_vs_h24Mfe:spearman(allRecords,r=>r.local_quality,r=>r.h24_mfe_pct),
        stageOrdinal_vs_h24Mfe:spearman(allRecords,r=>Replay.STAGE_ORDINAL?.[r.stage_label]??null,r=>r.h24_mfe_pct)
      },
      transitions:{
        stateScore_vs_h24Mfe:spearman(transitionRecords,r=>r.state_score,r=>r.h24_mfe_pct),
        localQuality_vs_h24Mfe:spearman(transitionRecords,r=>r.local_quality,r=>r.h24_mfe_pct),
        stageOrdinal_vs_h24Mfe:spearman(transitionRecords,r=>Replay.STAGE_ORDINAL?.[r.stage_label]??null,r=>r.h24_mfe_pct)
      }
    },
    integrity:{
      futureCandleSeenCount:allRecords.filter(r=>r.future_candle_seen).length,
      contextAfterCutoffCount:allRecords.filter(r=>r.context_not_after_cutoff===false).length,
      nextOpenMissingCount:allRecords.filter(r=>r.next_open==null).length
    },
    symbolReports,errors,
    interpretationGate:{
      transitionPerformanceConclusionAllowed:transitions.formalGate,
      mainScannerIntegrationAllowed:false,
      note:transitions.formalGate?
        'Minimum sample/class-balance software gate passed. Frozen validation and incremental-value review still required before scanner integration.':
        'Formal transition cohort gate not met. Treat results as smoke/exploratory only.'
    }
  };
  fs.writeFileSync(path.join(OUT_DIR,'summary.json'),JSON.stringify(summary,null,2));
  writeCsv(path.join(OUT_DIR,'all-observations.csv'),allRecords);
  writeCsv(path.join(OUT_DIR,'stage-transitions.csv'),transitionRecords);
  fs.writeFileSync(path.join(OUT_DIR,'errors.json'),JSON.stringify(errors,null,2));
  console.log('SUMMARY_JSON_START');
  console.log(JSON.stringify(summary,null,2));
  console.log('SUMMARY_JSON_END');
  if(summary.integrity.futureCandleSeenCount!==0||summary.integrity.contextAfterCutoffCount!==0){
    throw new Error('replay integrity violation');
  }
  if(allRecords.length<50)throw new Error('mixed batch produced fewer than 50 observations');
}
main().catch(e=>{console.error(e);process.exit(1)});
