(function(root, factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PulseDataState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  const DATA_STATES = Object.freeze([
    'live','confirmed','partial','stale','insufficient-history','api-degraded'
  ]);
  const META = Object.freeze({
    live:{ label:'실시간', severity:'ok', live:true },
    confirmed:{ label:'확정', severity:'ok', live:false },
    partial:{ label:'미완성', severity:'warn', live:true },
    stale:{ label:'지연', severity:'warn', live:false },
    'insufficient-history':{ label:'이력 부족', severity:'warn', live:false },
    'api-degraded':{ label:'API 저하', severity:'error', live:false }
  });

  function normalizeDataState(input){
    const v = String(input || '').trim().toLowerCase();
    return DATA_STATES.includes(v) ? v : 'api-degraded';
  }

  function formatDataState(state){
    const key = normalizeDataState(state);
    return { id:key, ...META[key] };
  }

  function deriveBarState({ nowMs, barCloseMs, fetchedAtMs, staleAfterMs, historyCount, requiredHistory }){
    const h = Number(historyCount);
    const req = Number(requiredHistory);
    if (Number.isFinite(req) && req > 0 && (!Number.isFinite(h) || h < req)) return 'insufficient-history';
    const now = Number(nowMs);
    const fetched = Number(fetchedAtMs);
    const staleAfter = Number(staleAfterMs);
    if (Number.isFinite(now) && Number.isFinite(fetched) && Number.isFinite(staleAfter) && staleAfter >= 0 && now - fetched > staleAfter) return 'stale';
    const close = Number(barCloseMs);
    if (Number.isFinite(now) && Number.isFinite(close) && close > now) return 'partial';
    if (Number.isFinite(now) && Number.isFinite(close) && close <= now) return 'confirmed';
    return 'live';
  }

  return { DATA_STATES, normalizeDataState, formatDataState, deriveBarState };
});
