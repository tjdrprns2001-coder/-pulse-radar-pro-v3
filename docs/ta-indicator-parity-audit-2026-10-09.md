# `bukosabino/ta` 독립 지표 교차검증 — 2026-10-09

기준 소스: [bukosabino/ta](https://github.com/bukosabino/ta), MIT. GitHub Actions 검증은 Python 3.11, `ta==0.11.0`, `pandas==2.2.3`, `numpy==2.1.3`를 사용한다.

운영 코드의 SMA/EMA/RSI/MACD/ATR 계산을 무턱대고 갈아엎지 않기 위해 별도 *연구 참고 구현*을 만들고 원본 `ta` 패키지의 계산 결과와 비교했다.

## 자동 검증 결과

[검증 실행](https://github.com/tjdrprns2001-coder/-pulse-radar-pro-v3/actions/runs/37947398173): **SUCCESS**.

550개의 확정 OHLC 합성 봉에 대하여:
- SMA112 최대 절댓값 오차 약 2.0e-13
- EMA20 최대 절댓값 오차 약 5.7e-14
- RSI14 최대 절댓값 오차 약 1.5e-14
- MACD line/signal/hist 오차 약 7.2e-14 이하
- ATR14 오차 0

※ 위 수치는 `ta-parity.js`의 **새로운 교차검증 참조 계산**과 실제 Python `ta` 패키지를 비교한 결과다. 기존 Pulse Radar Pro 전체 지표가 동일하다는 뜻이 아니다. 합성 봉 한 종류에 대한 정확도 테스트이며 실데이터 다종목·결측 테스트를 대신하지 않는다.

## 기존 운영 ATR 차이

기존 `ui/auto-chart/analysis/math.js`의 ATR은 진폭 `TR`에 계수 `2/(period+1)`의 **EMA 평활화**를 적용한다. Python `ta`의 ATR14는 첫 14개 TR의 산술평균으로 초기화한 뒤 `1/14`의 **Wilder 평활화**를 적용한다.

테스트 합성 봉 마지막 값에서 둘의 절댓값 차이는 약 **0.02794**였다. 이는 버그의 증거라기보다 **서로 다른 지표 정의로 인한 결과 차이**다. ATR 기반 손절·지지·저항·FVG 추출 등이 이미 기존 방식에 맞춰 검증되어 있을 수 있어, 운영 공식을 일괄 교체하지 않는다.

기존 RSI는 14개 변동의 산술평균을 초기값으로 사용하는 반면 `ta`는 첫 차분을 0으로 시작해 `ewm(adjust=False,alpha=1/14)`를 적용한다. 550봉 뒤에는 수치가 거의 수렴하지만, 초기 시점에는 차이가 날 수 있다.

## 코드

- `lib/research-backtest-v2/ta-parity.js`: 독립 Node 참조 수식
- `scripts/ta-parity-reference.py`: Python `ta` 호출
- `scripts/verify-ta-parity.js`: 각 시계열 완전 비교와 레거시 값 차이 진단
- `.github/workflows/ta-indicator-parity.yml`: 원본 패키지 설치 및 반복 검증

향후 순서: 다양한 실제 Binance OHLCV 및 결측·갭 샘플로 재검증 → 새/기존 ATR 병렬 리서치 → 백테스트 차이 확인 → 지표 공식 변경 여부를 별도 버전으로 결정.

현재 신규 코드는 관찰·검증용일 뿐 운영 시그널을 수정하거나 실거래에 연결하지 않는다.
