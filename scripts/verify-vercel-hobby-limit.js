'use strict';
// Keep Vercel Hobby deployments within the 12-function project limit.
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const apiDir=path.join(__dirname,'..','api');
const functions=fs.readdirSync(apiDir).filter(x=>x.endsWith('.js')).sort();
assert(functions.length<=12,`Vercel Hobby supports at most 12 Serverless Functions; found ${functions.length}: ${functions.join(', ')}`);
const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','vercel.json'),'utf8'));
assert.deepEqual(cfg.regions,['icn1'],'Vercel Hobby must run in the Seoul icn1 region for Binance futures access');
const rewrites=new Map((cfg.rewrites||[]).map(x=>[x.source,x.destination]));
for(const route of ['signal-alerts','signal-backfill','signal-calibration','signal-health','signal-performance']){
  assert.equal(rewrites.get(`/api/${route}`),`/api/index?route=${route}`,`missing consolidated rewrite for ${route}`);
}
const index=fs.readFileSync(path.join(apiDir,'index.js'),'utf8');
for(const route of ['signal-alerts','signal-backfill','signal-calibration','signal-health','signal-performance']){
  assert(index.includes(`'${route}'`),`api/index.js missing ${route} dispatcher`);
}
console.log(`vercel hobby function limit PASS (${functions.length}/12)`);
