import { getStore } from '@netlify/blobs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const handler=require('../../api/coin-scan.js');

export const config={background:true};

function bridgeResponse(){
  let statusCode=200,payload=null;const headers={};
  return{
    res:{setHeader(n,v){headers[n]=String(v)},status(c){statusCode=c;return this},json(v){payload=v;return v},send(v){payload=v;return v}},
    result(){return{statusCode,payload,headers}}
  };
}

export default async function coinScanRunBackground(req){
  let body={};try{body=await req.json()}catch{}
  const runId=String(body?.runId||body?.id||'').trim();
  if(!runId)return new Response(JSON.stringify({status:'error',error:'runId required'}),{status:400,headers:{'content-type':'application/json; charset=utf-8'}});
  const bridge=bridgeResponse();
  await handler({method:'GET',query:{mode:'scan-run',action:'execute',id:runId,precision:body?.precision?'1':'0'}},bridge.res,{getStore:(name)=>getStore(name)});
  const r=bridge.result();
  return new Response(JSON.stringify(r.payload||{status:r.statusCode>=200&&r.statusCode<300?'ok':'error',runId}),{
    status:r.statusCode,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
  });
}
