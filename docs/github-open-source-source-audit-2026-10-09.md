# GitHub 공개 소스 1차 통합·중복 제거 심사 (2026-10-09)

목적: 기존 Pulse Radar Pro의 **읽기 전용** Binance 현물·USDT 무기한 기반 엔진에만 실제 이득이 있는 구성요소를 사용한다. Stars는 동적으로 변한다. 아래 원본을 무단 복사·배포하지 않으며 각 저장소의 개별 라이선스를 따른다.

## A. 지금 코드에 적용되는 필수 요소

| 소스 | 최근 확인 Stars | 코드 적용 여부 | 통합 기준 |
|---|---:|---|---|
| [SpiralDevelopment/candlestick-patterns](https://github.com/SpiralDevelopment/candlestick-patterns) | 536 | **아이디어 적용**, 코드는 독자 구현 | `ui/auto-chart/analysis/pattern-evidence.js` 공통 서버·브라우저 UMD. MIT; 2020년 마지막 Push |
| [BennyThadikaran/stock-pattern](https://github.com/BennyThadikaran/stock-pattern) | 413 | **참고**, 직접 복사하지 않음 | 차트 패턴과 구간 분할 방식만 연구. GPL-3.0 주의 |
| [bukosabino/ta](https://github.com/bukosabino/ta) | 최신 별도 확인 필요 | **계산 교차검증 후보** | 운영은 기존 JS 지표 모듈을 유지. MIT |
| [mementum/backtrader](https://github.com/mementum/backtrader) | 23,434 | 기존 백테스트 엔진과 기능 비교 | GPL-3.0; 별도 실험에 한정, 운영에 직접 연결하지 않음 |
| [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) | 110,355 | 역할 설계 참고 | 기존 Pulse AI·연구 AI와 중복 확인 후 뉴스/기술/위험 의견을 **출처 있는 분석 텍스트로만** 활용. Apache-2.0 |
| [akfamily/akshare](https://github.com/akfamily/akshare) | 22,870 | 보조 데이터 후보, 미설치 | 중국/주식/매크로 데이터용. Binance 캔들·OI 대체하지 않음. MIT |

## B. 연구·검증을 강화할 소스

| 소스 | 최근 확인 Stars | 용도 | 판단 |
|---|---:|---|---|
| [microsoft/qlib](https://github.com/microsoft/qlib) | 49,240 | OOS·walk-forward·ML 특성 학습 | 우선 연구용 별도 Python 워커로 분리 |
| [polakowo/vectorbt](https://github.com/polakowo/vectorbt) | 9,307 | 다량의 시그널·파라미터 민감도 시험 | 연구 후보. 별도 라이선스 검토 필요 |
| [ranaroussi/quantstats](https://github.com/ranaroussi/quantstats) | 7,686 | 실현손익 Sharpe/MDD·성과 리포트 | 거래비용 포함 실현 수익률 데이터가 있을 때만 |
| [je-suis-tm/quant-trading](https://github.com/je-suis-tm/quant-trading) | 10,945 | 학습용 전략 아이디어 | Apache-2.0. 샘플 코드 직접 결합 불필요 |
| [quantopian/zipline](https://github.com/quantopian/zipline) | 20,140 | 주식 이벤트 백테스트 | 현물·선물 혼합 운영에는 후순위; 마지막 Push 2024 |
| [wilsonfreitas/awesome-quant](https://github.com/wilsonfreitas/awesome-quant) | 30,013 | 자료 목록 | 직접 실행 코드 아님 |

## C. AI·시각화·거래 플랫폼 — 나중에 쓰거나 현재는 제외

| 소스 | 최근 확인 Stars | 결정 및 이유 |
|---|---:|---|
| [ZhuLinsen/daily_stock_analysis](https://github.com/ZhuLinsen/daily_stock_analysis) | 66,087 | 보고서 문구·전송 UX 참조, 코인 엔진 대체 X |
| [virattt/ai-hedge-fund](https://github.com/virattt/ai-hedge-fund) | 63,913 | 교육용 투자자 에이전트 연구. 원본도 실매매 목적 아님 |
| [HKUDS/Vibe-Trading](https://github.com/HKUDS/Vibe-Trading) | 35,060 | Python FastAPI/React 통째 전환 불필요 |
| [HKUDS/AI-Trader](https://github.com/HKUDS/AI-Trader) | 22,712 | AI 모델 성능 비교 연구 후순위 |
| [charliedream1/ai_quant_trade](https://github.com/charliedream1/ai_quant_trade) | 6,601 | 노트북 중심 교육/연구, 직접 결합 X |
| [georgezouq/awesome-ai-in-finance](https://github.com/georgezouq/awesome-ai-in-finance) | 6,647 | 큐레이션, 실행 엔진 아님 |
| [white07S/TradingPatternScanner](https://github.com/white07S/TradingPatternScanner) | 313 | 기존 `lib/pattern-engine.js` 기능과 중복 가능성, 추가 구현 전 정밀 비교 |
| [Omar-Karimov/ChartScanAI](https://github.com/Omar-Karimov/ChartScanAI) | 182 | 화면 이미지 인식은 OHLCV 수치 판정보다 부정확할 수 있어 보조 시각 검증만 |
| [gitsha256/stockanalyzerV5](https://github.com/gitsha256/stockanalyzerV5) | 0 | README는 인도 NSE 기술분석 설명. 앞서 주장된 Temporal Symmetry 코드는 확인 전까지 인용하지 않음 |
| [vnpy/vnpy](https://github.com/vnpy/vnpy) | 45,774 | 중국계 퀀트/거래 프레임워크. 현재 읽기 전용 사이트에 주문 실행 스택 불필요 |
| [fmzquant/strategies](https://github.com/fmzquant/strategies) | 5,929 | 전략 모음집, 기존 분류 코드와 대조할 때만 참고 |
| [highfestiva/finplot](https://github.com/highfestiva/finplot) | 1,186 | Python 데스크톱 차트용, 현재 모바일 HTML Canvas와 미호환 |

## 실제 반영 및 검증

- 원본 소스 6개를 무작정 설치하지 않았다. 기존 Node.js 구조에 맞춰 독립 재구현했다.
- 패턴 탐지: `ui/auto-chart/analysis/{bowl-symmetry,pattern-evidence}.js` → 서버 `lib/coin-scan` 재사용 → 심층 스캐너 `item.patternEvidence` (shadow).
- 차트: `auto-chart-lab.html`, `core.js`, `renderer.js`, `overlays.js` 및 분석 카드에 관찰 결과 표시.
- 고전 캔들: 해머·역해머·유성형·도지 계열·장악·잉태·관통·먹구름·샛별·석별을 기술적 형태로 탐지. **거래 진입 확정 신호가 아니라 후보 패턴**.
- 과거 연구: `bowl224/runner.js`에 당시 시점 확정봉 패턴 섀도 스냅샷 저장; `bowl224/stats.js`에서 성과 라벨별 집계. 실제 샘플 데이터가 없어 손익 개선을 주장하지 않음.
- 검증: `npm run test:pattern-evidence`, `scripts/verify-bowl224-shadow.js`, `scripts/verify-period-symmetry-route.js`. GitHub Actions 확인.
- 서버리스: period-symmetry 엔드포인트를 공통 API 라우터로 옮겨 12개 제한 충족. 실제 Vercel 앱 권한/배포는 별도 검증 필요.

## 다음 단계 (분리된 연구 모드)

1. 실제 과거 상승·실패 표본을 가져와 탐지율, 거짓양성, OOS hit-rate를 측정한다. 이 과정에서 거래 시점과 수익 실현 시점을 구분한다.
2. `ta`와 운영 기술지표 값의 독립 비교 테스트 세트를 추가한다.
3. `qlib`/ `vectorbt` 기반 Python 워커는 데이터 CSV 계약과 라이선스가 확정되면 별도 서비스로 실험한다.
4. TradingAgents 방식 다각도 분석은 기존 Pulse AI를 조사한 뒤 겹치지 않는 역할만 추가한다. LLM 평가가 신호의 가격·수급 게이트를 우회할 수 없다.
5. 실데이터 통과 전에는 새 소스가 주문을 자동 전송하거나 기존 랭킹을 임의로 승격하지 않는다.
