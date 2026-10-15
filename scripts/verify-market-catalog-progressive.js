'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const match = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match, 'inline script must exist');
new vm.Script(match[1], { filename: 'index.html:inline' });
const start=match[1].indexOf('function catalogRows(data)');
const end=match[1].indexOf('async function loadCatalogPreview()');
assert.ok(start>=0 && end>start, 'catalog normalization function must exist');
const normalize=vm.runInNewContext(match[1].slice(start,end)+';catalogRows');
const rows=normalize({symbols:[
  {symbol:'BTCUSDT',spot:true,futures:true,exchangeCount:5,baseAsset:'BTC'},
  {symbol:'XPINUSDT',spot:false,futures:true,exchangeCount:1,baseAsset:'XPIN'},
  {symbol:'<script>',spot:true}
]});
assert.equal(rows.length,2,'invalid symbols must be excluded');
assert.equal(rows[0].market,'spot');
assert.equal(rows[1].market,'futures');
assert.equal(rows[0].hasFutures,true);
assert.equal(rows[1].pass,false);
for(const row of rows){
  for(const field of ['price','change24','quoteVol24','preScore','surgeScore','preRank','preTopPct']){
    assert.equal(row[field],null,field+' must not invent live evidence');
  }
  assert.equal(row.dataStatus,'catalog-only');
}
assert.ok(match[1].includes("if(!d?.ok||lastMarketSync||rows.length)return"),'catalog cannot overwrite confirmed full data');
assert.ok(match[1].includes("if(!Array.isArray(d.results)||!d.results.length)throw Error('유효한 시장 결과 없음')"),'empty full data cannot be silently successful');
assert.ok(match[1].includes("selected.dataStatus==='catalog-only'"),'preview selection needs fresh full data');
assert.ok(match[1].includes("catalogOnly&&!lastMarketSync"),'failed full market should label preview only');
assert.ok(match[1].includes("hasNumericValue(r.quoteVol24)?'$'+fmt(r.quoteVol24,0):'-'"),'unknown USD volume must render N/A');
assert.ok(match[1].includes("setTimeout(loadCatalogPreview,500)"),'avoid immediate duplicate startup provider load');
assert.ok(match[1].includes("lastMarketSync=Number.isFinite(sourceTime)?new Date(sourceTime):new Date()"),'rely on feed timestamp when present');
console.log('PASS market catalog-first display, missing evidence safety and source freshness');
