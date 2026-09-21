import {getStore} from '@netlify/blobs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const handler=require('../../handlers/signal-health.js');
const {createSignalRuntime}=require('../../lib/signal-performance/runtime.js');
function queryFrom(url){return Object.fromEntries(new URL(url).searchParams.entries())}
function bridge(){let code=200,payload=null;const headers={};return{res:{setHeader(k,v){headers[k]=String(v)},status(n){code=n;return this},json(v){payload=v;headers['Content-Type']='application/json; charset=utf-8';return v}},response(){return new Response(JSON.stringify(payload??{}),{status:code,headers})}}}
export default async function signalHealth(req){const b=bridge();try{const rt=createSignalRuntime({getStore:name=>getStore(name)});await handler({method:req.method,query:queryFrom(req.url)},b.res,{store:rt.store,provider:rt.provider,performance:rt.performance})}catch(e){b.res.status(503).json({status:'error',health:'down',error:String(e?.message||e),modules:{}})}return b.response()}
