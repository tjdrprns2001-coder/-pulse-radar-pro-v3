'use strict';
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),now=1800000000000;
const evidence={asOf:now,stage:'점화초기',type:'A+B',extended:false,
 oi:{known:true,a:true,aPre:true,cRebuild:false,change15mPct:.2},setup4h:{valid:true},
 ready1h:{ready:true,aboveEma14:true,holdOrHl:true,flow:'FLOW-SUSTAIN'},
 gate15m:{passed:true,aligned:true,alignmentTransition:false,break:{confirmed:true},rvolIncreasing:true,flow:'FLOW-SUSTAIN'},
 gate5m:{passed:true,aboveAllEmas:true,holdOrHl:true,vwapConfirmed:true,mssProxy:true,takerReentry:true},
 coverage:{frames:Object.fromEntries(['4h','1h','15m','5m'].map(tf=>[tf,{available:true}]))},candleCloses:{'15m':now-1,'5m':now-1}};
const rows=[{symbol:'ACTIVEUSDT',verdict:{key:'WAIT'},integratedSurge:evidence},
 {symbol:'MISSINGUSDT',verdict:{key:'WAIT'},integratedSurge:{...evidence,candleCloses:{}}}];
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+name);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
 try{res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file))}catch{res.writeHead(404).end()}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch();
 try{
  for(const width of [1440,375]){
   const context=await browser.newContext({viewport:{width,height:960}}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(t=>{window.__auditNow=t;Date.now=()=>window.__auditNow;window.__intervals=[];window.setInterval=(fn,ms)=>{window.__intervals.push({fn,ms});return window.__intervals.length}},now);
   await page.route('**/api/astra-scan?*',route=>{
    const stage=new URL(route.request().url()).searchParams.get('stage');
    const data=stage==='universe'?{universeCount:2,filteredCount:2,items:rows.map(r=>({symbol:r.symbol}))}:stage==='oi'?{items:rows.map(r=>({symbol:r.symbol,pass:true}))}:{items:rows};
    return route.fulfill({json:{status:'ok',...data}});
   });
   await page.route('**/api/v1/results?*',r=>r.fulfill({json:{status:'ok',items:[]}}));
   await page.route('**/api/chartbro-research?*',r=>r.fulfill({json:{status:'ok'}}));
   await page.goto(base+'/astra-scan.html');await page.locator('#astraRun').click();
   await page.locator('.conditionAudit').first().waitFor();
   const active=page.locator('.card').filter({has:page.locator('.symbol',{hasText:'ACTIVEUSDT'})}),missing=page.locator('.card').filter({has:page.locator('.symbol',{hasText:'MISSINGUSDT'})});
   assert((await missing.locator('.integratedSurge').innerText()).includes('15m 대기 / 5m 대기'),'missing timestamps must hide confirmations');
   await active.locator('.conditionAudit summary').click();
   assert((await active.locator('.auditTree').allTextContents()).join(' ').includes('5m 저점 유지'));
   await page.evaluate(()=>{window.__auditNow+=900000;window.__intervals.find(x=>x.ms===30000).fn()});
   assert.equal(await active.locator('.conditionAudit').getAttribute('open'),'','expiry refresh must preserve expanded details');
   assert((await active.locator('.conditionAudit summary').innerText()).includes('신호 만료'));
   assert((await active.locator('.integratedSurge').innerText()).includes('15m 대기 / 5m 대기'));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'audit must fit mobile width');
   await page.goto(base+'/auto-chart-lab.html');
   const fvg=page.locator('[data-layer="fvg"]'),ob=page.locator('[data-layer="ob"]');
   await fvg.uncheck();assert.equal(await ob.isChecked(),true);await ob.uncheck();await fvg.check();assert.equal(await ob.isChecked(),false);
   assert.deepEqual(errors,[],'browser must have no uncaught errors');await context.close();
  }
  console.log('condition audit: desktop/mobile, missing timestamps, expiry, expanded details and independent switches PASS');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
