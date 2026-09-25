'use strict';
const assert=require('assert');
const R=require('../lib/research-backtest-v2/setup-validation-report.js');

const batch={
  caseCount:2,errorCount:1,
  errors:[{symbol:'CCCUSDT',error:'missing history'}],
  aggregateLockedOos:{tradeCount:4},
  symbolSummary:[
    {symbol:'AAAUSDT',lockedOosStructureTriggers:10,lockedOosExecutionCoverageRate:.5,lockedOosTriggerConfirmConversion:.2,lockedOosTrades:2,lockedOosPrecision:.5,lockedOosFalseTriggerRate:.5,lockedOosMedianR:.8},
    {symbol:'BBBUSDT',lockedOosStructureTriggers:6,lockedOosExecutionCoverageRate:1,lockedOosTriggerConfirmConversion:.5,lockedOosTrades:2,lockedOosPrecision:1,lockedOosFalseTriggerRate:0,lockedOosMedianR:1.7}
  ],
  regimeAggregates:{
    lockedOos:{
      '1x':{
        'ALL|ALL':{tradeCount:4,precision:.75,falseTriggerRate:.25,medianRealizedR:1.2,meanRealizedR:1.1,meanReturnPct:2.5},
        'BOTTOM_REVERSAL|ALL':{tradeCount:2,precision:.5,falseTriggerRate:.5,medianRealizedR:.7,meanRealizedR:.6,meanReturnPct:1.1},
        'PREBREAKOUT|ALL':{tradeCount:2,precision:1,falseTriggerRate:0,medianRealizedR:1.8,meanRealizedR:1.7,meanReturnPct:3.9},
        'ALL|bull':{tradeCount:2,precision:1,falseTriggerRate:0,medianRealizedR:1.8,meanReturnPct:4},
        'ALL|sideways':{tradeCount:2,precision:.5,falseTriggerRate:.5,medianRealizedR:.5,meanReturnPct:1}
      },
      '1.5x':{'ALL|ALL':{tradeCount:4,precision:.75,falseTriggerRate:.25,medianRealizedR:1.0,meanRealizedR:.9,meanReturnPct:2.1}},
      '2x':{'ALL|ALL':{tradeCount:4,precision:.5,falseTriggerRate:.5,medianRealizedR:.6,meanRealizedR:.5,meanReturnPct:1.2}}
    }
  }
};

const json=R.buildJson(batch,{generatedAt:123,sourceReportId:'src-1'});
assert.equal(json.caseCount,2);
assert.equal(json.lockedOos.bySetup.length,2);
assert.equal(json.lockedOos.costStress.length,3);
assert.equal(json.lockedOos.symbolStructureExecution[0].symbol,'AAAUSDT');
assert(json.caveats.some(x=>x.includes('order-book')));
assert(json.caveats.some(x=>x.includes('제외')));

const md=R.buildMarkdown(batch,{generatedAt:123,sourceReportId:'src-1'});
assert(md.includes('Setup Validation 리포트'));
assert(md.includes('바닥 전환'));
assert(md.includes('급등 전조'));
assert(md.includes('상승장'));
assert(md.includes('Execution coverage'));
assert(md.includes('CCCUSDT'));

const report=R.buildReport(batch,{generatedAt:123});
assert.equal(report.version,R.VERSION);
assert(report.markdown.length>100);
assert.equal(report.json.lockedOos.costStress[2].costKey,'2x');

console.log('setup validation report verification passed');
