const ENGINE_VERSION='chart-patterns-v2.4';
const CALIBRATION_VERSION='calib-2026-09-14-a';
const MIN_SAMPLES_PER_FREE_PARAMETER=30;
const MIN_VALID_SAMPLES=20;
const SPLIT_RATIOS={dev:.55,valid:.20,holdout:.25};
const RELIABILITY_BANDS={high:80,medium:60,low:40};

// Keep the structural model compact: one global profile plus small TF deltas.
const GLOBAL={minSpan:10,minSpace:2,touchTol:.55,fit:.42,flat:.075,slope:.085,parallel:.13,doubleGap:8,confidence:72,maxBreach:.16};
const TF_DELTA={
  '15m':{minSpan:4,minSpace:1,touchTol:-.07,fit:.06,flat:-.01,slope:.01,parallel:-.02,doubleGap:2,confidence:2,maxBreach:-.04},
  '1h': {minSpan:2,minSpace:1,touchTol:-.03,fit:.03,flat:-.005,slope:.005,parallel:-.01,doubleGap:1,confidence:1,maxBreach:-.02},
  '4h': {},
  '1d': {minSpan:-2,touchTol:.07,fit:-.04,flat:.01,slope:-.01,parallel:.02,doubleGap:-2,confidence:-1,maxBreach:.02}
};
const RULES={
  triangle:{maxWidthRatio:.82,maxApexSpanFactor:2.5},
  channel:{minWidthRatio:.72,maxWidthRatio:1.28},
  headAndShoulders:{minShoulderSymmetry:.45,minHeadProminenceAtr:.35,minNeckDepthAtr:.65},
  double:{minSimilarity:.45,minDepthAtr:.65}
};
// At most three free parameters per family may be proposed by calibration.
const TUNABLES={
  triangle:['confidence','touchTol','minSpan'],
  channel:['confidence','maxBreach','parallel'],
  head_and_shoulders:['confidence','minShoulderSymmetry','minHeadProminenceAtr'],
  inverse_head_and_shoulders:['confidence','minShoulderSymmetry','minHeadProminenceAtr'],
  double_top:['confidence','minSimilarity','minDepthAtr'],
  double_bottom:['confidence','minSimilarity','minDepthAtr'],
  falling_wedge:['confidence','touchTol','minSpan']
};
const FAMILY={ascending_triangle:'triangle',descending_triangle:'triangle',symmetrical_triangle:'triangle',ascending_channel:'channel',descending_channel:'channel',head_and_shoulders:'head_and_shoulders',inverse_head_and_shoulders:'inverse_head_and_shoulders',double_top:'double_top',double_bottom:'double_bottom',falling_wedge:'falling_wedge'};
function tfConfig(tf='4h'){const d=TF_DELTA[String(tf).toLowerCase()]||TF_DELTA['4h'];const o={};for(const [k,v] of Object.entries(GLOBAL))o[k]=v+(d[k]||0);return o}
function tunablesFor(type){return TUNABLES[FAMILY[type]||type]||[]}
function requiredSamplesFor(type){return Math.max(MIN_VALID_SAMPLES,tunablesFor(type).length*MIN_SAMPLES_PER_FREE_PARAMETER)}
module.exports={ENGINE_VERSION,CALIBRATION_VERSION,MIN_SAMPLES_PER_FREE_PARAMETER,MIN_VALID_SAMPLES,SPLIT_RATIOS,RELIABILITY_BANDS,GLOBAL,TF_DELTA,RULES,TUNABLES,FAMILY,tfConfig,tunablesFor,requiredSamplesFor};