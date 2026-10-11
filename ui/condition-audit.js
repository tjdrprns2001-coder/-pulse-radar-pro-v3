(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseConditionAudit=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
// Original implementation: condition management only; no third-party indicator code.
const VERSION='CONDITION_AUDIT_v2';
const finite=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v));
const timestamp=v=>finite(v)&&Number.isSafeInteger(Number(v))&&Number(v)>0&&Number(v)<=8640000000000000;
const check=(id,label,value,known=true)=>({id,label,status:known!==true||typeof value!=='boolean'?'MISSING':value?'PASS':'FAIL'});
function group(label,operator,items){const states=items.map(x=>x.status);const status=operator==='OR'?(states.includes('PASS')?'PASS':states.includes('MISSING')?'MISSING':'FAIL'):(states.includes('FAIL')?'FAIL':states.includes('MISSING')?'MISSING':'PASS');return{label,operator,status,items}}
function evaluate(s={},now=Date.now()){
 if(!s||typeof s!=='object'||Array.isArray(s))s={};
 const oi=s.oi||{},h=s.ready1h||{},g15=s.gate15m||{},g5=s.gate5m||{},frames=s.coverage?.frames||{};
 const known=tf=>frames[tf]?.available===true;
 const goodFlow=v=>['FLOW-SUSTAIN','FLOW-IGNITION'].includes(v);
 const flowKnown=v=>v!=null&&v!=='UNKNOWN';
 const flow=group('1H 또는 15m 매수 흐름','OR',[
  check('flow1h','1H 매수 흐름',goodFlow(h.flow),known('1h')&&flowKnown(h.flow)),
  check('flow15m','15m 매수 흐름',goodFlow(g15.flow),known('15m')&&flowKnown(g15.flow))]);
 const paths={
  A:group('A · OI 선행','OR',[check('a','OI 1H 선행',oi.a,oi.known===true),check('apre','OI 구축 초입',oi.aPre,oi.known===true)]),
  B:group('B · 매수 흐름 선행','OR',flow.items),
  C:group('C · 정리 후 재구축','AND',[check('c','OI 정리·재구축',oi.cRebuild,oi.known===true),check('cprice','1H EMA14 회복',h.aboveEma14,known('1h')),check('chold','1H 저점 유지',h.holdOrHl,known('1h'))])
 };
 const groups={
  setup:group('4H 셋업','AND',[check('setup','4H 압축·눌림 회복',s.setup4h?.valid,known('4h'))]),
  candidate:group('후보 경로 A 또는 B 또는 C','OR',Object.entries(paths).map(([id,p])=>({id,label:p.label,status:p.status}))),
  ready:group('1H 준비','AND',[check('ready','1H 구조·모멘텀 준비',h.ready,known('1h'))]),
  ignition:group('15m 점화','AND',[
   group('정배열 또는 전환','OR',[check('align','15m 정배열',g15.aligned,known('15m')),check('transition','15m 정배열 전환',g15.alignmentTransition,known('15m'))]),
   check('break15','15m 돌파·회복',g15.break?.confirmed,known('15m')),
   check('rvol15','15m RVOL 증가',g15.rvolIncreasing,known('15m')),
   check('flow15','15m 매수 흐름',goodFlow(g15.flow),known('15m')&&flowKnown(g15.flow)),
   check('gate15','15m 전체 점화 조건',g15.passed,known('15m'))]),
  entry:group('5m 진입 확인','AND',[
   check('ema5','5m 전체 EMA 위',g5.aboveAllEmas,known('5m')),
   check('hold5','5m 저점 유지',g5.holdOrHl,known('5m')),
   check('reclaim5','5m VWAP 또는 EMA14 회복',g5.vwapConfirmed,known('5m')),
   check('mss5','5m 구조 돌파·유지',g5.mssProxy,known('5m')),
   check('taker5','5m 매수 체결 재유입',g5.takerReentry,known('5m')),
   check('gate5','5m 전체 진입 조건',g5.passed,known('5m'))]),
  oi:group('OI 조회·승격','AND',[check('oi','OI 조회 확인',true,oi.known===true),check('oi15','최근 OI 증가',oi.change15mPct>0,oi.known===true&&finite(oi.change15mPct))]),
  risk:group('과열 제외','AND',[check('extended','과열 제외',s.extended===false,s.extended!=null)])
 };
 const closes=s.candleCloses||{},configuredBars=Number(s.policy?.signalExpiryBars);
 const bars=Number.isSafeInteger(configuredBars)&&configuredBars>0&&configuredBars<=1000?configuredBars:3;
 const validTimes=timestamp(closes['15m'])&&timestamp(closes['5m'])&&timestamp(now)&&Number(closes['15m'])<=now&&Number(closes['5m'])<=now;
 const deadline=validTimes?Math.min(Number(closes['15m'])+900000*bars,Number(closes['5m'])+300000*bars):null;
 const expiresAt=timestamp(deadline)?deadline:null;
 const validity={status:expiresAt==null?'MISSING':now>=expiresAt?'EXPIRED':'ACTIVE',expiresAt,expiryBars:bars};
 const blockers=[];function collect(g){if(g.status==='PASS')return;if(g.items){if(g.operator==='OR'){blockers.push(g.label);return}g.items.forEach(collect)}else blockers.push(g.id==='oi'?'OI 미조회·지연: 승격 보류':g.label)}
 Object.values(groups).forEach(collect);
 if(validity.status!=='ACTIVE')blockers.push(validity.status==='EXPIRED'?'신호 만료: 확정봉 재조회 필요':'확정봉 시각 미확인');
 return{version:VERSION,paths,groups,validity,blockers:[...new Set(blockers)],executionReady:Object.values(groups).every(g=>g.status==='PASS')&&validity.status==='ACTIVE'};
}
function presentation(s={},now=Date.now()){
 const audit=evaluate(s,now),status=audit.validity.status,active=status==='ACTIVE';
 return{audit,stage:status==='EXPIRED'?'신호 만료':!active?'데이터 미확인':s.stage||'INCOMPLETE',
  title:status==='EXPIRED'?'신호 만료 · 재조회 필요':!active?'데이터 미확인 · 재조회 필요':audit.executionReady?'진입 확인 조건 충족':'진입 확인 대기',
  confirm15m:active&&audit.groups.ignition.status==='PASS',confirm5m:active&&audit.groups.entry.status==='PASS'};
}
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderDetails(s,now=Date.now(),formatTime=v=>new Date(v).toISOString()){
 const view=presentation(s,now),audit=view.audit,labels={PASS:'충족',FAIL:'미충족',MISSING:'데이터 없음'};
 const item=g=>'<li class="audit-'+g.status.toLowerCase()+'"><span>'+escape(g.label)+'</span> <b>'+labels[g.status]+'</b>'+(g.items?'<small>'+ (g.operator==='OR'?'하나 충족 (OR)':'모두 충족 (AND)')+'</small><ul>'+g.items.map(item).join('')+'</ul>':'')+'</li>';
 const expiry=audit.validity.expiresAt?formatTime(audit.validity.expiresAt):'확정봉 시각 미확인';
 const bars=audit.validity.expiryBars;
 return '<details class="conditionAudit" data-validity="'+audit.validity.status+'"><summary>'+escape(view.title)+'</summary><p>필수 조건은 모두 충족해야 하며, 후보 경로는 A/B/C 중 하나를 충족해야 합니다.</p><h4>후보 경로</h4><ul class="auditTree">'+Object.values(audit.paths).map(item).join('')+'</ul><h4>필수 확인</h4><ul class="auditTree">'+Object.values(audit.groups).filter(g=>g!==audit.groups.candidate).map(item).join('')+'</ul><p>유효기한 '+escape(expiry)+' · 15m '+bars+'봉 / 5m '+bars+'봉 중 먼저 만료되는 시각</p>'+(audit.blockers.length?'<div class="auditBlockers"><b>대기 이유</b><ul>'+audit.blockers.map(v=>'<li>'+escape(v)+'</li>').join('')+'</ul></div>':'')+'</details>';
}
return{VERSION,evaluate,presentation,renderDetails};
});
