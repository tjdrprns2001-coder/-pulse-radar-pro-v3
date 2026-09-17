(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PulsePreSurgeV2=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const STRONG_STATES=new Set(['ARMED','TRIGGERED','CONFIRMED']);
function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function evaluate(input={}){
  const dataState=String(input.dataState||'unknown').toLowerCase();
  if(dataState!=='live')return{label:'판정 보류',blocked:true,score:0,confirmations:0,reasons:['데이터가 실시간 상태가 아니어서 급등 전조 판정을 보류합니다.']};
  const bias=String(input.bias||'neutral').toLowerCase(),taker=n(input.takerRatio),oi=n(input.oiChangePct),funding=n(input.fundingPct),volume=n(input.volumeAcceleration),state=String(input.alertState||'OBSERVE').toUpperCase();
  const reasons=[];let confirmations=0;
  if(bias==='bullish')reasons.push('상승 구조 유지');else if(bias==='bearish')reasons.push('하락 구조라 상승 급등 전조에 불리');else reasons.push('구조 방향이 뚜렷하지 않음');
  if(taker!=null){if(taker>=1.15){confirmations++;reasons.push(`매수 체결 우위 ${taker.toFixed(2)}배`)}else if(taker<=0.87)reasons.push(`매도 우위 ${taker.toFixed(2)}배라 체결 흐름이 약함`);else reasons.push(`체결 흐름 균형 ${taker.toFixed(2)}배`)}else reasons.push('체결 흐름 자료 부족');
  if(oi!=null){if(oi>=0.5){confirmations++;reasons.push(`OI 증가 ${oi>=0?'+':''}${oi.toFixed(2)}%`)}else if(oi<=-0.5)reasons.push(`OI 감소 ${oi.toFixed(2)}%`);else reasons.push('OI 변화가 작음')}else reasons.push('OI 자료 부족');
  if(funding!=null){if(funding>=0&&funding<=0.03){confirmations++;reasons.push(`펀딩 과열 아님 ${funding>=0?'+':''}${funding.toFixed(3)}%`)}else if(funding>0.03)reasons.push(`펀딩 과열 주의 +${funding.toFixed(3)}%`);else reasons.push(`펀딩 음수 ${funding.toFixed(3)}%`)}else reasons.push('펀딩 자료 부족');
  if(volume!=null){if(volume>=1.5){confirmations++;reasons.push(`거래량 가속 ${volume.toFixed(2)}배`)}else reasons.push(`거래량 가속 약함 ${volume.toFixed(2)}배`)}else reasons.push('거래량 가속 자료 부족');
  if(STRONG_STATES.has(state)){confirmations++;reasons.push(`상태 ${state}`)}else if(state==='WATCH')reasons.push('상태는 아직 WATCH');
  const sellDominant=taker!=null&&taker<=0.87;
  const high=bias==='bullish'&&!sellDominant&&taker!=null&&taker>=1.35&&oi!=null&&oi>=2&&volume!=null&&volume>=1.8&&STRONG_STATES.has(state)&&confirmations>=4;
  const watch=bias==='bullish'&&!sellDominant&&confirmations>=2;
  return{label:high?'가능성 높음':watch?'관찰':'없음',blocked:false,score:confirmations,confirmations,reasons};
}
return{evaluate};
});
