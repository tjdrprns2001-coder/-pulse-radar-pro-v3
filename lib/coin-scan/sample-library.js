'use strict';

const SAMPLE_LIBRARY=Object.freeze([
  {name:'ONE',label:'ONE · XOI/BSL 재공격형',expected:{archetype:['X','X+B','X+A','X+A+B'],sweep:['BSL_PROBE_REATTACK','DOUBLE_SWEEP'],time15:['ABSORPTION_TIME','LONG_REBUILD'],time1h:['FAST_RECLAIM','TIME_SYMMETRY'],xoi:true,takerExtreme:true}},
  {name:'CELR',label:'CELR · taker 장기잠복형',expected:{archetype:['B','X+B'],sweep:['NO_SWEEP_COMPRESSION','BSL_PROBE_REATTACK'],time15:['TIME_SYMMETRY','ABSORPTION_TIME'],time1h:['TIME_SYMMETRY','LONG_REBUILD'],takerExtreme:true}},
  {name:'AKE',label:'AKE · 청소→재구축 FAST형',expected:{archetype:['C','A+B','X+A+B'],sweep:['BSL_PROBE_REATTACK','FAILED_BREAK_REBUILD'],time15:['FAST_RECLAIM'],time1h:['LONG_REBUILD'],reset:['15M_RESET_5M_REIGNITION','HTF_RESET_LTF_REIGNITION','RESET_WAIT'],cleanup:true}},
  {name:'MYX',label:'MYX · OI 선행 흡수형',expected:{archetype:['A','A+B'],sweep:['BSL_PROBE_REATTACK','NO_SWEEP_COMPRESSION'],time15:['FAST_RECLAIM','TIME_SYMMETRY'],time1h:['ABSORPTION_TIME'],reset:['HTF_RESET_LTF_REIGNITION','15M_RESET_5M_REIGNITION'],takerExtreme:false}},
  {name:'XTZ',label:'XTZ · XOI+양방향 청소형',expected:{archetype:['X+B','X+A+B'],sweep:['DOUBLE_SWEEP','FAILED_BREAK_REBUILD'],time15:['FAST_RECLAIM'],time1h:['ABSORPTION_TIME'],xoi:true,takerExtreme:true}},
  {name:'CETUS',label:'CETUS · 하위완전청소→OI rebuild',expected:{archetype:['C','A+B'],sweep:['SSL_SWEEP_RECLAIM','DOUBLE_SWEEP','NO_SWEEP_COMPRESSION'],time15:['FAST_RECLAIM'],time1h:['LONG_REBUILD'],reset:['RESET_WAIT','15M_RESET_5M_REIGNITION'],cleanup:true}},
  {name:'TAG',label:'TAG · RVOL 선행 BSL 잠복형',expected:{archetype:['B','A+B'],sweep:['BSL_PROBE_REATTACK'],time15:['ABSORPTION_TIME'],time1h:['ABSORPTION_TIME','LONG_REBUILD'],takerExtreme:true}},
  {name:'THETA',label:'THETA · 양방향 청소→재구축형',expected:{archetype:['C','A+B'],sweep:['DOUBLE_SWEEP','FAILED_BREAK_REBUILD'],time15:['ABSORPTION_TIME'],time1h:['FAST_RECLAIM'],reset:['HTF_RESET_LTF_REIGNITION','15M_RESET_5M_REIGNITION'],cleanup:true}},
  {name:'PIEVERSE',label:'PIEVERSE · SSL+15m 리셋 FAST형',expected:{archetype:['A','B','C','NEUTRAL'],sweep:['SSL_SWEEP_RECLAIM'],time15:['FAST_RECLAIM'],time1h:['LONG_REBUILD'],reset:['15M_RESET_5M_REIGNITION','RESET_WAIT']}},
  {name:'MORPHO',label:'MORPHO · OI 선행 시간흡수형',expected:{archetype:['A','A+B','X+A'],sweep:['BSL_PROBE_REATTACK','NO_SWEEP_COMPRESSION'],time15:['ABSORPTION_TIME'],time1h:['TIME_SYMMETRY'],xoi:false}},
  {name:'PORTAL',label:'PORTAL · 정대칭 taker 잠복형',expected:{archetype:['B','C'],sweep:['NO_SWEEP_COMPRESSION','BSL_PROBE_REATTACK'],time15:['TIME_SYMMETRY'],time1h:['ABSORPTION_TIME'],reset:['RESET_WAIT','15M_RESET_5M_REIGNITION'],takerExtreme:true}},
  {name:'ESP',label:'ESP · cleanup→FAST squeeze형',expected:{archetype:['C','B','A+B'],sweep:['BSL_PROBE_REATTACK','SSL_SWEEP_RECLAIM','DOUBLE_SWEEP'],time15:['FAST_RECLAIM'],time1h:['ABSORPTION_TIME'],reset:['15M_RESET_5M_REIGNITION','HTF_RESET_LTF_REIGNITION'],cleanup:true,takerExtreme:true}},
  {name:'T',label:'T · MA압축→거래량→OI 구축형',expected:{archetype:['A','A+B','B'],maCluster:['TIGHT','NEAR'],volumeStage:['PRE_SPARK','IGNITION'],flowType:['DIRECT_BUILD','CLEAN_REBUILD'],htfTransition:['LTF_LEADS_HTF','HTF_ALIGNED']}},
  {name:'JTO',label:'JTO · 리셋 하락봉 흡수형',expected:{archetype:['B','C','A+B'],reset:['RESET_WAIT','15M_RESET_5M_REIGNITION','HTF_RESET_LTF_REIGNITION'],maCluster:['TIGHT','NEAR'],volumeStage:['ABSORPTION','IGNITION'],flowType:['ABSORPTION','CLEAN_REBUILD']}},
  {name:'SKL',label:'SKL · 재압축→거래량 가속→OI형',expected:{archetype:['A','A+B','B'],maCluster:['TIGHT','NEAR'],volumeStage:['IGNITION','PRE_SPARK'],flowType:['DIRECT_BUILD','CLEAN_REBUILD'],takerExtreme:true}},
  {name:'ONG',label:'ONG · 15m 이평압축 선행점화형',expected:{archetype:['B','A+B','A'],maCluster:['TIGHT','NEAR'],volumeStage:['IGNITION','PRE_SPARK'],flowType:['DIRECT_BUILD','PRICE_LED','OBSERVE']}},
  {name:'GUN',label:'GUN · 4H 선행 이평전환형',expected:{archetype:['A','A+B','B'],maCluster:['TIGHT','NEAR'],volumeStage:['IGNITION','PRE_SPARK'],flowType:['DIRECT_BUILD','CLEAN_REBUILD'],htfTransition:['LTF_LEADS_HTF']}},
  {name:'BANK',label:'BANK · 장기선 압축 흡수/돌파형',expected:{archetype:['B','C','A+B'],maCluster:['TIGHT','NEAR'],volumeStage:['ABSORPTION','IGNITION'],flowType:['ABSORPTION','CLEAN_REBUILD','DIRECT_BUILD'],htfTransition:['LTF_LEADS_HTF','BASE_BUILD']}},
  {name:'CTSI',label:'CTSI · 멀티TF 이평압축 점화형',expected:{archetype:['A','A+B','B'],maCluster:['TIGHT','NEAR'],volumeStage:['IGNITION','PRE_SPARK'],flowType:['DIRECT_BUILD','CLEAN_REBUILD'],htfTransition:['HTF_ALIGNED','LTF_LEADS_HTF']}},
  {name:'ZIL',label:'ZIL · 3D/1D 전환 후 4H 점화형',expected:{archetype:['A','A+B','B'],maCluster:['TIGHT','NEAR'],volumeStage:['IGNITION','PRE_SPARK'],flowType:['DIRECT_BUILD','CLEAN_REBUILD'],htfTransition:['HTF_ALIGNED']}},
  {name:'PTB',label:'PTB · OI-led BUILD→RELOAD→REIGNITION형',expected:{archetype:['A','A+B','B'],maCluster:['TIGHT','NEAR','WIDE'],volumeStage:['IGNITION','EXPANSION','PRE_SPARK'],flowType:['DIRECT_BUILD','OBSERVE','ABSORPTION'],htfTransition:['LTF_LEADS_HTF','HTF_ALIGNED'],takerExtreme:false}},
  {name:'ZETA',label:'ZETA · FLOW-led BUILD→직접 OI 확장형',expected:{archetype:['B','A+B','A'],maCluster:['TIGHT','NEAR','WIDE'],volumeStage:['PRE_SPARK','IGNITION','EXPANSION'],flowType:['PRICE_LED','DIRECT_BUILD','OBSERVE'],htfTransition:['LTF_LEADS_HTF','HTF_ALIGNED'],takerExtreme:true}},
  {name:'DRIFT',label:'DRIFT · 15m 거래량 폭발→눌림→OI 후행 재증가형',expected:{archetype:['A','A+B','B'],volumeStage:['IGNITION','PRE_SPARK'],flowType:['DIRECT_BUILD','CLEAN_REBUILD'],reset:['15M_RESET_5M_REIGNITION','RESET_WAIT']}},
  {name:'STRK',label:'STRK · 계단식 거래량 가속형',expected:{archetype:['A','A+B','B'],volumeStage:['PRE_SPARK','IGNITION'],maCluster:['TIGHT','NEAR'],flowType:['DIRECT_BUILD','OBSERVE']}},
  {name:'APT',label:'APT · 1차 점프 후 상단 유지형',expected:{archetype:['A+B','B','A'],volumeStage:['IGNITION','EXPANSION'],flowType:['DIRECT_BUILD','PRICE_LED'],sweep:['NO_SWEEP_COMPRESSION','BSL_PROBE_REATTACK']}},
  {name:'WLD',label:'WLD · 1차 점프 후 상단 유지형',expected:{archetype:['A+B','B','A'],volumeStage:['IGNITION','EXPANSION'],flowType:['DIRECT_BUILD','PRICE_LED'],sweep:['NO_SWEEP_COMPRESSION','BSL_PROBE_REATTACK']}},
  {name:'TIA',label:'TIA · 4H 계단식 추세 확장형',expected:{archetype:['A','A+B','B'],htfTransition:['HTF_ALIGNED','LTF_LEADS_HTF'],volumeStage:['PRE_SPARK','IGNITION'],flowType:['DIRECT_BUILD','OBSERVE']}},
  {name:'DYDX',label:'DYDX · 4H 계단식 추세 확장형',expected:{archetype:['A','A+B','B'],htfTransition:['HTF_ALIGNED','LTF_LEADS_HTF'],volumeStage:['PRE_SPARK','IGNITION'],flowType:['DIRECT_BUILD','OBSERVE']}},
  {name:'ZK',label:'ZK · 4H 계단식 추세 확장형',expected:{archetype:['A','A+B','B'],htfTransition:['HTF_ALIGNED','LTF_LEADS_HTF'],volumeStage:['PRE_SPARK','IGNITION'],flowType:['DIRECT_BUILD','OBSERVE']}},
  {name:'ETHFI',label:'ETHFI · 거래량 재가속 연속돌파형',expected:{archetype:['A+B','B'],volumeStage:['IGNITION','EXPANSION'],flowType:['DIRECT_BUILD','PRICE_LED'],sweep:['BSL_PROBE_REATTACK','NO_SWEEP_COMPRESSION']}},
  {name:'SKY',label:'SKY · 거래량 재가속 연속돌파형',expected:{archetype:['A+B','B'],volumeStage:['IGNITION','EXPANSION'],flowType:['DIRECT_BUILD','PRICE_LED'],sweep:['BSL_PROBE_REATTACK','NO_SWEEP_COMPRESSION']}},
  {name:'OP',label:'OP · 1차 급등 후 눌림 유지형',expected:{archetype:['A','B','C','A+B'],reset:['RESET_WAIT','15M_RESET_5M_REIGNITION'],volumeStage:['PRE_SPARK','IGNITION'],flowType:['CLEAN_REBUILD','OBSERVE','DIRECT_BUILD']}},
  {name:'DOT',label:'DOT · 완만한 추세 확장형',expected:{archetype:['A','A+B'],htfTransition:['HTF_ALIGNED'],volumeStage:['PRE_SPARK','IGNITION'],flowType:['DIRECT_BUILD','OBSERVE']}},
  {name:'SUI',label:'SUI · 완만한 추세 확장형',expected:{archetype:['A','A+B'],htfTransition:['HTF_ALIGNED'],volumeStage:['PRE_SPARK','IGNITION'],flowType:['DIRECT_BUILD','OBSERVE']}},
  {name:'TAO',label:'TAO · 완만한 추세 확장형',expected:{archetype:['A','A+B'],htfTransition:['HTF_ALIGNED'],volumeStage:['PRE_SPARK','IGNITION'],flowType:['DIRECT_BUILD','OBSERVE']}},
  {name:'PENDLE',label:'PENDLE · 완만한 추세 확장형',expected:{archetype:['A','A+B'],htfTransition:['HTF_ALIGNED'],volumeStage:['PRE_SPARK','IGNITION'],flowType:['DIRECT_BUILD','OBSERVE']}},
  {name:'LSK',label:'LSK · 스윕 후 재구성형',expected:{archetype:['C','A','A+B'],sweep:['FAILED_BREAK_REBUILD','DOUBLE_SWEEP','SSL_SWEEP_RECLAIM'],reset:['RESET_WAIT','15M_RESET_5M_REIGNITION'],flowType:['CLEAN_REBUILD','ABSORPTION']}},
  {name:'BOME',label:'BOME · 상단 재압축 점화형',expected:{archetype:['A','A+B','B'],sweep:['NO_SWEEP_COMPRESSION','BSL_PROBE_REATTACK'],maCluster:['TIGHT','NEAR'],volumeStage:['PRE_SPARK','IGNITION']}},
  {name:'PEPE',label:'PEPE · 밈 대확장/재점화 샘플',expected:{archetype:['A+B','B','A'],volumeStage:['IGNITION','EXPANSION'],flowType:['DIRECT_BUILD','PRICE_LED','SQUEEZE']}},
  {name:'DOGE',label:'DOGE · 밈 대확장/재점화 샘플',expected:{archetype:['A+B','B','A'],volumeStage:['IGNITION','EXPANSION'],flowType:['DIRECT_BUILD','PRICE_LED','SQUEEZE']}},
  {name:'BONK',label:'BONK · 밈 대확장/재점화 샘플',expected:{archetype:['A+B','B','A'],volumeStage:['IGNITION','EXPANSION'],flowType:['DIRECT_BUILD','PRICE_LED','SQUEEZE']}},
  {name:'SHIB',label:'SHIB · 밈 대확장/재점화 샘플',expected:{archetype:['A+B','B','A'],volumeStage:['IGNITION','EXPANSION'],flowType:['DIRECT_BUILD','PRICE_LED','SQUEEZE']}},
  {name:'XLM',label:'XLM · 스윙형 OI 선행축적 샘플',expected:{archetype:['A','A+B'],volumeStage:['PRE_SPARK','IGNITION'],flowType:['DIRECT_BUILD','OBSERVE'],htfTransition:['HTF_ALIGNED','LTF_LEADS_HTF']}},
  {name:'LINK',label:'LINK · HTF 정렬 후 거래량 점화형',expected:{archetype:['A','A+B','B'],volumeStage:['PRE_SPARK','IGNITION'],flowType:['DIRECT_BUILD','OBSERVE'],htfTransition:['HTF_ALIGNED']}}
]);

const WEIGHTS=Object.freeze({archetype:24,sweep:18,time15:14,time1h:12,reset:14,cleanup:8,xoi:6,takerExtreme:4,maCluster:16,volumeStage:18,flowType:16,htfTransition:10});
function boolMatch(expected,actual){return expected===undefined?null:Boolean(expected)===Boolean(actual)}
function listMatch(expected,actual){if(!Array.isArray(expected)||!expected.length)return null;return expected.includes(actual)}
function compareOne(sample,features={}){
  const e=sample.expected||{}, checks=[
    ['archetype',listMatch(e.archetype,features.archetype)],
    ['sweep',listMatch(e.sweep,features.sweepKey)],
    ['time15',listMatch(e.time15,features.time15Key)],
    ['time1h',listMatch(e.time1h,features.time1hKey)],
    ['reset',listMatch(e.reset,features.resetKey)],
    ['cleanup',boolMatch(e.cleanup,features.cleanup)],
    ['xoi',boolMatch(e.xoi,features.xoi)],
    ['takerExtreme',boolMatch(e.takerExtreme,features.takerExtreme)],
    ['maCluster',listMatch(e.maCluster,features.maClusterKey)],
    ['volumeStage',listMatch(e.volumeStage,features.volumeStage)],
    ['flowType',listMatch(e.flowType,features.flowType)],
    ['htfTransition',listMatch(e.htfTransition,features.htfTransition)]
  ];
  let got=0,total=0;const matched=[],missed=[];
  for(const [k,result] of checks){if(result===null)continue;const w=WEIGHTS[k]||1;total+=w;if(result){got+=w;matched.push(k)}else missed.push(k)}
  const score=total?Math.round((got/total)*100):0;
  return{name:sample.name,label:sample.label,score,matched,missed};
}
const NEGATIVE_SAMPLE_LIBRARY=Object.freeze([
  {name:'ZAMA-CONTROL',label:'ZAMA 대조군 · 가격상승/OI 비동행',expected:{flowType:['SQUEEZE','PRICE_LED'],volumeStage:['EXPANSION','PRE_SPARK'],maCluster:['WIDE','NEAR']}},
  {name:'BTW-CONTROL',label:'BTW 대조군 · RVOL 반복/OI 감소형',expected:{flowType:['SQUEEZE','PRICE_LED'],volumeStage:['EXPANSION','IGNITION','PRE_SPARK'],maCluster:['TIGHT','NEAR','WIDE']}}
]);
function compareSampleLibrary(features={},limit=3){
  return SAMPLE_LIBRARY.map(s=>compareOne(s,features)).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,Math.max(1,Number(limit)||3));
}
function compareNegativeSampleLibrary(features={},limit=2){
  return NEGATIVE_SAMPLE_LIBRARY.map(s=>compareOne(s,features)).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,Math.max(1,Number(limit)||2));
}
module.exports={SAMPLE_LIBRARY,NEGATIVE_SAMPLE_LIBRARY,compareSampleLibrary,compareNegativeSampleLibrary};
