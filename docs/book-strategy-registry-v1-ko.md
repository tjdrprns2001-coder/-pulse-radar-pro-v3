# Book Strategy Registry v1

PulseRadar 자동스캔은 책 기법을 하나의 점수로 무조건 합산하지 않는다.

## 원칙
- `rank`: 후보 승격에 사용할 수 있는 주전략
- `evidence`: 위치/합류 근거만 제공, 단독 승격 금지
- `risk`: 무효화·목표·1R/포지션 관리용
- `context`: 시장상태·이벤트·상관관계 보조
- `data-required`: 실제 데이터가 없으면 N/A
- `not-applicable`: 24/7 crypto 기본 스캔에 직접 적용하지 않음

## 포함 소스
- 주식 차트 기법 종합 매매 매뉴얼
- 전문 트레이딩 플레이북
- 와이코프 매집·분배와 유동성 스윕 사례 연구
- Simple Trading Book 기반 기존 엔진
- All you should know about Forex p.1~406 기반 기존 엔진
- 기술적 차트 분석 / 코린이 입문서 Book Confluence
- Dante ruleset

## 실제 자동스캔 연결
- 기존: 가격구조, MA, 추세선, 유동성, 캔들/차트 패턴, Forex Book, Book Confluence, Dante
- 추가: OBV, A/D, VWAP proxy, CCI, ADX proxy, Fib 되돌림/확장, Elliott evidence, Wyckoff Spring/Test/SOS/LPS 및 UT/UTAD/SOW, OHLCV Volume Profile POC/VAH/VAL, 변동성 squeeze evidence, 구조 기반 invalidation/target/R
- 실제 체결방향 없는 CVD는 추정하지 않고 N/A
- Bollinger/Keltner는 evidence-only, scanner ranking weight 0
- 주식형 Gap/Opening Range는 24/7 crypto 기본 랭킹에서 비활성

## 점수 해석
점수는 승률이 아니라 현재 관찰된 근거 완성도다. 여러 책 기법을 모두 만족해야 후보가 되는 AND-gate를 사용하지 않는다. 주전략 1개 + 보조 근거 조합을 사용한다.
