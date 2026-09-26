'use strict';
const http=require('http');
const fs=require('fs');
const path=require('path');
const {URL}=require('url');

const ROOT=__dirname;
const PORT=Number(process.env.PORT||10000);

const aliases={
  '/':'/pulse-unified.html',
  '/astra-scan':'/astra-scan.html',
  '/analysis':'/analysis-shell-v12.html',
  '/liquidity':'/liquidity-lab-v2.html',
  '/radar':'/radar.html'
};

const indexRoutes=new Set([
  'backtest','calibration-freeze','calibration-health','detail','historical-structure-study','htf',
  'independent-temporal','market','micro-features','pattern','pattern-validation','structure-study',
  'dante-backtest','structure','temporal-features','trendline-study','signal-alerts','signal-backfill',
  'signal-calibration','signal-health','signal-performance'
]);

function contentType(file){
  const ext=path.extname(file).toLowerCase();
  return ({
    '.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
    '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
    '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg',
    '.webp':'image/webp','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'
  })[ext]||'application/octet-stream';
}

function send(res,status,body,headers={}){
  res.writeHead(status,{'Cache-Control':'no-store',...headers});
  res.end(body);
}

function makeRes(nodeRes){
  let statusCode=200;
  const headers={};
  const apiRes={
    headersSent:false,
    setHeader(name,value){headers[name]=String(value);return this;},
    getHeader(name){return headers[name];},
    status(code){statusCode=Number(code)||200;return this;},
    json(value){
      if(this.headersSent)return;
      this.headersSent=true;
      send(nodeRes,statusCode,JSON.stringify(value),{'Content-Type':'application/json; charset=utf-8',...headers});
      return this;
    },
    send(value){
      if(this.headersSent)return;
      this.headersSent=true;
      const body=Buffer.isBuffer(value)?value:(typeof value==='string'?value:JSON.stringify(value));
      send(nodeRes,statusCode,body,headers);
      return this;
    },
    end(value=''){
      if(this.headersSent)return;
      this.headersSent=true;
      send(nodeRes,statusCode,String(value),headers);
      return this;
    }
  };
  return apiRes;
}

async function bodyOf(req){
  if(req.method==='GET'||req.method==='HEAD')return null;
  const chunks=[];
  for await(const chunk of req)chunks.push(chunk);
  const raw=Buffer.concat(chunks).toString('utf8');
  if(!raw)return null;
  const ct=String(req.headers['content-type']||'');
  if(ct.includes('application/json')){try{return JSON.parse(raw)}catch{return raw}}
  return raw;
}

async function handleApi(req,res,u){
  const name=u.pathname.replace(/^\/api\//,'').replace(/\/+$/,'')||'index';
  const query=Object.fromEntries(u.searchParams.entries());
  const apiReq={
    method:req.method||'GET',
    headers:req.headers||{},
    query,
    body:await bodyOf(req),
    url:req.url,
    path:u.pathname
  };
  const apiRes=makeRes(res);
  try{
    let handler;
    if(name==='index'){
      handler=require(path.join(ROOT,'api','index.js'));
    }else if(indexRoutes.has(name)){
      apiReq.query.route=name;
      handler=require(path.join(ROOT,'api','index.js'));
    }else{
      const mod=path.join(ROOT,'api',name+'.js');
      if(!fs.existsSync(mod))return apiRes.status(404).json({ok:false,error:'Unknown API route',route:name});
      handler=require(mod);
    }
    const out=await handler(apiReq,apiRes);
    if(apiRes.headersSent)return;
    if(out&&typeof out.statusCode==='number'){
      const h=out.headers||{};
      return send(res,out.statusCode,out.body||'',h);
    }
    return apiRes.end('');
  }catch(e){
    if(apiRes.headersSent)return;
    return apiRes.status(500).json({ok:false,error:e&&e.message?e.message:String(e),route:name});
  }
}

function safeFile(pathname){
  const mapped=aliases[pathname]||pathname;
  const decoded=decodeURIComponent(mapped.split('?')[0]);
  const rel=decoded.replace(/^\/+/, '');
  const file=path.resolve(ROOT,rel);
  if(!file.startsWith(ROOT+path.sep)&&file!==ROOT)return null;
  return file;
}

const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,'http://localhost');
    if(u.pathname==='/health')return send(res,200,JSON.stringify({ok:true,service:'pulseradar-temp-preview'}),{'Content-Type':'application/json; charset=utf-8'});
    if(u.pathname.startsWith('/api/'))return await handleApi(req,res,u);
    const file=safeFile(u.pathname);
    if(!file||!fs.existsSync(file)||fs.statSync(file).isDirectory())return send(res,404,'Not Found',{'Content-Type':'text/plain; charset=utf-8'});
    const headers={'Content-Type':contentType(file)};
    if(file.endsWith('.html')||file.endsWith('.js')||file.endsWith('.css'))headers['Cache-Control']='public, max-age=0, must-revalidate';
    res.writeHead(200,headers);
    fs.createReadStream(file).pipe(res);
  }catch(e){
    send(res,500,'Server error: '+String(e&&e.message||e),{'Content-Type':'text/plain; charset=utf-8'});
  }
});
server.listen(PORT,'0.0.0.0',()=>console.log('PulseRadar temp preview listening on',PORT));
