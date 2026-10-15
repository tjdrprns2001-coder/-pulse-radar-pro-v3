'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const fixture='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><main><h1>Navigation browser test</h1></main><script defer src="/ui/analyst-nav.js?v=20261015"></script></body></html>';
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 if(pathname==='/nav-fixture'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fixture)}
 const filename=path.resolve(root,'.'+pathname);
 if(!filename.startsWith(root+path.sep))return res.writeHead(403).end();
 try{
  const ext=path.extname(filename);
  res.setHeader('Content-Type',ext==='.js'?'text/javascript':ext==='.css'?'text/css':'text/html; charset=utf-8');
  res.end(fs.readFileSync(filename));
 }catch{res.writeHead(404).end()}
});
async function checkBox(page,label){
 const b=await page.evaluate(()=>{
  const r=document.querySelector('#pr-an-panel').getBoundingClientRect();
  return {width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,left:r.left,right:r.right,top:r.top,bottom:r.bottom};
 });
 assert(b.scroll<=b.width+1,label+' horizontal overflow: '+JSON.stringify(b));
 assert(b.left>=-1 && b.right<=b.width+1,label+' menu horizontal bounds: '+JSON.stringify(b));
 assert(b.top>=-1 && b.bottom<=b.height+1,label+' menu vertical bounds: '+JSON.stringify(b));
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 try{
  for(const viewport of [{width:320,height:568},{width:375,height:667},{width:390,height:844},{width:1440,height:900}]){
   const context=await browser.newContext({viewport,isMobile:viewport.width<600,deviceScaleFactor:1});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/nav-fixture?symbol=ETHUSDT',{waitUntil:'domcontentloaded'});
   const toggle=page.locator('#pr-analyst-nav .pr-an-toggle'),panel=page.locator('#pr-an-panel');
   await toggle.waitFor({state:'visible'});
   assert.equal(await panel.isVisible(),false);
   await toggle.click();assert.equal(await panel.isVisible(),true);
   assert.equal(await toggle.getAttribute('aria-expanded'),'true');
   await checkBox(page,'fixture '+viewport.width);
   assert.equal(await panel.locator('.pr-an-item').count(),14);
   assert.equal(await panel.locator('a[href="/coin-report.html?symbol=ETHUSDT"]').count(),1);
   await panel.locator('input').fill('DNA');
   assert.equal(await panel.locator('a.pr-an-item:visible').count(),1);
   await page.keyboard.press('Escape');
   assert.equal(await panel.isVisible(),false,'Escape must close');
   assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('pr-an-toggle')),true);
   await page.evaluate(()=>history.replaceState(null,'','/nav-fixture?symbol=BTCUSDT'));
   await toggle.click();
   assert.equal(await panel.locator('a[href="/coin-report.html?symbol=BTCUSDT"]').count(),1,'fresh symbol in nav');
   assert.equal(await panel.locator('a[href*="ETHUSDT"]').count(),0,'no stale symbol');
   await page.evaluate(()=>history.replaceState(null,'','/nav-fixture?symbol=%3Csvg%3E'));
   await toggle.click();await toggle.click();
   assert.equal(await panel.locator('a[href*="symbol="]').count(),0,'invalid symbol removed');
   await toggle.click();
   assert.deepEqual(errors,[],'browser errors '+JSON.stringify(errors));
   await context.close();
  }
  const context=await browser.newContext({viewport:{width:375,height:667},isMobile:true});
  const page=await context.newPage();
  await page.route('https://**',route=>route.abort('blockedbyclient'));
  await page.goto(origin+'/astra-scan.html',{waitUntil:'domcontentloaded'});
  const toggle=page.locator('#pr-analyst-nav .pr-an-toggle');
  await toggle.waitFor({state:'visible',timeout:10000});
  assert.equal(await page.locator('#astraRun').isVisible(),true,'Astra execution button accessible');
  await toggle.click();
  await checkBox(page,'Astra 375');
  assert.equal(await page.locator('#pr-an-panel .pr-an-item').count(),14);
  await page.locator('#pr-analyst-nav .pr-an-close').click();
  assert.equal(await page.locator('#pr-an-panel').isVisible(),false);
  await context.close();
  console.log('PASS Chromium nav mobile 320/375/390, desktop 1440, search, keyboard, symbol update, Astra markup');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
