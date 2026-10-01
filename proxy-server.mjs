import {createServer} from 'node:http';
import {timingSafeEqual,createHash} from 'node:crypto';

const PORT=Number(process.env.PORT||8080);
const TOKEN=String(process.env.IGNITION_PROXY_TOKEN||'');
const SERVICE=String(process.env.RENDER_SERVICE_NAME||'ignition-binance-proxy');
const REGION=String(process.env.RENDER_REGION||process.env.AWS_REGION||'unknown');
const allowedHosts=new Set([
  'fapi.binance.com',
  'fapi1.binance.com',
  'fapi2.binance.com',
  'fapi3.binance.com',
  'fapi4.binance.com',
  'api.binance.com',
  'api-gcp.binance.com',
  'api1.binance.com',
  'api2.binance.com',
  'api3.binance.com',
  'api4.binance.com',
  'data-api.binance.vision'
]);
const futuresFailoverHosts=[
  'fapi.binance.com',
  'fapi1.binance.com',
  'fapi2.binance.com',
  'fapi3.binance.com',
  'fapi4.binance.com'
];
const allowedPaths=[
  /^\/fapi\/v1\/(?:exchangeInfo|ticker\/24hr|time|klines|fundingRate)$/,
  /^\/futures\/data\/(?:openInterestHist|takerlongshortRatio)$/,
  /^\/api\/v3\/(?:exchangeInfo|ticker\/24hr|time|klines)$/
];
const probes=[
  ['time','https://fapi.binance.com/fapi/v1/time'],
  ['klines','https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1m&limit=1'],
  ['oi','https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=5m&limit=1'],
  ['taker','https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=BTCUSDT&period=1h&limit=1'],
  ['funding','https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1'],
  ['spotKlines','https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=1']
];

function digest(v){return createHash('sha256').update(v).digest();}
function validToken(req){
  if(TOKEN.length<43)return false;
  const m=/^Bearer ([A-Za-z0-9_-]{43,256})$/.exec(String(req.headers.authorization||''));
  if(!m)return false;
  return timingSafeEqual(digest(m[1]),digest(TOKEN));
}
function json(res,status,body,headers={}){
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    ...headers
  });
  res.end(JSON.stringify(body));
}
async function probe(name,url){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),4500);
  const started=Date.now();
  try{
    const r=await fetch(url,{
      method:'GET',
      headers:{accept:'application/json','user-agent':'IGNITION-Proxy-Health/1.1'},
      signal:ctrl.signal,
      redirect:'error'
    });
    return{name,status:r.status,ok:r.ok,ms:Date.now()-started};
  }catch(e){
    return{name,status:null,ok:false,ms:Date.now()-started,error:e?.name==='AbortError'?'timeout':'network_error'};
  }finally{clearTimeout(timer);}
}
const server=createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,'http://proxy.internal');
    if(req.method!=='GET')return json(res,405,{error:'method_not_allowed'});
    if(u.pathname==='/health'){
      const checks=await Promise.all(probes.map(([name,url])=>probe(name,url)));
      return json(res,200,{
        ok:true,
        service:SERVICE,
        region:REGION,
        tokenConfigured:TOKEN.length>=43,
        binance:{ok:checks.every(x=>x.ok),checks}
      });
    }
    if(u.pathname!=='/fetch')return json(res,404,{error:'not_found'});
    if(!validToken(req))return json(res,401,{error:'unauthorized'});
    const targetRaw=u.searchParams.get('url');
    if(!targetRaw)return json(res,400,{error:'url_required'});
    let target;try{target=new URL(targetRaw);}catch{return json(res,400,{error:'invalid_url'});}
    if(target.protocol!=='https:'||!allowedHosts.has(target.hostname)||!allowedPaths.some(r=>r.test(target.pathname)))return json(res,403,{error:'target_forbidden'});
    if(target.username||target.password||target.port)return json(res,403,{error:'target_forbidden'});
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),20000);
    try{
      const candidates=target.hostname.startsWith('fapi')
        ? futuresFailoverHosts
        : [target.hostname];
      let upstream=null,buf=null,chosen=target.hostname;
      for(const host of candidates){
        const attempt=new URL(target.toString());
        attempt.hostname=host;
        const response=await fetch(attempt.toString(),{
          method:'GET',
          headers:{accept:'application/json','user-agent':'IGNITION-Proxy/1.2'},
          signal:ctrl.signal,
          redirect:'error'
        });
        const body=Buffer.from(await response.arrayBuffer());
        upstream=response;buf=body;chosen=host;
        if(response.ok||![403,418,429,451,500,502,503,504].includes(response.status))break;
      }
      const headers={
        'content-type':upstream.headers.get('content-type')||'application/json',
        'cache-control':'no-store',
        'x-ignition-proxy-service':SERVICE,
        'x-ignition-proxy-region':REGION,
        'x-ignition-upstream-host':chosen
      };
      for(const h of ['x-mbx-used-weight-1m','retry-after']){const v=upstream.headers.get(h);if(v)headers[h]=v;}
      res.writeHead(upstream.status,headers);res.end(buf);
    }finally{clearTimeout(timer);}
  }catch(e){
    json(res,502,{error:'proxy_upstream_error',message:String(e?.message||e).slice(0,180)});
  }
});
server.listen(PORT,'0.0.0.0');
