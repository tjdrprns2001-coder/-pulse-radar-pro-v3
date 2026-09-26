# Post-surge reverse samples — 2026-09-26

현재 급등 상위 종목을 **급등 후 상태(post-surge)** 로 채취한 샘플 세트입니다. 목적은 현재 급등 종목을 추격하기 위한 것이 아니라, 이후 급등 직전 1~6시간을 역추적해 PRE-SURGE 특징을 재구성하는 것입니다.

## 분류

- PRE-SURGE 역추적: RARE, 2Z, PHA, ARK, ENA
- 후반/분배: MUBARAK, AERO, VELODROME
- 2차 재점화: PUMP, SUI, JTO
- 과열 참고: RARE, 2Z

## 현재 관찰

- RARE: +62.45%, OI 4H +73.0%, OI 24H +143.85%, 1H RVOL 6.57x, 현재 OI 경로 +/−/−.
- 2Z: +31.67%, OI 4H +47.30%, 1H RVOL 9.09x, 15m RVOL 3.24x, 현재 OI 경로 +/−/−.
- PHA: +37.16%, OI 24H +107.19%지만 현재 RVOL은 1x 이하, 급등 후 냉각형.
- ARK: +28.41%, OI 24H +36.93%, 현재 1D premium.
- ENA: +24.81%, 15m taker 0.60 WEAK, OI BUILD_WEAKENING.
- PUMP: +15.72%, 5m taker 2.46 STRONG — 하위봉 재점화 참고형.
- SUI: +13.38%, 5m taker 1.48 — 대장 상승 후 재가속 참고형.

## 학습 규칙

1. 급등 후 현재 값 자체는 PRE-SURGE 진입 규칙으로 사용하지 않는다.
2. BUILD_WEAKENING(+/−/−)은 신규 롱 제외 역샘플 후보로 취급한다.
3. 다음 단계는 각 샘플의 급등 직전 1~6시간 OI 경로, RVOL, Taker, MA, HTF 위치를 역추적해 별도 PRE-SURGE 샘플로 저장한다.
4. 현재 JSON은 후속 역추적을 위한 원본 스냅샷이다.
