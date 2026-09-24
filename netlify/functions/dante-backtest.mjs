import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const handler=require('../../api/dante-backtest.js');
const {createDanteBacktestRuntime}=require('../../lib/dante/runtime.js');
function bridge(){let code=200,payload=null;const headers={};return{res:{setHeader(k,v){headers[k]=String(v)},status(n){code=n;return this},json(v){payload=v;headers['Content-Type']='application/json; charset=utf-8';return v}},response(){return new Response(JSON.stringify(payload??{}),{status:code,headers})}}}
export default async function danteBacktest(req){
  const b=bridge();
  try{
    const u=new URL(req.url),query=Object.fromEntries(u.searchParams.entries()),runtime=createDanteBacktestRuntime();
    await handler({method:req.method,query,headers:Object.fromEntries(req.headers.entries())},b.res,{runtime});
  }catch(e){b.res.status(503).json({status:'error',error:String(e?.message||e)})}
  return b.response();
}
