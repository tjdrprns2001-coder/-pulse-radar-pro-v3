# 과거 펀딩 정산 검증 단계 — 2026-10-10

## 실제 구현 범위

Binance USDⓈ-M 선물 공식 공개 API `GET /fapi/v1/fundingRate`를 조회하는 독립 **연구 전용** 기능을 연결했다. 거래 주문, 인증 키, 자동 매매는 사용하지 않는다.

- [lib/research-backtest-v2/binance-funding-audit.js](../lib/research-backtest-v2/binance-funding-audit.js): 날짜 제한, Binance 심볼 검증, timestamp-based 오름차순 페이징, 최대 요청 횟수, 중복·충돌 탐지, HTTP 오류 시 데이터 미확인 처리. 펀딩 비율과 정산 시점의 `markPrice`를 함께 보관한다.
- `auditFundingForTrades()`: 이전 단계의 **다음 확정봉 시가 가상 진입 → 7일 후 종가 가상 종료** 기간 사이 실제 관측된 정산만 집계한다. 롱은 양수 펀딩 시 지급, 음수 펀딩 시 수취다. 각 관측 시점의 기준가격 변화를 반영한다.
- [scripts/run-bowl-walk-forward.js](../scripts/run-bowl-walk-forward.js): 선택적 `--funding-audit` 옵션으로 `--risk`도 활성화하고, train/validation 신호의 펀딩 관측 집계를 별도 추가한다. test/holdout은 `LOCKED_BY_DESIGN`으로 유지.
- [scripts/verify-binance-funding-audit.js](../scripts/verify-binance-funding-audit.js): 페이징, 429 실패, 중복·상충, 정산 시점 누락, rate 부호, 미완성 데이터 방어 테스트.
- [scripts/verify-binance-funding-integration.js](../scripts/verify-binance-funding-integration.js): 합성 확정봉에 진짜 패턴 신호 생성 → 과거 정산 모의 HTTP 조회 → 실제 모듈 연결 → test 데이터 조회 금지 확인.
- CI: [QuantStyle research risk](../.github/workflows/quantstyle-risk-validation.yml)

### 실제 거래소 데이터 응답 확인

연결된 Binance USDⓈ-M 펀딩 히스토리에서 **2026-10-01 00:00:00Z부터 2026-10-08 23:59:59Z**까지 BTCUSDT **24건**, ETHUSDT **24건**이 조회됐고, `fundingTime`, `fundingRate`, `markPrice` 필드를 확인했다. 이는 API 가용성과 포맷 확인이며, 이 표본의 전체 펀딩 원장 감사가 완료됐다는 의미는 아니다.

API 문서: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Get-Funding-Rate-History

실행:
```bash
npm run test:funding-audit
node scripts/run-bowl-walk-forward.js BTCUSDT ETHUSDT SOLUSDT --tf=4h --limit=1200 --funding-audit
```

### 수익률 표기 기준

`signedFundingCashflowPct`는 포지션의 가상 체결시점 기준자본 대비 `-sum(markPrice/entryFillEstimate * fundingRate) * 100`으로 계산한다. **실제 펀딩을 포함한 총 실현 손익이 아니다.** 관측 이벤트별로 정산 당시의 계약 수량이 일정하다고 가정하며, 중도 레버리지/수량 조정/강제 청산은 모델링하지 않는다.

**의도적 안전 제한**

1. Binance는 급격한 변동 시 종목별 펀딩 정산 간격을 변경할 수 있다. 조회된 과거 정산 이벤트만으로 모든 과거 간격을 증명할 수 없기에 결과를 `OBSERVED_ONLY`, `verifiedNet:false`로 분리한다.
2. HTTP 오류, 429, incomplete pagination, `markPrice` 누락, 대상 심볼 불일치, 정산 기록이 0건인 구간을 **0% 펀딩**으로 간주하지 않는다. `UNAVAILABLE`/`PARTIAL`로 반환한다.
3. 관측 정산을 기존 일별 복리 그래프에 단순 가산하지 않는다. 일별 자산곡선은 계속 **funding 제외**이고, 별도 일람 표는 **관측 펀딩 정산 감사**로 표시한다.
4. 검증·평가 데이터가 부족한 후보가 갑자기 우수한 롱 후보로 승격되지 않는다. 기존 Astra 로직은 그대로다.
5. 소스 응답의 `rateType` 등 추가 타입을 정확히 해석할 수 없으면 승인된 총손익으로 자동 변환하지 않는다.

다음 작업: 변경된 과거 펀딩 간격을 증명하는 출처를 확보하고, *자산 평가 곡선*의 일별 정산 잔고를 정확히 업데이트하는 별도 리플레이를 만든 뒤 QuantStats 원본 Python 계산과 비교한다. 그전까지 최종 순수익은 미확정이다.

테스트 통과 여부는 GitHub Actions 해당 커밋 결과를 우선한다. **라이브 운영 사이트 배포는 별도 검증이 필요하다.**
