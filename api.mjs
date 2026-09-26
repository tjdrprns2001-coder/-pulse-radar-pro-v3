import {createHash, timingSafeEqual} from 'node:crypto';
export const PULSE_ORIGIN = 'https://pulseradar-pro-unified-0926.onrender.com';
const paths = new Set(['/api/v1/health', '/api/v1/results']);
const digest = value => createHash('sha256').update(value).digest();
export function createHandler({env, latestCompleted, now = Date.now}) {
  function keys() {
    return ['', '_PREVIOUS'].flatMap(suffix => {
      const token = env['IGNITION_READ_TOKEN' + suffix];
      const expiry = Date.parse(env['IGNITION_READ_TOKEN' + suffix + '_EXPIRES_AT'] || '');
      return typeof token === 'string' && token.length >= 43 && Number.isFinite(expiry) && expiry > now()
        ? [{hash: digest(token), expiry}] : [];
    });
  }
  return async request => {
    const url = new URL(request.url), origin = request.headers.get('origin');
    const headers = {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'Vary':'Origin', 'X-Content-Type-Options':'nosniff'};
    const response = (value, status = 200) => new Response(value === null ? null : JSON.stringify(value), {status, headers});
    if (origin && origin !== PULSE_ORIGIN) return response({error:'origin_forbidden'}, 403);
    if (origin === PULSE_ORIGIN) headers['Access-Control-Allow-Origin'] = origin;
    if (!paths.has(url.pathname)) return response({error:'not_found'}, 404);
    if (request.method === 'OPTIONS') {
      // Browser preflight never returns data and never requires the server token.
      const requested = (request.headers.get('access-control-request-headers') || '').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
      if (origin !== PULSE_ORIGIN || request.headers.get('access-control-request-method') !== 'GET' || requested.some(x=>x!=='authorization')) return response({error:'preflight_forbidden'}, 403);
      headers['Access-Control-Allow-Methods'] = 'GET';
      headers['Access-Control-Allow-Headers'] = 'Authorization';
      return response(null, 204);
    }
    if (request.method !== 'GET') { headers.Allow = 'GET, OPTIONS'; return response({error:'method_not_allowed'}, 405); }
    const active = keys();
    if (!active.length) return response({error:'authentication_unavailable'}, 503);
    const match = /^Bearer ([A-Za-z0-9_-]{43,256})$/.exec(request.headers.get('authorization') || '');
    const supplied = digest(match?.[1] || '');
    let valid = false;
    for (const key of active) valid = timingSafeEqual(supplied, key.hash) || valid;
    if (!match || !valid) { headers['WWW-Authenticate'] = 'Bearer realm="ignition-results"'; return response({error:'unauthorized'}, 401); }
    if (url.search) return response({error:'query_not_supported'}, 400);
    if (url.pathname === '/api/v1/health') return response({ok:true, schemaVersion:'1.0', scope:'results:read', clock:now()});
    try {
      const scan = await latestCompleted();
      if (!scan) return response({schemaVersion:'1.0', status:'empty', scan:null, candidates:[]});
      if (scan.kind !== 'scan' || scan.status !== 'complete' || !Number.isFinite(scan.finishedAt) || !Array.isArray(scan.candidates)) throw new Error('invalid_snapshot');
      // Never expose internal jobs, raw rows, config, errors, or publisher credentials.
      return response({schemaVersion:'1.0', status:'complete', scan:{id:scan.id, asOf:scan.asOf, finishedAt:scan.finishedAt, partialData:!!scan.partialData}, candidates:scan.candidates});
    } catch { return response({error:'results_unavailable'}, 503); }
  };
}
