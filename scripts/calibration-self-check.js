const assert=require('node:assert/strict');
const profile=require('../lib/calibration-profile.js');
const chart=require('../lib/chart-patterns.js');
const validation=require('../lib/pattern-validation.js');
function main(){
  assert.equal(chart.ENGINE_VERSION,profile.ENGINE_VERSION,'engine version mismatch');
  assert.equal(chart.CALIBRATION_VERSION,profile.CALIBRATION_VERSION,'calibration version mismatch');
  assert.equal(typeof validation.validatePatterns,'function','validator missing');
  const split=profile.SPLIT_RATIOS.dev+profile.SPLIT_RATIOS.valid+profile.SPLIT_RATIOS.holdout;
  assert.ok(Math.abs(split-1)<1e-9,'dataset split must equal 1');
  for(const [family,params] of Object.entries(profile.TUNABLES)){
    assert.ok(params.length<=3,`${family}: more than 3 free parameters`);
    for(const p of params)assert.ok(profile.PARAM_META[p],`${family}: missing PARAM_META for ${p}`);
  }
  for(const tf of ['15m','1h','4h','1d']){
    const c=profile.tfConfig(tf);
    for(const k of ['minSpan','minSpace','touchTol','fit','confidence','maxBreach'])assert.ok(Number.isFinite(c[k]),`${tf}: invalid ${k}`);
  }
  console.log(JSON.stringify({ok:true,engineVersion:profile.ENGINE_VERSION,calibrationVersion:profile.CALIBRATION_VERSION,split:profile.SPLIT_RATIOS,families:Object.keys(profile.TUNABLES).length,timeframes:['15m','1h','4h','1d']},null,2));
}
main();