'use strict';

const CATEGORY_ORDER=Object.freeze([
  '급등 전조 강함','급등 전조 관찰','거래량 이상징후','매수세 유입',
  '눌림·재축적','이미 급등함','약세·이탈','데이터 부족·판정 보류'
]);
const SCAN_CLASS_ORDER=Object.freeze([
  'PRE-SURGE','ACCUMULATION-PRE','META-PRE','SECTOR-ROTATION','ANOMALY',
  'POST-SURGE','DISTRIBUTION-RISK','PUMP-RISK','STALE'
]);
const SCAN_CLASS_LABELS=Object.freeze({
  'PRE-SURGE':'🔥 급등 직전',
  'ACCUMULATION-PRE':'🟢 잠복 축적',
  'META-PRE':'🟢 메타 선행',
  'SECTOR-ROTATION':'🟣 섹터 순환매',
  'ANOMALY':'🟠 이상징후',
  'POST-SURGE':'🔵 급등 완료',
  'DISTRIBUTION-RISK':'⚫ 분배 위험',
  'PUMP-RISK':'🔴 펌프 위험',
  'STALE':'⚪ 판단 보류'
});
const BLOCKED_STATES=new Set(['stale','failed','reconnecting','backfill','verifying']);
const LEVERAGED_SUFFIXES=['UP','DOWN','BULL','BEAR'];
const TRADE_BLOCKED_SCAN_CLASSES=new Set(['POST-SURGE','DISTRIBUTION-RISK','PUMP-RISK','STALE']);

function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}
function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,Number.isFinite(v)?v:0))}
function isLeveragedBase(base){const b=String(base||'').toUpperCase();return LEVERAGED_SUFFIXES.some(s=>b.endsWith(s))}
function scanClass(key,priority,reasons=[]){return{key,label:SCAN_CLASS_LABELS[key]||key,priority,reasons:reasons.filter(Boolean).slice(0,4)}}

function classifyV2(input={}){
  const state=String(input.dataState||'unknown').toLowerCase();
  const change24=finite(input.priceChange24h),change1h=finite(input.priceChange1h),change15m=finite(input.priceChange15m);
  const qv=finite(input.quoteVolume24h),v15=finite(input.volumeAcceleration15m??input.volumeAcceleration),v1h=finite(input.volumeAcceleration1h),v4h=finite(input.volumeAcceleration4h);
  const taker=finite(input.takerRatio),structure=String(input.structure||'neutral').toLowerCase();
  const momentum=input.momentumSignals&&typeof input.momentumSignals==='object'?input.momentumSignals:{};
  const meta=input.metaEvidence&&typeof input.metaEvidence==='object'?input.metaEvidence:null;
  const sample=input.samplePattern&&typeof input.samplePattern==='object'?input.samplePattern:null;
  const extended=Boolean(input.alreadySurged)||(change24!=null&&change24>=10)||(change1h!=null&&change1h>=7)||(change15m!=null&&change15m>=4);
  if(state!=='live')return scanClass('STALE',0,[state==='delayed'?'데이터가 지연되어 판단을 보류합니다.':'실시간 데이터가 부족하거나 불안정합니다.']);
  if(extended)return scanClass('POST-SURGE',42,[`이미 가격이 충분히 진행됨${change24==null?'':` · 24시간 ${change24>=0?'+':''}${change24.toFixed(1)}%`}`]);
  const thin=qv!=null&&qv<2_000_000;
  const burst=v15!=null&&v15>=3;
  const weakBasis=structure!=='bullish'&&!momentum.aligned;
  if(thin&&burst&&weakBasis&&(change15m==null||change15m>=2))return scanClass('PUMP-RISK',18,[`저유동성 거래대금 ${Math.round(qv).toLocaleString()} USDT`,`15분 거래량 ${v15.toFixed(2)}배 집중`,'구조 확인이 약해 펌프 위험으로 분류']);
  const distribution=(change24==null||change24>=-2)&&(taker!=null&&taker<=.95)&&((v15!=null&&v15<.95)||input.buyPressureFading===true);
  if(distribution)return scanClass('DISTRIBUTION-RISK',24,[`매수 체결 압력 둔화 ${taker.toFixed(2)}배`,v15==null?'거래량 둔화':`15분 거래량 ${v15.toFixed(2)}배로 둔화`]);
  const preSurge=structure==='bullish'&&Boolean(input.structureShift4h||input.preSurge?.label==='가능성 높음')&&Boolean(momentum.aligned)&&v15!=null&&v15>=3&&finite(input.volumeIncreasing5m)>=3&&taker!=null&&taker>=1.2;
  if(preSurge)return scanClass('PRE-SURGE',100,['4시간 구조 전환 확인','1시간·15분 모멘텀 정렬',`15분 거래량 ${v15.toFixed(2)}배`,`5분 거래량 ${finite(input.volumeIncreasing5m)}회 연속 증가 · 매수 체결 ${taker.toFixed(2)}배`]);
  const samplePhase=String(sample?.phase||''),sampleArchetype=String(sample?.archetype||'NEUTRAL'),sampleScore=finite(sample?.score);
  const sampleV4=sample?.preSurgeDna&&typeof sample.preSurgeDna==='object'?sample.preSurgeDna:null;
  const sampleV4Eligible=Boolean(sampleV4?.eligible),sampleControlRisk=Boolean(sample?.controlRisk),sampleEventExtreme=String(sample?.flowType?.key||'')==='EVENT_EXTREME';
  const sampleFresh=sampleScore!=null&&sampleScore>=58&&!sampleControlRisk&&!sampleEventExtreme&&(sampleArchetype!=='NEUTRAL'||sampleV4Eligible)&&(['LATENT','IGNITION-WAIT','IGNITION-EARLY'].includes(samplePhase)||sampleV4Eligible);
  if(sampleFresh){const best=Array.isArray(sample?.similarity)?sample.similarity[0]:null;return scanClass('PRE-SURGE',96,[sampleV4Eligible?sampleV4?.label:sample?.archetypeLabel,sample?.maCluster?.label,sample?.volumeMaDna?.label,sample?.flowType?.label,sample?.phaseLabel,`샘플 DNA ${sampleScore}점`,best&&Number(best.score)>=55?`과거 샘플 ${best.name} ${best.score}% 유사`:null,...(Array.isArray(sample?.reasons)?sample.reasons.slice(0,2):[])])}
  const sampleAccum=sampleScore!=null&&sampleScore>=50&&!sampleControlRisk&&!sampleEventExtreme&&['A','A+B','B'].includes(sampleArchetype)&&['LATENT','IGNITION-WAIT','OBSERVE'].includes(samplePhase);
  if(sampleAccum){const best=Array.isArray(sample?.similarity)?sample.similarity[0]:null;return scanClass('ACCUMULATION-PRE',90,[sample?.archetypeLabel,`샘플 DNA ${sampleScore}점`,best&&Number(best.score)>=55?`과거 샘플 ${best.name} ${best.score}% 유사`:null,sample?.sweep?.label||sample?.liquidity?.label])}
  const metaStrong=meta&&String(meta.strength||'').toLowerCase()==='strong'&&Number(meta.sources||0)>=1;
  if(metaStrong&&(change24==null||Math.abs(change24)<=5))return scanClass('META-PRE',84,[`강한 메타 근거 ${Number(meta.sources||0)}개 확인`,'가격은 아직 크게 확장되지 않음']);
  if(input.sectorRotation===true&&(change24==null||change24<6))return scanClass('SECTOR-ROTATION',80,['같은 섹터 선도 종목이 먼저 강해짐','해당 종목은 아직 후발 구간']);
  const accumulation=(change24==null||Math.abs(change24)<=5)&&structure!=='bearish'&&(String(input.lowTrend||'').toLowerCase()==='rising'||input.reaccumulating===true)&&input.breakout!==true&&((v4h!=null&&v4h>=1.15)||(v1h!=null&&v1h>=1.25));
  if(accumulation)return scanClass('ACCUMULATION-PRE',88,['가격이 ±5% 안쪽에서 아직 크게 확장되지 않음',`4시간 거래량 ${v4h==null?'-':v4h.toFixed(2)}배 · 1시간 ${v1h==null?'-':v1h.toFixed(2)}배`,'저점 유지·상승 또는 재축적 조건']);
  const anomaly=(v15!=null&&v15>=1.8)||(taker!=null&&(taker>=1.35||taker<=.75))||Boolean(input.largeFlowAnomaly);
  if(anomaly)return scanClass('ANOMALY',64,[v15!=null?`15분 거래량 ${v15.toFixed(2)}배`:null,taker!=null?`체결 불균형 ${taker.toFixed(2)}배`:null,'구조 확인이 충분하지 않아 이상징후로 관찰']);
  return scanClass('ANOMALY',36,['뚜렷한 급등 전조는 없지만 추가 관찰이 필요함']);
}

function filterUniverse(exchangeInfo={},tickers=[]){
  const tickerMap=new Map((Array.isArray(tickers)?tickers:[]).map(t=>[String(t.symbol||'').toUpperCase(),t]));
  return (Array.isArray(exchangeInfo.symbols)?exchangeInfo.symbols:[]).filter(s=>{
    const symbol=String(s.symbol||'').toUpperCase(),base=String(s.baseAsset||'').toUpperCase(),quote=String(s.quoteAsset||'').toUpperCase();
    return symbol&&base&&quote==='USDT'&&s.status==='TRADING'&&s.isSpotTradingAllowed!==false&&!isLeveragedBase(base)&&tickerMap.has(symbol);
  }).map(s=>({symbol:String(s.symbol).toUpperCase(),baseAsset:String(s.baseAsset).toUpperCase(),quoteAsset:'USDT',tradable:true,ticker:tickerMap.get(String(s.symbol).toUpperCase())}));
}

function fastScore(input={}){
  const change24=finite(input.priceChange24h??input.priceChangePercent),vol24=finite(input.quoteVolume24h??input.quoteVolume),accel=finite(input.volumeAcceleration),taker=finite(input.takerRatio),highDistance=finite(input.distanceFromRecentHighPct);
  let score=0;const fastReasons=[];
  if(vol24!=null){score+=Math.min(22,Math.max(0,Math.log10(Math.max(1,vol24))-4)*7);if(vol24>=1e7)fastReasons.push('24시간 거래대금 활발')}
  if(accel!=null){score+=clamp((accel-1)*28,0,34);if(accel>=1.5)fastReasons.push(`거래량 ${accel.toFixed(2)}배 가속`)}
  if(taker!=null){if(taker>=1.15){score+=Math.min(20,(taker-1)*40);fastReasons.push(`매수 체결 우위 ${taker.toFixed(2)}배`)}else if(taker<=.87)fastReasons.push(`매도 체결 우위 ${taker.toFixed(2)}배`)}
  if(change24!=null){score+=clamp(Math.abs(change24)*.8,0,18);if(Math.abs(change24)>=8)fastReasons.push(`24시간 변동 ${change24>=0?'+':''}${change24.toFixed(1)}%`)}
  if(highDistance!=null&&highDistance>=-6&&highDistance<=0){score+=6;fastReasons.push('최근 고점 부근')}
  const alreadySurged=(change24!=null&&change24>=25)||(finite(input.priceChange1h)!=null&&finite(input.priceChange1h)>=12)||(finite(input.priceChange15m)!=null&&finite(input.priceChange15m)>=7);
  const volumeAnomaly=accel!=null?accel:null;
  const buyPressure=taker!=null?taker:null;
  if(alreadySurged)score=Math.max(score,72);
  return{candidateScore:Math.round(clamp(score)),fastReasons:fastReasons.slice(0,4),alreadySurged,volumeAnomaly,buyPressure};
}

function classify(input={}){
  const state=String(input.dataState||'unknown').toLowerCase();
  const reasons=Array.isArray(input.reasons)?input.reasons.filter(Boolean).slice(0,4):[];
  if(BLOCKED_STATES.has(state)||state==='unknown')return{category:'데이터 부족·판정 보류',priority:0,reasons:reasons.length?reasons:['실시간 데이터 상태를 확인할 수 없음'],dataState:state};
  if(input.alreadySurged)return{category:'이미 급등함',priority:60,reasons:reasons.length?reasons:['최근 가격 상승폭이 급등 기준을 넘음'],dataState:state};
  const taker=finite(input.takerRatio),volume=finite(input.volumeAcceleration),change1h=finite(input.priceChange1h);
  const structure=String(input.structure||'neutral').toLowerCase();
  if(structure==='bearish'&&taker!=null&&taker<=.87)return{category:'약세·이탈',priority:45,reasons:reasons.length?reasons:['하락 구조와 매도 체결 우위가 겹침'],dataState:state};
  const preLabel=String(input.preSurge?.label||'');
  if(preLabel==='가능성 높음'){
    if(state==='delayed')return{category:'급등 전조 관찰',priority:72,reasons:reasons.length?reasons:['급등 전조 조건은 강하지만 데이터가 지연됨'],dataState:state};
    return{category:'급등 전조 강함',priority:95,reasons:reasons.length?reasons:['다중 급등 전조 조건이 동시에 확인됨'],dataState:state};
  }
  if(preLabel==='관찰')return{category:'급등 전조 관찰',priority:78,reasons:reasons.length?reasons:['일부 급등 전조 조건이 겹쳐 추가 확인이 필요함'],dataState:state};
  if(volume!=null&&volume>=1.5)return{category:'거래량 이상징후',priority:68,reasons:reasons.length?reasons:[`거래량이 기준 대비 ${volume.toFixed(2)}배 증가`],dataState:state};
  if(taker!=null&&taker>=1.15&&(change1h==null||change1h<8))return{category:'매수세 유입',priority:62,reasons:reasons.length?reasons:[`매수 체결 비율 ${taker.toFixed(2)}배`],dataState:state};
  if(structure==='bullish'&&input.pullback&&input.reaccumulating)return{category:'눌림·재축적',priority:58,reasons:reasons.length?reasons:['상승 구조 안에서 눌림 후 재축적 조건이 관찰됨'],dataState:state};
  return{category:'급등 전조 관찰',priority:25,reasons:reasons.length?reasons:['뚜렷한 강한 신호 없이 관찰 단계'],dataState:state};
}

function buildTradeSignal(input={}){
  const state=String(input.dataState||'unknown').toLowerCase();
  const category=String(input.category||'');
  const scanClassKey=String(input.scanClassKey||input.scanClass?.key||'');
  const structure=String(input.structure||'neutral').toLowerCase();
  const taker=finite(input.takerRatio),volume=finite(input.volumeAcceleration),change1h=finite(input.priceChange1h),change15m=finite(input.priceChange15m);
  const preLabel=String(input.preSurge?.label||'');
  const momentum=input.momentumSignals&&typeof input.momentumSignals==='object'?input.momentumSignals:null;
  const invalidations=[];
  if(state!=='live')invalidations.push(`데이터 상태 ${state||'unknown'}는 실시간 신호에 사용할 수 없음`);
  if(TRADE_BLOCKED_SCAN_CLASSES.has(scanClassKey)){
    if(scanClassKey==='POST-SURGE')invalidations.push('이미 급등 완료 구간이라 신규 매수 후보에서 제외');
    else if(scanClassKey==='DISTRIBUTION-RISK')invalidations.push('분배 위험 분류라 신규 매수 후보에서 제외');
    else if(scanClassKey==='PUMP-RISK')invalidations.push('펌프 위험 분류라 신규 매수 후보에서 제외');
    else invalidations.push('판단 보류 분류라 신규 매수 후보에서 제외');
  }
  if(input.alreadySurged||category==='이미 급등함')invalidations.push('이미 급등한 구간이라 신규 매수 후보에서 제외');
  if(structure==='bearish'||category==='약세·이탈')invalidations.push('상위 구조 약세·이탈 상태');
  if(taker!=null&&taker<=.87)invalidations.push(`매도 체결 우위 ${taker.toFixed(2)}배`);
  if(category==='데이터 부족·판정 보류')invalidations.push('데이터 부족으로 판정 보류');
  if(invalidations.length)return{level:'제외',confidence:0,confirmations:0,reasons:[],invalidations};

  let confidence=0,confirmations=0;const reasons=[];
  if(structure==='bullish'){confirmations++;confidence+=18;reasons.push('상위 시간봉 상승 구조')}
  if(preLabel==='가능성 높음'){confirmations++;confidence+=30;reasons.push('PRE-SURGE 강한 다중 확인')}
  else if(preLabel==='관찰'){confirmations++;confidence+=14;reasons.push('PRE-SURGE 관찰 조건')}
  if(taker!=null&&taker>=1.15){confirmations++;const strong=taker>=1.35;confidence+=strong?18:10;reasons.push(`매수 체결 우위 ${taker.toFixed(2)}배`)}
  if(volume!=null&&volume>=1.5){confirmations++;const strong=volume>=1.8;confidence+=strong?18:10;reasons.push(`거래량 가속 ${volume.toFixed(2)}배`)}
  if(change1h!=null&&change1h>=0&&change1h<8){confirmations++;confidence+=8;reasons.push(`1시간 가격 반응 ${change1h>=0?'+':''}${change1h.toFixed(2)}%로 과열 전`)}
  if(input.reaccumulating){confirmations++;confidence+=12;reasons.push('눌림 뒤 재축적 조건')}
  if(momentum?.aligned){confirmations++;confidence+=8;reasons.push('RSI·MACD·Stoch RSI·KDJ 모멘텀 정렬')}
  if(category==='급등 전조 강함')confidence+=8;
  else if(category==='매수세 유입'||category==='눌림·재축적')confidence+=5;
  confidence=Math.round(clamp(confidence));
  const strongContext=preLabel==='가능성 높음'||category==='급등 전조 강함';
  let level=strongContext&&confirmations>=4&&confidence>=80?'매수 후보':confidence>=35&&confirmations>=2?'관찰':'제외';
  if(level==='매수 후보'&&(volume==null||volume<1.4||taker==null||taker<1.1)){
    level='관찰';confidence=Math.min(confidence,74);
    const parts=[];if(volume==null||volume<1.4)parts.push(`거래량 ${volume==null?'-':volume.toFixed(2)}배`);if(taker==null||taker<1.1)parts.push(`매수 체결 ${taker==null?'-':taker.toFixed(2)}배`);
    invalidations.push(`시장 확인 부족으로 후보 강등: ${parts.join(' · ')}`);
  }
  if(level==='매수 후보'&&((change1h!=null&&change1h>=7)||(change15m!=null&&change15m>=4))){
    level='관찰';confidence=Math.min(confidence,72);
    invalidations.push(`단기 가격이 이미 확장돼 추격 진입 보류 (1H ${change1h==null?'-':change1h.toFixed(2)}% / 15m ${change15m==null?'-':change15m.toFixed(2)}%)`);
  }
  if(momentum?.overheated&&level==='매수 후보'){
    level='관찰';confidence=Math.min(confidence,74);
    const r1=finite(momentum.rsi1h),r15=finite(momentum.rsi15m);const rsiText=r1!=null||r15!=null?` (RSI 1H ${r1==null?'-':r1.toFixed(1)} / 15m ${r15==null?'-':r15.toFixed(1)})`:'';
    invalidations.push(`단기 보조지표 과열로 추격 진입 보류${rsiText}`);
  }
  if(level==='제외'&&!invalidations.length)invalidations.push('독립 확인 신호가 부족함');
  return{level,confidence,confirmations,reasons:reasons.slice(0,6),invalidations};
}

function beginnerSummary(item={}){
  const structure=String(item.structure||'neutral').toLowerCase();
  const structureText=structure==='bullish'?'큰 흐름은 상승 쪽입니다.':structure==='bearish'?'큰 흐름은 하락 쪽입니다.':'큰 흐름의 방향은 아직 뚜렷하지 않습니다.';
  const reason=Array.isArray(item.reasons)&&item.reasons[0]?String(item.reasons[0]):'추가 확인할 근거가 아직 부족합니다.';
  const state=String(item.dataState||'unknown').toLowerCase();
  const dataText=state==='live'?'데이터는 정상입니다.':state==='delayed'?'데이터가 지연되어 보수적으로 관찰합니다.':'데이터 상태가 불안정해 판정을 보류합니다.';
  const classification=item.scanClass?.label||item.category;
  const category=classification?`현재 분류는 ${classification}입니다.`:'';
  return [structureText,category,reason.endsWith('.')?reason:`${reason}.`,dataText].filter(Boolean).join(' ');
}

module.exports={CATEGORY_ORDER,SCAN_CLASS_ORDER,SCAN_CLASS_LABELS,BLOCKED_STATES,filterUniverse,fastScore,classify,classifyV2,buildTradeSignal,beginnerSummary,isLeveragedBase};
