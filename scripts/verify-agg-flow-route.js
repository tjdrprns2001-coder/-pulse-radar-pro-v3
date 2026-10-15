'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const flow = require('../handlers/agg-trade-flow');
const root = path.resolve(__dirname, '..');
const routes = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')).rewrites || [];
const route = routes.find(x => x.source === '/api/agg-trade-flow');
assert.equal(route?.destination, '/api/index?route=agg-trade-flow', 'keep public trade flow URL');
const dispatcher = fs.readFileSync(path.join(root, 'api', 'index.js'), 'utf8');
assert.ok(dispatcher.includes("'agg-trade-flow': require('../handlers/agg-trade-flow')"), 'dispatcher registration');
assert.equal(fs.existsSync(path.join(root, 'api', 'agg-trade-flow.js')), false, 'moved function must not count as Vercel function');
const entrypoints = fs.readdirSync(path.join(root, 'api')).filter(f => f.endsWith('.js'));
assert.ok(entrypoints.length <= 12, 'Vercel Hobby function count <= 12');

function mockResponse() {
 const output = { code: null, payload: null, headers: {} };
 const res = {
   setHeader(k, v) { output.headers[k] = v; return res; },
   status(code) { output.code = code; return res; },
   json(data) { output.payload = data; return res; }
 };
 return { res, output };
}

(async () => {
  let lastInput = null;
  const provider = async input => { lastInput = input; return { ok: true, trades: [{ id: 1 }] }; };
  let { res, output } = mockResponse();
  await flow({ method: 'GET', query: { symbol: 'ethusdt', market: 'spot' } }, res, { getFlowImpl: provider });
  assert.equal(output.code, 200);
  assert.equal(lastInput.symbol, 'ETHUSDT');
  assert.equal(lastInput.market, 'spot');
  assert.equal(lastInput.limit, 500);
  assert.equal(output.headers['Cache-Control'], 'public, max-age=10');
  ({ res, output } = mockResponse());
  await flow({ method: 'POST', query: {} }, res, { getFlowImpl: provider });
  assert.equal(output.code, 405);
  ({ res, output } = mockResponse());
  await flow({ method: 'GET', query: { symbol: 'BTCUSDT' } }, res, { getFlowImpl: async () => ({ ok: false }) });
  assert.equal(output.code, 400);
  console.log('PASS trade-flow endpoint moved with URL, methods and response contract preserved (12 functions)');
})().catch(error => { console.error(error); process.exitCode = 1; });
