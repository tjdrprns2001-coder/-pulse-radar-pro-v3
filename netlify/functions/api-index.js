const apiHandler = require('../../api/index.js');

const knownRoutes = new Set([
  'backtest','calibration-freeze','calibration-health','detail','historical-structure-study','htf',
  'independent-temporal','market','micro-features','pattern','pattern-validation','structure-study',
  'structure','temporal-features','trendline-study'
]);

function inferRoute(event, query) {
  if (query && query.route) return String(query.route);
  const path = String(event.path || event.rawPath || event.rawUrl || '');
  const clean = path.split('?')[0].replace(/\/+$/,'');
  const match = clean.match(/\/api\/([^/]+)$/);
  const candidate = match && match[1];
  return candidate && knownRoutes.has(candidate) ? candidate : '';
}

exports.handler = async function(event) {
  let statusCode = 200;
  const headers = {};
  let payload = '';
  const query = { ...(event.queryStringParameters || {}) };
  const route = inferRoute(event, query);
  if (route) query.route = route;
  const req = {
    query,
    method: event.httpMethod || 'GET',
    headers: event.headers || {},
    body: event.body || null,
    url: event.rawUrl || event.path || '/api/index'
  };
  const res = {
    headersSent: false,
    setHeader(name, value) { headers[name] = String(value); return this; },
    status(code) { statusCode = Number(code) || 200; return this; },
    json(value) { payload = JSON.stringify(value); headers['Content-Type'] = 'application/json; charset=utf-8'; this.headersSent = true; return { statusCode, headers, body: payload }; },
    send(value) { payload = typeof value === 'string' ? value : JSON.stringify(value); this.headersSent = true; return { statusCode, headers, body: payload }; },
    end(value) { if (value != null) payload = String(value); this.headersSent = true; return { statusCode, headers, body: payload }; }
  };
  try {
    const out = await apiHandler(req, res);
    if (out && typeof out.statusCode === 'number') return out;
    return { statusCode, headers, body: payload };
  } catch (error) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ok: false, error: error && error.message ? error.message : 'API bridge failed' }) };
  }
};
