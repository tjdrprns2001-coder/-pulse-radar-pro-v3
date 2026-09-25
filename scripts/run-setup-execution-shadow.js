'use strict';

const fs=require('fs');
const path=require('path');
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const Gate=require('../lib/coin-scan/setup-execution-gate.js');

const DEFAULT_SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','DOGEUSDT','LINKUSDT','SUIUSDT','ONDOUSDT','FETUSDT','PEPEUSDT','BONKUSDT','WIFUSDT'];

function arg(name,def=null){
  const p='--'+name+'=';
  const hit=process.argv.slice(2).find(x=>String(x).startsWith(p));
  return hit==null?def:String(hit).slice(p.length);
}
function symbols(v){return String(v||DEFAULT_SYMBOLS.join(',')).split(',').map(x=>x.trim().toUpperCase()).filter(Boolean)}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function ensureDir(p){fs.mkdirSync(p,{recursive:true})}
function writeJson(p,v){fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n','utf8')}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}
function summarizeSample(rows=[]){
  const total=rows.length;
  const any=rows.filter(x=>x.metrics.available).length;
  const pass=rows.filter(x=>!x.metrics.hardReject).length;
  const spot=rows.filter(x=>x.execution.spot?.available).length;
  const futures=rows.filter(x=>x.execution.futures?.available).length;
  return{
    symbolCount:total,
    anyExecutionCoverageRate:total?any/total:null,
    spotCoverageRate:total?spot/total:null,
    futuresCoverageRate:total?futures/total:null,
    executionPassRate:total?pass/total:null,
    hardRejectCount:total-pass,
    spreadsBps:rows.map(x=>finite(x.metrics.spreadBps)).filter(Number.isFinite),
    depths10Usd:rows.map(x=>finite(x.metrics.depth10Usd)).filter(Number.isFinite),
    maxSlippageBps:rows.map(x=>finite(x.metrics.maxSlippageBps)).filter(Number.isFinite)
  };
}
function dist(a=[]){
  const x=a.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  const q=p=>{if(!x.length)return null;const z=(x.length-1)*p,i=Math.floor(z),j=Math.ceil(z);return i===j?x[i]:x[i]+(x[j]-x[i])*(z-i)};
  return{count:x.length,min:x[0]??null,p50:q(.5),p90:q(.9),max:x.at(-1)??null};
}
(async()=>{
  const syms=symbols(arg('symbols'));
  const samples=Math.max(1,Math.min(10,Number(arg('samples','3'))||3));
  const intervalMs=Math.max(0,Math.min(60000,Number(arg('interval-ms','10000'))||10000));
  const outDir=path.resolve(arg('out','artifacts/setup-execution-shadow'));
  const provider=createBinanceProvider({fetchImpl:globalThis.fetch});
  const snapshots=[];
  for(let i=0;i<samples;i++){
    const observedAt=Date.now();
    const rows=await Promise.all(syms.map(async symbol=>{
      const execution=await provider.getExecutionContext(symbol,{spotListed:true,futuresListed:true});
      const metrics=Gate.executionMetrics(execution);
      return{symbol,observedAt,execution,metrics};
    }));
    snapshots.push({sample:i+1,observedAt,rows,summary:summarizeSample(rows)});
    if(i<samples-1&&intervalMs>0)await sleep(intervalMs);
  }
  const allRows=snapshots.flatMap(x=>x.rows);
  const aggregate={
    version:'SETUP_EXECUTION_SHADOW_r0.1',
    generatedAt:Date.now(),
    samples,
    intervalMs,
    symbols:syms,
    snapshotCount:snapshots.length,
    observationCount:allRows.length,
    anyExecutionCoverageRate:allRows.length?allRows.filter(x=>x.metrics.available).length/allRows.length:null,
    spotCoverageRate:allRows.length?allRows.filter(x=>x.execution.spot?.available).length/allRows.length:null,
    futuresCoverageRate:allRows.length?allRows.filter(x=>x.execution.futures?.available).length/allRows.length:null,
    executionPassRate:allRows.length?allRows.filter(x=>!x.metrics.hardReject).length/allRows.length:null,
    spreadBps:dist(allRows.map(x=>x.metrics.spreadBps)),
    depth10Usd:dist(allRows.map(x=>x.metrics.depth10Usd)),
    maxSlippageBps:dist(allRows.map(x=>x.metrics.maxSlippageBps)),
    rejectionReasons:Object.entries(allRows.flatMap(x=>x.metrics.reasons||[]).reduce((o,k)=>(o[k]=(o[k]||0)+1,o),{})).map(([reason,count])=>({reason,count})).sort((a,b)=>b.count-a.count),
    snapshots
  };
  ensureDir(outDir);
  writeJson(path.join(outDir,'execution-shadow.json'),aggregate);
  process.stdout.write(JSON.stringify({...aggregate,snapshots:undefined},null,2)+'\n');
  if(!(aggregate.anyExecutionCoverageRate>0))process.exitCode=2;
})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
