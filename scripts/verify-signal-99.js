'use strict';
const {execFileSync}=require('child_process');
const tests=['verify-signal-health.js','verify-signal-backfill.js','verify-signal-calibration.js','verify-signal-evidence.js','verify-signal-alerts-v2.js','verify-signal-resilience.js','verify-signal-ops-api.js','verify-signal-dashboard-v2.js'];
for(const file of tests)execFileSync(process.execPath,[`scripts/${file}`],{stdio:'inherit'});
console.log('PulseRadar 99 percent contracts PASS');
