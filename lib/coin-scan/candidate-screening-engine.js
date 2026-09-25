'use strict';

const LABELS={
  A_CANDIDATE:'A급 후보',
  B_WATCH:'B급 감시',
  EVENT_RISK:'이벤트 위험',
  DATA_INSUFFICIENT:'데이터 부족',
  EXCLUDED:'제외'
};
function n(v){if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null}
function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,Number(v)||0))}
function uniq(a=[]){return [...new Set(a.filter(Boolean).map(String))]}
function avg(a=[]){const v=a.filter(x=>Number.isFinite(x));return v.length?v.reduce((s,x)=>s+x,0)/v.length:null}
function push(a,x){if(x&&!a.includes(x))a.push(x)}
function executionMetrics(execution={}){
  const rows=[execution.spot,execution.futures].filter(x=>x?.available);
  if(!rows.length)return{available:false,score:null,spreadBps:null,depth10Usd:null,maxSlippageBps:null};
  const spreads=rows.map(x=>n(x.spreadBps)).filter(v=>v!=null);
  const depths=rows.flatMap(x=>[n(x.depthUsd?.bid10bps),n(x.depthUsd?.ask10bps)]).filter(v=>v!=null);
  const slips=rows.flatMap(x=>[...(x.slippage?.buy||[]),...(x.slippage?.sell||[])]).filter(Boolean).filter(x=>(n(x.notional)||0)>=10000).map(x=>n(x.slippageBps)).filter(v=>v!=null);
  const spread=spreads.length?Math.max(...spreads):null,depth=depths.length?Math.min(...depths):null,slip=slips.length?Math.max(...slips):null;
  let score=100;if(spread==null||depth==null)return{available:true,score:35,spreadBps:spread,depth10Usd:depth,maxSlippageBps:slip};
  if(spread>25)score-=65;else if(spread>10)score-=30;else if(spread>5)score-=12;
  if(depth<10000)score-=65;else if(depth<50000)score-=25;else if(depth<100000)score-=10;
  if(slip!=null){if(slip>40)score-=60;else if(slip>20)score-=25;else if(slip>10)score-=10}
  return{available:true,score:clamp(score),spreadBps:spread,depth10Usd:depth,maxSlippageBps:slip};
}
function eventRisk(intelligence={},now=Date.now()){
  const high=[],watch=[];
  const news=[...(intelligence?.news?.items||[]),...(intelligence?.events?.newsDerived||[])];
  const severe=/(hack|exploit|attack|vulnerab|breach|delist|delisting|suspend|halt|honeypot|transfer restrict)/i;
  const caution=/(unlock|migration|upgrade|mainnet|fork|governance|vote|listing|airdrop)/i;
  for(const x of news){const title=String(x?.title||'');if(severe.test(title))push(high,title);else if(caution.test(title))push(watch,title)}
  for(const x of intelligence?.events?.items||[]){
    const title=String(x?.title||''),ts=Date.parse(String(x?.date||''));
    const near=Number.isFinite(ts)&&ts>=now-3600000&&ts<=now+7*86400000;
    if(near){if(severe.test(title))push(high,title);else push(watch,title||'7일 이내 일정')}
  }
  return{level:high.length?'HIGH':watch.length?'WATCH':'NORMAL',high:high.slice(0,6),watch:watch.slice(0,6)};
}
function structureScore(item={}){
  let s=0,w=0;const ev=[],contra=[];
  const align=n(item.v3AlignmentPct??item.v3?.longTerm?.filter?.alignmentPct);if(align!=null){s+=clamp(align)*.35;w+=35;if(align>=70)push(ev,'HTF 정렬 '+align.toFixed(0)+'%');else if(align<45)push(contra,'HTF 정렬 약함')}
  const tier=String(item.v3LongTier||item.v3?.longTerm?.filter?.tier||'N/A');w+=20;if(tier==='PASS'){s+=20;push(ev,'v3 장기 필터 PASS')}else if(tier==='SOFT_FAIL')s+=11;else push(contra,'장기 필터 미완성');
  const cls=String(item.scanClass?.key||'');w+=20;if(cls==='PRE-SURGE'){s+=20;push(ev,'PRE-SURGE 구조')}else if(['ACCUMULATION-PRE','META-PRE'].includes(cls)){s+=15;push(ev,'축적/선행 구조')}else if(cls==='ANOMALY')s+=8;
  const signal=String(item.tradeSignal?.level||'');w+=15;if(signal==='매수 후보'){s+=15;push(ev,'기존 ICT/tradeSignal 후보')}else if(signal==='관찰')s+=8;else push(contra,'ICT setup 미확정');
  const invalid=Boolean(item.v3Invalidation);w+=10;if(!invalid)s+=10;else push(contra,'v3 구조 무효화');
  return{score:w?clamp(s/w*100):null,evidence:ev,contradictions:contra};
}
function derivativesScore(item={}){
  let s=50;const ev=[],contra=[];const oi=n(item.oi4hChangePct??item.v3?.oiPath?.main4hPct),tk=n(item.trueTakerRatio??item.takerRatio??item.v3?.taker?.latest),fund=n(item.fundingRate);
  if(oi!=null){if(oi>=1&&oi<=6){s+=15;push(ev,'OI 4H '+(oi>=0?'+':'')+oi.toFixed(1)+'%')}else if(oi>8){s-=10;push(contra,'OI 급증 crowding 가능')}else if(oi<=-3){s-=12;push(contra,'OI 감소')}}
  if(tk!=null){if(tk>=1.2&&tk<=1.8){s+=15;push(ev,'taker '+tk.toFixed(2))}else if(tk>2){s-=8;push(contra,'taker 과열')}else if(tk<.8){s-=15;push(contra,'taker 매도 우위')}}
  if(fund!=null){if(Math.abs(fund)<=.03)s+=10;else if(Math.abs(fund)>.08){s-=20;push(contra,'funding 극단값')}else{s-=8;push(contra,'funding 과열 주의')}}
  const crowd=item.validationGate?.crowding?.crowded;if(crowd){s-=30;push(contra,'파생 crowding 필터')}
  return{score:clamp(s),evidence:ev,contradictions:contra,oi4hPct:oi,takerRatio:tk,fundingRate:fund,crowded:Boolean(crowd)};
}
function onchainScore(intelligence={}){
  const coverage=intelligence?.coverage||{},wallet=intelligence?.walletVerification||{},dex=intelligence?.dex||{};let parts=[],ev=[],contra=[];
  if(coverage.wallets){parts.push(wallet.verifiedAttributions>0?70:50);push(ev,'온체인 transfer 소스 확인')}else push(contra,'온체인 transfer 데이터 없음');
  if(coverage.dex){parts.push(wallet.tokenContractVerified?80:45);if(wallet.tokenContractVerified)push(ev,'DEX contract 교차확인');else push(contra,'contract 교차검증 미완성')}
  return{score:avg(parts),evidence:ev,contradictions:contra};
}
function dataQuality(item={},intelligence={},execution={}){
  let s=0,w=0;const ev=[],missing=[],contra=[];
  w+=20;if(item.dataState==='live'){s+=20;push(ev,'실시간 데이터')}else push(contra,'데이터 상태 '+String(item.dataState||'unknown'));
  const cex=intelligence?.cex||item.marketIntelligence||{},venues=n(cex.exchangeCount);w+=25;if(venues!=null&&venues>=2){s+=25;push(ev,venues+'개 venue 교차확인')}else if(venues===1){s+=10;push(missing,'2개 이상 venue 가격 확인')}else push(missing,'멀티 venue 가격');
  const disp=n(cex.maxPriceDispersionPct);w+=15;if(disp!=null&&disp<=1){s+=15;push(ev,'venue 가격 괴리 양호')}else if(disp!=null&&disp<=3)s+=8;else if(disp!=null)push(contra,'venue 가격 괴리 '+disp.toFixed(2)+'%');else push(missing,'venue 가격 괴리');
  const ex=executionMetrics(execution);w+=25;if(ex.available&&ex.score!=null){s+=25*ex.score/100;if(ex.score>=70)push(ev,'체결성 검증 통과');else push(contra,'체결성 품질 낮음')}else push(missing,'실시간 bid/ask·depth');
  const cov=intelligence?.coverage||{},covered=['cex','indicators','news','scheduledEvents','wallets','execution'].filter(k=>cov[k]).length;w+=15;s+=15*(covered/6);if(covered<3)push(missing,'외부 데이터 coverage');
  return{score:w?clamp(s/w*100):null,evidence:ev,missing,contradictions:contra,venues,priceDispersionPct:disp,execution:ex,coverageCount:covered};
}
function screen(row={},opts={}){
  const item=row.item||{},execution=opts.execution||row.executionValidation||{},intel=opts.intelligence||{},evidence=[],contradictions=[],missing=[],exclusions=[];
  const dq=dataQuality(item,intel,execution),st=structureScore(item),der=derivativesScore(item),on=onchainScore(intel),evt=eventRisk(intel,opts.now||Date.now());
  for(const x of [...dq.evidence,...st.evidence,...der.evidence,...on.evidence])push(evidence,x);
  for(const x of [...dq.contradictions,...st.contradictions,...der.contradictions,...on.contradictions])push(contradictions,x);
  for(const x of dq.missing)push(missing,x);
  const gate=String(row.validationGate?.status||'');if(gate==='INVALIDATED')push(exclusions,'기존 체결/검증 게이트 INVALIDATED');
  if(String(row.state)==='EXCLUDE')for(const x of row.invalidations||[])push(exclusions,x);
  if(evt.level==='HIGH')for(const x of evt.high)push(contradictions,'고위험 이벤트: '+x);
  const catalystScore=intel?.events?.available||intel?.news?.available?(evt.level==='HIGH'?0:evt.level==='WATCH'?45:75):null;
  const components={liquidityExecution:dq.execution.score,marketStructure:st.score,derivatives:der.score,onchainActivity:on.score,catalystSafety:catalystScore,dataQuality:dq.score};
  const weighted=[[components.liquidityExecution,.25],[components.marketStructure,.20],[components.derivatives,.15],[components.onchainActivity,.15],[components.catalystSafety,.10],[components.dataQuality,.15]];
  const usable=weighted.filter(([v])=>v!=null),weight=usable.reduce((s,[,w])=>s+w,0),total=weight?usable.reduce((s,[v,w])=>s+v*w,0)/weight:null;
  let classification='B_WATCH';
  if(exclusions.length)classification='EXCLUDED';
  else if(evt.level==='HIGH')classification='EVENT_RISK';
  else if((dq.venues??0)<2||dq.score<50||!dq.execution.available)classification='DATA_INSUFFICIENT';
  else if(total!=null&&total>=75&&(st.score??0)>=60&&(dq.execution.score??0)>=65&&dq.score>=70&&gate==='VALIDATED'&&!der.crowded)classification='A_CANDIDATE';
  else classification='B_WATCH';
  if(classification==='DATA_INSUFFICIENT')push(missing,'A급 승격에 필요한 검증 데이터 부족');
  if(classification==='B_WATCH'&&(st.score??0)<60)push(missing,'ICT setup 확정');
  return{
    version:'CANDIDATE_SCREENING_v2',
    symbol:row.symbol||item.symbol||'',
    asOf:opts.asOf||Date.now(),
    classification,label:LABELS[classification],
    totalScore:total==null?null:Math.round(total*10)/10,
    marketCandidateScore:avg([components.liquidityExecution,components.derivatives,components.dataQuality]),
    ictSetupScore:components.marketStructure,
    executionQualityScore:components.liquidityExecution,
    eventRiskScore:evt.level==='HIGH'?100:evt.level==='WATCH'?55:0,
    dataQualityScore:components.dataQuality,
    components,
    validationStatus:gate||'UNVERIFIED',
    evidence:uniq(evidence).slice(0,12),
    contradictions:uniq(contradictions).slice(0,12),
    missing:uniq(missing).slice(0,12),
    exclusionReasons:uniq(exclusions).slice(0,12),
    invalidation:uniq([...(row.invalidations||[]),...contradictions]).slice(0,12),
    eventRisk:evt,
    sourceMeta:{venueCount:dq.venues,priceDispersionPct:dq.priceDispersionPct,coverageCount:dq.coverageCount}
  };
}
function bundle(rows=[]){
  const order={A_CANDIDATE:0,B_WATCH:1,EVENT_RISK:2,DATA_INSUFFICIENT:3,EXCLUDED:4};
  const sorted=rows.slice().sort((a,b)=>(order[a.classification]??99)-(order[b.classification]??99)||(Number(b.totalScore)||0)-(Number(a.totalScore)||0)||String(a.symbol).localeCompare(String(b.symbol)));
  return{
    aCandidates:sorted.filter(x=>x.classification==='A_CANDIDATE'),
    bWatch:sorted.filter(x=>x.classification==='B_WATCH'),
    eventRisk:sorted.filter(x=>x.classification==='EVENT_RISK'),
    dataInsufficient:sorted.filter(x=>x.classification==='DATA_INSUFFICIENT'),
    excluded:sorted.filter(x=>x.classification==='EXCLUDED')
  };
}
module.exports={LABELS,executionMetrics,eventRisk,structureScore,derivativesScore,onchainScore,dataQuality,screen,bundle};
