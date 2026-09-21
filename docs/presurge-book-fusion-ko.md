# PRE-SURGE 책·DNA·수급·SMC/ICT 통합 근거 게이트

## 목적

전체시장 스캐너의 기존 PRE-SURGE 탐지를 그대로 유지하면서, 정밀 후보 단계에서 다음 근거를 동시에 대조한다.

- 급등 성공 DNA / 샘플 유사도
- OI / true taker / funding / RVOL
- 기술적 차트 분석 + 코린이 입문서 기반 책 합성 Evidence
- Forex Book / Simple Trading Book
- SMC / ICT 구조

통합 점수는 **승률이나 예상수익률이 아니라 근거 완성도**다.

## 실행 경로

전체 Binance USDT 무기한 코어 유니버스에 책 엔진을 전부 돌리지 않는다.

1. summary 스캔은 기존처럼 전체 코어 유니버스를 빠르게 훑는다.
2. 가격·거래대금·기존 후보 점수로 최대 40개 정밀 후보를 만든다.
3. UI는 후보를 6개씩 나누어 deep 스캔한다.
4. 이미 받아온 8TF OHLCV를 재사용한다.
5. 정밀 후보에 한해서 책 합성 + SMC/ICT + DNA + 파생/거래량 근거를 합성한다.

따라서 책 합성 때문에 별도의 시장 데이터 API 요청을 추가하지 않는다.

## 책 Evidence

책 합성은 1W → 1D → 4H → 1H → 15m 순서로 계산한다.

- 이평 배열·밀집/확산
- 가격·거래량 구조
- 일목 시간론 / V·N·E·NT 가격론
- 피보나치
- 종가 확인 / 추세선 돌파·리테스트
- Confluent Zone
- Forex Book 캔들·지표
- Simple Trading Book 패턴

원문에 수치 임계값이 없는 항목은 기존 Book Confluence 모듈과 동일하게 **자동화 근사**로 취급한다.

## Smart Money Evidence

서버 정밀 스캔에서 4H와 1H OHLCV를 사용해 SMC를 재계산하고, 4H를 HTF / 1H를 LTF로 ICT Context를 만든다.

주요 근거:
- MSS
- Liquidity Sweep
- Displacement
- 활성 FVG / OB
- ICT sequence state / PD Array

이 레이어도 승률을 만들지 않고 방향성 근거의 중첩만 계산한다.

## 통합 PRE-SURGE Gate

`BOOK_SMC_ICT_FUSION_v1`의 강한 동시확인은 다음이 모두 충족될 때만 `eligible=true`가 된다.

- 책 합성 상승 근거
- SMC/ICT 상승 근거
- 급등 DNA 또는 충분한 샘플 DNA
- OI 또는 true taker 선행 확인
- RVOL 선행 확인
- 가격이 아직 과도하게 확장되지 않음
- 책/SMC/ICT 하락 반증이나 분배 위험이 없음

하락 반증이 강하면 통합 점수를 49 이하로 제한하고 PRE-SURGE 승격을 막는다.

## 출력

정밀 후보 응답에 아래가 추가된다.

- `bookEvidence`
- `bookScore`, `bookBias`, `bookHtfAligned`
- `smartMoneyScore`, `smartMoneyBias`, `ictState`
- `fusion`, `fusionScore`, `fusionEligible`

자동 전체스캔 카드에도 `책+DNA+수급+SMC/ICT` 블록을 표시한다.

## 우선순위

정밀 후보 정렬은 기존 v2 type보다 먼저 다음을 본다.

1. `fusionEligible`
2. `fusionScore`
3. 기존 v2 type
4. transition event
5. scan class
6. trade-signal confidence

이미 급등한 종목, 분배 위험, 펌프 위험, stale 데이터에 대한 기존 차단 규칙은 그대로 유지한다.
