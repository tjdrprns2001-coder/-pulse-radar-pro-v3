const assert=require('assert');
const O=require('../lib/coin-scan/selector-oos-evaluator.js');
const rows=[];for(let i=0;i<100;i++)rows.push({decision_time:i,market_ok:true,ict_ok:true,execution_ok:true,data_ok:true,onchain_ok:i%10!==0,catalyst_ok:i%8!==0,return:(i%3===0?.02:-.005)});
const a=O.evaluateAblation(rows,{feeBps:4,slippageBps:6,fundingBps:1});
assert.equal(a.A.sampleCount,100);assert(Object.prototype.hasOwnProperty.call(a.lift,'D_minus_A'));
const s=O.splitChronological(rows);assert.equal(s.train.length,50);assert.equal(s.validation.length,25);assert.equal(s.lockedOos.length,25);
const wf=O.walkForward(rows,{train:40,validation:20,test:20});assert(wf.length>=2);
const report=O.lockedOosReport(rows,{feeBps:10});assert.equal(report.locked,true);assert.equal(report.split.lockedOos,25);
console.log('selector ablation/OOS PASS');
