const apiHandler = require('../../api/index.js');

exports.handler = async function(event) {
  let statusCode = 200;
  const headers = {};
  let payload = '';
  const req = {
    query: event.queryStringParameters || {},
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
