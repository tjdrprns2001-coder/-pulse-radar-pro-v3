import {createHash, timingSafeEqual} from 'node:crypto';
export const PULSE_ORIGIN = 'https://pulseradar-pro-unified-0926.onrender.com';
const paths = new Set(['/api/v1/health', '/api/v1/results']);
const digest = value => createHash('sha256').update(value).digest();
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const obj = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const arr = value => Array.isArray(value) ? value : [];

function publicScan(scan){
  const status=String(scan?.status||'');
  const sourceStatus=String(scan?.sourceStatus||status);
  const finishedAt=finite(scan?.finishedAt);
  return {
    schemaVersion:'1.0',
    status,
    sourceStatus,
    servedFromLastComplete:Boolean(scan?.servedFromLastComplete),
    scan:{
      id:String(scan?.id||''),
      asOf:finite(scan?.asOf),
      finishedAt,
      partialData:Boolean(scan?.partialData),
      stage:scan?.stage==null?null:String(scan.stage)
    },
    counts:obj(scan?.counts),
    timings:obj(scan?.timings),
    metrics:obj(scan?.metrics),
    retryAt:finite(scan?.retryAt),
    errors:arr(scan?.errors).slice(-20).map(x=>({stage:x?.stage??null,symbol:x?.symbol??null,message:String(x?.message||'').slice(0,240)})),
    excluded:arr(scan?.excluded).slice(-50).map(x=>({symbol:x?.symbol??null,reason:String(x?.reason||'').slice(0,240)})),
    freshnessMs:finite(scan?.freshnessMs),
    candidates:arr(scan?.candidates)
  };
}

export function createHandler({env, latestCompleted, sourceHealth = null, now = Date.now}) {
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
    if (url.pathname === '/api/v1/health') return response({ok:true, schemaVersion:'1.0', scope:'results:read', clock:now(), scanner:typeof sourceHealth==='function'?sourceHealth():null});
    try {
      const scan = await latestCompleted();
      if (!scan) return response({schemaVersion:'1.0', status:'empty', sourceStatus:'empty', servedFromLastComplete:false, scan:null, counts:{}, timings:{}, metrics:{}, freshnessMs:null, candidates:[]});
      const allowed=new Set(['queued','running','paused','complete']);
      if (scan.kind!=null&&String(scan.kind)!=='scan') throw new Error('invalid_snapshot');
      if (!allowed.has(String(scan.status))) throw new Error('invalid_snapshot');
      return response(publicScan(scan));
    } catch { return response({error:'results_unavailable'}, 503); }
  };
}
