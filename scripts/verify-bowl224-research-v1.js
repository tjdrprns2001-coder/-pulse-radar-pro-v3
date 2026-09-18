'use strict';
const {execFileSync}=require('child_process');
const tests=['verify-bowl224-range-fetch.js','verify-bowl224-daily.js','verify-bowl224-patterns.js','verify-bowl224-intersection.js','verify-bowl224-groups-outcomes.js','verify-bowl224-runner-api.js','verify-bowl224-ui.js'];
for(const file of tests)execFileSync(process.execPath,['scripts/'+file],{stdio:'inherit'});
console.log('bowl224 research v1 PASS');
