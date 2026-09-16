const fs=require('fs');
function req(p){if(!fs.existsSync(p))throw new Error('missing '+p);return fs.readFileSync(p,'utf8')}
const cfg=req('netlify.toml');
const radar=req('netlify/functions/radar.js');
const legacy=req('netlify/functions/api-index.js');
if(!/functions\s*=\s*"netlify\/functions"/.test(cfg))throw new Error('functions directory missing');
if(!/from\s*=\s*"\/api\/radar\*"/.test(cfg))throw new Error('radar redirect missing');
if(!/to\s*=\s*"\/.netlify\/functions\/radar:splat"/.test(cfg))throw new Error('radar function target missing');
if(!/from\s*=\s*"\/api\/index"/.test(cfg))throw new Error('legacy api redirect missing');
if(!/to\s*=\s*"\/.netlify\/functions\/api-index"/.test(cfg))throw new Error('legacy api function target missing');
for(const route of ['market','detail','backtest','calibration-freeze','calibration-health','historical-structure-study','htf','independent-temporal','micro-features','pattern','pattern-validation','structure-study','structure','temporal-features','trendline-study']){
  if(!cfg.includes(`from = "/api/${route}"`))throw new Error('missing Netlify route '+route);
}
if(!/require\(['"]\.\.\/\.\.\/api\/radar\.js['"]\)/.test(radar))throw new Error('shared radar handler not reused');
if(!/require\(['"]\.\.\/\.\.\/api\/index\.js['"]\)/.test(legacy))throw new Error('shared legacy handler not reused');
for(const s of [radar,legacy])if(!/queryStringParameters/.test(s)||!/statusCode/.test(s)||!/headers/.test(s))throw new Error('netlify adapter contract missing');
if(!/method:event\.httpMethod/.test(legacy)||!/body:/.test(legacy)||!/send\(/.test(legacy)||!/end\(/.test(legacy))throw new Error('legacy req/res bridge incomplete');
if(!/inferRoute/.test(legacy)||!/event\.path/.test(legacy)||!/query\.route/.test(legacy))throw new Error('netlify route inference missing');
console.log('netlify temp deployment contract PASS');
