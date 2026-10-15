# PulseRadar System One 결정 계층 — v2 (2026-10-15)

## 현재 범위와 의도
기존 Pulse AI의 \`lib/pulse-ai/typesafe-judgment.js\` 를 확장한다. 결정 계층은 **SHADOW_ONLY** 연구 모드이며 주문, 레버리지, 기존 후보 순위, 알림 게이트를 직접 변경하지 않는다. 텍스트 설명은 기존 브리핑이 제공하고, System One 모델은 동일한 시점의 state에 Choice/Score/Noul 질문을 처리한다.

### 실행 방식
1. 스캐너 수집 → 후보 정렬 → \`lib/pulse-ai/context-builder.js\` 에서 입력 생성
2. 실패/차단/오래된 종목 제외. 15분 넘게 지난 전체 스냅샷도 사용하지 않음
3. 최다 5개 후보에 대해서만 1회 요청: \`marketMode\` Choice + 종목별 \`ready\` Score(0~4) / \`chase\` Noul(0~1)
4. \`decision-audit.js\` 에서 타입, 응답 범위, 누락값, 입력 필드 수와 시장 모드 검증
5. 결과: SHADOW, ABSTAIN, CHASE_RISK_REVIEW, RESEARCH_ONLY. *어떤 것도 주문 실행이 아님*
6. 빈 응답, 잘못된 값, 시간 불일치, 반복 장애는 fail-closed. 브리핑·기존 스캐너는 계속 동작

## 자체 결정 모델 연결
별도 GPU/CPU 호스트에서 TypeSafe 호환 \`POST /v1/systemone\` 서버를 운영하면 기존 Pulse AI 경로와 그대로 호환된다.
Kev는 [공식 서버](https://github.com/jaredpalmer/kev/blob/main/kev/serve.py)를 활용할 수 있다. Laya는 이 저장소의 \`services/decision-model/laya-bridge.py\` 를 사용한다. **해당 모델은 웹 서버리스 함수 내부에서 자동 실행되지 않는다.** 독립 서버를 먼저 배포해야 한다.

PulseRadar 런타임의 서버 환경변수 (비밀은 절대로 Git에 커밋 금지):
- \`DECISION_PROVIDER=kev\` 또는 \`laya\` 또는 \`typesafe\`
- \`DECISION_API_URL=https://YOUR-MODEL-HOST\` (끝에 \`/v1/systemone\` 붙이지 않음)
- \`DECISION_API_KEY=<secret>\` (Bearer, server-side only)
- \`DECISION_MODEL=kev-0.8b\` (모델에 실제 등록된 이름; Laya Router는 자동 선택)

이 변수들이 없으면 기존 \`TYPESAFE_API_KEY\`, \`TYPESAFE_BASE_URL\`, \`TYPESAFE_DEFAULT_MODEL\` 로 폴백한다. 둘 다 없으면 **disabled** 로 표시한다. API key는 브라우저에 내려보내지 않는다. 테스트용 키는 외부에 공개하지 않는다.

### Laya CPU 개발용
별도 Python 3.11 환경:
\`\`\`bash
python -m venv .venv
. .venv/bin/activate
pip install laya
export DECISION_API_KEY='change-me-to-random-secret'
export LAYA_HOST=127.0.0.1
python services/decision-model/laya-bridge.py
\`\`\`
운영 환경에서는 사설망/TLS 리버스 프록시, 요청량 제한, 비밀 관리, 모델 다운로드 용량, memory/CPU 부하, 외부 접근 통제를 추가한다. Laya bridge는 같은 질문 형식으로 응답하지만 원본 학습/검증을 대체하지 않는다. 외부 노출이 필요한 경우 인증과 TLS를 반드시 적용한다.

## 애널리스트 데이터 품질 규칙
- Null과 빈값은 0이 아니다. 0은 측정값이 실제로 0일 때만 허용한다.
- Score(2.7/4)는 가격 상승 확률 67.5%가 아니다.
- Noul(0.8)은 해당 문장에 대한 모델의 확률이지 투자 성공 확률이 아니다.
- 충분한 독립 지표가 없으면 모델 출력을 보류한다. 각 종목에 입력/누락 필드 목록을 돌려준다.
- 캔들 확정 여부, 거래소별 OI 타임스탬프/단위 통일, 실제 체결/펀딩, 모델 학습 라벨의 미래 누출은 상위 스캐너·실험 파이프라인에서 별도로 검증한다. 이 계층은 단독으로 이를 보장할 수 없다.
- 시계열 결과 라벨은 관측시점보다 반드시 이후에 생성하며, 무작위 train/test 섞기 금지. 실전 적용 전에 워크포워드, OOS, Brier/ECE(**실제 이벤트 확률로 학습된 모델에 한함**), 비용/슬리피지, 레짐별 오탐률 비교 필수.
- 모든 모델 판단은 데이터 측정/분류 역할. 규칙 기반 위험 차단은 모델 점수로 우회 불가.

## 테스트 및 승격 조건
\`node scripts/verify-decision-layer.js\` 실행. GitHub Actions \`decision-layer.yml\` 는 이 테스트와 기존 Pulse AI 회귀 테스트를 수행한다.
장애·일시정지·재배포 시 기존 시장 화면 유지. 외부 모델 활성화와 ACTIVE 승격은 별도 데이터 성능 평가·자격 확인·운영 검토를 필요로 한다. **이 PR만으로 모델 서빙 인프라나 실제 모델 가중치 배포는 완료되지 않는다.**
