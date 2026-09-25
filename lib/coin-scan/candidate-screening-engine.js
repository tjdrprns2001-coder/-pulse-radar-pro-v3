'use strict';
const crypto=require('crypto');
const EvidenceContext=require('./evidence-context-engine.js');
const Resilience=require('./source-resilience.js');

const SPEC_VERSION='selector-r0.3';
const LABELS={
  CANDIDATE:'검증 후보',
  WATCHLIST:'감시 목록',
  EVENT_RISK:'이벤트 위험',
  RISK_FILTERED:'위험 필터',
  INSUFFICIENT_DATA:'데이터 부족',
  CONFLICTED:'소스 충돌',
  REJECTED:'제외'
};
const WEIGHTS={marketQuality:.20,ictSetup:.25,executionQuality:.20,derivativesContext:.10,onchainContext:.10,catalystContext:.05,dataQuality:.10};
function n(v){if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null}
function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,Number(v)||0))}
function uniq(a=[]){return [...new Set(a.filter(Boolean).map(String))]}
function avg(a=[]){const v=a.filter(x=>Number.isFinite(x));return v.length?v.reduce((s,x)=>s+x,0)/v.length:null}
function push(a,x){if(x&&!a.includes(x))a.push(x)}
function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  return value;
}
function hashInput(value){return' sha256:'+crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}
function iso(v){if(v===null||v===undefined||v==='')return null;const x=n(v);if(x!=null)return new Date(x).toISOString();const d=new Date(v);return Number.isFinite(d.getTime())?d.toISOString():null}
function observedAt(x){return n(x?.observed_at??x?.observedAt??x?.retrieved_at??x?.retrievedAt??x?.publishedAt??x?.published_at)}
function publishedAt(x){return n(x?.published_at??x?.publishedAt)}
function eventAt(x){return n(x?.scheduled_at??x?.scheduledAt??x?.date_event??x?.date??x?.event_time??x?.eventTime)}
function pointInTime(items=[],decisionTime){
  const t=n(decisionTime)??Date.now();
  return (items||[]).filter(x=>{
    const pub=publishedAt(x),obs=observedAt(x);
    return (pub==null||pub<=t)&&(obs==null||obs<=t);
  });
}
function executionMetrics(execution={}){
  const rows=[execution.spot,execution.futures].filter(x=>x?.available);
  if(!rows.length)return{available:false,score:null,spreadBps:null,depth10Usd:null,maxSlippageBps:null,hardReject:false};
  const spreads=rows.map(x=>n(x.spreadBps)).filter(v=>v!=null);
  const depths=rows.flatMap(x=>[n(x.depthUsd?.bid10bps),n(x.depthUsd?.ask10bps)]).filter(v=>v!=null);
  const slips=rows.flatMap(x=>[...(x.slippage?.buy||[]),...(x.slippage?.sell||[])]).filter(Boolean).filter(x=>(n(x.notional)||0)>=10000).map(x=>n(x.slippageBps)).filter(v=>v!=null);
  const spread=spreads.length?Math.max(...spreads):null,depth=depths.length?Math.min(...depths):null,slip=slips.length?Math.max(...slips):null;
  let score=100;if(spread==null||depth==null)return{available:true,score:35,spreadBps:spread,depth10Usd:depth,maxSlippageBps:slip,hardReject:false};
  const hardReject=spread>25||(slip!=null&&slip>50)||depth<10000;
  if(spread>25)score=0;else if(spread>10)score-=30;else if(spread>5)score-=12;
  if(depth<10000)score=0;else if(depth<50000)score-=25;else if(depth<100000)score-=10;
  if(slip!=null){if(slip>50)score=0;else if(slip>20)score-=25;else if(slip>10)score-=10}
  return{available:true,score:clamp(score),spreadBps:spread,depth10Usd:depth,maxSlippageBps:slip,hardReject};
}
function eventRisk(intelligence={},decisionTime=Date.now()){
  const high=[],watch=[],used=[];
  const news=pointInTime([...(intelligence?.news?.items||[]),...(intelligence?.events?.newsDerived||[])],decisionTime);
  const severe=/(hack|exploit|attack|vulnerab|breach|delist|delisting|suspend|halt|honeypot|transfer restrict)/i;
  const caution=/(unlock|migration|upgrade|mainnet|fork|governance|vote|listing|airdrop)/i;
  for(const x of news){const title=String(x?.title||x?.headline||'');if(!title)continue;used.push({type:'news',title,published_at:iso(publishedAt(x)),observed_at:iso(observedAt(x))});if(severe.test(title))push(high,title);else if(caution.test(title))push(watch,title)}
  for(const x of pointInTime(intelligence?.events?.items||[],decisionTime)){
    const title=String(x?.title||x?.headline||''),ts=eventAt(x);
    const near=ts!=null&&ts>=decisionTime-3600000&&ts<=decisionTime+7*86400000;
    if(near){used.push({type:'calendar',title,scheduled_at:iso(ts),published_at:iso(publishedAt(x)),observed_at:iso(observedAt(x))});if(severe.test(title))push(high,title);else push(watch,title||'7일 이내 일정')}
  }
  return{level:high.length?'HIGH':watch.length?'WATCH':'NORMAL',high:high.slice(0,6),watch:watch.slice(0,6),pointInTimeEvidence:used.slice(0,12)};
}
function structureScore(item={}){
  let s=0,w=0;const ev=[],contra=[];
  const align=n(item.v3AlignmentPct??item.v3?.longTerm?.filter?.alignmentPct);if(align!=null){s+=clamp(align)*.20;w+=20;if(align>=70)push(ev,'confirmed higher-timeframe direction');else if(align<45)push(contra,'HTF alignment weak')}
  const tier=String(item.v3LongTier||item.v3?.longTerm?.filter?.tier||'N/A');w+=20;if(tier==='PASS'){s+=20;push(ev,'long-term filter PASS')}else if(tier==='SOFT_FAIL')s+=10;else push(contra,'long-term filter incomplete');
  const cls=String(item.scanClass?.key||'');w+=20;if(cls==='PRE-SURGE'){s+=20;push(ev,'liquidity/structure presurge condition')}else if(cls==='RE-ENTRY'){s+=20;push(ev,'post-surge re-entry structure confirmed')}else if(cls==='PATTERN-SETUP'){s+=16;push(ev,'multi-strategy pattern setup')}else if(['ACCUMULATION-PRE','META-PRE'].includes(cls)){s+=12;push(ev,'accumulation/leading structure')}
  const causal=item.v3?.causalIct||{},stage=String(causal?.longStage||causal?.timeframes?.[causal?.primaryTf||'4h']?.sequence?.long?.stage||'').toUpperCase();w+=20;
  if(/MSS|INTENT|FILLED|REVISIT/.test(stage)){s+=20;push(ev,'causal ICT event confirmed: '+stage)}else if(stage){s+=8;push(contra,'ICT setup incomplete: '+stage)}else push(contra,'ICT causal stage unavailable');
  const invalid=Boolean(item.v3Invalidation);w+=20;if(!invalid)s+=20;else push(contra,'v3 structure invalidated');
  const grade=String(item.strategyCycle?.entryQuality?.grade||'');if(grade){w+=10;if(grade==='A'){s+=10;push(ev,'entry location grade A')}else if(grade==='B'){s+=7;push(ev,'entry location grade B')}else if(grade==='C'){s+=3;push(contra,'entry location grade C')}else push(contra,'entry location grade D')}
  return{score:w?clamp(s/w*100):null,evidence:ev,contradictions:contra,stage};
}
function derivativesScore(item={},validationGate=null){
  let s=60;const ev=[],contra=[];const oi=n(item.oi4hChangePct??item.v3?.oiPath?.main4hPct),tk=n(item.trueTakerRatio??item.takerRatio??item.v3?.taker?.latest),fund=n(item.fundingRate);
  if(oi!=null){if(oi>=1&&oi<=6){s+=10;push(ev,'OI build within normal band')}else if(oi>8){s-=20;push(contra,'OI acceleration crowding')}else if(oi<=-3){s-=12;push(contra,'OI contraction')}}
  if(tk!=null){if(tk>=1.0&&tk<=1.8){s+=10;push(ev,'taker flow not extreme')}else if(tk>2){s-=15;push(contra,'taker extreme')}else if(tk<.8){s-=15;push(contra,'taker sell dominance')}}
  if(fund!=null){if(Math.abs(fund)<=.03)s+=10;else if(Math.abs(fund)>.08){s-=25;push(contra,'funding extreme')}else{s-=10;push(contra,'funding elevated')}}
  const crowded=Boolean(validationGate?.crowding?.crowded??item.validationGate?.crowding?.crowded);if(crowded){s-=30;push(contra,'derivatives crowding gate')}
  return{score:clamp(s),evidence:ev,contradictions:contra,oi4hPct:oi,takerRatio:tk,fundingRate:fund,crowded};
}
function onchainScore(intelligence={}){
  const coverage=intelligence?.coverage||{},wallet=intelligence?.walletVerification||{};const parts=[],ev=[],contra=[];
  if(coverage.wallets){parts.push(wallet.verifiedAttributions>0?70:50);push(ev,'on-chain transfer source available')}else push(contra,'on-chain transfer unavailable');
  if(coverage.dex){parts.push(wallet.tokenContractVerified?80:45);if(wallet.tokenContractVerified)push(ev,'token contract cross-verified');else push(contra,'contract verification incomplete')}
  return{score:avg(parts),evidence:ev,contradictions:contra};
}
function dataQuality(item={},intelligence={},execution={},decisionTime=Date.now()){
  let s=0,w=0;const ev=[],missing=[],contra=[];
  const updated=n(item.updatedAt);w+=20;
  if(item.dataState==='live'&&updated!=null&&decisionTime-updated<=300000){s+=20;push(ev,'source freshness within 5m')}
  else if(item.dataState==='live'&&updated==null){s+=10;push(missing,'source timestamp unavailable')}
  else push(contra,'stale/degraded market data');
  const cex=intelligence?.cex||item.marketIntelligence||{},venues=n(cex.exchangeCount);w+=25;if(venues!=null&&venues>=2){s+=25;push(ev,venues+' venues cross-checked')}else if(venues===1){s+=8;push(missing,'minimum 2 venues')}else push(missing,'multi-venue prices');
  const disp=n(cex.maxPriceDispersionPct);w+=20;if(disp!=null&&disp<=.35){s+=20;push(ev,'cross-venue deviation <=35bps')}else if(disp!=null&&disp<=1)s+=10;else if(disp!=null)push(contra,'cross-venue conflict '+disp.toFixed(2)+'%');else push(missing,'cross-venue deviation');
  const ex=executionMetrics(execution);w+=25;if(ex.available&&ex.score!=null){s+=25*ex.score/100;if(ex.score>=70)push(ev,'execution quality validated');else push(contra,'execution quality weak')}else push(missing,'bid/ask depth/slippage');
  const cov=intelligence?.coverage||{},covered=['cex','indicators','news','scheduledEvents','wallets','execution'].filter(k=>cov[k]).length;w+=10;s+=10*(covered/6);if(covered<3)push(missing,'external source coverage');
  return{score:w?clamp(s/w*100):null,evidence:ev,missing,contradictions:contra,venues,priceDispersionPct:disp,execution:ex,coverageCount:covered};
}
function marketQuality(item={},dq={}){
  const vol=n(item.quoteVolume24h);let volumeScore=null;if(vol!=null)volumeScore=vol>=100_000_000?100:vol>=25_000_000?80:vol>=5_000_000?60:vol>=1_000_000?35:10;
  const spreadScore=dq.execution.spreadBps==null?null:clamp(100-dq.execution.spreadBps*3);
  const depthScore=dq.execution.depth10Usd==null?null:clamp(Math.log10(Math.max(1,dq.execution.depth10Usd))/6*100);
  const venueScore=dq.venues==null?null:clamp(dq.venues/4*100);
  const priceConsistency=dq.priceDispersionPct==null?null:clamp(100-dq.priceDispersionPct*60);
  const vals=[[volumeScore,.35],[spreadScore,.20],[depthScore,.20],[venueScore,.15],[priceConsistency,.10]].filter(([v])=>v!=null),wt=vals.reduce((s,[,w])=>s+w,0);
  return{score:wt?vals.reduce((s,[v,w])=>s+v*w,0)/wt:null,volumeScore,spreadScore,depthScore,venueScore,priceConsistency};
}
function hardFilters(row={},dq={},evt={}){
  const item=row.item||{},reasons=[];
  if(item.dataState!=='live')push(reasons,'STALE_OR_DEGRADED');
  if((dq.venues??0)<2)push(reasons,'MINIMUM_TWO_VENUES_NOT_MET');
  if(dq.priceDispersionPct!=null&&dq.priceDispersionPct>.35)push(reasons,'CROSS_VENUE_PRICE_CONFLICT');
  if(dq.execution.hardReject){if((dq.execution.spreadBps??0)>25)push(reasons,'SPREAD_HARD_LIMIT');if((dq.execution.maxSlippageBps??0)>50)push(reasons,'SLIPPAGE_HARD_LIMIT');if((dq.execution.depth10Usd??Infinity)<10000)push(reasons,'DEPTH_HARD_LIMIT')}
  // News/security hard risk is handled by the verified r0.2 evidence context, not title matching.
  if(item?.strategyCycle?.fakeout?.longBlocked)push(reasons,'FAKEOUT_LONG_BLOCK');
  if(String(row.state)==='EXCLUDE'||String(row.validationGate?.status)==='INVALIDATED')push(reasons,'UPSTREAM_VALIDATION_REJECTED');
  return uniq(reasons);
}
function screen(row={},opts={}){
  const item=row.item||{},execution=opts.execution||row.executionValidation||{},intel=opts.intelligence||{},decisionTime=n(opts.decisionTime??opts.asOf??opts.now)??Date.now(),dataCutoff=n(opts.dataCutoff)??decisionTime;
  const evidence=[],contradictions=[],missing=[];
  const context=opts.evidenceContext||EvidenceContext.buildEvidenceContext({intelligence:intel,decisionTime});
  const sourceHealth=intel?.sourceHealth||opts.sourceHealth||null;
  const dq=dataQuality(item,intel,execution,decisionTime),st=structureScore(item),der=derivativesScore(item,row.validationGate),mq=marketQuality(item,dq);
  const on=context.onchain||{score:60,evidence:[],contradictions:[],risk_penalty:0,finality_status:'MISSING'};
  const cat=context.catalysts||{news_risk_score:60,calendar_risk_score:60,evidence:[],contradictions:[],risk_penalty:0,hard_event_risk:false,high_impact_event:false};
  const evt=eventRisk(intel,decisionTime);
  for(const x of [...dq.evidence,...st.evidence,...der.evidence,...(on.evidence||[]),...(cat.evidence||[])])push(evidence,x);
  for(const x of [...dq.contradictions,...st.contradictions,...der.contradictions,...(on.contradictions||[]),...(cat.contradictions||[])])push(contradictions,x);
  for(const x of dq.missing)push(missing,x);
  const hardRejectReasons=hardFilters(row,dq,evt);
  const catalystRisk=evt.level==='HIGH'?100:evt.level==='WATCH'?55:0;
  const scores={
    market_quality:mq.score==null?null:Math.round(mq.score*10)/10,
    ict_setup:st.score==null?null:Math.round(st.score*10)/10,
    execution_quality:dq.execution.score==null?null:Math.round(dq.execution.score*10)/10,
    derivatives_context:Math.round(der.score*10)/10,
    onchain_context:on.score==null?null:Math.round(on.score*10)/10,
    catalyst_context:Math.round((100-Math.max(Number(cat.news_risk_score)||0,Number(cat.calendar_risk_score)||0))*10)/10,
    catalyst_risk:Math.max(catalystRisk,Number(cat.news_risk_score)||0,Number(cat.calendar_risk_score)||0),
    data_quality:dq.score==null?null:Math.round(dq.score*10)/10
  };
  const weighted=[[scores.market_quality,WEIGHTS.marketQuality],[scores.ict_setup,WEIGHTS.ictSetup],[scores.execution_quality,WEIGHTS.executionQuality],[scores.derivatives_context,WEIGHTS.derivativesContext],[scores.onchain_context,WEIGHTS.onchainContext],[scores.catalyst_context,WEIGHTS.catalystContext],[scores.data_quality,WEIGHTS.dataQuality]].filter(([v])=>v!=null);
  const wt=weighted.reduce((s,[,w])=>s+w,0),base=wt?weighted.reduce((s,[v,w])=>s+v*w,0)/wt:null;
  let penalty=0;if(der.crowded)penalty+=20;if(dq.priceDispersionPct!=null&&dq.priceDispersionPct>.2)penalty+=10;penalty+=Number(on.risk_penalty)||0;penalty+=Number(cat.risk_penalty)||0;
  scores.final_score=base==null?null:Math.round(clamp(base-penalty)*10)/10;
  let classification='WATCHLIST';
  if(hardRejectReasons.includes('FAKEOUT_LONG_BLOCK')||hardRejectReasons.includes('UPSTREAM_VALIDATION_REJECTED')||hardRejectReasons.includes('SPREAD_HARD_LIMIT')||hardRejectReasons.includes('SLIPPAGE_HARD_LIMIT')||hardRejectReasons.includes('DEPTH_HARD_LIMIT'))classification='REJECTED';
  else if(hardRejectReasons.includes('STALE_OR_DEGRADED')||hardRejectReasons.includes('MINIMUM_TWO_VENUES_NOT_MET'))classification='INSUFFICIENT_DATA';
  else if(sourceHealth?.status==='CONFLICTED'||hardRejectReasons.includes('CROSS_VENUE_PRICE_CONFLICT'))classification='CONFLICTED';
  else if(['STALE','UNKNOWN'].includes(String(sourceHealth?.status||'')))classification='INSUFFICIENT_DATA';
  else if(cat.hard_event_risk)classification='EVENT_RISK';
  else if(cat.high_impact_event)classification='WATCHLIST';
  else if(sourceHealth?.status==='DEGRADED')classification='WATCHLIST';
  else if(der.crowded||(scores.execution_quality??0)<55)classification='RISK_FILTERED';
  else if((scores.final_score??0)>=75&&(scores.ict_setup??0)>=60&&(scores.execution_quality??0)>=65&&(scores.data_quality??0)>=70&&String(row.validationGate?.status)==='VALIDATED')classification='CANDIDATE';
  else classification='WATCHLIST';
  if(classification==='WATCHLIST'&&(scores.ict_setup??0)<60)push(missing,'ICT setup incomplete');
  if(classification==='INSUFFICIENT_DATA')push(missing,'minimum data/venue/freshness requirement not met');
  const symbol=row.symbol||item.symbol||'',timeframe=opts.timeframe||'5m',instrumentId=opts.instrumentId||('binance:'+symbol+':perpetual');
  const input={symbol,instrumentId,decisionTime,dataCutoff,timeframe,scores,classification,evidence,contradictions,missing,hardRejectReasons,eventRisk:evt,evidenceContext:context};
  const inputHash=hashInput(input).trim();
  const snapshotId='snap:'+instrumentId.replace(/:/g,'_')+':'+new Date(decisionTime).toISOString()+':'+timeframe;
  return{
    version:'CANDIDATE_SCREENING_v5',
    spec_version:SPEC_VERSION,
    snapshot_id:snapshotId,
    instrument_id:instrumentId,
    symbol,
    decision_time:new Date(decisionTime).toISOString(),
    data_cutoff:new Date(dataCutoff).toISOString(),
    timeframe,
    input_hash:inputHash,
    classification,
    label:LABELS[classification],
    validation_state:classification==='CANDIDATE'?'VALIDATED':classification,
    scores,
    rank:null,
    evidence:uniq(evidence).slice(0,16).map((x,i)=>({type:'supportive_'+(i+1),status:'supportive',value:x,observed_at:new Date(decisionTime).toISOString(),source_refs:[]})),
    contradictions:uniq(contradictions).slice(0,16).map((x,i)=>({type:'contradiction_'+(i+1),status:'caution',reason:x})),
    data_gaps:uniq(missing).slice(0,16),
    exclusion_reasons:hardRejectReasons,
    invalidation_conditions:uniq([...(row.invalidations||[]),'confirmed structure low close break','active FVG mitigation','spread or slippage hard limit breach','data freshness breach']).slice(0,16),
    event_risk:evt,
    evidence_context:context,
    source_event_ids:context.source_event_ids||[],
    source_versions:context.source_versions||[],
    source_health:sourceHealth,
    source_meta:{venue_count:dq.venues,price_dispersion_pct:dq.priceDispersionPct,coverage_count:dq.coverageCount,point_in_time_evidence:evt.pointInTimeEvidence},
    disclaimer:'Read-only research candidate; not an order or execution instruction'
  };
}
function bundle(rows=[]){
  const order={CANDIDATE:0,WATCHLIST:1,EVENT_RISK:2,CONFLICTED:3,RISK_FILTERED:4,INSUFFICIENT_DATA:5,REJECTED:6};
  const sorted=rows.slice().sort((a,b)=>(order[a.classification]??99)-(order[b.classification]??99)||(Number(b.scores?.final_score)||0)-(Number(a.scores?.final_score)||0)||String(a.symbol).localeCompare(String(b.symbol)));
  const ranked=sorted.map((x,i)=>({...x,rank:i+1}));
  return{
    candidates:ranked.filter(x=>x.classification==='CANDIDATE'),
    watchlist:ranked.filter(x=>x.classification==='WATCHLIST'),
    eventRisk:ranked.filter(x=>x.classification==='EVENT_RISK'),
    conflicted:ranked.filter(x=>x.classification==='CONFLICTED'),
    riskFiltered:ranked.filter(x=>x.classification==='RISK_FILTERED'),
    insufficientData:ranked.filter(x=>x.classification==='INSUFFICIENT_DATA'),
    rejected:ranked.filter(x=>x.classification==='REJECTED'),
    all:ranked
  };
}
module.exports={SPEC_VERSION,LABELS,WEIGHTS,pointInTime,executionMetrics,eventRisk,structureScore,derivativesScore,onchainScore,dataQuality,marketQuality,hardFilters,screen,bundle};
