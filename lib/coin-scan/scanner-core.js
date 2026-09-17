'use strict';

const CATEGORY_ORDER=Object.freeze([
  '급등 전조 강함','급등 전조 관찰','거래량 이상징후','매수세 유입',
  '눌림·재축적','이미 급등함','약세·이탈','데이터 부족·판정 보류'
]);
const BLOCKED_STATES=new Set(['stale','failed','reconnecting','backfill','verifying']);
const LEVERAGED_SUFFIXES=['UP','DOWN','BULL','BEAR'];

function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}
function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,Number.isFinite(v)?v:0))}
function isLeveragedBase(base){const b=String(base||'').toUpperCase();return LEVERAGED_SUFFIXES.some(s=>b.endsWith(s))}

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

function beginnerSummary(item={}){
  const structure=String(item.structure||'neutral').toLowerCase();
  const structureText=structure==='bullish'?'큰 흐름은 상승 쪽입니다.':structure==='bearish'?'큰 흐름은 하락 쪽입니다.':'큰 흐름의 방향은 아직 뚜렷하지 않습니다.';
  const reason=Array.isArray(item.reasons)&&item.reasons[0]?String(item.reasons[0]):'추가 확인할 근거가 아직 부족합니다.';
  const state=String(item.dataState||'unknown').toLowerCase();
  const dataText=state==='live'?'데이터는 정상입니다.':state==='delayed'?'데이터가 지연되어 보수적으로 관찰합니다.':'데이터 상태가 불안정해 판정을 보류합니다.';
  const category=item.category?`현재 분류는 ${item.category}입니다.`:'';
  return [structureText,category,reason.endsWith('.')?reason:`${reason}.`,dataText].filter(Boolean).join(' ');
}

module.exports={CATEGORY_ORDER,BLOCKED_STATES,filterUniverse,fastScore,classify,beginnerSummary,isLeveragedBase};
