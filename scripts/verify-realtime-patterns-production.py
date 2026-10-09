"""Production webpage and scripted WebSocket integration check for real-time patterns."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = os.getenv("PATTERN_URL", "https://pulse-radar-pro-v5.vercel.app/realtime-patterns.html")
OUT = Path("artifacts/realtime-patterns")
OUT.mkdir(parents=True, exist_ok=True)

MOCK = r"""
(() => {
 const oldFetch=window.fetch.bind(window), period=900000, base=Math.floor(Date.now()/period)*period-96*period;
 const candles=Array.from({length:95},(_,i)=>{
  const time=base+i*period, close=100+Math.sin(i/5)*.3;
  return {time,openTime:time,closeTime:time+period-1,open:close-.05,close,
   high:close+.6,low:close-.6,volume:100,partial:false};
 });
 window.fetch=(input,init)=>{
  const url=typeof input==='string'?input:input?.url||'';
  if(url.startsWith('/api/structure?'))return Promise.resolve({
   ok:true,status:200,json:async()=>({ok:true,candles,symbol:new URL(url,location.href).searchParams.get('symbol')})
  });
  return oldFetch(input,init);
 };
 class MockSocket {
  constructor(url) {
   this.url=url;this.readyState=0;
   setTimeout(()=>{
    if(this.readyState!==0)return;
    this.readyState=1;
    this.onopen?.();
    setTimeout(()=>{
     if(this.readyState!==1)return;
     const t=base+95*period,k={t,T:t+period-1,o:'100',h:'115',l:'99',c:'114',v:'900',x:true};
     this.onmessage?.({data:JSON.stringify({stream:'btcusdt@kline_15m',data:{s:'BTCUSDT',k}})});
    },900);
   },60);
  }
  close(){this.readyState=3;this.onclose?.({code:1000})}
 }
 window.WebSocket=MockSocket;
})();
"""

def run():
  findings={"url":URL,"checks":[],"browser_errors":[],"requests":[],"websocket_urls":[]}
  with sync_playwright() as playwright:
    browser=playwright.chromium.launch(headless=True,args=["--no-sandbox"])
    page=browser.new_page(viewport={"width":1280,"height":800})
    page.on("pageerror",lambda e:findings["browser_errors"].append(str(e)))
    page.on("response",lambda r:findings["requests"].append({"status":r.status,"url":r.url}) if "/api/structure?" in r.url else None)
    page.on("websocket",lambda ws: findings["websocket_urls"].append(ws.url))
    response=page.goto(URL,wait_until="domcontentloaded",timeout=45000)
    assert response and response.status==200, "Public page HTTP status must be 200"
    assert page.locator("h1").inner_text().startswith("실시간 패턴 감지")
    findings["checks"].append("production document HTTP 200")
    page.wait_for_function("document.querySelectorAll('#watchlist .watchRow').length>=2",timeout=15000)
    page.wait_for_function("document.querySelector('#watchlist .watchRow .price')?.textContent?.trim() !== '-'",timeout=35000)
    findings["checks"].append("production market data loads into watchlist")
    status=page.locator("#status").inner_text()
    try:
      page.wait_for_function("document.getElementById('status')?.textContent === '실시간 연결'",timeout=18000)
      findings["checks"].append("real Binance WebSocket connected")
    except Exception:
      findings["live_websocket_observation"]="not connected within 18 seconds; runner networking may block Binance"
    findings["last_status"]=page.locator("#status").inner_text()
    findings["data_error"]=page.locator("#error").inner_text()
    page.locator("#watchlist .watchRow").nth(1).click()
    assert "ETHUSDT" in page.locator("#chartTitle").inner_text(), "Clicking second symbol must change chart"
    findings["checks"].append("symbol selection updates chart")
    page.locator("#stop").click()
    assert page.locator("#status").inner_text()=="중지"
    assert page.locator("#start").is_enabled()
    findings["checks"].append("stop closes scanner")
    page.set_viewport_size({"width":390,"height":844})
    page.wait_for_timeout(600)
    width=page.evaluate("document.documentElement.scrollWidth")
    findings["mobile_width"]={"content":width,"viewport":390}
    assert width<=392, "Unexpected mobile horizontal overflow"
    findings["checks"].append("mobile responsive width")
    page.screenshot(path=str(OUT/"production.png"),full_page=True)
    page.close()
    mock=browser.new_page(viewport={"width":390,"height":844})
    mock.add_init_script(MOCK)
    mock_errors=[]
    mock.on("pageerror",lambda e:mock_errors.append(str(e)))
    mock.goto(URL,wait_until="domcontentloaded",timeout=45000)
    mock.wait_for_function("document.querySelectorAll('#watchlist .watchRow').length>=2",timeout=15000)
    mock.wait_for_function("document.querySelector('#eventFeed .eventRow')!==null",timeout=15000)
    assert "박스 상단 돌파" in mock.locator("#eventFeed").inner_text()
    assert mock.locator("#status").inner_text()=="실시간 연결"
    assert not mock_errors, "Mock page errors: "+str(mock_errors)
    findings["checks"].append("scripted closed WebSocket bar creates snapshot alert")
    mock.screenshot(path=str(OUT/"mock-signal.png"),full_page=True)
    mock.close()
    assert not findings["browser_errors"],"Production JS errors: "+str(findings["browser_errors"])
    browser.close()
  print(json.dumps(findings,ensure_ascii=False,indent=2))
  assert len(findings["requests"])>=2,"REST candle data not requested"
if __name__=="__main__":run()
