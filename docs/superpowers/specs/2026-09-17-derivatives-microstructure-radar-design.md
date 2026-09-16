# Derivatives + Microstructure Radar Design

## Goal

PulseRadar Pro v3의 ALTCOIN FLOW RADAR를 공개 시장 데이터 기반의 다중 증거 이상활동 탐지기로 확장한다. 기존 DEX/CEX/온체인 신호 위에 파생시장과 마이크로스트럭처 데이터를 결합하되, 가격 방향 예측이나 거래 실행 기능은 추가하지 않는다.

## Scope

이번 단계는 다음 데이터를 추가한다.

- 파생시장: Open Interest, funding rate, long/short crowding, taker buy/sell imbalance.
- 마이크로스트럭처: order-book bid/ask imbalance, spread, top-of-book depth, trade-side imbalance.
- 멀티거래소 교차검증: Binance, Bybit, OKX를 파생시장 주요 공개 공급자로 사용하고, Upbit/Bithumb/기존 CEX 스냅샷은 현물 참여도 및 한국시장 교차확인에 활용한다.
- 기존 DEX, CEX, 공개 온체인 데이터를 하나의 코인 단위 evidence model로 통합한다.

Out of scope:

- 주문 실행, 자동매매, 지갑 서명, 레버리지 포지션 제어.
- 개인별 매수/매도 추천.
- 단일 지표를 이용한 가격 방향 예측.

## Verified public-data capabilities

공식 문서 기준으로 설계한 입력은 다음과 같다.

- Binance Futures: OI/통계성 시장 데이터, funding 관련 공개 시장 데이터, taker buy/sell activity 계열 데이터를 공개 시장 데이터 레이어로 사용할 수 있다.
- Bybit: 공개 시장 API에서 open interest/funding/long-short 계열 지표를 수집하는 어댑터를 둔다.
- OKX: 공개 market data의 open interest/funding/order book/trades를 정규화한다.
- Upbit: 공개 WebSocket에서 orderbook total ask/bid size, 레벨별 잔량, trade side(BID/ASK)를 실시간 수집할 수 있다.
- Bithumb: 공개 체결/호가 피드는 선택적 보조 공급자로 둔다.

모든 공급자는 partial-failure가 가능하며 하나의 공급자 장애가 전체 market-flow API를 실패시키면 안 된다.

## Architecture

기존 `api/market-flow.js`가 오케스트레이터 역할을 유지한다. 새 모듈을 분리한다.

- `lib/market-flow/derivatives.js`
  - 거래소별 원시 응답을 공통 DerivativesEvidence로 정규화한다.
  - OI, funding, long/short, taker activity의 null-safe 변환과 품질 점수를 담당한다.
- `lib/market-flow/microstructure.js`
  - order book 및 trade-side 데이터를 공통 MicrostructureEvidence로 정규화한다.
  - bid/ask depth imbalance, spread, trade-side imbalance를 계산한다.
- `lib/market-flow/coin-anomaly.js`
  - 기존 score에 파생시장/마이크로스트럭처 evidence를 추가한다.
  - 단일 신규 지표가 PRE-SURGE/SURGE를 만들 수 없도록 independent-evidence gate를 강화한다.
- `api/market-flow.js`
  - 후보 코인을 먼저 좁힌 뒤 상위 후보만 deeper public-market 조회를 하는 2-stage collector를 적용한다.
- `ui/radar-altcoin-flow.js`
  - OI/funding/order-book/taker 상태를 요약 표시한다.
  - 데이터가 없으면 0이 아닌 `-`/대기 상태로 표시한다.

## Normalized derivatives model

코인별/거래소별 정규화 레코드:

```js
{
  venue,
  symbol,
  baseAsset,
  marketType: 'futures' | 'perpetual',
  openInterest,
  openInterestUsd,
  openInterestChange5m,
  openInterestChange15m,
  fundingRate,
  fundingZScore,
  longShortRatio,
  takerBuySellRatio,
  updatedAt,
  freshnessMs,
  confidence
}
```

규칙:

- 통화 단위가 명확하지 않은 값은 임의 USD 변환하지 않는다.
- OI change는 과거 샘플이 없으면 null이다.
- funding은 방향 신호가 아니라 crowding/overheat evidence로만 사용한다.
- long/short ratio는 거래소별 정의 차이를 숨기지 않고 source confidence를 반영한다.

## Normalized microstructure model

```js
{
  venue,
  symbol,
  baseAsset,
  bidDepthUsd,
  askDepthUsd,
  bookImbalance,
  topSpreadBps,
  tradeBuyUsd,
  tradeSellUsd,
  tradeImbalance,
  sampleWindowMs,
  updatedAt,
  freshnessMs,
  confidence
}
```

Derived metrics:

- `bookImbalance = (bidDepth - askDepth) / (bidDepth + askDepth)` when denominator > 0.
- `tradeImbalance = (buy - sell) / (buy + sell)` when denominator > 0.
- spread는 bps로 통일한다.
- 깊이는 동일한 depth policy 안에서만 비교한다.

## Candidate-first collection

전체 코인에 모든 API를 호출하지 않는다.

Stage 1:

- 기존 `coinFlows`, DEX 5m volume, CEX breadth, radar score, live volume anomaly로 후보 집합을 만든다.
- 기본 최대 후보 수는 40개.
- WATCH-only + 낮은 거래량 + 낮은 신뢰도 코인은 deep lookup에서 제외한다.

Stage 2:

- 후보에 대해서만 derivatives/microstructure 데이터를 수집한다.
- 공급자별 concurrency cap, timeout, cache TTL을 둔다.
- 한 공급자 실패 시 다른 공급자 결과는 유지한다.

## Scoring model

기존 anomaly score를 유지하면서 evidence dimension을 확장한다.

Core dimensions:

1. Short-window volume anomaly.
2. Multi-CEX/DEX breadth.
3. DEX buy-pressure estimate.
4. OI expansion/contraction anomaly.
5. Taker buy/sell imbalance.
6. Order-book imbalance.
7. Funding crowding.
8. Long/short crowding.
9. Liquidity impulse.
10. Public on-chain activity.

New safeguards:

- PRE-SURGE: 최소 3개의 서로 독립적인 evidence dimension + 최소 2개의 independent source family 필요.
- SURGE: 최소 4개의 evidence dimension + 가격/거래량 실제 활성 + 최소 3 source family 필요.
- funding/long-short만으로 PRE-SURGE/SURGE 금지.
- order-book imbalance 단독으로 PRE-SURGE/SURGE 금지.
- OI 증가 단독으로 PRE-SURGE/SURGE 금지.
- extreme funding, extreme long/short, 얕은 book, 급격한 liquidity drop은 `RISK` 보조 신호로 반영한다.

Source families:

- spot/cex
- dex
- derivatives
- microstructure
- onchain

## New displayed fields

ALTCOIN FLOW RADAR 상세 영역에 다음을 추가한다.

- OI 변화 5m / 15m
- Funding
- Taker ratio
- Book imbalance
- Spread bps
- Derivatives venue breadth
- Evidence count / source-family count
- Data freshness

상단 summary에는 다음 카운트를 추가한다.

- derivatives-confirmed anomalies
- order-book-confirmed anomalies
- 3+ source-family confirmed anomalies
- crowding risk count

모든 표현은 `활동 이상`, `과열`, `쏠림`, `교차확인` 같은 중립 표현을 사용한다. `매수 추천`, `상승 확정`, `급등 확정` 표현은 사용하지 않는다.

## History and baselines

- 브라우저 local history와 서버 in-memory rolling history를 모두 활용한다.
- derivatives OI/funding은 5m/15m 비교용 ring buffer를 둔다.
- microstructure는 고빈도 원본을 무제한 저장하지 않고 5~15초 샘플로 압축한다.
- stale sample은 score에서 제외한다.
- null은 0으로 변환하지 않는다.

## Reliability

- request timeout per provider.
- bounded concurrency.
- short TTL cache.
- stale-while-revalidate.
- partial success response.
- provider health and freshness exposed in API.
- score는 source freshness/confidence로 감쇠한다.
- API 응답이 오래되면 UI에서 `DEGRADED` 표시.

## API extension

`GET /api/market-flow` 응답에 optional 필드를 추가한다.

```js
{
  derivativesFlows: [],
  microstructureFlows: [],
  coinFlows: [],
  providerHealth: {},
  coverage: {
    derivativesMarkets,
    microstructureMarkets,
    derivativesVenues,
    microstructureVenues
  }
}
```

기존 필드는 삭제/변경하지 않아 backward compatibility를 유지한다.

## Testing

TDD로 다음을 검증한다.

- null OI/funding/orderbook values stay null.
- OI delta baseline math.
- funding crowding threshold behavior.
- taker buy/sell ratio normalization.
- order-book imbalance and spread math.
- single-factor false-positive prevention.
- PRE-SURGE independent-evidence minimum.
- SURGE stronger evidence/source-family minimum.
- stale evidence exclusion.
- provider partial-failure behavior.
- API backward compatibility.
- mobile UI labels and degraded states.
- existing `npm run verify` remains green.

## Success criteria

- 기존 LIVE RADAR/market-flow/onchain 기능이 그대로 동작한다.
- 공개 API만으로 동작하며 사용자 API 키를 요구하지 않는다.
- 단일 지표 기반 오탐을 크게 줄인다.
- 상위 후보에 대해서만 deep lookup해 API 부하를 제한한다.
- 데이터 부재는 0이 아닌 null/`-`로 표현한다.
- provider failure가 전체 페이지를 깨지 않는다.
- 전체 CI PASS 후 PR을 통해 main에 병합하고 Netlify production deploy가 해당 merge commit에서 ready임을 확인한다.
