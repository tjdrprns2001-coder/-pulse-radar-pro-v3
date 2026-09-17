const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const enginePath=path.join(__dirname,'../lib/analysis/presurge-v2.js');

test('PRE-SURGE v2 blocks evaluation when data is not live',()=>{
  assert.ok(fs.existsSync(enginePath),'presurge-v2.js must exist');
  const P=require(enginePath);
  const r=P.evaluate({dataState:'stale',bias:'bullish',takerRatio:1.6,oiChangePct:4,fundingPct:0.01,volumeAcceleration:3,alertState:'ARMED'});
  assert.equal(r.label,'판정 보류');
  assert.equal(r.blocked,true);
});

test('PRE-SURGE v2 requires multiple confirming conditions',()=>{
  const P=require(enginePath);
  const one=P.evaluate({dataState:'live',bias:'bullish',takerRatio:1.35,oiChangePct:null,fundingPct:null,volumeAcceleration:null,alertState:'OBSERVE'});
  assert.equal(one.label,'없음');
  const watch=P.evaluate({dataState:'live',bias:'bullish',takerRatio:1.25,oiChangePct:1.2,fundingPct:0.005,volumeAcceleration:null,alertState:'WATCH'});
  assert.equal(watch.label,'관찰');
  const high=P.evaluate({dataState:'live',bias:'bullish',takerRatio:1.45,oiChangePct:2.5,fundingPct:0.008,volumeAcceleration:2.2,alertState:'ARMED'});
  assert.equal(high.label,'가능성 높음');
});

test('PRE-SURGE v2 does not treat heavy sell taker as bullish trigger',()=>{
  const P=require(enginePath);
  const r=P.evaluate({dataState:'live',bias:'bullish',takerRatio:0.45,oiChangePct:2.5,fundingPct:0.008,volumeAcceleration:2.2,alertState:'ARMED'});
  assert.notEqual(r.label,'가능성 높음');
  assert.match(r.reasons.join(' '),/매도 우위|체결/);
});

test('beginner summary module references PRE-SURGE v2 and natural Korean explanation',()=>{
  const ui=fs.readFileSync(path.join(__dirname,'../ui/snapshot/signal-interpretation-ko.js'),'utf8');
  assert.match(ui,/PulsePreSurgeV2/);
  assert.match(ui,/가능성 높음/);
  assert.match(ui,/왜 이렇게 봤나요|판단 근거/);
});
