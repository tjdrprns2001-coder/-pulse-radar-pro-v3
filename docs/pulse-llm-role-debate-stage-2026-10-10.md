# Pulse AI 실제 Gemini 역할별 심의 2단계 — 2026-10-10

## 무엇이 실제로 구현됐는가

TradingAgents의 **상승/하락 리서치 토론 → 위험관리 심의** 순서를 참고한 자체 오케스트레이터와, Pulse AI가 이미 사용하던 Gemini API에 대한 **실제 HTTP 역할 호출**을 구현했다.

Python TradingAgents 원본 패키지 전체를 설치·실행한 것이 아니라, Pulse AI가 실제로 사용하는 API 공급자에 동일 모델을 세 번 각각 호출한다. 따라서 '3개의 서로 다른 모델이 독립적으로 동의한 판단'이라고 말해서는 안 된다.

- [`lib/pulse-ai/llm-role-debate.js`](../lib/pulse-ai/llm-role-debate.js): 안전 게이트 → `bull` → `bear` → `risk` 순서의 개별 Gemini 호출. 앞선 두 모델 출력은 마지막 위험관리 호출의 '반론할 내용'으로 전달된다. 최종 권한은 언제나 연구 전용이다.
- [`lib/pulse-ai/openai-gateway.js`](../lib/pulse-ai/openai-gateway.js): 새 `reviewRole()` 함수가 Gemini `generateContent` 공개 HTTP 엔드포인트를 POST로 호출하도록 구현. 실사용 키는 기존 서버 환경의 `GEMINI_API_KEY`로만 읽으며 코드·응답에 노출하지 않는다. JSON 응답 강제, 낮은 temperature, 최대 출력 900토큰, 개별 12초 제한, 웹검색 비활성.
- [`lib/pulse-ai/briefing-service.js`](../lib/pulse-ai/briefing-service.js): 명시적 `POST /api/pulse-ai?mode=chat` 요청에 `llmRoles:true`인 경우에만 역할별 LLM 심의 실행. 일반 브리핑/기존 다각도 심의는 **추가 LLM 호출 없음**. Gemini가 없으면 기존 규칙 기반 심의로 돌아간다.
- [`api/pulse-ai.js`](../api/pulse-ai.js): chat POST에서 엄격하게 `llmRoles===true`만 전달. 새로운 Vercel 서버리스 함수 개수를 늘리지 않았다.
- [`ui/pulse-ai.js`](../ui/pulse-ai.js), [`pulse-ai.html`](../pulse-ai.html), [`ui/pulse-ai.css`](../ui/pulse-ai.css): 종목 선택 후 **'AI 3역할 심의 실행' 버튼**을 직접 눌렀을 때만 실행. 모델 결과 3개와 근거 필드 IDs, 위험 심의 결론을 표시. API 키 비활성·데이터 부실·과열이면 실행 버튼 비활성화. 모바일 대응 CSS와 새 버전 쿼리로 정적 캐시 갱신.
- [`scripts/verify-pulse-ai-llm-role-debate.js`](../scripts/verify-pulse-ai-llm-role-debate.js): 실제 HTTP 호출 형식은 가짜 Gemini 응답 서버로 검증한다. 일반 브리핑과 LLM 역할 요청의 호출을 구분하며, 총 3회 호출·역할 순서·앞선 반론 전달·근거 필드 검증·거짓 근거 차단·실패 폴백·중복 요청·10분 쿨다운·전체 시간당 예산·일반 API 통합·UI 렌더러 연결 검사를 포함.
- [`.github/workflows/check-pulse-ai-v2.yml`](../.github/workflows/check-pulse-ai-v2.yml): 기본 브랜치 Push/PR마다 Pulse AI 전체 회귀 테스트 실행.

## 화면 및 API 사용

기존 Pulse AI 페이지 `/pulse-ai.html`의 **다각도 근거 심의** 패널에서 종목을 선택한 뒤 'AI 3역할 심의 실행' 클릭.

기존 API `POST /api/pulse-ai?mode=chat`:

```json
{
  "question": "선택 종목의 상승 하락 위험을 역할별로 심의",
  "selectedSymbol": "BTCUSDT",
  "llmRoles": true
}
```

결과 `llmDebate`: `status:READY|CACHED|BLOCKED|DISABLED|COOLDOWN|BUDGET_LIMIT|FAILED|IN_PROGRESS|CONCURRENCY_LIMIT`. `roles`의 `role`, `stance`, `summary`, `evidenceFields`는 각각 개별 모델 호출의 응답을 strict-check한 값이다. 기존 `multiPerspective` 규칙 기반 심의와 병렬로 표시된다.

## 보수적 비용·안전 제어

- 데이터가 오래되었거나, 외부 대체 데이터로 선물 OI가 비었거나, 급등 과열을 탐지하면 **모델을 호출하지 않는다**.
- 같은 종목·동일 데이터는 10분 안에 캐시로 재사용. 새 데이터로 바뀌어도 10분 제한 내에서는 재호출을 막는다.
- **서버 프로세스당** 시간당 신규 리뷰 최대 12회(최대 36회 역할 호출 시도), 동시 심의 2건. 프로세스 재시작/서버리스 여러 인스턴스 사이에는 공유되지 않는 한계가 있으므로 서버 전역/계정별 별도 저장소 기반 한도는 미구현이다.
- Gemini 오류나 모델의 부적절한 응답이 나오면 일부 모델 의견을 완료로 보여주지 않는다. 실패 시 실제 호출 시도 횟수 `modelCalls`를 기록하고 그 종목에는 쿨다운을 적용한다.
- 모델이 참조하는 `evidenceFields`는 기존 스캐너의 **정해진 숫자 필드 ID**에 반드시 존재해야 한다. 검증되지 않은 숫자/뉴스/상장 이벤트는 입력하지 않으며 외부 웹 검색도 하지 않는다.
- LLM 설명 문장의 모든 의미가 사실로 증명되는 것은 아니다. 사용자에게 **모델 해석**으로 보여줘야 한다.
- `risk`의 출력을 실제 포지션 개설 허가로 사용하지 않는다. 기존 Astra 신호·후보 우선순위·스캐너 결과는 변경 불가, `shadowOnly:true`.

## 확인된 것과 확인하지 못한 것

GitHub Actions의 **모의 HTTP API 테스트는 완료**되었지만, **현재 서버에 배포된 실제 `GEMINI_API_KEY`가 있는지, 공개 Gemini 호출이 실제 과금 포함 정상 완료되는지, Render 운영 서비스가 새 커밋을 수신했는지, iOS 실기기 렌더링은 아직 검증되지 않았다.** 이 단계의 실제 완료는 역할 호출을 위한 코드를 배포 가능한 형태로 갖추고, GitHub 회귀 검증을 통과한 상태를 뜻한다.

계정·호스팅 간 공유되는 쿼터 저장소, 별도 모델 공급자의 truly independent agent 구성, 실제 출처별 독립 뉴스 리서치, 거래 수행·실현 손익 검증은 후속 단계다.
