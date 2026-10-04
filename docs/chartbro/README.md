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

분석 API와 정적 페이지는 기존 서버에서 실행됩니다. 화면의 기본 데이터 공급자는 자동 모드입니다. OKX·Bybit·Bitget·Gate·Binance 순서로 사용 가능한 거래소의 데이터 전체를 선택하고 실제 거래소를 표시합니다. 현물/선물과 서로 다른 거래소의 봉·수급은 혼합하지 않습니다. 거래소를 직접 선택하면 다른 거래소로 자동 전환하지 않습니다.

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
|instruments|GET|venue, market, symbol optional|native USDT instruments at selected venue|
|universe|GET|venue=auto/all/specific, market, volume_cut=0/1|per-venue current population, quiet filter, missing metrics and failures|
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
- PostgreSQL 계약은 `db/chartbro-v1.sql`에 있습니다. 실행 저장소는 디스크 저널 또는 PostgreSQL입니다. PostgreSQL의 전체 요청/작업 단계는 전역 advisory transaction lock으로 직렬화합니다. 고처리량 분산 큐, 포트폴리오 계정 동기화, 실거래 주문, 경제일정, 체결 기반 VP, 1m/tick 모호성 해소, 정기 스캔 예약은 별도 운영 통합이 필요합니다.
- 성과 계산/OOS 분리/ablation 함수는 `research.js`에 있습니다. 실제 과거 모집단을 수집한 Champion/Challenger 실험이나 검증 성과가 아직 생성된 것은 아닙니다.

검증 기록: 새 fixture 80개와 기존 Node 테스트 291개 통과. `npm run verify`, Auto Chart Lab/transport, Vercel 함수 한도 검사 통과. 브라우저 바이너리 설치가 인증서/다운로드 제한으로 실패하여 실제 브라우저 화면 검증은 미완료입니다. 2026-10-03 운영 API에서 Bybit·OKX·Bitget·Gate의 BTC 4H 분석 성공을 확인했습니다. Bitget의 배타적 페이지 경계는 별도 fixture로 검증합니다.

로컬 HTTP smoke: 차트 HTML·JS·리플레이 worker·공유 엔진 200, health 정상 응답, source 대장 73개, 인증 없는 작업 POST 403 확인.

## PostgreSQL 운영 연결

기존 `workers/chartbro-oos-runtime.mjs`에도 `/chartbro-lab.html`과 `/api/chartbro`를 연결했습니다. 기존 연구 tracker는 유지됩니다. 루트 서버와 worker 모두 `pg` 의존성을 사용합니다. 싱가포르 DB의 내부 주소는 같은 리전의 서버에 연결해야 합니다.

- `CHARTBRO_POSTGRES_ENABLED=1`
- `CHARTBRO_DATABASE_URL` (차트브로 DB 연결 문자열을 직접 지정; 다른 서비스의 DATABASE_URL을 묵시적으로 사용하지 않음)
- `CHARTBRO_WORKER_ENABLED=1` (작업 큐 실행 시)
- `CHARTBRO_WRITE_TOKEN` (쓰기 인증; 미설정이면 읽기 전용)

연결 시 `chartbro_runtime_events`와 `chartbro_runtime_records`를 자동 생성합니다. 기존 OOS 테이블은 변경하지 않습니다. 이벤트 이력과 현재 projection을 한 트랜잭션으로 저장하고, commit 실패 시 메모리도 복구하며 성공 응답을 보내지 않습니다. 재시작·다른 프로세스에서는 DB projection을 다시 읽습니다. 단일 전역 잠금과 전체 projection 로드는 초기 소규모 작업용이며 고처리량 구현은 아닙니다.

Render 무료 PostgreSQL의 만료일은 서비스 정책을 확인해 관리해야 합니다. 구성만으로 데이터베이스 연결 검증이 끝난 것은 아니며 운영 health와 실제 DB 테이블을 확인합니다.

## 다중 거래소 및 요청 제한 복구

화면에서 자동 또는 Binance·Bybit·OKX·Bitget·Gate를 선택합니다. API `venue=auto|binance|bybit|okx|bitget|gate`도 같습니다. 자동 모드는 24초 전체 한도와 거래소당 6초 한도로 진행합니다. 타임프레임 비교는 선택된 실제 거래소에 고정합니다. Gate는 이 모듈에서 5m·15m·1h·4h·1d를 지원하며 나머지는 명시적으로 미지원입니다. 긴 조회는 페이지 수 제한으로 요청 history보다 짧을 수 있어 장기 EMA 준비 상태를 그대로 노출합니다.

거래소별 원본 시장·심볼·캔들 경계·거래량 단위를 보존합니다. OKX 파생상품 거래량은 계약 수가 아닌 base/quote 필드를 사용하고 Gate 계약 수는 contract multiplier로 변환합니다. Bybit·Gate OI 이력은 수량 기준 4H 변화율과 정확한 관측 창으로 계산합니다. Bybit의 OI 수량 단위는 base이며 notional 변화율을 추정하지 않습니다. OKX·Bitget의 현재 OI는 변화율이 없는 별도 참고 객체입니다. 기준 시각 이후 값은 확인 근거에 넣지 않습니다. 정산 펀딩은 4개 대체 거래소에서 조회하고 기준 시각 이하의 기록만 사용합니다. Bybit 최근 체결은 잘린 표본으로 표시하며 완전한 15m true taker로 승격하지 않습니다. 다른 거래소 수급을 Binance 값으로 채우지 않습니다.

418/429에서는 Retry-After와 응답의 ban 종료 시각을 저장하고 대기열·신규 요청을 중단합니다. 자동 조회는 다른 거래소의 독립 데이터를 선택할 수 있습니다. 고정 거래소에서 제한을 만났고 정상 snapshot이 있으면 원래 시각·ID를 유지한 stale 복사본을 반환합니다. 저장된 snapshot은 바꾸지 않으며 현재 신호 확인/순위 대상에 넣지 않습니다. 정상 snapshot이 없으면 재시도 시각과 오류를 표시합니다. 캐시는 같은 확정 봉의 요청을 재사용하며 명시한 과거 cutoff의 정확성은 유지합니다. 제한이 해제됐다고 가정하거나 다른 Binance 호스트로 우회하지 않습니다.

공식 API 형식 참고: [Bybit Kline](https://bybit-exchange.github.io/docs/v5/market/kline), [OKX V5](https://app.okx.com/docs-v5/en/), [Bitget 계약 시장](https://www.bitget.com/docs/catalog/classic-contract-market/classic-contract-market), [Gate API V4](https://www.gate.com/docs/developers/apiv4/en/). TradingView 이미지에서 OHLC/거래량을 추정해 확정 계산에 넣는 기능은 포함하지 않습니다.

## 전체 종목 스캔 v2

화면의 전체 스캔은 자동/연결된 거래소 5곳 전체/개별 거래소와 USDT 현물/무기한 선물을 선택합니다. 각 거래소 전체 목록을 조회하고 가격 변화율 ±10% 필터 및 선택한 quote 거래대금 필터를 적용합니다. Bybit 목록은 cursor pagination을 완료하며 잘린 목록은 성공으로 표시하지 않습니다. Gate와 OKX의 원본 심볼은 정규화하되 동일 코인을 거래소 간 합치지 않습니다. OKX 선물 ticker의 base 수량을 현재 가격으로 곱해 quote 거래대금을 추정하지 않습니다. 정확한 quote turnover가 없으면 거래대금 조건을 통과하지 못하며 결측 수를 표시합니다. 거래대금 필터를 끄면 변화율이 있는 종목은 관찰 가능합니다.

4H 관찰 또는 전체 시간봉 모드를 순차 실행합니다. 전체는 1W/1D/12H/4H/1H/15m/5m이며 Gate의 미지원 봉도 실패로 남깁니다. 모든 종목은 모집단 조회 후 고정한 한 cutoff로 분석합니다. 체크포인트는 같은 탭의 sessionStorage에 저장하고 페이지 복귀 후 이어갑니다. 저장 용량/브라우저 정책으로 실패하면 메모리에서만 유지하며 JSON으로 내보낼 수 있습니다. 페이지를 닫으면 실행은 중단됩니다. 자동 예약/서버 영속 worker가 활성화됐다는 뜻은 아닙니다.

서버의 durable scan job API도 선택 거래소를 고정하며 취소/재개 뒤 유지합니다. `venue=all`은 거래소별 job을 만들어야 하며 한 job의 봉을 서로 다른 거래소로 대체하지 않습니다. 쓰기 인증/영속 저장소 요구사항은 유지됩니다.

테스트: 모든 거래소 모집단 부분 실패, Bybit 페이지네이션, 수량/거래대금 단위, 미래 수급 제외, capped trade 미승격, 스캔 source/cutoff 고정, 일시정지/재개/취소 이후 중복 방지를 포함합니다.
