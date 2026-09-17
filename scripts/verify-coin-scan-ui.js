const fs=require('fs'),assert=require('assert');
const h=fs.readFileSync('coin-scan.html','utf8'),j=fs.readFileSync('ui/coin-scan.js','utf8'),c=fs.readFileSync('ui/coin-scan.css','utf8');
for(const s of ['전체','급등 전조','거래량 이상','매수세','눌림','이미 급등','약세','보류'])assert(h.includes(s));
for(const s of ['AI','MEME','RWA','DeFi','L1','L2','Gaming','Infrastructure','기타'])assert(h.includes(s));
assert(h.includes('/ui/coin-scan.js')&&h.includes('/ui/coin-scan.css'));
assert(j.includes('/api/coin-scan')&&j.includes('60000')&&j.includes('snapshot-analysis-restored.html')&&j.includes('escapeHtml'));
assert(c.includes('@media')&&c.includes('650px'));assert(!/width:\s*[7-9]\d\dpx/.test(c));
console.log('coin scan ui PASS');
