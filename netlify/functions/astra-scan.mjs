import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const handler=require('../../api/astra-scan.js');
function queryFrom(url){return Object.fromEntries(new URL(url).searchParams.entries())}
function bridge(){let status=200,payload={},headers={};return{res:{setHeader(k,v){headers[k]=String(v)},status(n){status=n;return this},json(v){payload=v;headers['Content-Type']='application/json; charset=utf-8';return v}},response(){return new Response(JSON.stringify(payload),{status,headers})}}}
export default async function astraScan(req){const b=bridge();await handler({query:queryFrom(req.url),method:req.method||'GET'},b.res,{});return b.response()}
