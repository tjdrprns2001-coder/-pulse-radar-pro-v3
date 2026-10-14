'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const target=path.join(__dirname,'check-operational-health.js');
test('operational probe is valid Node.js',()=>{const result=spawnSync(process.execPath,['--check',target]);assert.equal(result.status,0);});
test('probe checks liveness, readiness and DNA provenance',()=>{const source=fs.readFileSync(target,'utf8');for(const term of ['/health/live','/health/ready','method=dna','sourceState','process.exitCode'])assert.ok(source.includes(term),term);});
