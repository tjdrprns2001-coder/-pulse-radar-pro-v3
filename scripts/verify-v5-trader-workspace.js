'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const read=p=>fs.readFileSync(p,'utf8');
const shell=read('pulse-unified.html'),shellJs=read('ui/pulse-shell.js'),home=read('workspace-home.html');
const chart=read('unified-chart.html'),chartJs=read('ui/chart/unified-chart-v5.js');
const snap=read('mtf-snapshot-pro.html'),snapJs=read('ui/trader/mtf-snapshot-pro.js');
const dante=read('dante-lab.html'),methods=require('../ui/dante/dante-methods.js');
const trader=require('../ui/trader/analysis-engine.js'),scan=read('ui/coin-scan.js'),report=read('ui/coin-report.js');
const vercel=JSON.parse(read('vercel.json'));

assert(shell.includes('PulseRadar Pro v5'),'V5 branding missing');
assert.equal((shell.match(/class="mBtn/g)||[]).length,5,'V5 mobile nav must have exactly five roots');
for(const root of ['home','scan','analysis','dante','ai'])assert(shell.includes('data-root="'+root+'"'),'missing mobile root '+root);
assert(shell.includes('주식단테 실전 랩')&&shell.includes('8TF 스냅샷'),'V5 primary tools missing');
assert(shellJs.includes("mtfsnapshot:{title:'8TF 스냅샷'")&&shellJs.includes("dante:{title:'주식단테 실전 랩'"),'V5 routes missing');
assert(shellJs.includes("searchParams.set('build','20260921-v5')"),'V5 child cache-bust missing');
for(const page of ['dante-lab.html','mtf-snapshot-pro.html','unified-chart.html']){const src=read(page),sp=src.indexOf('/ui/chart/session-profile.js'),liq=src.indexOf('/ui/chart/liquidity-engine.js');assert(sp>=0&&liq>sp,'session profile must load before liquidity engine: '+page);}

assert(home.includes('REFRESH=3600000'),'home must refresh hourly');
for(const p of ['/api/market?','/api/coin-scan?','/api/pulse-ai?'])assert(home.includes(p),'market desk feed missing '+p);
assert(home.includes('AI 후보 코인')&&home.includes('1시간 시장 브리핑'),'market desk summary/candidates missing');
assert(home.includes('ai.aiGenerated')&&home.includes('규칙 기반'),'AI/rules provenance distinction missing');

for(const id of ['structure','smc','ict','liquidity','volume-profile','moving-average','dante'])assert(chart.includes('data-overlay="'+id+'"'),'chart overlay missing '+id);
for(const p of ['rsi','macd','stoch','kdj','obv'])assert(chart.includes('data-pane="'+p+'"'),'indicator pane missing '+p);
for(const s of ['PulseIctPlugin','PulseVolumeProfilePlugin','PulseMovingAveragePlugin','buildIctContext','analyzeSmcV2','analyzeLiquidity'])assert(chartJs.includes(s),'chart V5 logic missing '+s);

for(const tf of ['1w','3d','1d','12h','4h','1h','15m','5m'])assert(snapJs.includes("'"+tf+"'"),'MTF snapshot missing '+tf);
assert(snap.includes('canvas id="snapshot"')&&snap.includes('PNG 저장'),'snapshot render/export missing');
assert(snap.includes('추세선')&&snap.includes('SMC/ICT')&&snap.includes('매물대')&&snap.includes('이평'),'snapshot overlay controls incomplete');

assert(Array.isArray(methods.methods)&&methods.methods.length>=13,'Dante method library too small');
for(const id of ['bowl224','ma-hit','concrete','highheel','symmetry','share','kijun-scalp','256','reverse-wave','elliott','dead-dive','open-price','close-bet','force-balance'])assert(methods.methods.some(x=>x.id===id),'Dante method missing '+id);
assert(dante.includes('비공개/유료 세부 규칙은 임의로 공식화하지 않습니다.'),'Dante provenance boundary missing');
assert(dante.includes('멀티TF 검사')&&dante.includes('PNG 저장'),'Dante practice controls missing');

const candles=Array.from({length:520},(_,i)=>{const base=100+i*.03+Math.sin(i/9)*2;return{time:(i+1)*3600000,open:base-.3,high:base+1,low:base-1,close:base+.3,volume:1000+(i%20)*30}});
const summary=trader.summarize({candles,analysis:{trendlines:{}},smc:{mss:[],sweeps:[],fvgs:[],orderBlocks:[]},liquidity:{levels:[],sweeps:[]}});
assert(Number.isFinite(summary.rsi),'trader RSI unavailable');
assert(summary.volumeProfile?.bins?.length===24,'volume profile bins invalid');
assert(Array.isArray(summary.dante)&&summary.dante.length>=10,'Dante scoring unavailable');
assert(summary.ma[20]!=null&&summary.ma[60]!=null&&summary.ma[112]!=null&&summary.ma[224]!=null&&summary.ma[448]!=null,'MA ladder incomplete');

assert(scan.includes('mtf-snapshot-pro.html'),'scanner must link V5 snapshot');
assert(report.includes('mtf-snapshot-pro.html')&&report.includes('dante-lab.html'),'report must link V5 pro tools');
assert.deepEqual(vercel.regions,['icn1'],'Vercel functions must remain in Seoul');
assert(!Object.keys(vercel.functions||{}).some(k=>/dante|snapshot|trader/i.test(k)),'V5 static features must not consume new Hobby serverless slots');

for(const f of ['ui/trader/analysis-engine.js','ui/trader/snapshot-renderer.js','ui/trader/mtf-snapshot-pro.js','ui/dante/dante-methods.js','ui/dante/dante-lab.js','ui/chart/unified-chart-v5.js','ui/chart/plugins/moving-average-plugin.js','ui/chart/plugins/volume-profile-plugin.js'])new vm.Script(read(f),{filename:f});
console.log('PulseRadar V5 trader workspace PASS');
