'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),shell=fs.readFileSync(path.join(root,'ui/pulse-shell.js'),'utf8');
const pages=[...new Set([...shell.matchAll(/path:'([^']+)'/g)].map(x=>x[1]))];
const chart=fs.readFileSync(path.join(path.dirname(require.resolve('lightweight-charts/package.json')),'dist/lightweight-charts.standalone.production.js'));
const marketFlow={ok:true,status:'ok',updatedAt:new Date().toISOString(),stale:false,providerHealth:{binance:'live'},coverage:{},confidence:80,themeFlows:[],tokenFlows:[],coinFlows:[],onchainThemeFlows:[],derivativesFlows:[],microstructureFlows:[],dexFlows:[{baseAsset:'ABC',volume5mUsd:100000,volume1hUsd:200000,buyShare:.7,netBuyUsdEstimate:40000},{baseAsset:'BTC',volume5mUsd:300000,volume1hUsd:600000,buyShare:.6}],cexFlows:[]};
(async()=>{
 const server=spawn(process.execPath,['render-temp-server.js'],{cwd:root,env:{...process.env,PORT:'0',CHARTBRO_AUTO_TRACKER_ENABLED:'0',CHART_V1_ALERT_WORKER_ENABLED:'0',CHARTBRO_WORKER_ENABLED:'0'},stdio:['ignore','pipe','pipe']});
 let browser,logs='';server.stderr.on('data',d=>logs+=d);
 try{
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('startup timeout '+logs)),15000);server.stdout.on('data',d=>{const m=String(d).match(/listening on (\d+)/);if(m){clearTimeout(timer);resolve(m[1])}});server.once('exit',()=>{clearTimeout(timer);reject(new Error(logs))})});
  const base='http://127.0.0.1:'+port;browser=await chromium.launch();
  for(const width of [1440,375]){
   const context=await browser.newContext({locale:'ko-KR',viewport:{width,height:960}}),page=await context.newPage();page.setDefaultTimeout(7000);let errors=[],missing=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()===404&&r.url().startsWith(base))missing.push(new URL(r.url()).pathname)});
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===base){if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{ok:false,status:'unavailable',error:'Offline audit fixture',items:[],data:[]}});return route.continue()}
    if(u.pathname.includes('lightweight-charts@5.2.1/'))return route.fulfill({contentType:'application/javascript',body:chart});return route.abort();});
   for(const name of pages){
    console.log('checking',width,name);errors=[];missing=[];await page.goto(base+name+'?shell=1',{waitUntil:'domcontentloaded'});await page.waitForTimeout(300);
    assert.deepEqual(errors,[],name+' uncaught errors at '+width);assert.deepEqual(missing,[],name+' missing assets');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' mobile overflow at '+width);
   }
   const candles=Array.from({length:200},(_,i)=>{const close=100+i*.1+Math.sin(i/5),open=close-.2;return{time:1700000000000+i*14400000,open,high:close+.5,low:open-.5,close,volume:1000+i}});
   await page.route('**/api/structure?*',r=>r.fulfill({json:{ok:true,symbol:'BTCUSDT',interval:new URL(r.request().url()).searchParams.get('interval')||'4h',candles,canonicalSwings:[],events:[],zones:[],bias:'neutral',audit:{}}}));
   await page.goto(base+'/unified-chart.html');await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('로드 200'));
   assert(await page.locator('#unifiedChart canvas').count()>0,'valid candle fixture must render a chart');
   assert.deepEqual(errors,[],'chart rendering must have no uncaught errors');
   await page.goto(base+'/risk-calculator.html');await page.locator('#stop').fill('-5');assert.equal(await page.locator('#qty').innerText(),'—');assert((await page.locator('#targetRows').innerText()).includes('양수'));
   await page.locator('#stop').fill('95');await page.locator('#targets').fill('110,120,');assert.equal(await page.locator('#qty').innerText(),'20');await page.locator('#targets').fill('wrong');assert.equal(await page.locator('#qty').innerText(),'—');
   await page.goto(base+'/');await page.locator('#symbol').fill('eth');await page.locator('#go').click();assert((await page.locator('#frame').getAttribute('src')).includes('symbol=ETHUSDT'));
   await page.locator('#preset').selectOption('smc');assert((await page.locator('#frame').getAttribute('src')).includes('preset=smc')||await page.evaluate(()=>document.querySelector('#frame').contentDocument.documentElement.dataset.pulsePreset==='smc'));
   await page.evaluate(()=>{window.dispatchEvent(new MessageEvent('message',{origin:'https://example.invalid',source:window,data:{type:'pulse-symbol-sync',symbol:'WRONGUSDT'}}));window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data:{type:'pulse-symbol-sync',symbol:'WRONGUSDT'}}))});assert.equal(await page.locator('#symbol').inputValue(),'ETHUSDT');
   await page.evaluate(()=>{window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:document.querySelector('#frame').contentWindow,data:{type:'pulse-symbol-sync',symbol:'SOLUSDT'}}))});assert.equal(await page.locator('#symbol').inputValue(),'SOLUSDT');
   if(width===375)await page.locator('#menuBtn').click();await page.locator('details.advancedGroup').filter({has:page.locator('[data-view="risk"]')}).locator('summary').click();await page.locator('[data-view="risk"]').first().click();assert((await page.locator('#frame').getAttribute('src')).includes('/risk-calculator.html'));
   await page.route('**/api/market-flow*',r=>r.fulfill({json:marketFlow}));await page.goto(base+'/radar.html');await page.locator('.altRow').first().waitFor();
   assert.equal(await page.locator('.altRow').count(),1);await page.locator('[data-alt-mode="all"]').click();assert.equal(await page.locator('.altRow').count(),2);await page.locator('[data-alt-window="15m"]').click();assert((await page.locator('#altcoinFlowMeta').innerText()).includes('15m'));await page.locator('#altcoinFlowSort').selectOption('flow');await page.locator('.altRow details summary').first().click();assert.equal(await page.locator('.altRow details[open]').count(),1);
   assert.deepEqual(errors,[],'interactive checks must have no uncaught errors');await context.close();console.log(width+': '+pages.length+' pages, offline recovery, mobile sizing, shell navigation/preset/message trust, risk validation, RADAR filters PASS');
  }
 }finally{await browser?.close();server.kill();await new Promise(r=>server.exitCode!==null?r():server.once('exit',r))}
})().catch(e=>{console.error(e);process.exitCode=1});
