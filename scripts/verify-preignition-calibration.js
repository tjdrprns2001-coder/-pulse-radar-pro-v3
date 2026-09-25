'use strict';
const assert=require('assert');
const fs=require('fs');
const Cal=require('../lib/coin-scan/preignition-calibration.js');
const archive=JSON.parse(fs.readFileSync('research/surge-samples/2026-09-24-live-pump-batch.json','utf8'));
const report=Cal.calibrate(archive.samples,[60,70,80]);
assert.equal(report.version,'PREIGNITION_ARCHIVE_CALIBRATION_v1');
assert.equal(report.sampleCount,archive.samples.length);
assert(report.freshCount>0&&report.extendedCount>0,'archive must contain both fresh and extended pre-T0 controls');
assert.deepEqual(report.thresholds.map(x=>x.threshold),[60,70,80]);
assert(report.rows.every(x=>Number.isFinite(x.score)&&x.score>=0&&x.score<=100),'proxy scores must stay bounded');
const take=report.rows.find(x=>x.symbol==='TAKEUSDT'),xny=report.rows.find(x=>x.symbol==='XNYUSDT'),stable=report.rows.find(x=>x.symbol==='STABLEUSDT');
assert(take&&take.label==='EXTENDED_PRE_T0','TAKE late blowoff must remain an extended control');
assert(xny&&xny.label==='FRESH_PRE_T0','XNY pre-T0 should remain a fresh capture benchmark');
assert(stable&&stable.label==='FRESH_PRE_T0','STABLE absorption sample should remain a fresh benchmark');
assert(xny.score>take.score,'quiet OI+taker lead should outrank blowoff control without T0 leakage');
assert(report.caveats.some(x=>x.includes('survivor-biased')),'survivorship warning is mandatory');
assert(report.caveats.some(x=>x.includes('shadow-only')),'threshold must not auto-promote into production');
console.log('preignition archive calibration PASS');
console.log(JSON.stringify({
  sampleCount:report.sampleCount,
  freshCount:report.freshCount,
  extendedCount:report.extendedCount,
  shadowThreshold:report.shadowThreshold,
  thresholds:report.thresholds.map(x=>({
    threshold:x.threshold,
    selectedCount:x.selectedCount,
    freshCaptured:x.freshCaptured,
    freshTotal:x.freshTotal,
    freshRecall:x.freshRecall,
    extendedSelected:x.extendedSelected,
    extendedTotal:x.extendedTotal,
    extendedLeakRate:x.extendedLeakRate,
    balancedScore:x.balancedScore,
    freshSymbols:x.freshSymbols,
    extendedSymbols:x.extendedSymbols
  }))
},null,2));
