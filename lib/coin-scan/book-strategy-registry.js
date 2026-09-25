'use strict';

const VERSION='BOOK_STRATEGY_REGISTRY_v1';

const SOURCES=Object.freeze({
  COMPLETE_CHART_MANUAL:'주식 차트 기법 종합 매매 매뉴얼',
  PRO_PLAYBOOK:'전문 트레이딩 플레이북',
  WYCKOFF_CASES:'와이코프 매집·분배와 유동성 스윕 사례 연구',
  SIMPLE_BOOK:'Simple Trading Book',
  FOREX_BOOK:'All you should know about Forex p.1~406',
  TECHNICAL_CHART:'기술적 차트 분석',
  ROOKIE_BOOK:'코린이 입문서',
  DANTE:'단테 규칙형 엔진'
});

const MODES=Object.freeze({
  RANK:'rank',
  EVIDENCE:'evidence',
  RISK:'risk',
  CONTEXT:'context',
  DATA_REQUIRED:'data-required',
  NOT_APPLICABLE:'not-applicable'
});

const TECHNIQUES=Object.freeze([
  {id:'MARKET_STRUCTURE',label:'가격 구조 HH/HL/LH/LL · BOS/전환',category:'가격 구조',mode:MODES.RANK,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.PRO_PLAYBOOK]},
  {id:'SUPPORT_RESISTANCE',label:'지지·저항 · 역할 전환',category:'가격 구조',mode:MODES.RANK,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.SIMPLE_BOOK,SOURCES.FOREX_BOOK]},
  {id:'TRENDLINE_RETEST',label:'추세선 돌파·리테스트',category:'추세',mode:MODES.RANK,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.PRO_PLAYBOOK,SOURCES.ROOKIE_BOOK]},
  {id:'CHANNEL',label:'평행 채널 · 채널 돌파',category:'추세',mode:MODES.EVIDENCE,sources:[SOURCES.COMPLETE_CHART_MANUAL]},
  {id:'MA_STRUCTURE',label:'SMA/EMA 배열·기울기·눌림·재회복',category:'이평선',mode:MODES.RANK,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.PRO_PLAYBOOK,SOURCES.TECHNICAL_CHART,SOURCES.DANTE]},
  {id:'GOLDEN_DEAD_CROSS',label:'골든/데드크로스 + 구조/거래량 확인',category:'이평선',mode:MODES.EVIDENCE,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.FOREX_BOOK]},
  {id:'VOLUME_PRICE',label:'가격·거래량 / RVOL / 조정 거래량 감소',category:'거래량',mode:MODES.RANK,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.PRO_PLAYBOOK,SOURCES.TECHNICAL_CHART]},
  {id:'OBV',label:'OBV 방향·가격 괴리',category:'수급',mode:MODES.EVIDENCE,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.FOREX_BOOK]},
  {id:'AD_LINE',label:'A/D Line',category:'수급',mode:MODES.EVIDENCE,sources:[SOURCES.COMPLETE_CHART_MANUAL]},
  {id:'VWAP',label:'VWAP 유지·회복·저항',category:'수급',mode:MODES.EVIDENCE,sources:[SOURCES.COMPLETE_CHART_MANUAL]},
  {id:'CVD',label:'CVD / 매수·매도 주도 체결',category:'수급',mode:MODES.DATA_REQUIRED,sources:[SOURCES.COMPLETE_CHART_MANUAL],requires:['true_trade_direction']},
  {id:'ATR',label:'ATR 변동성·손절·목표·포지션 거리',category:'변동성',mode:MODES.RISK,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.PRO_PLAYBOOK]},
  {id:'BOLLINGER',label:'볼린저 밴드 수축·확장',category:'변동성',mode:MODES.EVIDENCE,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.FOREX_BOOK],rankingWeight:0},
  {id:'KELTNER',label:'켈트너 채널 · 변동성 돌파',category:'변동성',mode:MODES.EVIDENCE,sources:[SOURCES.COMPLETE_CHART_MANUAL],rankingWeight:0},
  {id:'RSI',label:'RSI',category:'모멘텀',mode:MODES.EVIDENCE,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.FOREX_BOOK]},
  {id:'MACD',label:'MACD',category:'모멘텀',mode:MODES.EVIDENCE,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.FOREX_BOOK]},
  {id:'STOCHASTIC',label:'Stochastic / Stoch RSI',category:'모멘텀',mode:MODES.EVIDENCE,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.FOREX_BOOK]},
  {id:'CCI',label:'CCI',category:'모멘텀',mode:MODES.EVIDENCE,sources:[SOURCES.COMPLETE_CHART_MANUAL]},
  {id:'ADX',label:'ADX 추세 강도',category:'추세',mode:MODES.EVIDENCE,sources:[SOURCES.COMPLETE_CHART_MANUAL]},
  {id:'CANDLESTICKS',label:'망치·핀바·장악·도지·별형·삼병 등',category:'캔들',mode:MODES.RANK,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.PRO_PLAYBOOK,SOURCES.SIMPLE_BOOK,SOURCES.FOREX_BOOK]},
  {id:'CLASSIC_PATTERNS',label:'더블/트리플 · H&S · 쐐기 · 플래그 · 페넌트 · 다이아몬드 · 컵앤핸들',category:'차트 패턴',mode:MODES.RANK,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.SIMPLE_BOOK,SOURCES.FOREX_BOOK]},
  {id:'FIBONACCI',label:'Fib 38.2/50/61.8 되돌림 · 1.618/2/2.618 확장',category:'피보나치',mode:MODES.EVIDENCE,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.PRO_PLAYBOOK,SOURCES.TECHNICAL_CHART,SOURCES.ROOKIE_BOOK,SOURCES.FOREX_BOOK]},
  {id:'ELLIOTT',label:'엘리어트 파동 시나리오 · 무효화 우선',category:'파동',mode:MODES.EVIDENCE,sources:[SOURCES.COMPLETE_CHART_MANUAL]},
  {id:'WYCKOFF_ACCUMULATION',label:'Wyckoff 매집 · Spring/Test · SOS · LPS/BU',category:'와이코프',mode:MODES.RANK,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.WYCKOFF_CASES]},
  {id:'WYCKOFF_DISTRIBUTION',label:'Wyckoff 분배 · UT/UTAD · SOW · LPSY',category:'와이코프',mode:MODES.CONTEXT,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.WYCKOFF_CASES]},
  {id:'VOLUME_PROFILE',label:'Volume Profile · POC/VAH/VAL · HVN/LVN',category:'프로파일',mode:MODES.EVIDENCE,sources:[SOURCES.COMPLETE_CHART_MANUAL]},
  {id:'LIQUIDITY_SWEEP',label:'전고/전저·EQH/EQL·박스 유동성 스윕 후 회복',category:'유동성',mode:MODES.RANK,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.PRO_PLAYBOOK,SOURCES.WYCKOFF_CASES]},
  {id:'ORDERBOOK',label:'호가 깊이·스프레드·체결 반응',category:'유동성',mode:MODES.DATA_REQUIRED,sources:[SOURCES.COMPLETE_CHART_MANUAL],requires:['orderbook']},
  {id:'GAP',label:'갭 앤 고 · 갭 메움 · 갭 반전',category:'갭',mode:MODES.NOT_APPLICABLE,sources:[SOURCES.COMPLETE_CHART_MANUAL],note:'24/7 crypto continuous candles: 기본 후보랭킹 제외'},
  {id:'OPENING_RANGE',label:'오프닝 레인지 돌파',category:'세션',mode:MODES.NOT_APPLICABLE,sources:[SOURCES.COMPLETE_CHART_MANUAL],note:'24/7 crypto: 세션 정의가 별도일 때만 사용'},
  {id:'MEAN_REVERSION',label:'평균회귀 · 가치영역 복귀',category:'전략',mode:MODES.EVIDENCE,sources:[SOURCES.COMPLETE_CHART_MANUAL]},
  {id:'TREND_FOLLOWING',label:'추세추종 · 눌림·돌파·후행손절',category:'전략',mode:MODES.RANK,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.PRO_PLAYBOOK]},
  {id:'REENTRY_SECOND_WAVE',label:'재상승·2차 파동',category:'전략',mode:MODES.RANK,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.PRO_PLAYBOOK]},
  {id:'ICHIMOKU',label:'일목균형표 · 시간론/가격론 보조',category:'일목',mode:MODES.EVIDENCE,sources:[SOURCES.FOREX_BOOK,SOURCES.TECHNICAL_CHART]},
  {id:'DANTE_RICE_BOWL',label:'단테 밥그릇',category:'단테',mode:MODES.RANK,sources:[SOURCES.DANTE]},
  {id:'DANTE_GONGGURI',label:'단테 공구리',category:'단테',mode:MODES.RANK,sources:[SOURCES.DANTE]},
  {id:'DANTE_EMA_STRIKE',label:'단테 EMA 때리기',category:'단테',mode:MODES.RANK,sources:[SOURCES.DANTE]},
  {id:'DANTE_256',label:'단테 256',category:'단테',mode:MODES.EVIDENCE,sources:[SOURCES.DANTE]},
  {id:'CORRELATION',label:'상관관계·동조/비동조',category:'시장 관계',mode:MODES.CONTEXT,sources:[SOURCES.FOREX_BOOK]},
  {id:'ECONOMIC_EVENT',label:'경제 이벤트/뉴스 컨텍스트',category:'이벤트',mode:MODES.CONTEXT,sources:[SOURCES.FOREX_BOOK]},
  {id:'POSITION_SIZING',label:'포지션 크기·1R·수수료·슬리피지',category:'리스크',mode:MODES.RISK,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.PRO_PLAYBOOK,SOURCES.FOREX_BOOK]},
  {id:'INVALIDATION',label:'무효화 가격 우선',category:'리스크',mode:MODES.RISK,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.PRO_PLAYBOOK]},
  {id:'PARTIAL_EXIT',label:'부분청산·다중 목표·후행손절',category:'리스크',mode:MODES.RISK,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.PRO_PLAYBOOK,SOURCES.FOREX_BOOK]},
  {id:'BACKTEST_RULES',label:'기계적 규칙·백테스트·복기',category:'검증',mode:MODES.CONTEXT,sources:[SOURCES.COMPLETE_CHART_MANUAL,SOURCES.PRO_PLAYBOOK,SOURCES.FOREX_BOOK]},
  {id:'FOMO_CHECK',label:'FOMO/추격 충동 체크',category:'심리',mode:MODES.CONTEXT,sources:[SOURCES.SIMPLE_BOOK,SOURCES.FOREX_BOOK]}
]);

const BY_ID=Object.freeze(Object.fromEntries(TECHNIQUES.map(x=>[x.id,x])));
function get(id){return BY_ID[String(id||'')]||null}
function byCategory(category){return TECHNIQUES.filter(x=>x.category===category)}
function activeForRanking(){return TECHNIQUES.filter(x=>x.mode===MODES.RANK)}
function summary(){const out={total:TECHNIQUES.length};for(const x of TECHNIQUES){out[x.mode]=(out[x.mode]||0)+1}return out}

module.exports={VERSION,SOURCES,MODES,TECHNIQUES,BY_ID,get,byCategory,activeForRanking,summary};
