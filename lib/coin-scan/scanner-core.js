'use strict';
const CATEGORY_ORDER=['급등 전조 강함','급등 전조 관찰','거래량 이상징후','매수세 유입','눌림·재축적','이미 급등함','약세·이탈','데이터 부족·판정 보류'];
const BLOCKED=new Set(['stale','failed','reconnecting','backfill','verifying','unknown']);
const n=v=>{if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null};
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
function leveragedSymbol(symbol=''){return /(?:UP|DOWN|BULL|BEAR)USDT$/i.test(String(symbol))}
function filterUniverse(exchangeInfo={},tickers=[]){
  const tm=new Map((Array.isArray(tickers)?tickers:[]).map(t=>[t.symbol,t]));
  return (exchangeInfo.symbols||[]).filter(s=>s&&s.status==='TRADING'&&s.quoteAsset==='USDT'&&s.isSpotTradingAllowed!==false&&!leveragedSymbol(s.symbol)&&tm.has(s.symbol)).map(s=>({symbol:s.symbol,baseAsset:s.baseAsset,quoteAsset:s.quoteAsset,tradable:true,ticker:tm.get(s.symbol)}));
}
function fastScore(input={}){
  const change=n(input.priceChange24h),vol=n(input.volumeAcceleration),nearHigh=n(input.priceFromHighPct),taker=n(input.takerRatio),volatility=n(input.volatility);
  const alreadySurged=(change!=null&&change>=18)||(nearHigh!=null&&nearHigh>=-2&&change!=null&&change>=10);
  const volumeAnomaly=vol!=null&&vol>=1.8;
  const buyPressure=taker!=null&&taker>=1.15;
  let score=0;const fastReasons=[];
  if(volumeAnomaly){score+=32;fastReasons.push(`거래량 가속 ${vol.toFixed(2)}배`)}
  if(buyPressure){score+=22;fastReasons.push(`매수 체결 우위 ${taker.toFixed(2)}배`)}
  if(change!=null&&change>=0&&change<=8){score+=16;fastReasons.push('가격이 과열 전 구간')}
  if(nearHigh!=null&&nearHigh<=-3&&nearHigh>=-15){score+=12;fastReasons.push('최근 고점 아래 압축 구간')}
  if(volatility!=null&&volatility>=1&&volatility<=5){score+=8;fastReasons.push('변동성 확장 초기')}
  if(alreadySurged){score=Math.max(score,25);fastReasons.push('이미 단기 급등 조건')}
  return{candidateScore:clamp(Math.round(score)),fastReasons,alreadySurged,volumeAnomaly,buyPressure};
}
function classify(input={}){
  const dataState=String(input.dataState||'unknown').toLowerCase();
  const reasons=Array.isArray(input.reasons)?input.reasons.filter(Boolean).slice(0,6):[];
  let category='급등 전조 관찰',priority=35;
  if(BLOCKED.has(dataState)){category='데이터 부족·판정 보류';priority=0;reasons.unshift('실시간 판정에 사용할 수 없는 데이터 상태')}
  else if(input.alreadySurged){category='이미 급등함';priority=55;reasons.unshift('최근 단기 급등·과열 조건 충족')}
  else if(input.structure==='bearish'&&n(input.takerRatio)!=null&&n(input.takerRatio)<=0.87){category='약세·이탈';priority=45;reasons.unshift('구조 약세와 매도 우위 동시 확인')}
  else if(input.preSurge?.label==='가능성 높음'){category=dataState==='delayed'?'급등 전조 관찰':'급등 전조 강함';priority=dataState==='delayed'?72:92;reasons.unshift(dataState==='delayed'?'지연 데이터라 강한 신호 승격 제한':'PRE-SURGE 다중 확인')}
  else if(input.preSurge?.label==='관찰'){category='급등 전조 관찰';priority=72;reasons.unshift('PRE-SURGE 관찰 조건')}
  else if(n(input.volumeAcceleration)!=null&&n(input.volumeAcceleration)>=1.8&&(n(input.takerRatio)==null||n(input.takerRatio)<1.15)){category='거래량 이상징후';priority=66;reasons.unshift('거래량 가속 대비 체결 확인 부족')}
  else if(n(input.takerRatio)!=null&&n(input.takerRatio)>=1.15&&n(input.priceChange1h)!=null&&n(input.priceChange1h)>=0){category='매수세 유입';priority=62;reasons.unshift('매수 체결 우위와 초기 가격 반응')}
  else if(input.structure==='bullish'&&input.pullback&&input.reaccumulating){category='눌림·재축적';priority=58;reasons.unshift('상승 구조 내 눌림·재축적 징후')}
  else if(n(input.volumeAcceleration)!=null&&n(input.volumeAcceleration)>=1.3){category='거래량 이상징후';priority=48;reasons.unshift('거래량이 평소보다 증가')}
  return{category,priority,reasons,dataState};
}
function beginnerSummary(item={}){
  const structure=item.structure==='bullish'?'큰 흐름은 상승 쪽':item.structure==='bearish'?'큰 흐름은 약세 쪽':'큰 흐름은 중립';
  const reason=(item.reasons&&item.reasons[0])||'추가 확인이 필요';
  const ds=item.dataState==='live'?'데이터는 정상':item.dataState==='delayed'?'데이터는 지연 상태':'데이터 상태 확인 필요';
  return `${structure}입니다. 현재 분류는 ${item.category||'관찰'}이며, ${reason}이 핵심 근거입니다. ${ds}입니다.`;
}
module.exports={CATEGORY_ORDER,filterUniverse,fastScore,classify,beginnerSummary};
