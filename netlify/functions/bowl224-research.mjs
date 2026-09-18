import {getStore} from '@netlify/blobs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const handler=require('../../api/bowl224-research.js');
const {createBowl224Runtime}=require('../../lib/research-backtest-v2/bowl224/runtime.js');
function bridge(){let code=200,payload={};const headers={};return{res:{setHeader(k,v){headers[k]=String(v)},status(n){code=n;return this},json(v){payload=v;headers['Content-Type']='application/json; charset=utf-8';return v}},response(){return new Response(JSON.stringify(payload),{status:code,headers})}}}
export default async function bowl224Research(req){
 const b=bridge();try{let body={};if(req.method==='POST'){try{body=await req.json()}catch{}}
  const query=Object.fromEntries(new URL(req.url).searchParams.entries()),runtime=createBowl224Runtime({getStore:name=>getStore(name)});
  await handler({method:req.method,query,body,headers:Object.fromEntries(req.headers.entries())},b.res,{runtime,adminToken:process.env.BOWL224_RESEARCH_ADMIN_TOKEN});
 }catch(e){b.res.status(503).json({status:'error',error:String(e?.message||e)})}return b.response();
}