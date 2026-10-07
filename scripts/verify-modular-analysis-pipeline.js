const assert=require('assert');
const DQ=require('../lib/coin-report/modules/data-quality.js');
const VP=require('../lib/coin-report/modules/volume-profile.js');
const MS=require('../lib/coin-report/modules/market-structure.js');
const LQ=require('../lib/coin-report/modules/liquidity.js');
const ICT=require('../lib/coin-report/modules/ict.js');
const SM=require('../lib/coin-report/modules/smart-money.js');
const CF=require('../lib/coin-report/modules/confluence.js');
const Pipeline=require('../lib/coin-report/analysis-pipeline.js');

const H=3600000,now=400*H;
function frame(step=H,count=260){const out=[];for(let i=0;i<count;i++){const wave=Math.sin(i/6)*.8,trend=i*.02,c=100+trend+wave,o=c-Math.sin(i/3)*.15,h=Math.max(o,c)+.45,l=Math.min(o,c)-.45,v=1000+(i%11)*35+(i>240?300:0),t=i*step;out.push([t,o,h,l,c,v,t+step-1,v*c,0,0,v*c*.55])}return out}
const raw=frame();raw.push([now+H,100,150,50,140,999999,now+2*H,0,0,0,0]);
const q=DQ.normalizeFrame(raw,{tf:'1h',nowMs:now});assert(q.bars.length===260);assert(!q.bars.some(x=>x.v===999999));assert(q.closedOnly);
const vp=VP.analyze(q.bars,{bins:32});assert(vp.available);assert(vp.approximation===true);assert(vp.poc.price>=vp.range.low&&vp.poc.price<=vp.range.high);assert(vp.val<=vp.vah);
const ms=MS.analyze(q.bars,{tf:'1h'});assert(ms.available);assert(ms.swings.every(x=>x.confirmedAt>=x.eventAt),'confirmed swing cannot be known before its event');assert(ms.lookaheadSafe);
const exec={futures:{available:true,venue:'BYBIT',bid:104,ask:104.01,mid:104.005,spreadBps:.96,depthUsd:{bid10bps:200000,ask10bps:150000,bid25bps:500000,ask25bps:420000},slippage:{}}};
const liq=LQ.analyze({bars:q.bars,structure:ms,execution:exec,currentPrice:q.bars.at(-1).c});assert(liq.orderbook.available);assert(liq.orderbook.actualOrdersConfirmed);assert(liq.priceBased.warning.includes('실제 주문'));
const ict=ICT.analyze({bars:q.bars,structure:ms,liquidity:liq,currentPrice:q.bars.at(-1).c});assert(ict.available);assert.equal(ict.standardizedFormula,false);for(const f of ict.fvgs)assert(f.knownAt>=f.eventAt);
const sm=SM.candidate({bars:q.bars,structure:ms,liquidity:liq,ict,volumeProfile:vp,derivatives:{dataAvailable:false}});assert.equal(sm.institutionalFlowConfirmed,false);assert(sm.missingData.includes('derivatives'));
const rawZones=CF.sourceZones({volumeProfile:vp,liquidity:liq,ict,structure:ms,currentPrice:q.bars.at(-1).c}),merged=CF.mergeZones(rawZones,{tolerance:.1});assert(merged.length>0);const scored=CF.scoreZone(merged[0],{htfTrend:'bullish',volumeProfileAvailable:true,ictAvailable:true,volumeRatio:1.3,derivativesAvailable:false,oiChangePct:null,spotConfirmation:null,orderbookAvailable:true,orderbookImbalance:.2});assert(scored.missingData.includes('oi'));assert(scored.coverage<1);assert(scored.score!==null);
const frames={'15m':frame(15*60000),'1h':frame(H),'4h':frame(4*H),'1d':frame(24*H)};const pipe=Pipeline.run({symbol:'DOGEUSDT',frames,nowMs:300*24*H,execution:exec,derivatives:{derivativesSupported:true,dataAvailable:true,status:'data_normal',fundingPct:-.003,v2Profile:{oi1hPct:.4,oi4hPct:1.2,oi24hPct:4}}});
assert.equal(pipe.version,'COIN_ANALYSIS_PIPELINE_v1.0.0');assert.equal(pipe.primaryTimeframe,'4h');assert(pipe.zones.length>0);assert(pipe.dataQuality.closedCandlesOnly);assert(pipe.dataQuality.approximation.volumeProfile===true);assert(pipe.smartMoney.institutionalFlowConfirmed===false);assert(['valid','needs_confirmation','failed','fakeout_candidate'].includes(pipe.breakout.up.state));
console.log('modular analysis pipeline PASS');
