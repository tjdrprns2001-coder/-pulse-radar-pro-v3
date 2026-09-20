const assert=require('assert');
const s=require('../lib/coin-scan/sample-engine.js');
const library=require('../lib/coin-scan/sample-library.js');

const oiAB=s.deriveOiProfile([{sumOpenInterest:'100'},{sumOpenInterest:'102'},{sumOpenInterest:'104'}]);
assert(Math.abs(oiAB.changePct-4)<1e-9);
assert.equal(oiAB.drawdownPct,0);
const takerAB=s.deriveTakerProfile([{buySellRatio:'0.42'},{buySellRatio:'2.35'},{buySellRatio:'1.1'}]);
assert.equal(takerAB.spikes20,1);
assert.equal(s.classifyArchetype({priceProfile:{priceChange8hPct:1.2},oiProfile:oiAB,takerProfile:takerAB}).archetype,'A+B');

const oiB=s.deriveOiProfile([100,100.4,100.2]);
const takerB=s.deriveTakerProfile([.22,1.1,4.13,.7]);
assert.equal(s.classifyArchetype({priceProfile:{priceChange8hPct:-1},oiProfile:oiB,takerProfile:takerB}).archetype,'B');

const xoi=s.normalizeXoiProfile({available:true,exchanges:{bybit:{available:true,changePct:3.8,samples:32},okx:{available:true,changePct:2.1,samples:8}}});
assert.equal(xoi.positiveBreadth,2);
const xClass=s.classifyArchetype({priceProfile:{priceChange8hPct:.8},oiProfile:oiB,takerProfile:takerB,xoiProfile:xoi});
assert.equal(xClass.archetype,'X+B');
assert.equal(s.deriveSequenceTag({oiProfile:oiB,takerProfile:takerB,xoiProfile:xoi}),'XOI-B2+');

const oiC=s.deriveOiProfile([100,96,97]);
assert.equal(s.classifyArchetype({priceProfile:{priceChange8hPct:-1},oiProfile:oiC,takerProfile:s.deriveTakerProfile([.8,1.2])}).archetype,'C');

const rows=[];
for(let i=0;i<48;i++){
  const late=i>=24,base=10+i*.001;
  rows.push([i,base,late?11:10.2,late?9.5:9,base+.01,100+(late?50:0),0,0,0,0,0,0]);
}
const liq=s.deriveLiquidityPattern(rows);
assert.equal(liq.key,'BSL-EXPANSION');
assert.equal(liq.lowSweep,false);
assert.equal(liq.highSweep,true);

const sample=s.analyzeSamplePattern({
  frames:{'15m':rows},
  derivativesProfile:{oiProfile:oiAB,takerProfile:takerAB,xoiProfile:xoi}
});
assert.equal(sample.archetype,'X+A+B');
assert.equal(sample.sequenceTag,'XOI-A+B');
assert(sample.xoiProfile.available);
assert(sample.score>=50);
assert(['IGNITION-WAIT','IGNITION-EARLY','OBSERVE','PROGRESSED','REIGNITION'].includes(sample.phase));
assert(Array.isArray(sample.reasons));


const sweepRows=Array.from({length:42},(_,i)=>{
  const base=100+(i>28?(i-28)*.08:0),high=101,low=i===28?98:99,close=i===28?100.4:base;
  return [i*300000,String(base),String(high),String(low),String(close),String(100+i),0,0,0,0,0,0];
});
const precise=s.deriveLocalSweepPattern(sweepRows);
assert(['SSL_SWEEP_RECLAIM','NO_SWEEP_COMPRESSION'].includes(precise.key),'precise sweep tag required');
assert(typeof precise.label==='string'&&precise.label.length>0);

const timeRows=Array.from({length:36},(_,i)=>{
  let p=100;
  if(i<=10)p=100+i;
  else if(i<=14)p=110-(i-10)*5;
  else p=90+(i-14)*.8;
  const hi=i===10?112:p+1,lo=i===14?88:p-1;
  return [i*900000,String(p),String(hi),String(lo),String(p),String(100+i),0,0,0,0,0,0];
});
const ts=s.deriveTimeSymmetry(timeRows,15);
assert(['FAST_RECLAIM','TIME_SYMMETRY','ABSORPTION_TIME','LONG_REBUILD','UNKNOWN'].includes(ts.tag),'time symmetry tag required');

const reset=s.deriveResetReignition({'1h':timeRows.concat(timeRows),'15m':timeRows.concat(timeRows),'5m':timeRows.concat(timeRows)});
assert(reset&&typeof reset.key==='string'&&typeof reset.label==='string','reset/reignition DNA required');

const matches=library.compareSampleLibrary({archetype:'C',sweepKey:'BSL_PROBE_REATTACK',time15Key:'FAST_RECLAIM',time1hKey:'LONG_REBUILD',resetKey:'15M_RESET_5M_REIGNITION',cleanup:true,xoi:false,takerExtreme:false});
assert(Array.isArray(matches)&&matches.length===3,'sample similarity top3 required');
assert(matches[0].score>=50,'representative sample similarity should be meaningful');

const enhanced=s.analyzeSamplePattern({frames:{'1h':timeRows.concat(timeRows),'15m':timeRows.concat(timeRows),'5m':sweepRows.concat(sweepRows)},derivativesProfile:{oiProfile:oiAB,takerProfile:takerAB,xoiProfile:xoi}});
for(const k of ['sweep','timeSymmetry','resetReignition','volumeShockMemory','similarity','dormancy'])assert(Object.prototype.hasOwnProperty.call(enhanced,k),`enhanced sample field ${k} required`);
assert(Array.isArray(enhanced.similarity)&&enhanced.similarity.length>0);

// closed 5m RVOL >=3x should persist as a 24H latent memory even after volume cools.
const shock5=Array.from({length:300},(_,i)=>{
  const px=i<150?100:100.5;
  const vol=i===160?420:100;
  return [i*300000,String(px),String(px+1),String(px-1),String(px),String(vol),i*300000+299999,String(vol*px),10,String(vol*.55),String(vol*px*.55),0];
});
const shockMemory=s.deriveVolumeShockMemory({frames:{'5m':shock5},oiProfile:s.deriveOiProfile([100,101.2,102]),takerProfile:s.deriveTakerProfile([.7,2.2,1.1])});
assert.equal(shockMemory.found,true,'5m RVOL shock should be detected');
assert.equal(shockMemory.eligible,true,'held shock should stay in 24H memory');
assert.equal(shockMemory.dna,'D+A+B','volume shock should join OI/taker confirmations');
assert(['REIGNITION_READY','REIGNITION'].includes(shockMemory.status),'joined confirmations should promote latent shock');
assert(shockMemory.ageHours>0&&shockMemory.ageHours<=24,'shock age should be tracked inside 24H');

const broken5=shock5.map(r=>r.slice());
for(let i=170;i<broken5.length;i++){broken5[i][3]='94';broken5[i][4]='94';}
const brokenMemory=s.deriveVolumeShockMemory({frames:{'5m':broken5},oiProfile:s.deriveOiProfile([100,101.2,102]),takerProfile:s.deriveTakerProfile([.7,2.2])});
assert.equal(brokenMemory.eligible,false,'broken signal price/structure must leave latent memory');
assert.equal(brokenMemory.status,'BROKEN');

const shockAnalysis=s.analyzeSamplePattern({frames:{'1h':timeRows.concat(timeRows),'15m':timeRows.concat(timeRows),'5m':shock5},derivativesProfile:{oiProfile:s.deriveOiProfile([100,101.2,102]),takerProfile:s.deriveTakerProfile([.7,2.2,1.1])}});
assert.equal(shockAnalysis.volumeShockMemory.found,true);
assert.equal(shockAnalysis.dormancy.eligible,true);
assert.equal(shockAnalysis.dormancy.source,'RVOL_5M_SHOCK');

const clusterRows=Array.from({length:260},(_,i)=>{
  const wobble=((i%9)-4)*0.01,px=100+wobble,vol=i===250?420:100;
  return [i*900000,String(px),String(px+.15),String(px-.15),String(px),String(vol),i*900000+899999,String(vol*px),10,String(vol*.58),String(vol*px*.58),0];
});
const ma=s.deriveMaClusterProfile({'1d':clusterRows,'4h':clusterRows,'1h':clusterRows,'15m':clusterRows});
assert.equal(ma.key,'TIGHT','20/60/112/224 flat cluster should be tight');
const volDna=s.deriveVolumeMaDna({frames:{'4h':clusterRows,'1h':clusterRows,'15m':clusterRows},maClusterProfile:ma});
assert.equal(volDna.found,true,'clustered RVOL spike should be detected');
assert(['PRE_SPARK','IGNITION','ABSORPTION'].includes(volDna.stage),'cluster spike should be pre-surge volume stage');
const directOi=s.deriveOiProfile([100,100.5,102.2]),directTaker=s.deriveTakerProfile([.9,2.25,1.1]);
const flow=s.deriveFlowType({priceProfile:{priceChange8hPct:1},oiProfile:directOi,takerProfile:directTaker,volumeMaDna:volDna});
assert.equal(flow.key,'DIRECT_BUILD');
const preV4=s.derivePreSurgeDna({priceProfile:{priceChange8hPct:1},maCluster:ma,volumeMaDna:volDna,resetReignition:{key:'RESET_WAIT'},flowType:flow,oiProfile:directOi,takerProfile:directTaker});
assert.equal(preV4.eligible,true,'MA cluster + volume + taker/OI should form v4 pre-surge DNA');
assert(preV4.score>=55);
const v4Analysis=s.analyzeSamplePattern({frames:{'1d':clusterRows,'4h':clusterRows,'1h':clusterRows,'15m':clusterRows,'5m':clusterRows},derivativesProfile:{oiProfile:directOi,takerProfile:directTaker}});
for(const k of ['maCluster','volumeMaDna','flowType','preSurgeDna','negativeSimilarity','controlRisk'])assert(Object.prototype.hasOwnProperty.call(v4Analysis,k),`v4 field ${k} required`);
assert(Array.isArray(v4Analysis.negativeSimilarity));
const tLike=library.compareSampleLibrary({archetype:'A+B',maClusterKey:'TIGHT',volumeStage:'IGNITION',flowType:'DIRECT_BUILD',htfTransition:'HTF_ALIGNED'},5);
assert(tLike.some(x=>x.name==='T'||x.name==='CTSI'||x.name==='ZIL'),'new MA-volume samples should participate in similarity');

console.log('sample DNA engine PASS');
