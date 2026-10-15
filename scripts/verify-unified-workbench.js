'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const home = read('index.html');
const portal = read('workbench.html');

function checkInlineScripts(source, filename) {
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let match, count = 0;
  while ((match = re.exec(source)) !== null) {
    new vm.Script(match[1], { filename: filename + ':inline:' + ++count });
  }
  assert.ok(count > 0, filename + ': expected one or more inline scripts');
}

checkInlineScripts(home, 'index.html');
checkInlineScripts(portal, 'workbench.html');
assert.ok(home.includes('href="/workbench.html"'), 'main navigation must expose workbench');
assert.ok(home.includes('if(requestId!==detailRequestSeq)return;'), 'stale detail responses should not overwrite selection');
assert.ok(home.includes('if(requestId===detailRequestSeq)'), 'stale failures must be ignored');
assert.ok(home.includes('if(loadAllInFlight)return;'), 'only one market request at a time');
assert.ok(home.includes('lastMarketSync?'), 'failed refresh must disclose stale data');
assert.ok(home.includes('data-row="${esc(r.symbol)}"'), 'symbol must be escaped in HTML attribute');
assert.ok(home.includes('data-r="${esc(s)}"'), 'recent symbol must be escaped in HTML attribute');

const begin = home.indexOf('const hasNumericValue=');
const end = home.indexOf('function getList(');
assert.ok(begin > 0 && end > begin, 'numeric format helpers located');
const helpers = vm.runInNewContext(home.slice(begin, end) + ';({fmt,pct,price,esc})');
assert.equal(helpers.fmt(null), '-');
assert.equal(helpers.fmt(undefined), '-');
assert.equal(helpers.fmt(''), '-');
assert.equal(helpers.pct(null), '-');
assert.equal(helpers.price(null), '-');
assert.equal(helpers.fmt(0), '0');
assert.equal(helpers.esc('<a title="x">'), '&lt;a title=&quot;x&quot;&gt;');

const routeRe = /href="(\/[^"#?]+)(?:\?[^"]*)?"/g;
let match, internalCount = 0;
while ((match = routeRe.exec(portal)) !== null) {
  const route = match[1];
  const actual = path.resolve(root, '.' + route);
  assert.ok(actual.startsWith(root + path.sep), 'route must be within repository');
  assert.ok(fs.existsSync(actual), 'missing linked internal page: ' + route);
  internalCount++;
}
assert.ok(internalCount >= 12, 'expected all existing analyst modules');
assert.ok(portal.includes('현재 상태 미검증'), 'legacy deployments must not appear verified');
assert.ok(portal.includes('1W → 3D → 1D → 12H → 4H → 3H → 2H → 1H → 15m → 5m'),
  'preserve canonical ten-timeframe review order');
console.log('PASS unified workbench: inline JS, module routes, stale-data guards, missing values');
