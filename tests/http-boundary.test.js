'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
test('HTTP server serves every menu and browser asset, rejects private files and malformed input',async()=>{
 const child=spawn(process.execPath,['render-temp-server.js'],{env:{...process.env,PORT:'0',CHARTBRO_AUTO_TRACKER_ENABLED:'0',CHART_V1_ALERT_WORKER_ENABLED:'0',CHARTBRO_WORKER_ENABLED:'0'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stderr.on('data',d=>logs+=d);
 try{
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('server startup timeout '+logs)),15000);child.stdout.on('data',d=>{const m=String(d).match(/listening on (\d+)/);if(m){clearTimeout(timer);resolve(Number(m[1]))}});child.once('exit',code=>{clearTimeout(timer);reject(new Error('server exited '+code+' '+logs))})});
  const base='http://127.0.0.1:'+port;
  for(const p of ['/.git/HEAD','/%2egit/HEAD','/render-temp-server.js','/package.json','/api/index.js','/handlers/v1.js','/lib/coin-scan/binance-provider.js','/tests/http-boundary.test.js'])assert.equal((await fetch(base+p)).status,404,p);
  assert.equal((await fetch(base+'/bad%GG')).status,400);
  assert.equal((await fetch(base+'/api/not-a-route',{method:'POST',headers:{'content-type':'application/json'},body:'{bad'})).status,400);
  const large=await fetch(base+'/api/not-a-route',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify('a'.repeat(2*1024*1024))});assert.equal(large.status,413);assert.equal((await large.json()).error,'Request body too large');
  assert.equal((await fetch(base+'/ui/pulse-shell.js',{method:'POST'})).status,405);
  const routes=[...new Set([...fs.readFileSync('ui/pulse-shell.js','utf8').matchAll(/path:'([^']+)'/g)].map(x=>x[1]))];
  const assets=new Set(['/','/astra-scan','/health/live','/lib/chartbro/engine.js']);
  for(const p of routes){assets.add(p);for(const m of fs.readFileSync('.'+p,'utf8').matchAll(/(?:src|href)=["']([^"']+)["']/g)){const a=m[1];if(a.includes('${')||a.startsWith('#')||/^https?:|^\/\//.test(a))continue;const u=new URL(a,base+p);if(/\.(?:js|css|html|svg|png|ico)$/.test(u.pathname))assets.add(u.pathname)}}
  for(const p of assets){const r=await fetch(base+p);assert.equal(r.status,200,p);assert.equal(r.headers.get('x-content-type-options'),'nosniff',p);await r.arrayBuffer()}
 }finally{child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r))}
});
