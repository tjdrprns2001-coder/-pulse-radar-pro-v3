const fs=require('fs'),assert=require('assert');
const h=fs.readFileSync('pulse-unified.html','utf8'),j=fs.readFileSync('ui/pulse-shell.js','utf8');
assert(h.includes('data-view="autoscan"'));
assert(j.includes("autoscan:{title:'자동 코인 분류'"));
assert(j.includes("path:'/coin-scan.html'"));
assert(j.includes("scanner:{")&&j.includes("path:'/index.html'"));
assert(j.includes("radar:{")&&j.includes("path:'/radar.html'"));
console.log('coin scan shell PASS');
