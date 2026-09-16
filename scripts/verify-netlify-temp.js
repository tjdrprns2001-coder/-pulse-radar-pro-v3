const fs=require('fs');
function req(p){if(!fs.existsSync(p))throw new Error('missing '+p);return fs.readFileSync(p,'utf8')}
const cfg=req('netlify.toml');
const fn=req('netlify/functions/radar.js');
if(!/functions\s*=\s*"netlify\/functions"/.test(cfg))throw new Error('functions directory missing');
if(!/from\s*=\s*"\/api\/radar\*"/.test(cfg))throw new Error('radar redirect missing');
if(!/to\s*=\s*"\/.netlify\/functions\/radar:splat"/.test(cfg))throw new Error('radar function target missing');
if(!/require\(['"]\.\.\/\.\.\/api\/radar\.js['"]\)/.test(fn))throw new Error('shared radar handler not reused');
if(!/queryStringParameters/.test(fn)||!/statusCode/.test(fn)||!/headers/.test(fn))throw new Error('netlify adapter contract missing');
console.log('netlify temp deployment contract PASS');
