'use strict';
const fs=require('node:fs');
const {classify}=require('./dna-source-venue.js');
try{const result=classify(JSON.parse(fs.readFileSync(0,'utf8')));console.log(JSON.stringify(result));if(result.status!=='PASS')process.exitCode=1}
catch(e){console.error('DNA source probe failed:',String(e.message||e));process.exitCode=1}
