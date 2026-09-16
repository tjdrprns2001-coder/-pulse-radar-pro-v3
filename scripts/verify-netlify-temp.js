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
if(!/require\(['"]\.\.\/\.\.\/api\/radar\.js['"]\)/.test(radar))throw new Error('shared radar handler not reused');
if(!/require\(['"]\.\.\/\.\.\/api\/index\.js['"]\)/.test(legacy))throw new Error('shared legacy handler not reused');
for(const s of [radar,legacy])if(!/queryStringParameters/.test(s)||!/statusCode/.test(s)||!/headers/.test(s))throw new Error('netlify adapter contract missing');
if(!/method:event\.httpMethod/.test(legacy)||!/body:/.test(legacy)||!/send\(/.test(legacy)||!/end\(/.test(legacy))throw new Error('legacy req/res bridge incomplete');
console.log('netlify temp deployment contract PASS');
