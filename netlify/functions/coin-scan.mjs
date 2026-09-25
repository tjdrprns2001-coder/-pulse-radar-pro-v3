import { getStore } from '@netlify/blobs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const handler=require('../../api/coin-scan.js');

function queryFrom(url){return Object.fromEntries(new URL(url).searchParams.entries())}
function bridgeResponse(){
  let statusCode=200;const headers={};let payload=null;let raw=false;
  return{
    res:{setHeader(name,value){headers[name]=String(value)},status(code){statusCode=code;return this},json(value){payload=value;raw=false;headers['Content-Type']='application/json; charset=utf-8';return value},send(value){payload=value;raw=true;return value}},
    response(){return new Response(raw?String(payload??''):JSON.stringify(payload??{}),{status:statusCode,headers})}
  };
}

export default async function netlifyCoinScan(req){
  const bridge=bridgeResponse();
  await handler({query:queryFrom(req.url)},bridge.res,{getStore:(name)=>getStore(name)});
  return bridge.response();
}
