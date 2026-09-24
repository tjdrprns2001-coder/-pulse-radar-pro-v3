# Sample Readiness Gate v1

## 목적

이 Gate는 거래 신호를 자동 활성화하거나 점수를 변경하지 않는다. 역할은 오직 Liquidity Event Journal에 쌓인 추세선 리테스트 표본이 사람이 정책 검토를 시작할 만큼 준비됐는지 판정하는 것이다.

`REVIEWABLE_VALIDATED`는 자동 적용 가능이 아니라 독립 validation 구간에서도 검토할 가치가 있는 데이터가 재현됐다는 뜻이다.

## 분석 단위

- 원천 사건: 독립 `TL_RETEST_TOUCH` event row.
- 중복 제거 키: immutable `eventId`.
- 5m은 reference-only이므로 Gate 표본에서 제외.
- readiness eligible: H24 outcome이 `FINALIZED`된 retest event.
- Journal은 최근 snapshot 200개를 유지하지만 Gate는 compact observation archive를 별도로 유지한다.
- compact observation에는 eventId, timeframe, confirmedAt, trendline telemetry, H24 result/MFE/MAE만 저장한다.

## 시간 기준

- `DAY_MS = 86,400,000`.
- Discovery clock origin: 최초 eligible event의 `confirmedAt`.
- Discovery cutoff: `eligibleN >= 200` 그리고 elapsed >= 14일.
- Validation clock origin: `discoveryCutoffConfirmedAt`.
- Validation cutoff: 신규 eligible `n >= 50` 그리고 elapsed >= 7일.
- timezone과 UTC/한국 자정은 판정에 사용하지 않는다.
- 정확히 임계값에 도달하면 PASS한다.
- Discovery는 `confirmedAt <= cutoff`, Validation은 `confirmedAt > discovery cutoff`.
- 같은 timestamp 이벤트는 모두 Discovery에 포함하고 `cutoffEventId`와 `cutoffOrdinal`을 동결한다.

## 상태

1. `INSUFFICIENT`: eligible n < 100
2. `OBSERVING`: 표본 수집 중
3. `REVIEWABLE_INITIAL`: 200개 + 14일 최초 충족, Discovery cohort 동결
4. `VALIDATING`: 독립 validation 수집
5. `INSUFFICIENT_VALIDATION`: validation 전체 조건은 충족했지만 TF 교집합이 2개 미만
6. `REVIEWABLE_VALIDATED`: validation 및 TF consistency guard 통과
7. `REVIEWABLE_UNSTABLE`: 충분한 표본에서 material conflict/방향 반전 확인
8. `PARAMS_CHANGED`: 진행 round와 현재 gateParamsHash 불일치

`INSUFFICIENT_VALIDATION`은 실패가 아니라 더 기다려야 함이다. `REVIEWABLE_UNSTABLE`은 표본 부족이 아니라 충분한 표본에서 구조적 일관성이 약하다는 뜻이다.

## TF eligibility

- Discovery TF eligible: 해당 TF discovery n >= 30.
- Validation TF eligible: 해당 TF validation n >= 30.
- 최종 판정 TF = Discovery eligible과 Validation eligible의 교집합.
- 교집합 TF가 최소 2개 필요.
- Validation cutoff 순간 TF 집합을 동결.
- `allowLateTfEntryIntoRound = false`.
- cutoff 이후 뒤늦게 n=30을 넘은 TF는 현재 round에 추가하지 않는다.
- 5m은 항상 제외.

## 효과 분류

v1 관찰 hypothesis는 `sameBarWouldConfirm`이다. H24 DOL rate, median MFE, median MAE를 same-bar 후보군과 비후보군으로 나눠 비교한다.

- `NEUTRAL`: validation DOL delta가 ±10%p 이내.
- `SUPPORTIVE`: material effect가 Discovery 방향과 일치.
- `CONFLICT`: material effect가 Discovery 방향과 반대.
- 표본 부족 TF는 conflict가 아니라 eligibility 단계에서 제외.

Global stability:

- Discovery 대비 Validation DOL delta 변화가 10%p를 초과하면 불안정.
- MFE 우위 방향이 반전되면 불안정.
- MAE 우위 방향이 반전되면 불안정.
- eligible TF 중 material conflict가 있으면 불안정.

## 불변성 / anti-p-hacking

- 최초 Discovery cutoff와 통계를 frozen snapshot으로 저장.
- Validation은 Discovery event를 재사용하지 않음.
- Validation cutoff와 TF 교집합도 frozen snapshot으로 저장.
- 완료된 Review Round는 새 이벤트가 들어와도 소급 수정하지 않음.
- Rolling 통계는 frozen Discovery/Validation과 별도.
- 계산 규칙 전체를 `gateParamsHash`로 동결.
- params 변경은 기존 round를 재해석하지 않고 `PARAMS_CHANGED`로 노출.
- `REVIEWABLE_VALIDATED`라도 confluence 20점이나 scanner ranking을 자동 변경하지 않음.

## v1 frozen params

```text
discoveryMinEligibleN = 200
discoveryMinElapsedMs = 14 * 86400000
validationMinNewEligibleN = 50
validationMinElapsedMs = 7 * 86400000
minDiscoveryNPerTf = 30
minValidationNPerTf = 30
minEligibleTfCount = 2
excludeTf = [5m]
tfEligibilityMode = DISCOVERY_VALIDATION_INTERSECTION
eligibilityFreezeAtValidationCutoff = true
allowLateTfEntryIntoRound = false
materialConflictPctPoint = 10
maxDolRateDeltaPctPoint = 10
rejectMfeDirectionFlip = true
rejectMaeDirectionFlip = true
observationClock = ELAPSED_EPOCH_MS
discoveryTimeOrigin = FIRST_ELIGIBLE_EVENT_CONFIRMED_AT
validationTimeOrigin = DISCOVERY_CUTOFF_CONFIRMED_AT
discoveryCutoffInclusivity = LTE
validationCutoffInclusivity = GT
timezoneDependent = false
```

## 변경 관리

v1 임계값은 결과를 본 뒤 같은 round에서 조정하지 않는다. 임계값 또는 분석 정의를 바꾸려면 새 Gate version과 새 paramsHash를 사용한다.