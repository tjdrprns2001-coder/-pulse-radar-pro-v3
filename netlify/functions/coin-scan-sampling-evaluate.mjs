import { getStore } from '@netlify/blobs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const handler=require('../../api/coin-scan.js');

export const config={schedule:'17 * * * *'};

function bridgeResponse(){
  let statusCode=200,payload=null;const headers={};
  return{
    res:{setHeader(n,v){headers[n]=String(v)},status(c){statusCode=c;return this},json(v){payload=v;return v},send(v){payload=v;return v}},
    result(){return{statusCode,payload,headers}}
  };
}

export default async function samplingEvaluator(){
  const bridge=bridgeResponse();
  await handler({method:'GET',query:{mode:'sampling-history',action:'evaluate'}},bridge.res,{getStore:(name)=>getStore(name)});
  const first=bridge.result();
  if(first.statusCode<200||first.statusCode>=300){
    return new Response(JSON.stringify(first.payload||{status:'error',error:'sampling evaluation failed'}),{status:first.statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
  }
  const statsBridge=bridgeResponse();
  await handler({method:'GET',query:{mode:'sampling-history',action:'stats'}},statsBridge.res,{getStore:(name)=>getStore(name)});
  const stats=statsBridge.result();
  return new Response(JSON.stringify({status:'ok',mode:'sampling-v3-oos-scheduled',evaluated:first.payload?.evaluation||null,stats:stats.payload?.stats||null}),{
    status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
  });
}
