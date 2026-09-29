const fs=require('fs'),assert=require('assert');
const E=require('../ui/auto-chart/auto-chart-engine.js');
assert.equal(E.VERSION,'AUTO_CHART_ENGINE_v1');
function candles(n=180){const out=[];let p=100;for(let i=0;i<n;i++){const drift=i<70?.08:i<130?.015:.04;const wave=Math.sin(i/6)*.35;p=Math.max(1,p+drift+wave*.12);const open=p-.18,close=p,high=p+.45,low=p-.45,volume=1000+(i===110?5000:Math.sin(i/7)*80);out.push({time:1700000000000+i*3600000,open,high,low,close,volume,partial:false})}return out}
const c=candles(),sw=[];for(let i=8;i<c.length-8;i+=12){const type=(sw.length%2===0)?'L':'H',price=type==='L'?c[i].low:c[i].high;sw.push({type,price,pivotIndex:i,confirmedAt:i+3,swingId:'s'+i})}
sw.push({type:'H',price:c.at(-1).high+2,pivotIndex:c.length-2,confirmedAt:c.length+2,swingId:'future-confirm'});
const raw={ok:true,candles:c,canonicalSwings:sw,provisionalPivots:[{type:'H',price:c.at(-1).high+1,i:c.length-1}],events:[]};
const confirmed=E.confirmedSwings(raw,E.cleanCandles(c));
assert(!confirmed.some(x=>x.id==='future-confirm'),'future-confirmed swing must not appear early');
assert(E.provisionalSwings(raw,c).length===1,'provisional swing should remain separate');
const lin=E.analyze(raw,{tf:'4h',scale:'linear',derivatives:{openInterestChange4hPct:1.6,openInterestChange24hPct:2,takerBuySellRatio4h:1.25}});
const log=E.analyze(raw,{tf:'4h',scale:'log'});
assert(lin.available&&log.available,'models should be available');
for(const x of Object.values(lin.trendlines).filter(Boolean))assert.equal(x.scale,'linear');
for(const x of Object.values(log.trendlines).filter(Boolean))assert.equal(x.scale,'log');
assert(Number.isFinite(lin.compression.ribbonWidthAtr),'compression must be ATR-normalized');
assert(lin.compression.ribbonPercentile==null||(lin.compression.ribbonPercentile>=0&&lin.compression.ribbonPercentile<=1));
assert(['A','B','C','A+B','N/A'].includes(lin.supplyClass));
const breakoutKeys=new Set(['none','wick-fail','breakout-confirmed','support-confirmed','retest','breakout-failed','testing','support-lost','inside']);
assert(breakoutKeys.has(lin.breakout.key),'breakout state must be explicit');
assert(lin.scenarios.bull&&lin.scenarios.fail,'conditional bull and invalidation scenarios required');
const html=fs.readFileSync('auto-chart-lab.html','utf8'),app=fs.readFileSync('ui/auto-chart/auto-chart-lab.js','utf8'),css=fs.readFileSync('ui/auto-chart/auto-chart-lab.css','utf8');
['AUTO CHART LAB','시장 환경','현재 셋업 해석','확인 조건','무효화','데이터 충실도','조건부 경로','VPVR 추정','일목 9·26·52'].forEach(k=>assert(html.includes(k),'missing UI '+k));
['lastGood','실시간 지연 · 차트 유지','fetchLive','drawScenario','drawVp','drawFib','drawIchimoku','sequence'].filter(Boolean);
assert(app.includes('lastGood'),'last-good chart preservation missing');
assert(app.includes("setState($('historyState'),'과거 차트 표시','live')"),'historical chart must render before live status');
assert(app.indexOf("setState($('historyState'),'과거 차트 표시','live')")<app.indexOf("const liveTask=CD.fetchLive"),'live fetch must not gate historical chart rendering');
assert(css.includes('@media(max-width:700px)'),'mobile layout missing');
console.log('auto chart lab v1 PASS');