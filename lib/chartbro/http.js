'use strict';
const fs=require('node:fs'),path=require('node:path'),handler=require('../../handlers/chartbro');
const root=path.resolve(__dirname,'../..');
async function route(req,res,u){
 if(u.pathname==='/api/chartbro'||(u.pathname==='/api/index'&&u.searchParams.get('route')==='chartbro')){
  let body='';for await(const c of req){body+=c;if(Buffer.byteLength(body)>20000){res.writeHead(413);res.end('Body too large');return true;}}
  req.query=Object.fromEntries(u.searchParams);req.body=body;let status=200;
  const out={setHeader(k,v){res.setHeader(k,v);},status(n){status=n;return this;},json(v){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(v));}};
  await handler(req,out);return true;
 }
 if(req.method==='GET'&&(u.pathname==='/chartbro-lab.html'||/^\/(ui|lib)\/chartbro\/[a-z0-9-]+\.(js|css)$/.test(u.pathname))){
  const name=u.pathname;if(name.startsWith('/lib/')&&!['data','indicators','engine','models','temporal','sessions','research'].some(x=>name==='/lib/chartbro/'+x+'.js'))return false;
  const file=path.join(root,name);if(!fs.existsSync(file))return false;
  res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'application/javascript; charset=utf-8','Cache-Control':'no-cache'});res.end(fs.readFileSync(file));return true;
 }return false;
}
module.exports={route};
