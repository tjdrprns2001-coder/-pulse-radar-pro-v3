# IGNITION 독립 검색기

## 범위
검색, 후보 정밀검사, 급등 직전 샘플과 결과 API만 포함한다. 기존 Pulse Radar 코드/데이터/배포를 가져오거나 변경하지 않았다.

## 프로젝트 구조
- app/page.tsx: 한국어 검색 화면, 단계 진행, 후보 표, 상세 TF, Sample Engine
- app/api/v1/[...path]/route.ts: REST 라우트
- lib/scanner/api.ts: HTTP 계약, CORS, 오류 응답
- lib/scanner/binance.mjs: 원본 API, 동시성, 재시도, 요청 예산, 확정봉 캐시
- lib/scanner/engine.mjs: 단계 작업 및 샘플 엔진
- lib/scanner/indicators.mjs: 수치 지표, 구조 휴리스틱, 상태, 유사도
- lib/scanner/store.mjs: 영구 작업/샘플, 캐시, 배치 잠금
- db/schema.ts / drizzle/: D1 스키마 및 마이그레이션
- tests/: 지표, 미래정보 누수, 요청 순서, SQL 저장소 검증
- scripts/live-validation.mjs: Binance 실데이터 검증

## 파이프라인
1. exchangeInfo의 TRADING + USDT + PERPETUAL 전체. 24H ticker와 serverTime을 병렬 읽음.
2. abs(priceChangePercent) <=10 및 quoteVolume >=10M 기본. 사용자 변경 가능.
3. 통과한 모든 종목 OI 조회. 5m 100개로 계약 수 4H/8H 변화 계산. 4H >1%만 통과. 16개 동시, 배치80. 시간창/신선도 부족은 N/A.
4. OI 통과 종목 1H/4H 각각 149개 봉으로 프리스캔. 심볼4개 동시. 가격/MA/OBV/RSI/MACD/압축 합치도로 순위.
5. 상위 최대30개(설정20~40) 압축. 통과 종목이 적으면 실제 개수만 반환.
6. 후보만 1W→3D→1D→12H→4H→3H→2H→1H→15m→5m 정밀 분석. 후보3개, 각 TF4개 동시. 결과 순서는 고정. 3H는 UTC 정렬 연속1H3개를 합성. 1H1499개, 나머지499개를 요청하며 미완성봉 제외.
7. taker endpoint와 동일 시간창 캔들 buy/(total-buy) 대조, 확정 funding, 동일심볼 현물1H 가격/거래대금/RVOL/RSI 대조. 1000배수 상품은 임의 현물 매핑하지 않음.

## 계산 규칙
RSI14 Wilder, MACD12/26/9 SMA시드 EMA, StochRSI14/14/3/3, KDJ9/3/3, OBV, RVOL 직전20봉 평균 제외현재, ATR14. SMA5/10/20/60/120, EMA5/20/60/92/112/224/448. EMA448은 448개 이하 N/A, 448~895개는 최소워밍업 표시. 긴 EMA의 초기값 민감도가 남는다.
BOS/CHoCH는 좌우3봉 확정 피벗 돌파, MSS는 CHoCH+몸통>=0.8ATR. FVG 최근100봉의 미완전충족 3봉 갭, OB는 현재 구조 돌파 직전15봉 내 반대색 캔들. BSL/SSL은 최근 확정 피벗 레벨, sweep는 이탈 후 현재 종가 회복/거절. RSI/MACD/OBV 다이버전스는 최근 두 확정 피벗 대조.
장기추세선은 20봉 이상 간격의 하락 고점2개, 리테스트 허용0.25ATR. 밥그릇은224봉 하락/축적/회복 휴리스틱이며 재량적 원기법과 동등하지 않다. OB와 sweep는 마지막 확정봉 이벤트를 판정하며 과거 모든 OB를 추적하는 엔진은 아니다.
상태: 점화전/점화대기/점화초기/리테스트/재축적/이미진행/과열/제외. 점화초기는 분봉RVOL>=3, taker>1.2, 1H MA20위. 0.8~1.2는 중립. 과열/하락구조를 우선 적용. 점수와 유사도는 수익 확률이 아니다.

## Sample Engine
24H +10% 이상 및 최소 거래대금 통과 종목 중 상위12개. 최근30개1H 봉에서 1H+2% 돌파 및 후속6H 최대+10% 이벤트 탐색(후속6봉 완성 필수). 중첩12시간 제외, 종목당최대2개. 돌파 직전 확정봉만 특징 계산. 돌파 이후 데이터는 outcome으로 분리. 당시OI 가능시만 포함. RSI/RVOL/압축/ATR이격/OBV/MACD/OI 정규화 벡터, 공통5개이상 RMS 거리 유사도. 다른 종목의 과거샘플만 상위3개 대조. 양성샘플만 수집하므로 선택편향이 있고 예측성능/승률로 해석하면 안 된다. 새 샘플은 다음 검색부터 자동 비교.

## 실행/내구성
영구 작업은 D1에 저장. 각 POST step이 제한된 배치를 실행하고 체크포인트를 저장. 브라우저는 완료까지 step을 순차 호출. 새로고침/창닫기는 현재배치 이후 중단되며 이어하기 가능. 서버 상주 백그라운드 워커나 시간 예약은 포함하지 않는다. step은300초 lease로 중복실행 방지, 새작업30초 게이트. GET은 읽기전용.

## 캐시와 요청 예산
exchangeInfo는 필요한 필드만 저장(1시간). ticker30초, OI60초/5m버킷, 확정봉은 TF버킷 공유. 동일 진행작업 중복통합, 요청 timeout20초+1회재시도. 429/418은 Retry-After 전체 공유. 원자적 SQL 예산: 선물1800weight/min, 통계900/5min, funding450/5min, 현물4000weight/min. 외부 서비스가 같은 IP를 쓰면 실제 제한이 더 빨리 올 수 있어 응답제한도 존중한다. TTL은 반환시각/확정봉시각과 함께 해석한다.

## 병목
주요 병목은 Binance 네트워크 왕복, 종목별 OI/taker 응답, 제한/재시도, 장기간 EMA용 캔들 수집. 계산만으로 속도를 보장하지 않는다. 단계별 timings/API requests/cache hits/errors를 반환한다. 전종목×10TF 미실행. 미수집데이터는 추정하지 않는다.
