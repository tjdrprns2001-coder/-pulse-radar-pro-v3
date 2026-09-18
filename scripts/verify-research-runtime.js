'use strict';
const assert=require('assert');
const {createFeatureBuilder}=require('../lib/research-backtest-v2/runtime.js');
const {createFrozenManifest}=require('../lib/research-backtest-v2/contracts.js');
function bar(o,c,p){return[o,p,p,p,p,1,c,100,1,1,50,0]}
(async()=>{
 const cutoff=899999;
 const frames={'15m':[bar(0,899999,100),bar(900000,1799999,9999)],'5m':[bar(0,299999,100),bar(300000,599999,100),bar(600000,899999,100)],'1h':[],'4h':[],'1d':[],'1w':[]};
 let sawFuture=false;
 const classifyFn=async({frames})=>{sawFuture=Object.values(frames).flat().some(r=>Number(r[6])>cutoff);return{candidateScore:90,tradeSignal:{confidence:80},scanClass:{key:'ANOMALY'},quoteVolume24h:null}};
 const builder=createFeatureBuilder({classifyFn});
 const manifest=createFrozenManifest({manifestVersion:'m1',createdAt:1,derivedFromSplit:'train',screenerConfigVersion:'s1',signalTimeframe:'15m',evaluationGridMs:900000,thresholds:{}});
 const event=await builder({symbol:'AAAUSDT',frames,signalCandleCloseTs:cutoff,manifest,universe:{universeVersion:'u1',universeMode:'current-survivors-only',survivorshipSafe:false}});
 assert.equal(sawFuture,false,'historical classifier saw a candle after signal close');
 assert.equal(event.entryPrice,100);
 console.log('research runtime leakage guard PASS');
})().catch(e=>{console.error(e);process.exit(1)});
