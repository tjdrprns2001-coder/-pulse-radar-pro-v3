'use strict';
const assert=require('assert');
const Engine=require('../lib/coin-scan/common-preignition-stage.js');

const TFMS={ '15m':900000,'1h':3600000,'4h':14400000 };
function rows({tf='15m',count=140,base=100,drift=0,vol=1000,spikeAt=null,spikeVol=5000,lastVol=null,lastBreakout=false}={}){
  const ms=TFMS[tf],start=Date.now()-ms*(count+2),out=[];let p=base;
  for(let i=0;i<count;i++){
    const o=p;
    let c=p+drift;
    if(lastBreakout&&i===count-1)c=p+1.5;
    const h=Math.max(o,c)+.2,l=Math.min(o,c)-.2;
    let v=vol;if(i===spikeAt)v=spikeVol;if(i===count-1&&lastVol!=null)v=lastVol;
    out.push([start+i*ms,String(o),String(h),String(l),String(c),String(v),start+(i+1)*ms-1,String(v*c),100,String(v*.55),String(v*c*.55),'0']);
    p=c;
  }
  return out;
}
function taker(vals){return vals.map((x,i)=>({timestamp:Date.now()-((vals.length-i)*900000),buyVol:x*100,sellVol:100,ratio:x}))}

const cooldownFrames={
  '4h':rows({tf:'4h',count:140,drift:.001}),
  '1h':rows({tf:'1h',count:140,drift:.001}),
  '15m':rows({tf:'15m',count:140,drift:0,spikeAt:105,spikeVol:6000,lastVol:900})
};
const cooldown=Engine.evaluate({
  frames:cooldownFrames,
  row:{priceChange24h:.8,oi4hPct:1.2,oi8hPct:1.8,fundingRatePct:.01},
  taker15mSeries:taker([.92,.98,1.05,1.24])
});
assert.equal(cooldown.shadowOnly,true);
assert.equal(cooldown.rankingEffect,0);
assert(['EARLY_ACTIVITY','COOLDOWN_COMPRESSION','RECLAIM','IGNITION','BASE'].includes(cooldown.stage));
assert(cooldown.subtypes.some(x=>x.startsWith('A · OI_BUILD')),'OI build subtype required');
assert(cooldown.subtypes.some(x=>x.startsWith('B · FLOW_LEAD')),'flow lead subtype required');
assert.equal(cooldown.policy.validatedWinRate,false);

const ignitionFrames={
  '4h':rows({tf:'4h',count:140,drift:.001}),
  '1h':rows({tf:'1h',count:140,drift:.001,lastBreakout:true}),
  '15m':rows({tf:'15m',count:140,drift:.001,lastVol:4200,lastBreakout:true})
};
const ignition=Engine.evaluate({
  frames:ignitionFrames,
  row:{priceChange24h:3.2,oi4hPct:.4,fundingRatePct:.01},
  taker15mSeries:taker([.95,1.02,1.18,1.31])
});
assert.equal(ignition.stage,'IGNITION','price breakout + RVOL re-expansion should promote ignition');
assert.equal(ignition.priceConfirm,true);
assert.equal(ignition.ignition,true);
assert(ignition.progressPct===100);

const missing=Engine.evaluate({frames:{'4h':[],'1h':[],'15m':[]},row:{},taker15mSeries:[]});
assert.equal(missing.stage,'NO_SETUP');
assert(missing.counterEvidence.includes('4H OI 미확인'));
assert.equal(missing.rankingEffect,0);

console.log('common pre-ignition stage verification passed');
