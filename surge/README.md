# 통합 급등 스캐너와 전향적 검증

대화에서 합의한 Python 구현을 이 저장소의 독립적인 surge/ 모듈로 재구현했습니다.
기존 BTC/ETH 모니터와 별도로 실행합니다. 주문 기능은 없습니다.

## 실행

Python 3.12를 권장합니다.

~~~bash
pip install -r surge/requirements.txt
python surge/scanner.py --self-test
python surge/scanner.py --symbols CELRUSDT MOVRUSDT QNTUSDT --output scan.json
python surge/scanner.py --output scan.json
python surge/validate.py collect --once --db signals.sqlite
python surge/validate.py collect --interval 900 --db signals.sqlite
python surge/validate.py report --db signals.sqlite --output validation.json
~~~

거래대금 필터는 기본 해제입니다. 필요하면 scanner에 --min-quote-volume을 지정합니다.
기본 유니버스는 거래 중인 Binance USDT 무기한 전체이며 개수는 고정하지 않습니다.

## 계산과 단계

- 확정봉만 사용하고 한 스캔의 모든 프레임에 동일한 기준시점을 적용합니다.
- EMA14/28/57/92 폭 = (최댓값 - 최솟값) / 종가. JSON은 % 표시입니다.
- EMA는 첫 조회 종가로 초기화합니다. MACD는 12/26/9입니다.
- hist_pct = MACD histogram / close * 100.
- MACD 개선은 최근 3개 hist_pct의 변화로 판정합니다.
- RVOL = 해당 봉 base volume / 직전 20봉 평균. 평가 봉은 분모에 넣지 않습니다.
- 1D 압축은 필수 조건이 아닙니다.
- 4H 압축 <=10% 또는 상승 후 눌림/재회복을 사용합니다. <=5%는 강한 압축입니다.
- 준비 단계에는 현재 RVOL 최솟값을 강제하지 않습니다.
- 음수 MACD 자체는 탈락 조건이 아닙니다. 특히 5m에는 MACD veto가 없습니다.
- 15m는 EMA 정렬/전환, 최근 고점 돌파/reclaim, RVOL 증가, 연속 taker 흐름을 확인합니다.
- 5m는 주요 EMA 위, 저점 유지, VWAP/EMA 확인, 범위 돌파, RVOL, taker 재유입을 봅니다.
- 5m MSS는 최근 범위 돌파 + 저점 유지의 근사치입니다. 정밀 pivot CHoCH가 아닙니다.

유형과 진행 단계를 따로 기록합니다.

| 단계 | 조건 |
|---|---|
| PRE | 4H 구조 후보 |
| A-pre | 최근 1H OI +0.2% 이상, 최근 15m 증가와 연속 증가 |
| A | 최근 1H 계약 수량 OI +1% 이상 |
| B | 1H 또는 15m의 지속/점화 taker FLOW |
| A+B | OI +1%와 FLOW 모두 확인 |
| 점화초기 | A+B, 1H 준비, 15m/5m 게이트, 최근 15m OI 증가, 비과열 |

C형은 이전 2시간 OI 정리 후 최근 1H 재구축과 가격 안정입니다.
OI 실패/누락은 미확인으로 남기고 A/A+B/점화초기로 승격하지 않습니다.
taker는 quote 매수량 / quote 매도량이며 지속·증가 경로를 봅니다.

## Volume Echo와 preload

volume_echo.detected를 유지해 validator와 호환합니다.

- VOLUME-ECHO: 1H의 과거 3~72시간 거래량 스파이크, 현재 거래량 감소,
  이후 가격 유지, 살아있는 4H/1H 구조.
- RECENT-PRELOAD: 최근 3시간 1H 또는 최근 1시간 15m의 선행 RVOL 흔적.
- ECHO+RECENT-PRELOAD: 두 조건 모두 충족.
- QUIET: 둘 다 미확인.

Echo의 3시간 최소 간격, 가격 유지 허용폭 등은 설정 가능한 구현 기본값입니다.
159개 성공 표본으로 추정된 최적값이 아닙니다.
preload만으로 B형에 승격하지 않습니다. B는 taker FLOW로 판단합니다.

## 짧은 상장 이력

5m는 최소 100봉입니다. 24H 변화율은 5m -> 1H로 fallback하며 기준 프레임,
기준봉 종료 시각, 시점 차이를 출력합니다. 1H fallback의 기준 시점은
24시간 전과 최대 약 1시간 차이 날 수 있습니다. 모두 없으면 미확인입니다.

1D는 최소 30봉, 나머지 프레임은 최소 100봉입니다. 더 짧은 이력은 errors에 기록합니다.
EMA92 이력이 92봉 미만이면 참고치 경고를 출력합니다.
history의 ema92_seed_decay는 초기값 영향 계수이며 실제 EMA 오차 추정치가 아닙니다.
최대 400봉 조회만으로 장기 EMA 초기화 오차가 완전히 제거되지는 않습니다.

## 전향적 성과 검증

신호 가격이 아니라 스캔 완료 후 관측한 가격을 시작 가격으로 사용합니다.
신호가 스캔 기준시점보다 15분 넘게 늦으면 기록만 저장하고 이벤트를 생성하지 않습니다.

- 같은 종목/단계 반복 이벤트는 기본 24시간 cooldown.
- 대조군: 성공적으로 조회된 4H 비후보 중 거래대금과 기존 24H 상승률이 가까운 3개.
- 조회 오류 종목, 과열 후보, 구조 후보는 대조군에서 제외.
- 대조군은 신호 발생 시점에 고정하며 사후 수익률로 재선택하지 않습니다.
- 1/4/24H 목표시각 이후 첫 관측을 사용합니다. 기본 허용 지연은 30분입니다.
- 미래 가격 누락은 0%가 아니라 미확인입니다.
- 대조군 3개 모두 관측된 경우에만 초과수익(pp)을 계산합니다.
- 단계/유형/Echo/volume state별 events, observed, matched를 출력합니다.
- 긍정 수익 비율은 실제 전략 성공확률이 아닙니다.
- 수수료/슬리피지/펀딩/손절/익절은 포함하지 않습니다.
- 반복 이벤트와 시장 공통 움직임 때문에 표본들이 독립이라고 가정하지 않습니다.
- 159개 표의 사후 최대 상승률/점화봉 RVOL/봉 내부 최대 RVOL은 PRE 입력이 아닙니다.

## GitHub Actions

Integrated Surge Scanner 워크플로:
1. PR/코드 push에서 네트워크 없는 문법 검사, 19개 통합 테스트, 빈 DB report 검사.
2. 수동 실행의 live=true 또는 main 병합 후 15분 스케줄에서 1회 수집/보고.
3. 같은 브랜치의 최근 surge-validation-state artifact에서 SQLite 복원.
4. 성공한 수집 후 갱신한 SQLite와 보고서를 새 artifact로 저장.
5. 수집이 실패하면 갱신 artifact를 올리지 않아 이전 성공 상태를 보존.

artifact 보관은 90일입니다. 90일 넘는 중단/삭제 후에는 기존 상태가 자동 복원되지 않습니다.
GitHub Actions 스케줄은 정확한 15분 실행을 보장하지 않습니다.
Binance의 DNS/지역 제한/418/429로 라이브 조회가 실패할 수 있습니다.
이 경우 CI 계산 테스트 통과와 라이브 데이터 수집 성공을 따로 확인하세요.
워크플로 수동 실행 UI는 워크플로가 default branch에 병합된 뒤 사용할 수 있습니다.

PR/push의 live-smoke 작업은 BTCUSDT의 5개 프레임과 OI를 실제 조회합니다.
결과는 surge-live-smoke artifact에 저장합니다. 지역 제한으로 실패해도 오프라인
계산 테스트 결과를 보존하도록 continue-on-error로 분리합니다. 라이브 성공을
뜻하지 않으므로 live-smoke 작업의 실제 결론과 JSON을 확인하세요.

## PulseRadar 웹 연결

lib/coin-scan/integrated-surge-engine.js가 Astra deep 결과의 integratedSurge 필드에
확정봉 기반 통합 단계를 계산합니다. ui/astra-scan.js는 단계/유형/Echo/Preload,
OI1H, 4H EMA폭, 15m FLOW와 5m 확인을 후보 카드에 표시합니다.
기존 Astra 선별을 거친 종목에 대한 추가 판정이므로 웹 화면이 전체 유니버스를
전수 심사했다는 의미는 아닙니다. 전수 수집은 위 Python worker를 사용합니다.
웹 기존 provider의 조회 이력 범위 때문에 오래된 Echo를 놓칠 수 있으며
19개 Python 테스트와 네이티브 엔진/기존 Astra 연결 검사를 함께 실행합니다.
새 통합 판정의 rankingEffect는 0이며 기존 순위와 예측 성공확률을 혼동하지 않습니다.
