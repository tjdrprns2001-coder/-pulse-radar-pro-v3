# 서버 스캔·결과 평가 운영 v1

## 구현

- 시간 슬롯별, 거래소별 예약 대장과 작업 ID를 영속 Journal에 저장한다.
- 같은 슬롯·설정의 재실행/재시작은 작업을 복제하지 않는다.
- 같은 거래소의 이전 QUEUED/RUNNING 작업이 있으면 새 슬롯은 SKIPPED_BUSY로 남긴다.
- 실패 거래소는 FAILED 기록을 남기며 다른 거래소의 작업을 막지 않는다.
- 워커는 거래소별 작업 단계를 순환 처리한다. 한 사이클에서 예약·결과 평가·스캔 중 한 종류의 네트워크 작업만 진행한다.
- 실행 확인 당시 snapshot이 있는 후보만 24/72시간 결과를 검사한다. 종목·시간봉별 중복 조회를 합치며 다음 미완료 horizon이 도래할 때 조회한다. 이후 봉 1500개까지 요청하고 누락·기간 부족은 기존 평가 엔진이 결과를 확정하지 않는다.
- 결과 복구 조회는 트리거 후 최대 7일까지만 시도하며 미완료 결과를 성공으로 바꾸지 않는다.
- 읽기 API `action=operations`와 운영 카드에서 저장 상태, 워커 heartbeat, 다음 슬롯, 작업 진행과 실패, 평가 조회 상태를 보여준다. POST 작업 인증은 기존 규칙을 유지한다.

## 기존 Render 서비스에 연결할 설정

아래 값은 관리자 환경변수로 설정하며 연결 문자열은 코드/브라우저에 노출하지 않는다.

```
CHARTBRO_POSTGRES_ENABLED=1
CHARTBRO_DATABASE_URL=<same-region internal PostgreSQL URL>
CHARTBRO_WORKER_ENABLED=1
CHARTBRO_SCHEDULE_ENABLED=1
CHARTBRO_SCHEDULE_VENUES=okx,bybit,bitget,gate,binance
CHARTBRO_SCHEDULE_INTERVAL_MS=3600000
CHARTBRO_SCHEDULE_VOLUME_CUT=0
```

기본 스캔은 1W/1D/12H/4H/1H/15m/5m, 확정봉, 24h 변화율 ±10%, 거래대금 컷 제외다. OI와 펀딩은 지원되는 원본 소스만 사용한다. 스캔이 1시간보다 오래 걸리면 중복 실행하지 않고 이후 슬롯을 건너뛴다. 결과가 0인 작업과 조회 실패를 구분한다.

영속 설정이 없으면 예약 실행과 평가 polling을 거부한다. PostgreSQL이 연결되어도 웹 서비스가 절전·중지되면 워커는 실행되지 않는다. 재기동하면 저장된 작업을 이어가며 놓친 모든 슬롯을 대량 소급 생성하지 않는다. 24시간 상시 운영은 절전하지 않는 별도 워커 환경이 필요하다.

이 변경은 운영 코드와 화면을 제공한다. 배포 환경의 실제 DB 연결·스케줄 활성화 여부는 `operations`의 durable/scheduler/heartbeat와 DB 기록을 확인해야 한다. 기존 free DB의 만료일은 인프라 관리 화면에서 별도로 관리한다.
