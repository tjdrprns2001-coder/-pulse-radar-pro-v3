'use strict';
const {execFileSync}=require('child_process');
const tests=['verify-research-contracts.js','verify-research-features.js','verify-research-collector.js','verify-research-outcomes.js','verify-research-stats.js','verify-research-api.js','verify-research-runtime.js','verify-research-ui.js','verify-forex-book-replay.js'];
for(const file of tests)execFileSync(process.execPath,['scripts/'+file],{stdio:'inherit'});
console.log('research backtest v2 PASS');
