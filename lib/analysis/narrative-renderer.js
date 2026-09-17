(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseNarrativeRenderer=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const TF_LABEL={'15m':'15분봉','1h':'1시간봉','4h':'4시간봉','1d':'일봉','1w':'주봉'};
function f(v){const n=Number(v);if(!Number.isFinite(n))return null;return Math.abs(n)>=100?n.toFixed(2):Math.abs(n)>=1?n.toFixed(4):n.toFixed(6).replace(/0+$/,'').replace(/\.$/,'');}
function biasText(b){return b==='bullish'?'강세':b==='bearish'?'약세':'혼합';}
function patternText(p){if(!p)return null;const type=String(p.type||''),sub=String(p.subtype||'');let name=type;if(type==='channel')name=sub==='ascending'?'상승 채널':sub==='descending'?'하락 채널':'수평 채널';else if(type==='triangle')name=sub==='ascending'?'상승 삼각형':sub==='descending'?'하락 삼각형':'대칭 삼각형';else if(type==='falling_wedge')name='하락 쐐기';else if(type==='rising_wedge')name='상승 쐐기';const state=String(p.state||'FORMING'),stateText=state==='BREAKOUT_CONFIRMED'?'돌파 확인':state==='BREAKOUT_CANDIDATE'?'돌파 후보':state==='PRE_BREAKOUT'?'돌파 관찰':state==='FAILED'?'패턴 무효':'형성 중';return`${name} · ${stateText} · 패턴 점수 ${Number(p.confidence)||0} · 검증확률 미확정`;}
function renderNarrative({symbol,tf,scenario={},htfContext=null,btcContext=null,patternSet=null}={}){
  const label=TF_LABEL[tf]||String(tf||''),lines=[];const bias=scenario.bias||'neutral';
  lines.push(`현재 ${label} 기준 ${biasText(bias)} 구조${bias==='neutral'?'로 방향 확인이 더 필요합니다.':'가 우세합니다.'}`);
  const pt=patternText(patternSet?.primary);if(pt)lines.push(`패턴 컨텍스트: ${pt}.`);
  if(scenario.invalidation&&f(scenario.invalidation.price))lines.push(`${f(scenario.invalidation.price)} 부근의 구조 기준을 ${label} 종가로 넘어서면 현재 시나리오를 다시 평가합니다.`);else lines.push('구조적 무효화 레벨은 아직 미확정입니다.');
  if(scenario.interestZone&&f(scenario.interestZone.low)&&f(scenario.interestZone.high))lines.push(`관심구간은 ${f(scenario.interestZone.low)} ~ ${f(scenario.interestZone.high)}이며, 선택한 시간봉의 실제 구조 구간만 표시합니다.`);else lines.push('현재 근거가 충분한 관심구간은 미확정입니다.');
  if(Array.isArray(scenario.targets)&&scenario.targets.length){lines.push(`구조적 목표 후보는 ${scenario.targets.slice(0,3).map(t=>f(t.price)).filter(Boolean).join(' · ')} 순서입니다.`);}else lines.push('확인된 구조적 유동성 목표가 부족해 목표 구간은 미확정입니다.');
  if(scenario.htfConflict)lines.push(`선택한 ${label} 구조와 상위 TF 방향이 달라 상위 TF 불일치가 있습니다.`);else if(htfContext?.bias&&htfContext.bias!=='neutral')lines.push(`상위 TF는 ${biasText(htfContext.bias)} 컨텍스트로 참고합니다.`);
  if(btcContext?.bias&&btcContext.bias!=='neutral')lines.push(`BTC 컨텍스트는 ${biasText(btcContext.bias)}이며 보조 정보로만 반영합니다.`);
  for(const w of scenario.warnings||[]){if(w==='HTF_CONFLICT')continue;lines.push(`주의: ${String(w)}`);}
  return{title:`📊 ${String(symbol||'').toUpperCase()} · ${tf}`,lines};
}
return{renderNarrative,TF_LABELS:{...TF_LABEL},patternText};
});
