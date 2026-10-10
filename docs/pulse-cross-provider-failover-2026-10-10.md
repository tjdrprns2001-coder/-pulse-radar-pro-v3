# Pulse AI 다중 공급자 자동 전환 — 2026-10-10

## 구현 결과

Gemini **모델 간 폴백(기존 기능)**을 넘어, 서로 다른 API 공급자에 대해 실제 서버측 HTTP 요청을 수행하는 **공급자 간 폴백**을 구현했다. 모든 응답은 기존 Pulse AI 분석 형식으로 정규화되어 기존 페이지·채팅·AI 3역할 위험 심의에서 읽을 수 있다.

호출 대상은 서버에 등록된 환경변수 중 실제 설정된 공급자만이며, 사용자에게 키를 노출하거나 입력받지 않는다. 키 존재만으로 API가 성공한다고 주장하지 않는다. **투자 주문·매매 신호 변경은 전혀 없다.**

### 기본 순서 (설정된 것만 실행)

1. Gemini `GEMINI_API_KEY` — 기존 주 모델 → Flash-Lite → Flash 폴백
2. Groq `GROQ_API_KEY` — `openai/gpt-oss-20b`
3. OpenRouter `OPENROUTER_API_KEY` — `openai/gpt-oss-20b`
4. Cohere `COHERE_API_KEY` — `command-r7b-12-2024`, v2/chat API 및 전용 JSON 응답 파서
5. AionLabs `AIONLABS_API_KEY` — `aion-labs/aion-3.5`
6. Ollama Cloud `OLLAMA_API_KEY` — `gemma4:31b`
7. LLM7.io `LLM7_API_KEY` — `DeepSeek-V4-Flash-0731`
8. Hugging Face `HUGGINGFACE_API_TOKEN` — `openai/gpt-oss-20b:cheapest`
9. Kilo Code `KILOCODE_API_KEY` — `openai/gpt-oss-20b`
10. Mistral AI `MISTRAL_API_KEY` — `mistral-small-latest`
11. Cloudflare Workers AI `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` — `@cf/meta/llama-3.1-8b-instruct`

모델명·가격·접근권한·상장 여부는 공급자 설정과 시점에 따라 변경 가능. 제공자별 모델을 바꾸려면 `PULSE_AI_MODEL_GROQ` 등 `PULSE_AI_MODEL_<PROVIDER>`를 설정. 순서는 `PULSE_AI_PROVIDER_ORDER`에 쉼표 구분한 공급자 ID로 설정. 입력 URL은 허용하지 않으며 사전에 확인한 **고정 HTTPS 엔드포인트**만 사용한다.

### 호출 판단·비용 제한

- 공급자마다 1회만 호출하고 오류가 나면 다음 공급자 시도. Gemini 자체 다중 모델 시도 포함 작업당 최대 14번 HTTP 요청으로 제한한다.
- `429`, `402`, `401`, `403`, `400`, `404`, `5xx`, 네트워크/응답 형식 오류를 각각 관측. 실패한 **해당 공급자를 쿨다운**하고 다른 서비스로 이동한다. 인증·결제·미지원 모델 오류는 1시간, 429·5xx는 2분 동안 인스턴스당 건너뛴다.
- 모든 공급자가 실패하면 **로컬 규칙 분석**을 반환하되, AI 생성 성공으로 표시하지 않는다.
- `roleDebate`는 기존 3역할 연구 전용 위험 심의, OI/체결·데이터 시각 검증, 10분 중복 쿨다운, 시간당 12회 심의 제한을 유지한다. 제공자/모델별 실제 결과를 `providerUsed`, `modelUsed`로 기록.
- 브리핑·채팅에도 동일 폴백을 적용한다. 새로운 공급자 모델은 토큰 요금이 부과될 수 있고, 일부 공급자는 잔액·유료 플랜을 요구한다. **무료 호출을 보장하지 않는다.**
- 프로젝트 전체 크레딧 부족도 같은 공급자의 다른 모델로 돌려 회피하지 않고, 다음 **독립된 API 키/공급자**로 넘어간다. 모든 공급자 할당량이 소진되면 중단한다.
- 이 제한은 Render 실행 프로세스의 메모리에서 적용되며, 재시작·복수 인스턴스·다른 실행 환경 간에 전역 공유되지 않는다. 고객별 예산 지출 상한이나 계정 통합 청구 시스템은 아직 없다.

### 데이터 보안 및 API

- `lib/pulse-ai/multi-provider-gateway.js`: 사전 허용된 11개 공급자 엔드포인트, 각 JSON 형식·인증·예외처리, 캐시/쿨다운/시도 상한
- `api/pulse-ai.js`: 기존 Pulse AI endpoint가 공급자 라우터를 사용
- `lib/pulse-ai/llm-role-debate.js`: 역할별 모델/공급자 ID 추적, 최종 위험 심의는 연구 전용
- `lib/pulse-ai/provider-config-health.js`: 11개 설정 상태 및 라우터 구현 여부만 응답, 키 값 미노출
- `lib/pulse-ai/briefing-service.js`: 기존 브리핑, 챗봇, 건강 상태에 `modelRouting` 제공
- `scripts/verify-pulse-ai-multi-provider-gateway.js`: 규칙/모의 HTTP 전체 11 공급자, 429 → 타 공급자 성공, Cohere 응답, 키 인증 실패, 전부 고갈, 재호출, 비허용 URL 차단 테스트
- `.github/workflows/check-pulse-ai-v2.yml`: CI 검증
- `ui/pulse-ai.js`: AI 3역할 심의에서 공급자·모델 표시

운영 상태를 확인하는 방법:

`GET /api/pulse-ai?mode=health`의 `providerEnvironment`와 `modelRouting`을 읽으면, 등록 여부와 현재 라우팅 결과를 **키 공개 없이** 볼 수 있다. `configuredProviders`는 환경변수 등록을 의미하며, `readyProviders`는 쿨다운 상태만 뜻한다. 실제 인증·할당량 검증을 위한 온라인 호출은 별도로 진행해야 한다.

### 공식 API 참고

- Groq https://console.groq.com/docs/models
- OpenRouter https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request
- Cohere https://docs.cohere.com/v2/reference/chat
- AionLabs https://www.aionlabs.ai/docs/
- Ollama https://github.com/ollama/ollama/blob/main/docs/api/openai-compatibility.mdx
- LLM7.io https://llm7.io/models/features/json-mode/
- Hugging Face https://huggingface.co/docs/inference-providers/main/index
- Kilo Code https://github.com/Kilo-Org/kilocode/blob/main/packages/kilo-docs/pages/gateway/api-reference.md
- Mistral https://docs.mistral.ai/api
- Cloudflare https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/

마지막으로, 과거 대화에 실제 키가 들어간 상태이므로 **각 공급자 키 교체를 강력히 권장한다.** 신규 키는 Render 환경변수에만 입력할 것.
