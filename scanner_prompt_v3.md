# Scanner Prompt v3 — Astra 수집 + SURGE v2 판정 통합

> 출처: Claude가 제안한 Astra 보강안. 기존 v2와 나란히 관리하기 위한 v3 초안.
> 구현 기본값 중 원문에서 숫자가 확정되지 않은 값은 provisional config로 분리한다.

## 1. 데이터 우선순위

- Binance USDT 무기한 선물 원데이터 우선.
- true taker ratio는 별도 buySellRatio endpoint와 Kline 내부 taker buy volume 두 경로를 병행 조회한다.
- 조회 실패한 소스는 성공으로 간주하지 않는다. 실패/결측은 N/A 또는 명시적 상태로 남긴다.
- 모든 지표는 확정봉만 사용한다.

## 2. 전체 스캔 순서

### 0차 — 유니버스 확정
- status = TRADING
- quoteAsset = USDT
- contractType = PERPETUAL

### 1차 — 가격·유동성
- abs(24H%) <= 10
- 거래대금은 절대 $10M 고정값 대신 전체 유니버스 퍼센타일 상위 X% 사용.
- 구현 기본값: 70 percentile. 이 값은 provisional이며 OOS/전진검증으로 교체 가능.
- BTC/ETH 24H, 전체 상승 breadth, 거래대금 가중 breadth를 동시에 기록한다.

### 2차 — OI 경로 조기 분해
살아남은 후보 전부에 대해 1H OI 원자료에서 다음 세 구간을 계산한다.

- 0~4H
- 4~8H
- 8~12H

승격:
- + / + / + = CONTINUOUS_BUILD
- - / + / + = CLEAN→REBUILD

강등:
- + / - / - = BUILD_WEAKENING
- 기타 경로 = 미완성/보류

OI 증가 하나만으로 매집을 단정하지 않는다.

### 3차 — HTF 컨텍스트 선태깅
- 1W HTF_DISCOUNT: 최근 52주 범위 위치 <= 35%
- 1D MID_TERM_PREMIUM: 최근 120일 범위 위치 >= 80%
- 1D premium 후보는 추격 위험으로 우선순위를 낮춘다.
- 35% / 80%는 현재 버전 고정값이며 변경 시 새 버전으로 관리한다.

## 3. 정밀검사

타임프레임:
1W → 3D → 1D → 12H → 4H → 1H → 15m → 5m

지표:
- RSI14
- EMA 12 / 14 / 26 / 28 / 57 / 92 / 268 / 378
- SMA 5 / 10 / 14 / 20 / 28 / 57 / 60 / 92 / 120 / 260 / 378
- MACD + signal 변화
- MA 정렬
- 지지/저항
- liquidity sweep
- RVOL
- Spot 24H
- Funding

진행 중 캔들은 전 지표 계산에서 제외한다.

## 4. RVOL 구간

- < 1.5x = QUIET
- 1.5x ~ <3x = PRE_SPARK
- 3x ~ 10x = IGNITION
- >10x = EXPANSION

숫자와 라벨을 함께 기록한다.

## 5. Taker 구간 및 교차검증

- <0.8 = WEAK
- 0.8~1.2 = NEUTRAL
- >1.2~<1.5 = IMPROVE
- >=1.5 = STRONG

endpoint와 Kline 계산치가 모두 있으면 보수적으로 낮은 값을 판정값으로 사용한다.
두 소스의 시점 불일치/결측은 별도 상태로 남긴다.

## 6. 방향 확정

DIRECTION_CONFIRM:
- 최근 1H 3봉 중 2봉 이상 conservative taker >1.2
- 최근 OI BUILD 유지

STRONG_FLOW_CONFIRM:
- 최근 1H 3봉 중 최소 1봉 conservative taker >=1.5
- 또는 향후 검증된 15m 연속 flow 규칙으로 확장

DIRECTION_CONFIRM 미충족 시 direction=none.
OI/RVOL이 좋아도 A-pre/보류로 강등한다.

라벨 판정 권한:
- 1H / 15m = 최종 방향 및 라벨
- 5m = 실행 참고 전용

## 7. 최종 라벨

- A-pre
- A
- A→A+B
- A+B
- B
- C(CLEAN→REBUILD)
- NFB
- NFB-SQ
- NFB-SC
- 미완성

현재 구현의 세부 라벨 매핑은 규칙 기반 provisional 상태이며, 백테스트/OOS 결과로 버전업한다.
OI_BUILD가 깨지면 A 계열은 A-pre/미완성으로 자동 강등한다.

## 8. 운영 원칙

- OI 증가 단독으로 매집 단정 금지.
- 가격·taker·funding·spot 조합으로 해석.
- 확정봉만 사용.
- 실패/결측을 숨기지 않음.
- 파라미터는 버전당 고정하고 사후 임의 변경 금지.
- 변경 시 scanner_prompt_v4 등 새 버전으로 분기.
