import { getStore } from '@netlify/blobs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const handler=require('../../api/coin-scan.js');

export const config={schedule:'5 * * * *'};

function symbols(){
  const raw=String(process.env.SELECTOR_MVP_SYMBOLS||'BTCUSDT,ETHUSDT,SOLUSDT,XRPUSDT,LINKUSDT');
  return [...new Set(raw.split(',').map(x=>x.trim().toUpperCase().replace(/[^A-Z0-9]/g,'')).filter(Boolean))].slice(0,10);
}
function bridgeResponse(){
  let statusCode=200,payload=null;const headers={};
  return{
    res:{setHeader(n,v){headers[n]=String(v)},status(c){statusCode=c;return this},json(v){payload=v;return v},send(v){payload=v;return v}},
    result(){return{statusCode,payload,headers}}
  };
}
export default async function selectorScheduledScan(){
  const list=symbols(),bridge=bridgeResponse();
  await handler({method:'GET',query:{mode:'deep',precision:'1',limit:String(list.length),symbols:list.join(',')}},bridge.res,{getStore:(name)=>getStore(name)});
  const r=bridge.result(),body=r.payload||{};
  const summary={
    status:r.statusCode>=200&&r.statusCode<300?'ok':'error',
    scheduled:true,
    symbols:list,
    updatedAt:Date.now(),
    scanStatus:body.status||null,
    deepScanCount:body.deepScanCount||0,
    selectorRecording:body.selectorRecording||null,
    selectorEvaluation:body.selectorEvaluation||null,
    classification:body.autoScreeningMeta||null,
    auxiliary:body.auxiliary||null
  };
  return new Response(JSON.stringify(summary),{status:r.statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
