(()=>{'use strict';
const O=window.PulseOutcomeRecorder,C=window.PulseCalibration,X=window.PulseDriftMonitor,A=window.PulseAlertState,P=window.PulsePolicyGate,H=window.PulseAlertHistory;
if(!O||!C||!X||!A||!P)return;
const $=id=>document.getElementById(id),state={drift:{status:'insufficient'},calibration:null,lastUiState:null,patched:false};
function symbol(){return String($('symbol')?.value||new URLSearchParams(location.search).get('symbol')||'BTCUSDT').toUpperCase()}
function tf(){return document.querySelector('[data-tf].active')?.dataset.tf||new URLSearchParams(location.search).get('tf')||'4h'}
function pattern(){const t=$('snapshotNarrative')?.textContent||'',m=t.match(/패턴 컨텍스트:\s*([^·.]+)/);return m?m[1].trim():'none'}
function regime(){const t=$('qRegime')?.textContent||'';return t&& !/INSUFFICIENT|미확정/.test(t)?t.toLowerCase().replace(/\s+/g,'_'):'unknown'}
function allSamples(source='LIVE_VALIDATED'){
  return O.read().map(r=>{const s=r.snapshot||{},o=r.outcomes?.['20'],score=Number(s.modelScore);if(!o||!Number.isFinite(score)||String(s.validationSource||'LIVE_VALIDATED')!==source)return null;return{symbol:s.symbol,tf:s.tf,pattern:s.pattern,regime:s.regime,venue:s.venue||'cex',validationSource:source,probability:Math.max(0,Math.min(1,score/100)),outcome:o.success?1:0,returnPct:Number(o.returnPct),atMs:Number(s.asOfTime||s.createdAt),features:s.features||{}}}).filter(Boolean)
}
function fmtWindow(label,w){if(!w)return`${label} insufficient`;if(w.status==='insufficient')return`${label} insufficient · ${w.recentN||0}/${w.historicalN||0}`;return`${label} ${w.status} · ${(w.recentContribution??0).toFixed(2)} vs ${(w.historicalContribution??0).toFixed(2)}`}
function updateEvidence(){
  const s=symbol(),t=tf(),ctx={symbol:s,tf:t,pattern:pattern(),regime:regime(),venue:'cex'};
  const live=allSamples('LIVE_VALIDATED');
  const cal=C.resolveHierarchical(live,ctx,{validationSource:'LIVE_VALIDATED',minSamples:30,adequateSamples:100,confidence:.9});state.calibration=cal;
  const exact=O.resolvedSamples({horizon:20,symbol:s,tf:t,validationSource:'LIVE_VALIDATED'}),driftRows=exact.map(x=>({atMs:x.atMs,featureValue:x.features?.oiAccelerationPct,outcome:x.outcome})).filter(x=>Number.isFinite(Number(x.atMs))&&Number.isFinite(Number(x.featureValue)));
  const drift=X.compareWindows(driftRows,{windows:[30,90],historyDays:365,minRecent:20,minHistorical:50,warningDrop:.25});state.drift=drift;
  window.__pulseV2Quality={calibration:cal,drift};
  const d30=drift.windows?.['30'],d90=drift.windows?.['90'];if($('qDrift'))$('qDrift').textContent=`${fmtWindow('30d',d30)} · ${fmtWindow('90d',d90)}`;
  if($('qCal'))$('qCal').textContent=cal.available?`${Math.round(cal.probability*100)}% · N=${cal.N}${cal.broaderBucket?' · BACKOFF':''}`:`수집 중 · N=${cal.N||0}`;
  if($('qCalSub'))$('qCalSub').textContent=cal.available?`${cal.status} · ${cal.bucketLabel}${cal.broaderBucket?' · broader bucket 사용 중':''} · LIVE_VALIDATED`:'LIVE calibration insufficient · BACKTESTED는 별도 참고';
  const bt=C.resolveHierarchical(allSamples('BACKTESTED'),ctx,{validationSource:'BACKTESTED',minSamples:30,adequateSamples:100,confidence:.9});
  if($('qCalDetail')){const old=$('qCalDetail').textContent||'';$('qCalDetail').textContent=`${old.split(' · backtest ')[0]} · bucket ${cal.bucketLabel} · backtest ${bt.available?Math.round(bt.probability*100)+'% N='+bt.N:'insufficient N='+(bt.N||0)}`}
}
function patchAlert(){if(state.patched)return;state.patched=true;const original=A.transition.bind(A);A.transition=function(prev,input={},nowMs=Date.now()){const out=original(prev,input,nowMs),q=window.__pulseV2Quality||{},drift=q.drift||{status:'insufficient'},cal=q.calibration||{available:Boolean(input.calibrationReady),validationSource:'LIVE_VALIDATED'},material=drift.status==='warning';const policy=P.apply(out.state,{integrityState:input.integrityState||'live',calibration:cal,drift,materiallyContributing:material});if(policy.state!==out.state){out.state=policy.state;out.changed=out.state!==(typeof prev==='string'?prev:prev?.state||'OBSERVE');out.policyReason=policy.reason}return out}}
function recordUiState(){const next=$('qState')?.textContent?.trim();if(!next)return;if(state.lastUiState&&next!==state.lastUiState&&H){H.recordTransition({state:state.lastUiState},{state:next,reason:$('qStateSub')?.textContent||null,conditionsTotal:3},{symbol:symbol(),tf:tf(),calibrationBucket:state.calibration?.bucketLabel||null,validationSource:state.calibration?.validationSource||null,driftStatus:state.drift?.status||'insufficient',integrityStatus:$('qData')?.textContent?.toLowerCase()||null,policyReason:window.__pulseV2Quality?.policyReason||null})}state.lastUiState=next}
function tick(){try{updateEvidence();recordUiState()}catch(e){console.warn('Signal Quality v2 overlay',e)}}
patchAlert();setInterval(tick,2500);setTimeout(tick,400);
})();
