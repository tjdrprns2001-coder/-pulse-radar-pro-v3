# IGNITION → Pulse Radar 읽기 전용 API

전용 Render 서비스에서 실행하는 독립 Node API. 기존 Pulse 서비스와 IGNITION 비공개 UI는 변경하지 않는다. 배포 결과는 별도 검증 기록 참조.

## 공개 계약

Bearer 토큰이 필요한 경로는 `GET /api/v1/health`, `GET /api/v1/results`뿐이다. 나머지 경로는 404, 허용 경로의 GET/OPTIONS 이외 메서드는 405다. OPTIONS는 허용 origin의 GET/Authorization preflight만 204로 응답하며 데이터를 반환하지 않는다.

CORS origin은 `https://pulseradar-pro-unified-0926.onrender.com`과 정확히 일치해야 한다. 서버 간 요청은 Origin 없이 Bearer 인증으로 호출한다. CORS는 서버 신원 인증 수단이 아니며 토큰은 브라우저로 보내지 않는다.

| 환경변수 | 설정 위치 / 의미 |
|---|---|
| IGNITION_READ_TOKEN | API 서버 secret, 32바이트 이상 암호학적 난수의 base64url |
| IGNITION_READ_TOKEN_EXPIRES_AT | API 서버, ISO 8601 만료 시각, 필수 |
| IGNITION_READ_TOKEN_PREVIOUS | API 서버 secret, 회전 유예용 이전 토큰, 선택 |
| IGNITION_READ_TOKEN_PREVIOUS_EXPIRES_AT | API 서버, 이전 토큰 만료 시각 |
| IGNITION_UPSTREAM_TOKEN | 새 Render 서비스 secret, 기존 private IGNITION gateway 내부 접속 자격증명. Pulse에 전달 금지 |
| IGNITION_API_BASE_URL | Pulse Radar 서버, 실제 배포 origin |
| IGNITION_RESULTS_TOKEN | Pulse Radar 서버 secret, API의 현재 토큰과 동일 |
| PORT | 호스팅 런타임 제공 포트 |

토큰은 환경변수 저장이 가능한 배포 환경을 확정한 후 발급한다. 원문을 문서, 소스, Git, 로그, 프론트 환경변수에 저장하지 않는다. 회전 시 새 토큰을 현재 키로 설정하고 이전 키에는 짧은 만료 시각을 부여한다. Pulse 서버를 새 키로 전환한 뒤 이전 키를 삭제한다. 만료 설정이 없거나 유효 키가 없으면 인증은 503으로 닫힌다.

## 저장소 연결

`upstream.mjs`는 기존 IGNITION의 고정된 `/api/v1/results` URL을 GET으로만 조회한다. 클라이언트가 upstream URL, 메서드, 헤더를 지정할 수 없고 redirect를 따르지 않는다. 기존 gateway 자격증명은 새 Render 서버에만 저장하고 외부 읽기 토큰과 분리한다. 내부 자격증명은 gateway 범위이며 read-only로 발급된 자격증명이 아니다. 최소 권한은 외부 토큰에 대한 서버 라우팅/고정 GET 호출로 강제한다.

인증된 results 요청 시 동기화하며 5초 캐시와 동시 요청 병합을 사용한다. `queued`/`running`/`paused` scan은 읽기 전용 부분 결과로 전달하므로 Pulse가 후보를 먼저 표시할 수 있다. `complete`는 최종 결과로 전달한다. `failed`/`cancelled`가 최신 작업이면 같은 프로세스에서 관측한 마지막 완료 결과를 fallback으로 유지하고 `sourceStatus`, `servedFromLastComplete`로 표시한다. upstream 연결 실패는 503이다.

**제약:** 기존 API가 최신 작업 1개만 제공하므로 Render 재시작 뒤에는 그 시점의 최신 작업부터 다시 관측한다. `running`/`paused`는 부분 결과로 복구할 수 있지만, 재시작 직후 최신 작업이 `failed`/`cancelled`이고 완료 이력을 별도로 읽을 수 없으면 과거 완료 결과를 복원할 수 없다. 완전한 완료 이력 보존에는 원본의 완료 전용 조회 API 또는 영구 저장소 연결이 필요하다.

배포 직전 실제 D1 읽기 확인: failed scan 1개, 완료 결과 0개. 실패 원인은 Binance HTTP 403이었다. 검증용 후보 데이터를 운영 결과로 삽입하지 않았다.

## 응답

`results.schema.json`에 JSON Schema가 있다. candidates 항목은 기존 IGNITION 정밀 후보 객체를 전달한다. 점수는 조건 합치도이며 수익 확률이 아니다. 다음은 완료 결과의 형태만 보여주는 예시로 실제 조회 결과가 아니다.

```json
{
  "schemaVersion":"1.0",
  "status":"complete",
  "scan":{"id":"example-scan","asOf":1790424000000,"finishedAt":1790424300000,"partialData":false},
  "candidates":[]
}
```

부분 진행 중에는 `status`가 `queued`/`running`/`paused` 중 하나이며 `candidates`에 현재까지 계산된 후보가 포함될 수 있다. `detailComplete`와 `coverage`를 확인해서 정밀 완료 여부를 구분한다.

완료된 검색이 없는 정상 상태:

```json
{"schemaVersion":"1.0","status":"empty","scan":null,"candidates":[]}
```

오류: 401 `unauthorized`, 403 `origin_forbidden`, 404 `not_found`, 405 `method_not_allowed`, 503 `authentication_unavailable`/`results_unavailable`. 내부 오류 내용이나 비밀값은 반환하지 않는다.

## 서버 호출

헤더: `Authorization: Bearer <server-secret-token>`

Pulse 서버 환경변수로만 실행한다. 셸 추적(`set -x`)과 verbose curl을 사용하지 않는다. 아래 curl은 토큰을 프로세스 인자에 넣지 않고 stdin config로 전달한다.

```bash
printf 'header = "Authorization: Bearer %s"\n' "$IGNITION_RESULTS_TOKEN" |
  curl --fail-with-body --silent --show-error --config - \
  "$IGNITION_API_BASE_URL/api/v1/results"
```

서버 전용 JavaScript:

```js
const response = await fetch(`${process.env.IGNITION_API_BASE_URL}/api/v1/results`, {
  headers: { Authorization: `Bearer ${process.env.IGNITION_RESULTS_TOKEN}` },
  cache: 'no-store',
  signal: AbortSignal.timeout(10000)
});
if (!response.ok) throw new Error(`IGNITION HTTP ${response.status}`);
const results = await response.json();
```

## 검증

`node --test *.test.mjs`: 14 tests passed. 실제 외부 배포 후 인증 200, 미인증 401, 쓰기 차단, origin 차단을 별도 검증해야 한다. 테스트는 매번 임시 난수를 메모리에서 생성하며 운영 토큰을 발급하지 않는다.
