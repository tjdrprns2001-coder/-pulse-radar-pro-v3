import {createServer} from 'node:http';
import {timingSafeEqual,createHash} from 'node:crypto';

const PORT=Number(process.env.PORT||8080);
const TOKEN=String(process.env.IGNITION_PROXY_TOKEN||'');
const allowedHosts=new Set([
  'fapi.binance.com',
  'api.binance.com',
  'api-gcp.binance.com',
  'api1.binance.com',
  'api2.binance.com',
  'api3.binance.com',
  'api4.binance.com',
  'data-api.binance.vision'
]);
const allowedPaths=[
  /^\/fapi\/v1\/(?:exchangeInfo|ticker\/24hr|time|klines|fundingRate)$/,
  /^\/futures\/data\/(?:openInterestHist|takerlongshortRatio)$/,
  /^\/api\/v3\/(?:exchangeInfo|ticker\/24hr|time|klines)$/
];
function digest(v){return createHash('sha256').update(v).digest();}
function validToken(req){
  if(TOKEN.length<43)return false;
  const m=/^Bearer ([A-Za-z0-9_-]{43,256})$/.exec(String(req.headers.authorization||''));
  if(!m)return false;
  return timingSafeEqual(digest(m[1]),digest(TOKEN));
}
function json(res,status,body){
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end(JSON.stringify(body));
}
const server=createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,'http://proxy.internal');
    if(req.method!=='GET')return json(res,405,{error:'method_not_allowed'});
    if(u.pathname==='/health')return json(res,200,{ok:true,service:'ignition-binance-proxy'});
    if(u.pathname!=='/fetch')return json(res,404,{error:'not_found'});
    if(!validToken(req))return json(res,401,{error:'unauthorized'});
    const targetRaw=u.searchParams.get('url');
    if(!targetRaw)return json(res,400,{error:'url_required'});
    let target;try{target=new URL(targetRaw);}catch{return json(res,400,{error:'invalid_url'});}
    if(target.protocol!=='https:'||!allowedHosts.has(target.hostname)||!allowedPaths.some(r=>r.test(target.pathname)))return json(res,403,{error:'target_forbidden'});
    if(target.username||target.password||target.port)return json(res,403,{error:'target_forbidden'});
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),20000);
    try{
      const upstream=await fetch(target.toString(),{method:'GET',headers:{accept:'application/json','user-agent':'IGNITION-Proxy/1.0'},signal:ctrl.signal,redirect:'error'});
      const buf=Buffer.from(await upstream.arrayBuffer());
      const headers={'content-type':upstream.headers.get('content-type')||'application/json','cache-control':'no-store'};
      for(const h of ['x-mbx-used-weight-1m','retry-after']){const v=upstream.headers.get(h);if(v)headers[h]=v;}
      res.writeHead(upstream.status,headers);res.end(buf);
    }finally{clearTimeout(timer);}
  }catch(e){json(res,502,{error:'proxy_upstream_error',message:String(e?.message||e).slice(0,180)});}
});
server.listen(PORT,'0.0.0.0');
