import { getStore } from '@netlify/blobs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const handler=require('../../api/coin-scan.js');

export const config={schedule:'17 * * * *'};
const TARGET_PER_BUCKET=4,MAX_DEEP=20;

function bridgeResponse(){
  let statusCode=200,payload=null;const headers={};
  return{
    res:{setHeader(n,v){headers[n]=String(v)},status(c){statusCode=c;return this},json(v){payload=v;return v},send(v){payload=v;return v}},
    result(){return{statusCode,payload,headers}}
  };
}
async function call(query){
  const bridge=bridgeResponse();
  await handler({method:'GET',query},bridge.res,{getStore:(name)=>getStore(name)});
  return bridge.result();
}
function score(item){const n=Number(item?.preIgnitionScore);return Number.isFinite(n)?n:null}
function fastBucket(item){
  if(item?.autoDeepEligible===false)return'REJECTED_FAST';
  const s=score(item);if(s==null||s<60)return'LT60_FAST';if(s<70)return'S60_69_FAST';if(s<80)return'S70_79_FAST';return'S80_PLUS_FAST';
}
function rotateTake(rows,count,seed){
  if(!rows.length||count<=0)return[];const start=Math.abs(Number(seed)||0)%rows.length,out=[];
  for(let i=0;i<Math.min(count,rows.length);i++)out.push(rows[(start+i)%rows.length]);
  return out;
}
function stratifiedSymbols(items=[],candidateSymbols=[],ts=Date.now()){
  const groups=new Map([['REJECTED_FAST',[]],['LT60_FAST',[]],['S60_69_FAST',[]],['S70_79_FAST',[]],['S80_PLUS_FAST',[]]]);
  for(const item of items){const k=fastBucket(item);if(groups.has(k))groups.get(k).push(item)}
  for(const rows of groups.values())rows.sort((a,b)=>(score(b)||0)-(score(a)||0)||String(a.symbol).localeCompare(String(b.symbol)));
  const seed=Math.floor(ts/3600000),chosen=[],seen=new Set();
  for(const [idx,key] of [...groups.keys()].entries()){
    for(const item of rotateTake(groups.get(key),TARGET_PER_BUCKET,seed+idx*7)){const s=String(item.symbol||'').toUpperCase();if(s&&!seen.has(s)){seen.add(s);chosen.push(s)}}
  }
  const fallback=[...(candidateSymbols||[]),...items.slice().sort((a,b)=>(score(b)||0)-(score(a)||0)).map(x=>x.symbol)];
  for(const raw of fallback){if(chosen.length>=MAX_DEEP)break;const s=String(raw||'').toUpperCase();if(s&&!seen.has(s)){seen.add(s);chosen.push(s)}}
  return{symbols:chosen.slice(0,MAX_DEEP),groups:Object.fromEntries([...groups.entries()].map(([k,v])=>[k,v.length]))};
}

export default async function preIgnitionOosScan(){
  const startedAt=Date.now(),summary=await call({mode:'summary',limit:'500'});
  if(summary.statusCode<200||summary.statusCode>=300||summary.payload?.status!=='ok'){
    return new Response(JSON.stringify({status:'error',stage:'summary',updatedAt:Date.now(),detail:summary.payload||null}),{status:summary.statusCode||502,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
  }
  const selection=stratifiedSymbols(summary.payload.items||[],summary.payload.candidateSymbols||[],startedAt);
  const deep=selection.symbols.length?await call({mode:'deep',limit:String(selection.symbols.length),symbols:selection.symbols.join(','),precision:'0'}):{statusCode:200,payload:{status:'ok',items:[]}};
  const evaluation=await call({mode:'preignition-history',action:'evaluate',limit:'500'});
  const stats=await call({mode:'preignition-history',action:'stats',limit:'500'});
  const ok=deep.statusCode>=200&&deep.statusCode<300&&deep.payload?.status==='ok';
  const body={
    status:ok?'ok':'degraded',scheduled:true,updatedAt:Date.now(),durationMs:Date.now()-startedAt,
    summaryCount:Number(summary.payload.scanCount)||0,fastGroups:selection.groups,selectedSymbols:selection.symbols,
    deepStatus:deep.payload?.status||null,deepScanCount:Number(deep.payload?.deepScanCount)||0,
    preIgnitionRecording:deep.payload?.preIgnitionRecording||null,
    evaluation:evaluation.payload?.evaluation||null,
    stats:stats.payload?.stats||null
  };
  return new Response(JSON.stringify(body),{status:ok?200:207,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}

export{fastBucket,stratifiedSymbols};
