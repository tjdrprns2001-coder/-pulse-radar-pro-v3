# QuantStats 원본 성과지표 교차검증 — 2026-10-10

## 결론 및 검증 범위

원본 오픈소스 [QuantStats](https://github.com/ranaroussi/quantstats)의 **공식 릴리스 `0.0.86`** (Apache-2.0)를 실제 Python 패키지로 설치해, Pulse Radar Pro 연구 모듈의 **일별 평가자산곡선(daily mark-to-market equity)** 성과지표와 나란히 비교한다. 원본 코드 자체를 Node.js에 복사하지 않고 참조 계산기로만 사용한다.

**대조하는 6개 지표:**
- `totalReturnPct` ↔ `quantstats.stats.comp`
- `cagrPct` ↔ `quantstats.stats.cagr`
- `annualizedVolPct` ↔ `quantstats.stats.volatility`
- `sharpe` ↔ `quantstats.stats.sharpe`
- `sortino` ↔ `quantstats.stats.sortino`
- `maxDrawdownPct` ↔ `quantstats.stats.max_drawdown`

**기준 정의:** 연간 365.25일, 일별 **복리** 수익률, 샤프/연변동성 표본 표준편차(`ddof=1`), 소르티노 분모는 전체 일수로 나눈 하방 2차 모멘트. 연간 무위험 수익률 0% 및 4.25% 두 가지 기준을 비교한다. CAGR은 무위험 수익률을 차감하지 않는다.

기존 `riskFromDailyEquity()`에서 연간 무위험 수익률을 `rf/365.25`로 단순 나누던 계산을 QuantStats 원본과 같은 `(1+rf)^(1/365.25)-1`로 수정했다. 이 변경은 **무위험 수익률이 0%일 때의 계산 결과에는 영향을 주지 않는다.**

## 검증 입력

1. 120일간 자산곡선 유지(변동성 0: 샤프/소르티노 정의 불가)
2. 180일간 완만한 상승 추세와 소폭 변동
3. 260일간 등락이 반복되는 구간
4. 260일간 급락과 일부 회복을 포함하는 구간
5. 150일간 처음에 큰 손실이 발생하는 구간
6. 150일간 상승만 나타나는 구간(소르티노 분모 0)

6가지 × 무위험 수익률 2가지 × 성과지표 6개 = **72개 계산 결과**를 비교한다. Python은 실제 `quantstats==0.0.86`, Node.js는 저장소의 `lib/research-backtest-v2/quantstyle-performance.js`를 사용한다. 허용 절댓값 오차는 1e-6이며, 정의 불가(`null`) 여부도 서로 일치해야 한다.

시간축은 하루 24시간으로 연속된 UTC 일별 평가로 통일한다. 결측일 시계열은 `UNAVAILABLE`, 30일 미만은 `INSUFFICIENT_DAILY_MARKS` 등으로 별도 처리하며 샤프/소르티노를 만들어내지 않는다.

## 작업 파일

- `scripts/quantstats-parity-reference.py` — 순정 QuantStats 지표를 실제 실행하는 Python 오라클
- `scripts/verify-quantstats-parity.js` — deterministic fixture 생성, Node/Python 실행 및 비교
- `.github/workflows/quantstats-source-parity.yml` — QuantStats 0.0.86 설치, 위 72개 교차검증
- `lib/research-backtest-v2/quantstyle-performance.js` — 기존 일별 손익/위험 계산, 비제로 무위험 수익률 복리 환산 수정

GitHub Actions 결과:
- 최초 0% 무위험 수익률 36개 지표 검증 [통과](https://github.com/tjdrprns2001-coder/-pulse-radar-pro-v3/actions/runs/37997985071).
- 추가 4.25% 무위험 수익률 포함 72개 검증: [Actions 작업 페이지](https://github.com/tjdrprns2001-coder/-pulse-radar-pro-v3/actions/runs/37998127453)에서 최종 상태 확인.

## 적용 한계

이번 교차검증은 **성과지표 계산 공식의 수치 일치**를 확인하는 단계다. 72개 항목은 72개 독립 거래나 72개 실전 시장 상황이 아니다. 아래 사항은 별도 검증이 필요하다.

- 실제 과거 거래의 수수료·체결품질·펀딩·강제청산까지 포함한 **실현 순손익**
- 역사적 상장/상장폐지 종목을 포함한 전시장 생존편향 통제
- BTC·ETH 및 알트코인 실데이터의 일별 평가곡선 원본 재현
- 거래소별 자금조달 비용·계좌 리스크·마진·동시 다중 포지션
- 운영 사이트 배포 및 모바일 화면 검증

기존 Astra 실시간 후보 선정/스캐너 순위는 이번 단계에서 바꾸지 않았다. QuantStats 원본은 GitHub Actions의 **검증 환경**에만 설치했다.
