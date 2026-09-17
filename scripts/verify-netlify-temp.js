const fs=require('fs');
function req(p){if(!fs.existsSync(p))throw new Error('missing '+p);return fs.readFileSync(p,'utf8')}
const cfg=req('netlify.toml');
const radar=req('netlify/functions/radar.js');
const legacy=req('netlify/functions/api-index.js');
const coinScan=req('netlify/functions/coin-scan.mjs');
const coinScanApi=req('api/coin-scan.js');
const v2Names=['signal-performance','signal-calibration','signal-alerts','signal-health','signal-backfill'];
const v2=Object.fromEntries(v2Names.map(name=>[name,req(`netlify/functions/${name}.mjs`)]));
if(!/functions\s*=\s*"netlify\/functions"/.test(cfg))throw new Error('functions directory missing');
if(!/from\s*=\s*"\/api\/radar\*"/.test(cfg))throw new Error('radar redirect missing');
if(!/to\s*=\s*"\/.netlify\/functions\/radar:splat"/.test(cfg))throw new Error('radar function target missing');
for(const name of v2Names){
  if(!cfg.includes(`from = "/api/${name}*"`))throw new Error(name+' redirect missing');
  if(!cfg.includes(`to = "/.netlify/functions/${name}:splat"`))throw new Error(name+' function target missing');
}
if(!/from\s*=\s*"\/api\/index"/.test(cfg))throw new Error('legacy api redirect missing');
if(!/to\s*=\s*"\/.netlify\/functions\/api-index"/.test(cfg))throw new Error('legacy api function target missing');
for(const route of ['market','detail','backtest','calibration-freeze','calibration-health','historical-structure-study','htf','independent-temporal','micro-features','pattern','pattern-validation','structure-study','structure','temporal-features','trendline-study'])if(!cfg.includes(`from = "/api/${route}"`))throw new Error('missing Netlify route '+route);
if(!/require\(['"]\.\.\/\.\.\/api\/radar\.js['"]\)/.test(radar))throw new Error('shared radar handler not reused');
if(!/require\(['"]\.\.\/\.\.\/api\/index\.js['"]\)/.test(legacy))throw new Error('shared legacy handler not reused');
for(const [name,src] of [['coin-scan',coinScan],...Object.entries(v2)]){
  if(!/export\s+default\s+async\s+function/.test(src))throw new Error(name+' must use Netlify Functions v2 default export');
  if(!/from\s+['"]@netlify\/blobs['"]/.test(src))throw new Error(name+' must statically import @netlify/blobs');
  if(!/getStore/.test(src))throw new Error(name+' must inject getStore');
}
for(const name of v2Names)if(!new RegExp(`api\\/${name}\\.js`).test(v2[name]))throw new Error('shared '+name+' handler not reused');
if(!/api\/coin-scan\.js/.test(coinScan))throw new Error('shared coin scan handler not reused');
if(!/ctx\.getStore/.test(coinScanApi))throw new Error('coin scan API must pass injected getStore into auxiliary recorders');
if(!/queryStringParameters/.test(radar)||!/statusCode/.test(radar)||!/headers/.test(radar))throw new Error('legacy radar adapter contract missing');
if(!/method\s*:\s*event\.httpMethod/.test(legacy)||!/body\s*:/.test(legacy)||!/send\s*\(/.test(legacy)||!/end\s*\(/.test(legacy))throw new Error('legacy req/res bridge incomplete');
if(!/inferRoute/.test(legacy)||!/event\.path/.test(legacy)||!/query\.route/.test(legacy))throw new Error('netlify route inference missing');
console.log('netlify temp deployment contract PASS');
