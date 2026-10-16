'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('./mtf-market-analyzer.js');

const TFMS={ '1w':604800000,'3d':259200000,'1d':86400000,'12h':43200000,'4h':14400000,'2h':7200000,'1h':3600000,'15m':900000,'5m':300000 };
function rows(tf,count=520,base=100){
  const ms=TFMS[tf],end=Date.parse('2026-10-02T09:00:00Z'),start=end-count*ms,out=[];
  for(let i=0;i<count;i++){
    const wave=Math.sin(i/5)*1.8+Math.sin(i/17)*.8,trend=i*.035,close=base+trend+wave,open=close-Math.sin(i/3)*.35;
    const high=Math.max(open,close)+.8+Math.abs(Math.sin(i))*0.3,low=Math.min(open,close)-.8-Math.abs(Math.cos(i))*0.3;
    const volume=1000+(i%20===0?2200:0)+(i>count-4?(i-count+4)*180:0),buy=volume*(.52+Math.min(.12,i/count*.08));
    out.push([start+i*ms,String(open),String(high),String(low),String(close),String(volume),start+(i+1)*ms-1,String(volume*close),100,String(buy),String(buy*close),'0']);
  }
  return out;
}
function frameSet(){return Object.fromEntries(M.TFS.filter(tf=>tf!=='3h').map(tf=>[tf,rows(tf,M.rowsForTf(tf)+10)]))}
test('shared MTF analyzer produces all ten role-separated frames with 3H synthetic provenance',()=>{
  const rawFrames=frameSet(),asOf=Date.parse('2026-10-02T10:00:00Z');
  const longEntry={status:'WAIT_REBREAK',label:'재돌파 대기',sweep:{at:asOf-7200000,low:101,session:'LONDON'},reclaimAt:asOf-6500000,mss:{confirmed:true,tf:'15m',at:asOf-5400000},displacement:{at:asOf-4500000,tf:'15m'},zone:{kind:'BULLISH_FVG',low:103,high:104,mid:103.5},retestAt:asOf-1800000,plannedEntry:105,stop:101,selectedTarget:{label:'PDH',price:112,rr:1.75},riskReward:1.75,minRr:1.5};
  const out=M.analyze({symbol:'AAAUSDT',rawFrames,row:{priceChange24h:1.4,spotPriceChange24h:1.8,oi4hPct:1.4,fundingRatePct:.01,taker15m:1.25},asOf,longEntry,cohort:'SHADOW_EXPANSION'});
  assert.equal(out.version,M.VERSION);
  assert.deepEqual(out.timeframes,['1w','3d','1d','12h','4h','3h','2h','1h','15m','5m']);
  for(const tf of M.TFS)assert.equal(out.frames[tf].available,true,tf+' must be available');
  assert.equal(out.multiTimeframe.rows.length,10);
  assert.equal(out.multiTimeframe.coverage.mode,'10TF');
  assert.equal(out.coverage.total,10);
  assert.equal(out.coverage.available,10);
  assert.equal(out.frames['3h'].sourceOrigin,'SYNTHETIC_3H_FROM_CLOSED_1H');
  assert.equal(out.frames['3h'].sourceTimeframe,'1h');
  assert(out.frames['3h'].sourceAsOf<asOf);
  assert(['BULL','BEAR','MIXED'].includes(out.multiTimeframe.regime));
  assert(Number.isFinite(out.preIgnition.score));
  assert.equal(out.preIgnition.stage.key,'PRE_IGNITION');
  assert.equal(out.entryMap.entryVisible,false,'planned entry must not be shown as executable before LONG_READY');
  assert.equal(out.entryMap.steps.sslSweep,true);
  assert.equal(out.entryMap.steps.mss,true);
  assert.equal(out.entryMap.steps.retest,true);
  assert.equal(out.researchSample.cohort,'SHADOW_EXPANSION');
  assert.equal(out.researchSample.lookaheadSafe,true);
  assert(Number.isFinite(out.researchSample.features.compression4h));
});
test('entry map only exposes executable entry after final ready gate',()=>{
  const plan={status:'LONG_READY',label:'롱 트리거 충족',entry:105,plannedEntry:105,stop:101,invalidation:101,sweep:{at:1,low:101},reclaimAt:2,mss:{confirmed:true,tf:'5m',at:3},displacement:{at:4,tf:'5m'},zone:{kind:'BULLISH_FVG',low:103,high:104,mid:103.5},retestAt:5,rebreakAt:6,selectedTarget:{label:'PDH',price:112,rr:1.75},targets:[{label:'PDH',price:112,rr:1.75}],riskReward:1.75,minRr:1.5};
  const x=M.entryMap(plan,{});
  assert.equal(x.entryVisible,true);
  assert.equal(x.entry,105);
  assert.equal(x.stop,101);
  assert.equal(x.steps.rrPass,true);
  const blocked=M.entryMap({...plan,status:'BLOCKED_REVIEW'},{});
  assert.equal(blocked.entryVisible,false);
  assert.equal(blocked.entry,null);
});
test('pre-ignition scoring excludes extended moves and rewards quiet OI-led compressed setups',()=>{
  const compact={};
  for(const tf of M.TFS)compact[tf]={available:true,structure:'UPTREND',emaTrend:'BULL',compressionState:'COMPRESSED',compressionPct:4,ema14DistancePct:2,rsi:58,volumeEcho:{active:tf==='4h'},specialSetups:{}};
  compact['1d'].specialSetups={daily92142:{ready:true}};
  compact['4h'].specialSetups={fourHLongEmaSupport:{holding:true}};
  const good=M.score({frames:compact,row:{priceChange24h:1.8,oi4hPct:1.6,taker15m:1.3,taker15mImproving:true,fundingRatePct:.01,spotFutures:{state:'SPOT_LEAD'}},mtf:{execution:{longState:'WATCH'}},longEntry:{status:'WAIT_REBREAK'}});
  const late=M.score({frames:{...compact,'1d':{...compact['1d'],ema14DistancePct:20},'4h':{...compact['4h'],ema14DistancePct:12}},row:{priceChange24h:18,oi4hPct:1.6,taker15m:1.3,fundingRatePct:.01,spotFutures:{state:'ALIGNED'}},mtf:{execution:{longState:'READY'}},longEntry:{status:'LONG_READY'}});
  assert(good.score>late.score);
  assert.equal(good.extended,false);
  assert.equal(late.extended,true);
  assert(good.evidence.some(x=>x.includes('OI 4H')));
  assert(late.risks.some(x=>x.includes('이미 진행')||x.includes('과이격')));
});

test('missing high-timeframe inputs remain explicitly unavailable rather than silently copied from 1D',()=>{
  const asOf=Date.parse('2026-10-02T10:00:00Z'),rawFrames=frameSet();
  delete rawFrames['3d'];delete rawFrames['12h'];delete rawFrames['2h'];
  const out=M.analyze({symbol:'MISSINGUSDT',rawFrames,asOf,row:{}});
  for(const tf of ['3d','12h','2h']){
    assert.equal(out.frames[tf].available,false);
    assert.equal(out.frames[tf].missingReason,'MISSING_OR_INSUFFICIENT_CLOSED_CANDLES');
  }
  assert.equal(out.coverage.available,7);
  assert(out.multiTimeframe.coverage.missing.includes('3d'));
});
test('3H needs at least 24 complete aligned 3H candles, not partial stale rows',()=>{
  const asOf=Date.parse('2026-10-02T10:00:00Z'),rawFrames=frameSet();
  rawFrames['1h']=rawFrames['1h'].slice(-35);
  const out=M.analyze({symbol:'PARTIALUSDT',rawFrames,asOf,row:{}});
  assert.equal(out.frames['3h'].available,false);
  assert.equal(out.frames['3h'].sourceOrigin,'SYNTHETIC_3H_FROM_CLOSED_1H');
  assert.equal(out.frames['3h'].sourceAsOf,null);
  assert.equal(out.frames['1h'].available,true);
});
