# Pulse AI 다각도 근거 심의 1단계 — 2026-10-10

## 구현 상태

TradingAgents [공식 저장소](https://github.com/TauricResearch/TradingAgents)의 전문 분석가·리서치 토론·위험관리 조직 구성을 참고하여 **기존 Pulse AI에 별도 읽기 전용 심의판**을 구현했다.

**매우 중요:** 이 단계는 TradingAgents Python 원본을 설치한 상태도, 여섯 개 독립 LLM을 실행시켜 실제 토론시킨 상태도 아니다. 현재는 **독립적으로 검증 가능한 규칙 기반 관점별 근거 분해**이며, 향후 LLM 분석가 연결을 위한 안정적인 데이터 계약·화면·안전 게이트를 만드는 단계다.

### 실제 구현 기능

- `lib/pulse-ai/multi-perspective-board.js` — 여섯 역할, 스캐너 입력만 사용. 실시간 상태 및 연령 검사, 선물/현물 출처 상태, OI·taker·펀딩 누락 구분. 돌파 전후 과열과 실제 수급의 의견 차이를 명시.
  1. 시장 환경: 상승·하락 종목 수, 시장 폭
  2. 기술 구조: 기존 가격변화·거래량 가속·후보 점수(점수 자체 수정 없음)
  3. 수급 분석: OI, 매수/매도 체결비, 펀딩 기록이 없으면 `UNKNOWN`
  4. 상승 가설: 관측된 긍정 근거만 재검토
  5. 하락 가설: 과열·수급 약화·무효화 확인 부족을 반론으로 표시
  6. 위험 심의: 스캔 오류, 오래된 데이터, 급등 과진행 조건이면 `DATA_OR_RISK_BLOCKED`
- `lib/pulse-ai/briefing-service.js` — 기존 브리핑 JSON의 `multiPerspective` 속성과 다각도 질문(채팅 `answerMode: role-review`) 및 health 진단 연결.
- `pulse-ai.html`, `ui/pulse-ai.js`, `ui/pulse-ai.css` — 사용자가 브리핑 페이지에서 종목을 바꾸고 여섯 관점의 관측 근거·누락 근거를 펼쳐볼 수 있는 반응형 섹션.
- `scripts/verify-pulse-ai-multi-perspective.js` — 과열, OI 누락, 오래된 데이터, 값 오염, 원본 점수 보존, 브리핑/채팅 연결, 안전한 `textContent` 렌더링 검증.
- `.github/workflows/check-pulse-ai-v2.yml` — 이전에는 기능 브랜치의 push 위주였으나 이제 기본 브랜치 `main`의 push에서도 검증.

### 출력과 안전 원칙

각 심의 결과는 `shadowOnly:true`, `method: DETERMINISTIC_ROLE_LENSES_NOT_LLM_AGENTS`, `permission: READ_ONLY_NO_ORDER_NO_RANK_PROMOTION`으로 명시한다.

`readiness` 값은 `DATA_OR_RISK_BLOCKED`, `MISSING_DERIVATIVES`, `INSUFFICIENT_CONSENSUS`, `RESEARCH_WATCH` 중 하나다. 어떤 결과도 매매 실행·추천·Astra 후보 랭킹 승격에 연결되지 않는다. `RESEARCH_WATCH`는 **조사해볼 후보**일 뿐 승인/매수 신호가 아니다.

- OI 값이 없으면 `0`으로 가정하지 않는다.
- 거래량 가속과 OI는 미래 가격을 보장하지 않는다.
- 독립 AI 두 명이 동의한 것처럼 규칙의 두 줄을 별개 근거로 위장하지 않는다.
- 미확인 뉴스/소셜 감성 및 펀더멘털 데이터를 허구로 채우지 않는다.
- 과열 코인은 리뷰 표시 순위만 뒤로 미루며 기존 스캐너 우선순위/점수를 변경하지 않는다.
- 기존 Gemini 브리핑과 TypeSafe 판단은 유지하며 가상 투자 실행 권한은 없다.

### 검증 결과

GitHub Actions에서 Pulse AI 전용 회귀 테스트 및 저장소 Foundation Verify 확인. 직접 확인할 링크:
- [Pulse AI v2 checks](https://github.com/tjdrprns2001-coder/-pulse-radar-pro-v3/actions/workflows/check-pulse-ai-v2.yml)
- [Foundation Verify](https://github.com/tjdrprns2001-coder/-pulse-radar-pro-v3/actions/workflows/foundation-verify.yml)

### 다음 단계

TradingAgents의 독립 LLM 역할과 달리 이번 버전은 규칙만 실행한다. 다음 단계는 실제 선택적 Gemini 등 모델별 전문가 호출을 추가하되 **고정 JSON 스키마·출처/시각 정합성·비용/호출 제한·역할 간 의견 대조·LLM 장애 시 규칙 기반 폴백**을 먼저 검증해야 한다.

원본 TradingAgents의 파이썬 코드나 라이선스 원문은 무단 복제하지 않았다. 서버 운영 배포와 모바일 실기기 확인은 아직 미검증이다.
