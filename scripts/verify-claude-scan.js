'use strict';
const assert=require('assert');
const Claude=require('../lib/coin-scan/claude-scan-mode.js');
const Astra=require('../lib/coin-scan/astra-auto-scanner.js');

function oiRows(anchorValues){
  const anchors=new Map([[0,anchorValues[0]],[4,anchorValues[1]],[8,anchorValues[2]],[12,anchorValues[3]]]),out=[];
  for(let i=0;i<=12;i++){
    let v;if(anchors.has(i))v=anchors.get(i);else{
      const lo=Math.floor(i/4)*4,hi=Math.min(12,lo+4),a=anchors.get(lo),b=anchors.get(hi);v=a+(b-a)*((i-lo)/(hi-lo||1));
    }
    out.push({timestamp:i*3600000,sumOpenInterest:String(v),sumOpenInterestValue:String(v*10000)});
  }
  return out;
}
function kline(open,ratio=1.5,close=1,volume=100,ms=3600000){
  const buy=volume*ratio/(1+ratio);
  return[open,String(close*.999),String(close*1.002),String(close*.998),String(close),String(volume),open+ms-1,String(close*volume),100,String(buy),String(close*buy),'0'];
}
(function(){
  const build=Claude.oiPath({rows:oiRows([100,110,120,130])});
  assert.equal(build.path,'+/+/+');
  assert.equal(build.pattern,'CONTINUOUS_BUILD');
  assert.equal(build.eligible,true);

  const clean=Claude.oiPath({rows:oiRows([100,110,120,115])});
  assert.equal(clean.path,'-/+/+');
  assert.equal(clean.pattern,'CLEAN_REBUILD');
  assert.equal(clean.eligible,true);

  const weak=Claude.oiPath({rows:oiRows([120,110,100,110])});
  assert.equal(weak.path,'+/-/-');
  assert.equal(weak.pattern,'BUILD_WEAKENING');
  assert.equal(weak.eligible,false);

  assert.equal(Claude.rvolZone(1.2),'QUIET');
  assert.equal(Claude.rvolZone(2),'PRE_SPARK');
  assert.equal(Claude.rvolZone(5),'IGNITION');
  assert.equal(Claude.rvolZone(11),'EXPANSION');
  assert.equal(Claude.takerZone(.7),'WEAK');
  assert.equal(Claude.takerZone(1),'NEUTRAL');
  assert.equal(Claude.takerZone(1.3),'IMPROVE');
  assert.equal(Claude.takerZone(1.5),'STRONG');

  const asOf=4*3600000;
  const k1=[kline(0,1.5),kline(3600000,1.5),kline(7200000,1.5)];
  const e1=[0,3600000,7200000].map(t=>({timestamp:t,ratio:1.4,buyVol:140,sellVol:100}));
  const dir=Claude.directionConfirm(k1,e1,build,asOf);
  assert.equal(dir.confirmed,true);
  assert.equal(dir.improveCount,3);
  assert.equal(dir.strongCount,0,'conservative ratio must use lower endpoint value');

  const row={
    asOf,
    priceChange24h:1,
    spotPriceChange24h:.8,
    fundingRatePct:.01,
    claudeOiPath:build,
    tf:{'15m':{rvol:2},'5m':{rvol:1.6}},
    takerCross:{'15m':{klineRatio:1.5,endpointRatio:1.4},'5m':{klineRatio:1.4,endpointRatio:1.3}}
  };
  const v=Claude.classify(row,{frames:{'1w':[],'3d':[],'1d':[],'12h':[],'4h':[],'1h':k1,'15m':[],'5m':[]},taker1hSeries:e1});
  assert.equal(v.key,'CLAUDE_A');
  assert.equal(v.direction,'LONG_BIAS');
  assert.equal(v.taker['15m'].conservative,1.4);

  assert.equal(Astra.methodOf('claude'),'claude');
  assert.deepEqual(Astra.CLAUDE_TIMEFRAMES,['1w','3d','1d','12h','4h','1h','15m','5m']);
  assert.equal(Astra.CLAUDE_CONFIG.takerWeak,.8);
  assert.equal(Astra.CLAUDE_CONFIG.rvolIgnition,3);
  assert.equal(Astra.CLAUDE_CONFIG.rvolExpansion,10);
  console.log('claude Astra+SURGE v3 verification passed');
})();
