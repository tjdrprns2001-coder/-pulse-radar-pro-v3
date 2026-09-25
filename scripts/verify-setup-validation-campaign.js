'use strict';
const assert=require('assert');
const Campaign=require('../lib/research-backtest-v2/setup-validation-campaign.js');

const STEP=15*60*1000,START=Date.UTC(2026,0,1);
function bars(n=160){
  const out=[];
  for(let i=0;i<n;i++){
    const ot=START+i*STEP,ct=ot+STEP-1,p=100+i*.02;
    out.push([ot,String(p),String(p+1),String(p-1),String(p+.2),'1000',ct,String((p+.2)*1000)]);
  }
  return out;
}
function context(symbol,n=160){
  const rows=bars(n);
  return rows.map((r,i)=>({
    availableAt:r[6],
    derivativesProfile:{
      oi4hPct:i<16?null:.5,
      oi8hPct:i<32?null:1,
      oi24hPct:i<96?null:2,
      fundingRate:.01,
      taker15m:Array.from({length:Math.min(20,i+1)},(_,j)=>({timestamp:r[6]-(j*STEP),ratio:1.05})),
      taker1h:Array.from({length:Math.min(12,Math.floor(i/4)+1)},(_,j)=>({timestamp:r[6]-(j*4*STEP),ratio:1.03}))
    },
    spot15m:rows.slice(Math.max(0,i-63),i+1),
    execution:null,
    data:{stale:false},
    historicalCoverage:{execution:false}
  }));
}
const fakeProvider={
  async getHistoricalFramesRange(symbol,{startTime,endTime}={}){
    const r=bars(160).filter(x=>x[6]>=startTime-40*STEP&&x[6]<=endTime);
    return{frames:{'1w':r,'3d':r,'1d':r,'12h':r,'4h':r,'1h':r,'15m':r,'5m':r},meta:{'15m':{rowCount:r.length}}};
  },
  async buildHistoricalContextTimeline(symbol,{startTime,endTime}={}){
    const tl=context(symbol).filter(x=>x.availableAt>=startTime&&x.availableAt<=endTime);
    return{timeline:tl,coverage:{oiRows:tl.length,taker15mRows:tl.length,fundingRows:tl.length,spot15mRows:tl.length,executionHistorical:false},pages:{oi:1,taker15m:1,funding:1,spot:1}};
  }
};

(async()=>{
  const syms=['AAAUSDT','BBBUSDT','CCCUSDT','DDDUSDT'];
  const start=START+24*STEP,end=START+140*STEP;
  const out=await Campaign.runCampaign({provider:fakeProvider,symbols:syms,requestedStart:start,endTime:end,minimumUsableSymbols:4});
  assert.equal(out.effective.symbols.length,4);
  assert(out.effective.startTime>=start);
  assert(out.effective.splits.development.endTs<out.effective.splits.walkForward.startTs);
  assert(out.effective.splits.walkForward.endTs<out.effective.splits.lockedOos.startTs);
  assert(out.lock.lockId.startsWith('setup-campaign-'));
  assert.equal(out.lock.fingerprint.length,64);
  assert.equal(out.coverage.length,4);
  assert(out.report.markdown.includes('Setup Validation'));
  const same=Campaign.buildLock(out.lock.payload);
  assert.equal(typeof same.fingerprint,'string');
  console.log('setup validation campaign verification passed');
})().catch(e=>{console.error(e);process.exit(1)});
