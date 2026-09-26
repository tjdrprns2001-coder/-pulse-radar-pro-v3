'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const Blind=require('../lib/coin-scan/sample-blind-validation.js');

const result=Blind.blindValidation();
const approval=Blind.productionApproval();
const out=path.join(__dirname,'..','data','samples','SAMPLE_LOO_VALIDATION_latest.json');
fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');

assert.equal(result.version,'SAMPLE_LOO_VALIDATION_v1');
assert.equal(result.leakageControl,'exact event id excluded');
assert(result.total>=12,'need at least 12 labeled events for blind validation');
assert(result.decisions>=4,'need at least 4 non-zero blind decisions');
assert(result.confusion.harmfulRate<=result.gate.maxHarmfulRate,'opposite-direction error rate exceeds gate');
assert.equal(result.gate.passed,true,'sample ranking promotion gate must pass');
assert.equal(approval.approved,true,'frozen production approval must be active');
assert.equal(approval.approval?.policy?.version,Blind.POLICY.version,'approval policy version must match runtime policy');

console.log('sample blind validation PASS');
console.log(JSON.stringify({
  total:result.total,
  decisions:result.decisions,
  decisionCoverage:result.decisionCoverage,
  confusion:result.confusion,
  metrics:result.metrics,
  gate:result.gate,
  policy:result.policy
},null,2));
