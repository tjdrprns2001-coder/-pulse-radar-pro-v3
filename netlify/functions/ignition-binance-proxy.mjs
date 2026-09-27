import {createHash,timingSafeEqual} from 'node:crypto';

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
const digest=v=>createHash('sha256').update(String(v||'')).digest();

function validToken(req){
  const secret=String(process.env.IGNITION_PROXY_TOKEN||'');
  if(secret.length<43)return false;
  const match=/^Bearer ([A-Za-z0-9_-]{43,256})$/.exec(req.headers.get('authorization')||'');
  if(!match)return false;
  return timingSafeEqual(digest(match[1]),digest(secret));
}

const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{
  status,
  headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}
});

export default async function ignitionBinanceProxy(req){
  if(req.method!=='GET')return json({error:'method_not_allowed'},405,{allow:'GET'});
  const u=new URL(req.url);
  if(u.searchParams.get('health')==='1')return json({ok:true,service:'ignition-binance-proxy-netlify'});
  if(!validToken(req))return json({error:'unauthorized'},401,{'www-authenticate':'Bearer realm="ignition-binance-proxy"'});
  const raw=u.searchParams.get('url');
  if(!raw)return json({error:'url_required'},400);
  let target;
  try{target=new URL(raw);}catch{return json({error:'invalid_url'},400);}
  if(target.protocol!=='https:'||target.username||target.password||target.port||!allowedHosts.has(target.hostname)||!allowedPaths.some(r=>r.test(target.pathname)))return json({error:'target_forbidden'},403);
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),20000);
  try{
    const upstream=await fetch(target.toString(),{
      method:'GET',
      headers:{accept:'application/json','user-agent':'IGNITION-Netlify-Proxy/1.0'},
      signal:ctrl.signal,
      redirect:'error'
    });
    const body=await upstream.arrayBuffer();
    const headers={'content-type':upstream.headers.get('content-type')||'application/json','cache-control':'no-store'};
    for(const key of ['x-mbx-used-weight-1m','retry-after']){
      const value=upstream.headers.get(key);
      if(value)headers[key]=value;
    }
    return new Response(body,{status:upstream.status,headers});
  }catch(e){
    return json({error:'proxy_upstream_error',message:String(e?.message||e).slice(0,180)},502);
  }finally{clearTimeout(timer);}
}
