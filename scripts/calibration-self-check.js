const assert=require('node:assert/strict');
const profile=require('../lib/calibration-profile.js');
const chart=require('../lib/chart-patterns.js');
const validation=require('../lib/pattern-validation.js');
const {buildFreezeManifest}=require('../lib/calibration-freeze.js');
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
  const a=buildFreezeManifest(),b=buildFreezeManifest();
  assert.equal(a.sha256,b.sha256,'freeze fingerprint must be deterministic');
  assert.equal(a.manifest.engineVersion,profile.ENGINE_VERSION,'freeze engine version mismatch');
  assert.equal(a.manifest.calibrationVersion,profile.CALIBRATION_VERSION,'freeze calibration version mismatch');
  assert.equal(a.manifest.samplePolicy.maxFreeParametersPerFamily,3,'freeze parameter budget mismatch');
  assert.ok(!('generatedAt' in a.manifest),'generated timestamps must stay outside canonical freeze manifest');
  console.log(JSON.stringify({ok:true,engineVersion:profile.ENGINE_VERSION,calibrationVersion:profile.CALIBRATION_VERSION,freezeSha256:a.sha256,freezeBytes:a.canonicalBytes,split:profile.SPLIT_RATIOS,families:Object.keys(profile.TUNABLES).length,timeframes:['15m','1h','4h','1d']},null,2));
}
main();