const fs=require('fs');const assert=require('assert');
const html=fs.readFileSync('pulse-unified.html','utf8');
const js=fs.readFileSync('ui/pulse-shell.js','utf8');
assert(html.includes('data-view="autoscan"'),'autoscan navigation required');
assert(html.includes('자동스캔 검색기'),'Korean autoscan finder label required');
assert(js.includes("autoscan")&&js.includes('/coin-scan.html'),'autoscan route required');
assert(js.includes("scanner")&&js.includes('/index.html'),'legacy scanner route must remain');
assert(js.includes("radar")&&js.includes('/radar.html'),'radar route must remain');
console.log('coin scan shell PASS');
