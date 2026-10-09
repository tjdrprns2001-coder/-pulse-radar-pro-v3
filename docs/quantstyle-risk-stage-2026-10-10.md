# QuantStats 방식 성과·위험 평가 — 2026-10-10

## 이번 구현의 실제 범위

기존 `lib/research-backtest-v2/performance-report.js`와 `portfolio-simulator.js`는 그대로 유지했다. 기존 리포트의 샤프지수는 거래당 수익률을 고정 연율화 인자로 환산해 불규칙한 거래 시간·겹치는 포지션에 대한 편향 위험이 있다. 이를 기존 화면에서 일괄 변경하지 않고 **연구 전용 독립 모듈**을 구축했다. Python QuantStats 원본 패키지를 직접 설치·실행한 것은 아니다.

### 추가 코드

- [`lib/research-backtest-v2/quantstyle-performance.js`](../lib/research-backtest-v2/quantstyle-performance.js): 수수료·슬리피지·스프레드 비용과 다음 캔들 시가 진입/7일 후 종가 종료의 가상 거래 재생. 펀딩 `UNAVAILABLE`, 실제 체결 `false`. 전 자산 중 동시 보유 1개라는 명시적 시뮬레이션 제약을 둬 겹친 포지션의 순차 복리 중복 계산을 방지.
- 같은 코드의 `riskFromDailyEquity`: **일별 종가 평가곡선**에서 최대 낙폭, 총수익률, CAGR, 일별 샤프지수, 소르티노지수, 연율화 변동성을 계산. 30일 미만 표본의 변동성·샤프/소르티노는 `null`; 입력된 일별 시계열이 비연속적이면 `UNAVAILABLE`.
- [`scripts/run-bowl-walk-forward.js`](../scripts/run-bowl-walk-forward.js): 기존 직접 Binance 선물 OHLCV 연구 CLI에 선택적 `--risk` 옵션 추가. *train*, *validation* 두 구간의 거래비용 가정만 평가하고 최종 *test* 위험 평가는 `LOCKED_BY_DESIGN`. 데이터 누락이나 결과 이벤트 내보내기 일부 누락 시 성공·0신호로 취급하지 않고 차단.
- [`scripts/verify-quantstyle-performance.js`](../scripts/verify-quantstyle-performance.js): 다음봉 진입, 7일 이후 청산, 비용 차감, 펀딩 미확인, 동시 보유 충돌 제거, 미확정·미래봉 배제, 누락 시계열, 일별 변동성·최대 낙폭 회귀 테스트.
- [`scripts/verify-quantstyle-integration.js`](../scripts/verify-quantstyle-integration.js): CLI 위험 옵션, 데이터 공백, 잠긴 테스트 분할 보호.
- [`.github/workflows/quantstyle-risk-validation.yml`](../.github/workflows/quantstyle-risk-validation.yml): GitHub 자동 테스트.

## 사용

```bash
npm run test:quantstyle-performance
node scripts/run-bowl-walk-forward.js BTCUSDT ETHUSDT SOLUSDT --tf=4h --limit=1200 --risk
```

가정은 코드 기본값 기준 *한쪽* 수수료 5bps, 슬리피지 5bps, 스프레드 2bps (왕복 고려). 자산의 실제 VIP 거래수수료, 펀딩, 슬리피지는 종목/시간대에 따라 달라지며 계정 수수료를 조회하지 않았다. 결과 `estimatedAfterCostsExFundingPct`는 **펀딩 제외 비용차감 추정치**, 실현 순손익이나 거래 가능 수익률이 아니다.

시나리오에 전액 투자·롱·동시 1포지션·청산 전 7일 보유 가정을 사용한다. 반대 포지션이나 동시에 발생한 알트코인 후보는 내림차순 수익 기준으로 고르지 않으며 시간→심볼명 순서로 결정한다. 따라서 데이터 마이닝 결과 개선을 보장하지 않는다.

**최대낙폭/샤프지수**는 일별 평가 자산가치 곡선에서만 계산하고, 기존의 이벤트당 수익률을 일별 수익률로 간주하지 않는다. 이는 일별 평가 데이터가 결측이 없음을 전제로 한 연구 지표이며 실제 마진 유지·펀딩 손익·강제청산은 반영하지 않는다.

## 미완료 (다음 단계)

- 실제 역사적 펀딩/거래 체결·호가 스프레드 데이터를 날짜별로 수집하고 출처/미조회/N/A를 보존하는 실효 비용 모형
- 다양한 코인 및 상장폐지 포함 과거 거래가능 종목 집합
- 원본 QuantStats Python 패키지의 독립 지표 교차검증 (오늘의 자체 모듈이 원본 코드를 옮겨 심은 것은 아님)
- 기존 차트/리스크 대시보드에 연구 결과를 사용자용 읽기 전용 형태로 연결
- 플랫폼 운영 배포, 모바일 실화면 QA

현재는 기존 Astra 신호 분류, 진입 추천, 자동매매, OI 산출 규칙을 변경하지 않았다.
