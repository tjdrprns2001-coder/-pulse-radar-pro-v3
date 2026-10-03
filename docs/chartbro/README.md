# 차트브로 실전 분석기 · 독립 연구 v1

별도 페이지: `/chartbro-lab.html`. 기존 분석기는 변경하지 않습니다.
제공된 2026-10-03 명세의 수식을 독립 연구 구현으로 사용합니다. 영상 시청·회원 강의 검증을 완료했다고 표시하지 않습니다.

## 실행

Node 24, 기존 프로젝트 의존성 설치 후:

```sh
npm install --omit=dev
npm run test:chartbro
PORT=10000 node render-temp-server.js
```

분석 API와 정적 페이지는 기존 서버에서 실행됩니다. 데이터 공급자는 Binance 현물/선물을 구분하며 다른 거래소 또는 현물로 묵시적으로 대체하지 않습니다. 공급자 실패는 오류입니다.

영속 스캔 작업을 사용할 때는 서버 외부의 영속 디스크 경로와 쓰기 토큰을 환경변수로 설정합니다:

- `CHARTBRO_DATA_DIR`: 영속 디스크 디렉터리. 저장소나 정적 웹 루트 안에 두지 않습니다.
- `CHARTBRO_WORKER_ENABLED=1`: 서버의 단일 협력 작업자 활성화.
- `CHARTBRO_WRITE_TOKEN`: POST와 거래일지 읽기의 Bearer 인증.

환경변수 값과 토큰을 저장소에 커밋하지 않습니다. 서버리스에서는 영속 작업 생성을 거부합니다. 기본 스캔은 1W·1D·12H·4H·1H·15m·5m을 각각 체크포인트로 저장하고, 명시한 tf만 있으면 단일 시간봉 연구 모드입니다. 워커는 다음 안전 경계에서 취소하며, 결과 저장 후 카운터 갱신 사이에 재시작해도 저장 결과로 복원합니다. 실패 종목은 결과에 보존됩니다. 복구 재개는 남은 종목을 처리하며 이미 실패한 종목의 자동 재시도와는 다릅니다.

## API

모든 요청은 `/api/index?route=chartbro&action=...` 또는 `/api/chartbro?action=...`입니다. 추가 Vercel 함수는 생성하지 않습니다.

|action|method|parameters|result|
|---|---|---|---|
|analysis|GET|symbol, market=perpetual/spot, tf, at(UTC ms), flow=1 optional|immutable analysis with bars/objects/events|
|matrix|GET|symbol, market, at, cross_mode=window/exact/maintained, window_ms|as-of TF matrix and separate cross results|
|snapshot|GET|id|stored immutable snapshot|
|objects / evidence|GET|id|objects / events from same snapshot|
|replay|GET|id, at|recompute only bars closed by cutoff|
|instruments|GET|market|current Binance USDT instruments|
|sources|GET|none|73 metadata records and explicit unverified definitions|
|health|GET|none|engine/storage/worker state|
|jobs|POST|symbols optional, timeframes optional, tf(single mode), market, volume_cut=false optional, flow=false optional|job ID and locked decision cutoff|
|job / results|GET|id|progress / all success and failure records|
|cancel / resume|POST|id query|checkpoint state|
|cohorts|GET|none|candidate observations and full scan population; no invented OOS performance|
|journal|POST|plan, evidence_ids, emotion, adherence, review etc.|saved diary entry|
|journal|GET|Bearer authentication|diary entries|
|risk|GET|equity,risk_fraction,entry,stop,fee_rate,slippage,lot,min_notional|cost-aware hypothetical quantity|

## 재현과 화면

피벗은 event_at와 known_at를 분리합니다. 같은 봉의 새 FVG에는 접촉을 적용하지 않습니다. 현재 상태는 후속 봉에서 바뀔 수 있지만 저장된 이벤트·스냅샷은 덮어쓰지 않습니다. 구간 충족과 종가 무효화를 구분합니다. 누락 봉에서 지표를 다시 준비하고 기존 셋업을 만료합니다. 기존 구간의 경계는 후속 ATR로 바뀌지 않습니다.

리플레이는 동일 공유 엔진을 Web Worker에서 실행합니다. 수급 이력이 당시 조회되지 않았다면 최신 OI를 과거로 복사하지 않습니다. 도형과 카드의 가격은 같은 object ID에서 읽습니다. 캔버스 좌표는 시간·가격 변환으로 재계산하고, 레이어 변경과 확대는 분석을 다시 계산하지 않습니다. PNG와 JSON은 현재 리플레이 시점과 레이어를 내보냅니다. 장기 EMA는 봉 개수 기준이며 안정화 여부가 feature에 포함됩니다.

## 검증 및 한계

fixture 결과는 `npm run test:chartbro`에서 직접 확인합니다. 실시간 시장 성공 조회 또는 수익률을 뜻하지 않습니다.

- 피벗/구조/유동성/PD Array/지표/리플레이/작업 복구/위험 계산은 실행 가능한 코드입니다.
- CISD, institutional swing, Breaker/Mitigation, IOF, Three Drive, AMD/MMXM는 독립 proxy입니다.
- SMT·세션은 명시된 비교 입력/세션 설정으로 호출하는 모듈입니다. 기본 화면은 임의의 강사 세션 시간이나 상관관계를 자동 삽입하지 않습니다.
- 메타데이터 73개 대장은 사용자 제공 내용이며 원문 검증 0개입니다. 회원 규칙, 세 가지 캔들 패턴의 정확한 이름, 정식 스토캐스틱 설정, ICT Gap 고유 분류, 시간론의 고유 예외는 미확인입니다.
- PostgreSQL 계약은 `db/chartbro-v1.sql`에 있습니다. 실제 초기 저장소는 단일 워커 디스크 저널입니다. 다중 워커 PostgreSQL 실행, 포트폴리오 계정 동기화, 실거래 주문, 경제일정, 체결 기반 VP, 1m/tick 모호성 해소, 정기 스캔 예약은 별도 운영 통합이 필요합니다.
- 성과 계산/OOS 분리/ablation 함수는 `research.js`에 있습니다. 실제 과거 모집단을 수집한 Champion/Challenger 실험이나 검증 성과가 아직 생성된 것은 아닙니다.

검증 기록: 새 fixture 46개와 기존 Node 테스트 291개 통과. `npm run verify`, Auto Chart Lab/transport, Vercel 함수 한도 검사 통과. 브라우저 바이너리 설치가 인증서/다운로드 제한으로 실패하여 실제 브라우저 화면 검증은 미완료입니다. 운영 배포나 실시간 공급자 성공 조회를 이 결과로 주장하지 않습니다.

로컬 HTTP smoke: 차트 HTML·JS·리플레이 worker·공유 엔진 200, health 정상 응답, source 대장 73개, 인증 없는 작업 POST 403 확인.
