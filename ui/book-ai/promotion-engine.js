(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PulseRecommendationPromotion=api;
})(typeof window!=='undefined'?window:globalThis,function(){'use strict';

const VERSION='RECOMMEND_PROMOTION_v2';
const ORDER=Object.freeze({EXCLUDE:-1,WAIT:0,WATCH:1,READY:2,CONFIRMED:3,RECOMMEND:4});
const LABEL=Object.freeze({EXCLUDE:'제외',WAIT:'대기',WATCH:'관찰',READY:'준비',CONFIRMED:'확정',RECOMMEND:'자동 추천'});
function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function bool(v){return v===true}
function text(v){return String(v||'')}
function uniq(a){return[...new Set((a||[]).filter(Boolean))]}
function scanClass(item){return text(item?.scanClass?.key||'STALE')}
function bookConfirmed(book){
  if(book?.confirmed===true)return true;
  if(text(book?.status).toUpperCase()==='CONFIRMED')return true;
  const rows=book?.bookSetups||book?.rules||[];
  return Array.isArray(rows)&&rows.some(x=>x?.status==='CONFIRMED'&&Array.isArray(x?.trustedEvidenceEventIds)&&x.trustedEvidenceEventIds.length>0);
}
function bookScore(book){return n(book?.bookEvidence?.total??book?.score??book?.evidenceScore)}
function scannerGates(item={}){
  const missing=[],failed=[],passed=[];
  const v3=text(item.v3LongTier||'N/A'),align=n(item.v3AlignmentPct),ch=n(item.priceChange24h);
  const oi=n(item.oi4hChangePct),xoi=item.xoiProfile||item.samplePattern?.xoiProfile||{},taker=n(item.trueTakerRatio??item.takerRatio);
  const rvol=n(item.v3Rvol?.ignition15m?.value??item.volumeAcceleration15m??item.volumeAcceleration);
  const causal=item?.v3?.causalIct||item?.causalIct||{},causalAvailable=causal?.available===true,causalTf=causal?.primaryTf||'4h',causalRow=causal?.timeframes?.[causalTf]||{},causalStage=String(causalRow?.sequence?.long?.stage||causal?.longStage||'N/A'),causalPass=causal?.contractPass!==false&&causalRow?.contractPass!==false,causalReady=['REVISIT','INTENT','FILLED'].includes(causalStage);
  const tf=item.tfState||{},one=text(tf['1h']?.bias??tf['1h']?.direction??tf['1h']?.trend).toLowerCase(),m15=text(tf['15m']?.bias??tf['15m']?.direction??tf['15m']?.trend).toLowerCase();
  const blocked=[];
  if(item?.dataState==='failed'||item?.dataState==='stale')blocked.push('데이터 불안정');
  if(item?.v3Invalidation)blocked.push('v3 장기 구조 무효화');
  if(['POST-SURGE','DISTRIBUTION-RISK','PUMP-RISK','STALE'].includes(scanClass(item)))blocked.push(scanClass(item));
  if(item?.tradeSignal?.level==='제외')blocked.push(...(item.tradeSignal.invalidations||['Scanner 제외']));
  if(ch!=null&&ch>=12)blocked.push('24H 과진행');
  if(taker!=null&&taker<0.8)blocked.push('taker 매도 우위');
  if(rvol!=null&&rvol>=8)blocked.push('15m 거래량 과열');
  if(causalAvailable&&!causalPass)blocked.push('Causal ICT 인과성 계약 실패');

  if(v3==='PASS')passed.push('HTF PASS');else missing.push('HTF PASS');
  if(align!=null&&align>=60)passed.push('HTF 정렬');else missing.push('HTF 정렬 ≥60%');
  if(item.structure==='bullish')passed.push('상위 구조 상승');else missing.push('상위 구조 상승');
  if(ch!=null&&ch<=8)passed.push('과진행 아님');else missing.push('24H 과진행 해소');
  const derivative=(oi!=null&&oi>=1)||bool(xoi.available);
  if(derivative)passed.push(oi!=null&&oi>=1?'OI 증가':'교차 OI 확인');else missing.push('OI/XOI 확인');
  if(taker!=null&&taker>=1.2)passed.push('taker 확인');else missing.push('taker ≥1.2');
  if(rvol!=null&&rvol>=1.5&&rvol<6)passed.push('15m RVOL 점화');else missing.push('15m RVOL 1.5~6x');
  const lowerOk=(!one||!one.includes('down'))&&(!m15||!m15.includes('down'));
  if(lowerOk)passed.push('하위TF 비약세');else failed.push('1H/15m 약세');
  const presurge=['PRE-SURGE','ACCUMULATION-PRE','META-PRE'].includes(scanClass(item))||item?.preSurge?.label==='가능성 높음'||item?.preSurge?.label==='관찰';
  if(presurge)passed.push('선행 구조');else missing.push('PRE-SURGE/축적');
  if(causalAvailable){if(causalReady)passed.push('Causal ICT '+causalStage);else missing.push('Causal ICT '+causalStage+' → REVISIT 대기')}else missing.push('Causal ICT 데이터');

  const readyCore=v3==='PASS'&&align!=null&&align>=60&&item.structure==='bullish'&&(ch==null||ch<=8)&&presurge;
  const finalGate=derivative&&taker!=null&&taker>=1.2&&rvol!=null&&rvol>=1.5&&rvol<6&&lowerOk&&(!causalAvailable||causalReady);
  return{blocked:uniq(blocked),missing:uniq(missing),failed:uniq(failed),passed:uniq(passed),readyCore,finalGate,metrics:{v3,align,ch,oi,taker,rvol,xoiAvailable:bool(xoi.available),lowerOk,presurge,causalAvailable,causalStage,causalPass,causalReady}};
}
function evaluate({item={},book=null,priorState=null}={}){
  const g=scannerGates(item),confirmed=bookConfirmed(book),bScore=bookScore(book),reasons=[...g.passed],missing=[...g.missing],invalidations=[...g.blocked,...g.failed];
  let state='WAIT';
  if(g.blocked.length)state='EXCLUDE';
  else if(g.readyCore)state='READY';
  else if(g.passed.length>=3)state='WATCH';
  if(state!=='EXCLUDE'&&confirmed&&g.readyCore){state='CONFIRMED';reasons.push('책 근거 확정 + Scanner READY 조건 통과');}
  else if(state!=='EXCLUDE'&&confirmed&&!g.readyCore){reasons.push('책 근거 확정');missing.push('시장 승격용 Scanner READY 조건');}
  if(state==='CONFIRMED'&&g.finalGate){state='RECOMMEND';reasons.push('최종 파생/거래량 게이트 통과');}
  if(confirmed&&g.readyCore&&!g.finalGate)missing.push('최종 OI/taker/RVOL/하위TF 게이트');
  const prior=text(priorState).toUpperCase(),transition=prior&&ORDER[prior]!=null&&prior!==state?prior+'→'+state:null;
  return{version:VERSION,state,label:LABEL[state],transition,order:ORDER[state],confirmed,bookScore:bScore,gates:g,reasons:uniq(reasons).slice(0,8),missing:uniq(missing).slice(0,8),invalidations:uniq(invalidations).slice(0,8)};
}
return{VERSION,ORDER,LABEL,bookConfirmed,bookScore,scannerGates,evaluate};
});