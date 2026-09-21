'use strict';

const PARAM_SET='v2_taker_0.8_1.2';
const PARAMS=Object.freeze({
  OI_BUILD_4H_PCT:1.0, QUIET_PRICE_1H_PCT:1.5,
  TAKER_WEAK:0.8, TAKER_NEUTRAL_LOW:0.8, TAKER_NEUTRAL_HIGH:1.2,
  TAKER_IMPROVE:1.2, TAKER_STRONG:1.5,
  HTF_DISCOUNT_PCT:35, HTF_PREMIUM_PCT:80,
  RVOL_PRE_SPARK_MIN:1.5, RVOL_IGNITION_MIN:3, RVOL_EXPANSION_MIN:10,
  COST_ROUND_TRIP_PCT:0.2
});

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function count(arr,p){return (Array.isArray(arr)?arr:[]).filter(p).length}
function last(arr){return Array.isArray(arr)&&arr.length?arr[arr.length-1]:null}
function stageLabel(key){return({OBSERVE:'⚪ 관찰',PREP:'🟢 준비중',WAIT:'🟡 점화대기',EARLY:'🟠 점화초기',PROGRESSED:'🔴 이미진행',OVERHEATED:'🔥 과열',RISK:'⚠️ 실패·분배 위험'})[key]||'⚪ 관찰'}
function trueTakerDirection(v){const x=finite(v);if(x==null)return'unknown';if(x<PARAMS.TAKER_WEAK)return'sell';if(x>=PARAMS.TAKER_STRONG)return'strong-buy';if(x>PARAMS.TAKER_IMPROVE)return'buy';return'none'}
function buildDirection({taker1h=[],oi4hPct,price1hPct,type}={}){
  const oi4=finite(oi4hPct),p1=finite(price1hPct),ts=(Array.isArray(taker1h)?taker1h:[]).map(finite).filter(Number.isFinite).slice(-3);
  const improve=count(ts,v=>v>PARAMS.TAKER_IMPROVE);
  if(type==='NFB-SC')return'short';
  if(oi4!=null&&oi4>PARAMS.OI_BUILD_4H_PCT&&improve>=2)return'long';
  if(p1!=null&&p1<0&&oi4!=null&&oi4>PARAMS.OI_BUILD_4H_PCT&&last(ts)!=null&&last(ts)<PARAMS.TAKER_WEAK)return'short';
  return'none';
}
function classifyType(input={}){
  const p1=finite(input.price1hPct),p24=finite(input.price24hPct),oi4=finite(input.oi4hPct),oi8=finite(input.oi8hPct),fund=finite(input.fundingRate),rvol=finite(input.rvol1h);
  const t1=(Array.isArray(input.taker1h)?input.taker1h:[]).map(finite).filter(Number.isFinite).slice(-3),t=last(t1);
  const improve=count(t1,v=>v>PARAMS.TAKER_IMPROVE),strong=count(t1,v=>v>=PARAMS.TAKER_STRONG);
  const quiet=p1!=null&&Math.abs(p1)<=PARAMS.QUIET_PRICE_1H_PCT,build=oi4!=null&&oi4>PARAMS.OI_BUILD_4H_PCT,negativeFunding=fund!=null&&fund<0;
  const range=finite(input.htfRangePct),htfDiscount=range!=null&&range<=PARAMS.HTF_DISCOUNT_PCT;
  const structureImproving=Boolean(input.structureImproving||input.structureShift4h||input.sslSweepReclaim),breakout=Boolean(input.bosUp||input.displacement||input.breakout);
  const clean=finite(input.oiDrawdownPct)!=null&&finite(input.oiDrawdownPct)<=-2,recentOiFalling=finite(input.oi1hPct)!=null&&finite(input.oi1hPct)<0;
  const priceUp=p1!=null&&p1>0,priceDown=p1!=null&&p1<0;
  if(build&&negativeFunding&&priceDown&&t!=null&&t<PARAMS.TAKER_WEAK)return'NFB-SC';
  if(negativeFunding&&priceUp&&recentOiFalling&&t!=null&&t>PARAMS.TAKER_IMPROVE)return'NFB-SQ';
  if(build&&negativeFunding&&(htfDiscount||structureImproving)&&p24!=null&&p24<10)return'NFB';
  if(clean&&Boolean(input.htfStructureHeld)&&Boolean(input.sslSweepReclaim))return'C';
  if(build&&priceUp&&improve>=2&&(rvol==null||rvol>=PARAMS.RVOL_PRE_SPARK_MIN)&&breakout)return'A+B';
  if(build&&strong>=1&&(Boolean(input.rvolReaccel)||breakout))return'A→A+B';
  if(!build&&priceUp&&improve>=2)return'B';
  if(build&&quiet&&(htfDiscount||structureImproving))return'A';
  if(oi4!=null&&oi4>0&&oi4<=PARAMS.OI_BUILD_4H_PCT&&quiet&&structureImproving)return'A-pre';
  if(oi8!=null&&oi8>1&&oi4!=null&&oi4<=PARAMS.OI_BUILD_4H_PCT)return'INCOMPLETE';
  return'INCOMPLETE';
}
function classifyStage(input={},type){
  const p24=finite(input.price24hPct),p1=finite(input.price1hPct),rv=finite(input.rvol1h),rv15=finite(input.rvol15m),t15=(Array.isArray(input.taker15m)?input.taker15m:[]).map(finite).filter(Number.isFinite);
  if(type==='NFB-SC'||Boolean(input.distributionRisk))return'RISK';
  if(p24!=null&&p24>=20)return'PROGRESSED';
  if(Boolean(input.overheated)||((p1!=null&&p1>=7)||(rv!=null&&rv>=PARAMS.RVOL_EXPANSION_MIN)))return'OVERHEATED';
  if(type==='A+B'||type==='NFB-SQ')return'EARLY';
  if(type==='A→A+B'||(rv15!=null&&rv15>=PARAMS.RVOL_PRE_SPARK_MIN&&count(t15.slice(-4),v=>v>PARAMS.TAKER_IMPROVE)>=2))return'WAIT';
  if(['A','A-pre','NFB','C','B'].includes(type))return'PREP';
  return'OBSERVE';
}
function sampleSubtype(input={}){
  const oi1=finite(input.oi1hPct),oi4=finite(input.oi4hPct),oiDd=finite(input.oiDrawdownPct),rv1=finite(input.rvol1h),rv15=finite(input.rvol15m),rv5=finite(input.rvol5m),p1=finite(input.price1hPct);
  const t1=(Array.isArray(input.taker1h)?input.taker1h:[]).map(finite).filter(Number.isFinite);
  const t15=(Array.isArray(input.taker15m)?input.taker15m:[]).map(finite).filter(Number.isFinite);
  const neutral=t1.length&&count(t1.slice(-3),v=>v>=PARAMS.TAKER_NEUTRAL_LOW&&v<=PARAMS.TAKER_NEUTRAL_HIGH)>=2;
  const flowLead1h=count(t1.slice(-6),v=>v>PARAMS.TAKER_IMPROVE)>=3;
  const flowBurst15=count(t15.slice(-12),v=>v>=PARAMS.TAKER_STRONG)>=2;
  const ptbOiLead=(oi4!=null&&oi4>=3)||(oi1!=null&&oi1>=8);
  const oiRetained=oiDd==null||oiDd>=-5;
  const shock=Boolean(input.volumeShockSeen)||Boolean(input.priceHoldAfterShock)||(rv1!=null&&rv1>=PARAMS.RVOL_PRE_SPARK_MIN);
  const reaccel=Boolean(input.rvolReaccel)||(rv15!=null&&rv15>=3)||(rv5!=null&&rv5>=3);
  const zetaPreOiFlat=oi4!=null&&oi4<=PARAMS.OI_BUILD_4H_PCT&&oi4>=-3;
  const zetaDirectExpansion=oi1!=null&&oi1>=20&&rv1!=null&&rv1>=PARAMS.RVOL_EXPANSION_MIN&&p1!=null&&p1>=5&&flowLead1h;
  if(zetaDirectExpansion)return'ZETA_DIRECT_OI_EXPANSION';
  if(zetaPreOiFlat&&flowLead1h&&flowBurst15&&p1!=null&&Math.abs(p1)<=3)return'ZETA_FLOW_LED_BUILD';
  if(ptbOiLead&&neutral&&Boolean(input.priceHoldAfterShock)&&oiRetained&&reaccel)return'PTB_OI_LED_REIGNITION';
  if(ptbOiLead&&neutral&&Boolean(input.priceHoldAfterShock)&&oiRetained&&rv1!=null&&rv1<3)return'PTB_OI_LED_RELOAD';
  if(ptbOiLead&&neutral&&shock&&oiRetained)return'PTB_OI_LED_BUILD';
  if(Boolean(input.sslSweepReclaim)&&oi4!=null&&oi4>PARAMS.OI_BUILD_4H_PCT)return'SSL_RECLAIM_BUILD';
  if(Boolean(input.cleanRebuild))return'CLEAN_REBUILD';
  if(Boolean(input.absorptionCandidate))return'ABSORPTION';
  if(p1!=null&&Math.abs(p1)<=PARAMS.QUIET_PRICE_1H_PCT&&oi4!=null&&oi4>PARAMS.OI_BUILD_4H_PCT&&neutral)return'OI_LED_NEUTRAL_BUILD';
  if(rv5!=null&&rv5>=3&&Boolean(input.rvolReaccel))return'REIGNITION';
  return null;
}
function avg(values=[]){
  const xs=(Array.isArray(values)?values:[]).map(finite).filter(Number.isFinite);
  return xs.length?xs.reduce((sum,x)=>sum+x,0)/xs.length:null;
}
function detectDnaTags(input={}){
  const tags=[];
  const p1=finite(input.price1hPct),p24=finite(input.price24hPct);
  const oi4=finite(input.oi4hPct),oi12=finite(input.oi12hPct),oi24=finite(input.oi24hPct),oi72=finite(input.oi72hPct);
  const rv1=finite(input.rvol1h),rv4=finite(input.rvol4h),rv15=finite(input.rvol15m),rv5=finite(input.rvol5m);
  const rsi1=finite(input.rsi1h),rsi15=finite(input.rsi15m),rsi5=finite(input.rsi5m);
  const taker1=(Array.isArray(input.taker1h)?input.taker1h:[]).map(finite).filter(Number.isFinite);
  const latestTaker=last(taker1),taker6=avg(taker1.slice(-6));
  const structureUp=Boolean(input.structureImproving||input.structureShift4h||input.bosUp||input.htfBullish);
  const breakout=Boolean(input.bosUp||input.displacement||input.breakout||input.htfBreakout);
  const quiet=(p1!=null&&Math.abs(p1)<=3)&&(p24==null||p24<12);
  const oiFlat=(oi4==null||(oi4>=-3&&oi4<=2))&&(oi12==null||(oi12>=-4&&oi12<=3));
  const lowerReset=Boolean(input.lowerTfReset)||(rsi5!=null&&rsi5<=35)||(rsi15!=null&&rsi15<=55);
  const flowLead=taker6!=null&&taker6>=1.2;

  if(structureUp&&quiet&&oiFlat&&flowLead&&lowerReset)tags.push('ZETA_FLOW_COMPRESSION');

  const deleveraging=(oi72!=null&&oi72<=-5)||(oi24!=null&&oi24<0)||(oi12!=null&&oi12<=-2);
  const volumeReaccel=(rv5!=null&&rv5>=1.5)||(rv15!=null&&rv15>=1.5)||(rv1!=null&&rv1>=1.5);
  if(p1!=null&&p1>0&&deleveraging&&breakout&&volumeReaccel)tags.push('PHA_SHORT_COVER_ACCEL');

  const oiExplosion=(oi12!=null&&oi12>=20)||(oi24!=null&&oi24>=20)||(oi4!=null&&oi4>=8);
  const volumeExpansion=(rv4!=null&&rv4>=5)||(rv1!=null&&rv1>=5);
  if(oiExplosion&&volumeExpansion&&breakout)tags.push('PTB_LEVERAGE_IGNITION');

  const technicalStep=Boolean(input.structureShift4h||input.bosUp||input.breakout4h)&&Boolean(input.maAligned1h)&&Boolean(input.macd1hPositive)&&Boolean(input.obv1hUp);
  if(technicalStep&&taker6!=null&&taker6>=1.05&&(oi12==null||oi12>-10))tags.push('UAI_TECHNICAL_STEP_IGNITION');

  const oversold=(rsi1!=null&&rsi1<=32)||(rsi15!=null&&rsi15<=18)||(rsi5!=null&&rsi5<=20);
  const capitulationVolume=(rv15!=null&&rv15>=5)||(rv5!=null&&rv5>=4)||(rv1!=null&&rv1>=3);
  const downside=(p1!=null&&p1<0)||Boolean(input.sslSweep);
  const priceHold=Boolean(input.priceHoldAfterShock||input.lowExtensionStopped||input.sslSweepReclaim||input.absorptionCandidate);
  if(oversold&&capitulationVolume&&downside&&priceHold)tags.push('ABSORPTION_LIQUIDITY_SWEEP');

  const oiFalling=(oi12!=null&&oi12<0)||(oi4!=null&&oi4<0);
  const takerFlip=(latestTaker!=null&&latestTaker>=1.2)||(taker6!=null&&taker6>=1.05);
  if(oversold&&oiFalling&&takerFlip&&downside)tags.push('SEI_DELEVERAGING_REVERSAL');
  return tags;
}
function dnaPrimary(tags=[]){
  const priority=['ABSORPTION_LIQUIDITY_SWEEP','SEI_DELEVERAGING_REVERSAL','ZETA_FLOW_COMPRESSION','PHA_SHORT_COVER_ACCEL','PTB_LEVERAGE_IGNITION','UAI_TECHNICAL_STEP_IGNITION'];
  return priority.find(x=>tags.includes(x))||null;
}
function dnaStage(tags=[]){
  if(tags.includes('ABSORPTION_LIQUIDITY_SWEEP'))return'ABSORPTION / LIQUIDITY-SWEEP PRE-SURGE';
  if(tags.includes('SEI_DELEVERAGING_REVERSAL'))return'DELEVERAGING REVERSAL PRE-SURGE';
  if(tags.includes('ZETA_FLOW_COMPRESSION'))return'FLOW-LED PRE-SURGE';
  if(tags.includes('PHA_SHORT_COVER_ACCEL'))return'SHORT-COVER ACCELERATION';
  if(tags.includes('PTB_LEVERAGE_IGNITION'))return'LEVERAGE IGNITION';
  if(tags.includes('UAI_TECHNICAL_STEP_IGNITION'))return'TECHNICAL STEP IGNITION';
  return null;
}
function buildEvidenceFusion(input={},dnaTags=[]){
  const bookScore=finite(input.bookScore),smartScore=finite(input.smartMoneyScore),sampleScore=finite(input.sampleDnaScore);
  const p1=finite(input.price1hPct),p24=finite(input.price24hPct),oi4=finite(input.oi4hPct),rv1=finite(input.rvol1h),rv15=finite(input.rvol15m),rv5=finite(input.rvol5m);
  const taker=(Array.isArray(input.taker1h)?input.taker1h:[]).map(finite).filter(Number.isFinite),takerAvg=avg(taker.slice(-6));
  const bookBull=String(input.bookBias||'')==='상승',bookBear=String(input.bookBias||'')==='하락',bookHtf=String(input.bookHtfAligned||'');
  const smartBull=String(input.smartMoneyBias||'')==='상승',smartBear=String(input.smartMoneyBias||'')==='하락';
  const bookStrong=bookBull&&bookScore!=null&&bookScore>=62&&(bookHtf==='상승'||['확인','확인대기'].includes(String(input.bookState||'')));
  const smartStrong=smartBull&&smartScore!=null&&smartScore>=60&&(String(input.smcBias||'')==='상승'||String(input.ictBias||'')==='상승'||Boolean(input.smartMoneyAligned));
  const dnaStrong=(Array.isArray(dnaTags)&&dnaTags.length>0)||(sampleScore!=null&&sampleScore>=58);
  const derivativesStrong=(oi4!=null&&oi4>0)||(takerAvg!=null&&takerAvg>=1.05);
  const volumeStrong=(rv1!=null&&rv1>=1.25)||(rv15!=null&&rv15>=1.5)||(rv5!=null&&rv5>=1.8);
  const priceEarly=(p1==null||Math.abs(p1)<=3.5)&&(p24==null||p24<12);
  const hardRisk=bookBear||smartBear||String(input.ictState||'')==='invalidated'||Boolean(input.distributionRisk);
  let score=0;const reasons=[],counter=[];
  if(bookStrong){score+=25;reasons.push(`책 합성 ${Math.round(bookScore)}점 · HTF ${bookHtf}`)}else if(bookScore!=null){score+=Math.min(14,bookScore*.18);counter.push(`책 합성 ${Math.round(bookScore)}점 · ${input.bookBias||'중립'}`)}
  if(smartStrong){score+=25;reasons.push(`SMC/ICT ${Math.round(smartScore)}점 · 상승 정렬`)}else if(smartScore!=null){score+=Math.min(12,smartScore*.15);counter.push(`SMC/ICT ${Math.round(smartScore)}점 · ${input.smartMoneyBias||'중립'}`)}
  if(dnaStrong){score+=20;reasons.push(dnaTags.length?`급등 DNA ${dnaTags.join(', ')}`:`샘플 DNA ${Math.round(sampleScore)}점`)}else counter.push('급등 DNA 독립 확인 부족');
  if(derivativesStrong){score+=15;reasons.push(`파생 확인 · OI4H ${oi4==null?'-':oi4.toFixed(2)}% · taker ${takerAvg==null?'-':takerAvg.toFixed(2)}`)}else counter.push('OI/taker 확인 부족');
  if(volumeStrong){score+=10;reasons.push(`거래량 선행 · 1H ${rv1==null?'-':rv1.toFixed(2)}x · 15m ${rv15==null?'-':rv15.toFixed(2)}x`)}else counter.push('거래량 선행 확인 부족');
  if(priceEarly){score+=5}else counter.push('가격이 이미 확장된 구간');
  if(hardRisk){score=Math.min(score,49);counter.push(bookBear?'책 합성 하락 반증':smartBear?'SMC/ICT 하락 반증':String(input.ictState||'')==='invalidated'?'ICT 시퀀스 무효화':'분배 위험')}
  score=Math.round(Math.max(0,Math.min(100,score)));
  const eligible=Boolean(!hardRisk&&priceEarly&&bookStrong&&smartStrong&&dnaStrong&&derivativesStrong&&volumeStrong);
  return{version:'BOOK_SMC_ICT_FUSION_v1',score,eligible,watch:!eligible&&score>=60,bookStrong,smartStrong,dnaStrong,derivativesStrong,volumeStrong,priceEarly,reasons:reasons.slice(0,6),counterEvidence:counter.slice(0,6),disclaimer:'통합 점수는 승률이 아니라 책·급등 DNA·OI/taker·거래량·SMC/ICT 근거 완성도'};
}
function evaluate(input={}){
  const missing=[];
  if(finite(input.oi4hPct)==null)missing.push('oi4hPct');
  if(!Array.isArray(input.taker1h)||!input.taker1h.map(finite).some(Number.isFinite))missing.push('trueTaker1h');
  if(finite(input.fundingRate)==null)missing.push('fundingRate');
  const rawType=classifyType(input),direction=buildDirection({...input,type:rawType}),stage=classifyStage(input,rawType),subtype=sampleSubtype(input),incomplete=missing.length>0;
  const dnaTags=detectDnaTags(input),primaryDna=dnaPrimary(dnaTags),parallelStage=dnaStage(dnaTags),fusion=buildEvidenceFusion(input,dnaTags);
  return{version:'v2',paramSet:PARAM_SET,type:incomplete?'미완성':rawType,rawType,stage,stageLabel:stageLabel(stage),direction:incomplete?'none':direction,
    deadBand:trueTakerDirection(last(input.taker1h||[]))==='none',sampleSubtype:subtype,dnaTags,dnaPrimary:primaryDna,dnaStage:parallelStage,absorptionPresurge:dnaTags.includes('ABSORPTION_LIQUIDITY_SWEEP'),fusion,dataComplete:!incomplete,missing,
    oiBuild:finite(input.oi4hPct)!=null&&finite(input.oi4hPct)>PARAMS.OI_BUILD_4H_PCT,takerLatest:finite(last(input.taker1h||[])),sources:{oi:'Binance USDT Futures',taker:'Binance true taker buy/sell volume',funding:'Binance mark/funding',crossOi:input.crossOiSource||'N/A'},
    takerImproveCount3:count((input.taker1h||[]).slice(-3).map(finite),v=>Number.isFinite(v)&&v>PARAMS.TAKER_IMPROVE),
    takerStrongCount3:count((input.taker1h||[]).slice(-3).map(finite),v=>Number.isFinite(v)&&v>=PARAMS.TAKER_STRONG)};
}
function csvRow(input={},v2={},previous=null){
  const transition=previous&&previous.stage_label?previous.stage_label+'→'+v2.stageLabel:'unknown';
  const changed=Boolean(previous&&previous.stage_label&&previous.stage_label!==v2.stageLabel);
  return{symbol:String(input.symbol||'').toUpperCase(),timestamp:input.timestamp||Date.now(),price_close:finite(input.priceClose),price_change_1h_pct:finite(input.price1hPct),price_change_24h_pct:finite(input.price24hPct),
    atr_1h:finite(input.atr1h),oi_4h_change_pct:finite(input.oi4hPct),oi_8h_change_pct:finite(input.oi8hPct),taker_ratio:v2.takerLatest,funding_rate:finite(input.fundingRate),range_1d_pct:finite(input.range1dPct),
    book_score:finite(input.bookScore),book_bias:String(input.bookBias||''),smart_money_score:finite(input.smartMoneyScore),smart_money_bias:String(input.smartMoneyBias||''),fusion_score:finite(v2.fusion?.score),fusion_eligible:Boolean(v2.fusion?.eligible),
    stage_label:v2.stageLabel,stage_transition:transition,direction:v2.direction,signal_close:finite(input.priceClose),next_open:null,ret_24h_pct:null,ret_72h_pct:null,mae_72h_pct:null,is_transition_event:changed,param_set:PARAM_SET};
}
module.exports={PARAM_SET,PARAMS,trueTakerDirection,buildDirection,classifyType,classifyStage,sampleSubtype,detectDnaTags,dnaPrimary,dnaStage,buildEvidenceFusion,evaluate,csvRow};
