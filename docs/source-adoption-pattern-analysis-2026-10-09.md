# 오픈소스 도입 검토 — 2026-10-09

목표: 기존 Node.js 코인 스캔을 유지한 채, 지표·차트 패턴·캔들 패턴·백테스트·AI 설명 품질을 높인다.

| 저장소 | 라이선스(저장소 LICENSE 확인) | 판단 | 사용 범위 |
|---|---|---|---|
| [akfamily/akshare](https://github.com/akfamily/akshare) | MIT | 보조 | 중국 주식·매크로 추가 데이터용. Binance 시장원천과 혼합 금지 |
| [bukosabino/ta](https://github.com/bukosabino/ta) | MIT | 지표 검증용 | MA·RSI·MACD·ATR 계산 결과를 기존 JS 엔진과 교차 테스트 |
| [BennyThadikaran/stock-pattern](https://github.com/BennyThadikaran/stock-pattern) | GPL-3.0 | 알고리즘 연구 | 개념·출력 형식만 비교. 소스 복사/연결 전 라이선스 검토 |
| [SpiralDevelopment/candlestick-patterns](https://github.com/SpiralDevelopment/candlestick-patterns) | MIT | 선행 도입 | 망치·도지·상승/하락 장악형. 우선 독립 JS 구현 |
| [mementum/backtrader](https://github.com/mementum/backtrader) | GPL-3.0 | 독립 연구 실험 | 수수료/슬리피지/시간단절 반영해 별도 검증. 포함/배포 시 라이선스 검토 |
| [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) | Apache-2.0 | AI 설명용 후순위 | 사실/출처·리스크/반증 평가. 신호의 소급 승격 금지 |

## 코드 반영 상태

- `lib/coin-scan/bowl-symmetry.js`: 기간 대칭 + 횡보 폭 + 돌파/거래량 + 112/224/448 이동평균.
- `lib/coin-scan/pattern-evidence.js`: 확정봉만 사용해 1D·4H의 밥그릇·망치·도지·장악형 탐지.
- `lib/coin-scan/scan-service.js`: 심층 분석 시 `item.patternEvidence`로 첨부. **관찰 모드**이며 기존 스캔 분류 및 매매 신호를 변경하지 않음.
- `npm run test:pattern-evidence`: 두 독립 테스트. 실데이터/전체 CI/배포 검증은 별도.

## 반드시 지킬 검증 절차

1. OHLCV 출처, 시장 구분(현물/선물), closeTime 및 서버시각을 기록한다.
2. 미확정봉을 제외하고 모든 판단은 **판정 시점 이전 데이터만** 사용한다.
3. 448봉 미만 장기선 미조회는 N/A로 표시한다. 4H의 448봉과 **일봉** 448일선은 서로 다르다.
4. 패턴 한 개만으로 롱 신호를 승격하지 않는다. OI·taker·funding은 검증 데이터가 없으면 N/A.
5. 샘플링 편향, 시간 누수, 생존 편향을 통제하고 아웃오브샘플 테스트한다.
6. 손익 검증은 현물/선물, 수수료, 슬리피지, 펀딩, 종목 상장일을 분리한다.
7. 라이선스 의무가 다른 Python 구현을 그대로 복사하여 Node 서비스에 편입하지 않는다.

## 남은 일

- Vercel 배포 실패 조사 및 권한 복구 (현재 403 scope 제한).
- 대량 과거 샘플에 대해 탐지기 오탐·누락률 계산.
- 백테스트 인터페이스와 AI 해설을 테스트 통과 후 단계별로 연결.
- 모바일 차트 오버레이에 매집 박스, 저점, 돌파선 표시.
