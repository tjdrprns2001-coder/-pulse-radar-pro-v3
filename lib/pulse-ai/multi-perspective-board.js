'use strict';
// TradingAgents-inspired six-lens research board. Original code, no TradingAgents Python runtime.
// ONLY scanner-sourced evidence; no stochastic agent confidence, invented news or rankings.
// Every verdict is SHADOW / informational, never changes the Astra candidate queue.
const VERSION='PULSE_MULTI_PERSPECTIVE_v1',MAX_SYMBOLS=4;
const num=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const sym=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,25);
function signalName(x){return x==='SUPPORT'?'근거 있음':x==='CAUTION'?'주의':x==='NEUTRAL'?'중립':'자료 부족'}
function evidence(field,value,detail){return{field,value,detail}}
function makeRole(id,label,stance,summary,ev=[],missing=[]){
 return{id,label,stance,stanceKo:signalName(stance),summary,evidence:ev.slice(0,5),missing:missing.slice(0,5)};
}
function validateContext(ctx,now){
 const age=num(ctx?.updatedAt),h=ctx?.dataHealth||{},coverage=ctx?.universe?.coverage||{};
 const warnings=[];
 if(ctx?.status!=='ok')warnings.push('스캔 상태가 정상이 아닙니다');
 if(ctx?.partial||Number(h.errors)>0||Number(h.blocked)>0)warnings.push('스캔 결과가 일부 누락되거나 오류가 있습니다');
 if(age===null||age>now+60000||now-age>180000)warnings.push('스캔 시각이 오래되었거나 확인되지 않았습니다');
 if(num(coverage.futures)===0&&num(coverage.both)===0&&num(coverage.spot)>0)warnings.push('선물 데이터 대신 현물만 확인되었습니다');
 return{status:warnings.length?'DEGRADED':'CHECKED',warnings,updatedAt:age};
}
function reviewOne(row,ctx,quality){
 const symbol=sym(row.symbol),change=num(row.priceChange24h),oi=num(row.oiChangePct),
  taker=num(row.takerRatio),rvol=num(row.volumeAcceleration),funding=num(row.fundingPct),
  score=num(row.candidateScore),pre=num(row.preIgnitionScore),live=row.dataState==='live';
 const extended=/이미 급등|과열|EXTENDED/i.test(String(row.category||''))||(change!==null&&change>=20);
 const breadth=ctx?.breadth||{},up=num(breadth.up),down=num(breadth.down),
  ratio=up!==null&&down!==null&&up+down>0?up/(up+down):null;
 const evMarket=ratio===null?[]:[evidence('breadth.up',up,'상승 종목 수'),evidence('breadth.down',down,'하락 종목 수')];
 const market=makeRole('market','시장 환경',
  ratio===null?'UNKNOWN':ratio>=.62?'SUPPORT':ratio<=.38?'CAUTION':'NEUTRAL',
  ratio===null?'전체 시장 상승·하락 비율을 확인할 수 없습니다':ratio>=.62?'관측된 시장 상승 종목이 더 많습니다':ratio<=.38?'관측된 시장 하락 종목이 더 많습니다':'시장 폭이 한쪽으로 뚜렷하게 기울지 않았습니다',
  evMarket,ratio===null?['시장 상승·하락 종목 수']:[]);
 const eTech=[],missingTech=[];
 if(change!==null)eTech.push(evidence('priceChange24h',change,'24시간 가격 변화율(%)'));else missingTech.push('24시간 가격 변화율');
 if(rvol!==null)eTech.push(evidence('volumeAcceleration',rvol,'거래량 가속 지표'));else missingTech.push('거래량 가속 지표');
 if(score!==null)eTech.push(evidence('candidateScore',score,'기존 스캐너 후보 점수'));else missingTech.push('기존 스캐너 후보 점수');
 if(pre!==null)eTech.push(evidence('preIgnitionScore',pre,'기존 점화전 점수'));
 const technical=makeRole('technical','기술 구조',!live?'UNKNOWN':extended?'CAUTION':rvol===null?'UNKNOWN':rvol>=1.5?'SUPPORT':'NEUTRAL',
  !live?'현재 종목 데이터 상태가 실시간이 아닙니다':extended?'상승이 이미 크게 진행되어 추격 위험을 우선 확인해야 합니다':rvol===null?'거래량 가속 자료가 없어 기술적 진입 조건을 검증할 수 없습니다':rvol>=1.5?'거래량 가속 근거가 있으나 돌파·지지·확정봉은 별도 확인이 필요합니다':'현재 거래량 가속만으로 점화가 확인되지는 않습니다',
  eTech,missingTech);
 const eFlow=[],missingFlow=[];
 if(oi!==null)eFlow.push(evidence('oiChangePct',oi,'미결제약정 변화율(%)'));else missingFlow.push('OI 변화율');
 if(taker!==null)eFlow.push(evidence('takerRatio',taker,'매수/매도 체결 비율'));else missingFlow.push('매수/매도 체결 비율');
 if(funding!==null)eFlow.push(evidence('fundingPct',funding,'펀딩비(%)'));else missingFlow.push('펀딩비');
 const flowStance=oi===null||taker===null?'UNKNOWN':oi>=1&&taker>=1.15?'SUPPORT':oi<0&&taker<1?'CAUTION':'NEUTRAL';
 const flow=makeRole('flow','수급 분석',!live?'UNKNOWN':flowStance,
  !live?'선물 수급 데이터를 사용할 수 없습니다':oi===null||taker===null?'OI 또는 매수·매도 체결 근거가 누락돼 수급 판단을 유보합니다':flowStance==='SUPPORT'?'OI 증가와 매수 체결 우위가 함께 관측됩니다':flowStance==='CAUTION'?'OI 감소와 매도 체결 우위가 함께 관측됩니다':'OI와 체결 비율의 동시 상승 근거는 부족합니다',
  eFlow,missingFlow);
 const bullishEvidence=[...technical.evidence.filter(x=>x.field==='volumeAcceleration'&&x.value>=1.5),
  ...flow.evidence.filter(x=>x.field==='oiChangePct'&&x.value>=1||x.field==='takerRatio'&&x.value>=1.15)];
 const bull=makeRole('bull','상승 근거',!live?'UNKNOWN':technical.stance==='SUPPORT'&&flow.stance==='SUPPORT'?'SUPPORT':technical.stance==='SUPPORT'||flow.stance==='SUPPORT'?'NEUTRAL':'UNKNOWN',
  !live?'실시간 근거가 없어 상승 가설을 검토할 수 없습니다':technical.stance==='SUPPORT'&&flow.stance==='SUPPORT'?'거래량과 선물 수급이 함께 개선된 관측 근거가 있습니다. 미래 상승을 보장하지 않습니다':bullishEvidence.length?'일부 긍정적 근거만 관측됩니다. 독립 확인이 부족합니다':'동시에 확인된 상승 근거가 부족합니다',
  bullishEvidence,['실제 지지·저항 돌파 후 유지 검증']);
 const bearishEvidence=[...(change!==null?[evidence('priceChange24h',change,'24시간 변동률(%)')]:[]),
  ...(flow.stance==='CAUTION'?flow.evidence:[])];
 const bear=makeRole('bear','하락·반론',extended||flow.stance==='CAUTION'?'CAUTION':change===null?'UNKNOWN':'NEUTRAL',
  extended?'이미 급등한 구간의 추격 및 되돌림 위험이 있습니다':flow.stance==='CAUTION'?'OI와 매도체결 동반 약세가 관측됩니다':change===null?'가격 변화 정보 부족으로 반대 가설을 점검할 수 없습니다':'하락 가설을 배제할 수 없으며 별도 무효화·손절 근거가 필요합니다',
  bearishEvidence,['과거 지지 이탈·무효화 가격 검증']);
 const hardStop=!live||quality.status!=='CHECKED'||extended;
 const riskReasons=[...quality.warnings];
 if(!live)riskReasons.push('종목 실시간 데이터 누락');
 if(extended)riskReasons.push('상승 과진행·과열 구간');
 if(oi===null)riskReasons.push('OI 미확인');
 if(taker===null)riskReasons.push('체결 비율 미확인');
 if(funding===null)riskReasons.push('펀딩비 미확인');
 const risk=makeRole('risk','위험 심의',hardStop?'CAUTION':riskReasons.length?'UNKNOWN':'NEUTRAL',
  hardStop?'데이터 품질 또는 과열 조건으로 신호 확정을 차단합니다':riskReasons.length?'일부 수급 근거가 없어 리스크 확인 전에는 신호 확정 불가입니다':'입력 데이터의 기본 리스크 확인을 통과했지만, 거래 위험이 제거된 것은 아닙니다',
  [],riskReasons);
 const supporters=[technical,flow,market].filter(x=>x.stance==='SUPPORT').length;
 const detractors=[technical,flow,market,bear].filter(x=>x.stance==='CAUTION').length;
 const disagreement=supporters>0&&detractors>0;
 const readiness=hardStop?'DATA_OR_RISK_BLOCKED':oi===null||taker===null||funding===null?'MISSING_DERIVATIVES':
  supporters>=2&&!disagreement?'RESEARCH_WATCH':'INSUFFICIENT_CONSENSUS';
 const verdict=readiness==='DATA_OR_RISK_BLOCKED'?'데이터 품질·과열로 심의 차단':readiness==='MISSING_DERIVATIVES'?'선물 수급 자료가 부족해 판정 유보':
  readiness==='RESEARCH_WATCH'?'관찰 후보. 확정 진입 신호가 아님':'의견이 엇갈리거나 근거가 부족해 관찰 유지';
 return{symbol,shadowOnly:true,readiness,verdict,disagreement,
  source:'SCANNER_ONLY',sourceAsOf:quality.updatedAt,rawScoresUnchanged:true,
  roles:[market,technical,flow,bull,bear,risk],
  missingCritical:riskReasons,notTradingAdvice:true};
}
function buildReviewBoard(ctx,{selectedSymbol=null,now=Date.now(),maxSymbols=MAX_SYMBOLS}={}){
 const quality=validateContext(ctx,now),src=Array.isArray(ctx?.symbols)?ctx.symbols:[],
  selected=sym(selectedSymbol||ctx?.selectedSymbol),bySym=new Map();
 for(const row of [ctx?.selected,...src]){
  const s=sym(row?.symbol);if(!s||bySym.has(s))continue;
  bySym.set(s,row);
 }
 const ordered=[...(selected&&bySym.has(selected)?[bySym.get(selected)]:[]),
  ...src.filter(r=>sym(r?.symbol)!==selected)].filter(x=>sym(x?.symbol));
 const limit=Math.max(1,Math.min(MAX_SYMBOLS,Math.floor(num(maxSymbols)??MAX_SYMBOLS)));
 const seen=new Set(),reviews=[];
 for(const row of ordered){
  const s=sym(row.symbol);if(seen.has(s))continue;seen.add(s);
  reviews.push(reviewOne(row,ctx,quality));if(reviews.length>=limit)break;
 }
 return{version:VERSION,status:reviews.length?'READY':'NO_EVIDENCE',shadowOnly:true,
  method:'DETERMINISTIC_ROLE_LENSES_NOT_LLM_AGENTS',inspiration:'TradingAgents research-team structure',
  independentLLMAgents:false,permission:'READ_ONLY_NO_ORDER_NO_RANK_PROMOTION',
  quality,selectedSymbol:selected||null,reviews,
  limitations:['Rules interpret scanner-derived fields only; no news or social sentiment was independently researched',
   'Role summaries are deterministic and cannot be treated as independent corroboration',
   'No recommendations, strategy promotion, or actual order actions']};
}
function reviewAnswer(board,symbol=null){
 const selected=sym(symbol||board?.selectedSymbol),item=board?.reviews?.find(x=>x.symbol===selected)||board?.reviews?.[0];
 if(!item)return'현재 다각도 심의에 사용할 확정 스캐너 자료가 없습니다.';
 const rows=item.roles.map(x=>`• ${x.label}: ${x.stanceKo} — ${x.summary}`).join('\n');
 return`${item.symbol} 다각도 연구 심의 (규칙 기반, 독립 LLM 아님)\n${rows}\n종합: ${item.verdict}. 현재는 자동매매·실제 매수 추천에 연결되지 않습니다.`;
}
module.exports={VERSION,reviewOne,buildReviewBoard,reviewAnswer,validateContext};
