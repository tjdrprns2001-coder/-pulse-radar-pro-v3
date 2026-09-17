# Signal Outcome Backtest Design

Date: 2026-09-18
Branch: `spec/signal-outcome-backtest`

## Goal

Add a persistent, server-side signal outcome tracking system to PulseRadar Pro so scanner classifications can be evaluated with real forward returns instead of intuition. The system must record immutable signal snapshots, evaluate them only after the requested horizon has elapsed, and expose Korean-language performance summaries without feeding those statistics back into live signal confidence yet.

## Scope

The first version tracks forward performance for these scanner classes only:

- `PRE-SURGE` — 급등 직전
- `ACCUMULATION-PRE` — 잠복 축적
- `META-PRE` — 메타 선행
- `SECTOR-ROTATION` — 섹터 순환매
- `ANOMALY` — 이상징후

The following are not treated as positive-entry candidates in the first performance dashboard:

- `POST-SURGE`
- `DISTRIBUTION-RISK`
- `PUMP-RISK`
- `STALE`

They may still be stored later for separate defensive/risk analysis, but they do not contribute to the first candidate hit-rate view.

## Recommended Architecture

### 1. Persistent snapshot store

Use Netlify Blobs as the persistent store for immutable signal snapshots and evaluated outcomes.

Each stored snapshot contains:

- `id`
- `symbol`
- `scanClassKey`
- Korean class label
- `capturedAt`
- `entryPrice`
- `tradeSignal.level`
- `tradeSignal.confidence`
- candidate score
- sector
- 24h change
- volume acceleration values
- taker ratio
- momentum summary
- RSI / MACD / Stoch RSI / KDJ values available at capture time
- PRE-SURGE evidence and relevant reasons
- scanner/data version metadata

The snapshot is immutable after creation. Outcome fields are stored as a separate evaluation object keyed by the snapshot ID so the original signal state cannot be rewritten by future market data.

### 2. Duplicate suppression

Repeated scans must not create a new record every minute for the same unchanged signal.

Deduplication key:

`symbol + scanClassKey + timeBucket`

Initial bucket size: 30 minutes.

A new record is allowed inside the same symbol when:

- the classification materially changes, or
- the previous snapshot moves out of the 30-minute bucket, or
- the signal was previously absent and later reappears.

This preserves regime transitions without inflating sample counts from repeated refreshes.

### 3. Forward-return evaluation

Evaluation horizons:

- 15 minutes
- 1 hour
- 4 hours
- 24 hours

When a horizon has elapsed, fetch Binance spot historical candles around the target timestamp and resolve the first valid market price at or after that target time.

Return formula:

`(futurePrice / entryPrice - 1) * 100`

Each horizon stores:

- target timestamp
- resolved market timestamp
- resolved price
- return percent
- evaluation status

Evaluation must never use candles that occur before the target horizon timestamp.

### 4. No future leakage

The evaluator must use only data available at or after each horizon target.

Rules:

- never use the current latest price as a substitute for a missing past target price;
- never evaluate a 1H result before `capturedAt + 1 hour`;
- if Binance data around the horizon is unavailable, leave the horizon as pending/unavailable rather than estimate it;
- historical snapshots retain the original live signal evidence exactly as captured.

### 5. Outcome aggregation

Aggregate separately by class and horizon.

Metrics:

- sample count
- evaluated count
- pending count
- positive-return ratio
- average return
- median return
- best return
- worst return

The UI must not call positive-return ratio an `accuracy` or a probability of future success. It is a historical sample statistic.

For small samples, show `표본 부족`.

Initial minimum sample threshold for a normal performance label: 30 evaluated observations per class/horizon.

Below 30, the raw count and returns may still be shown, but no strong reliability wording is allowed.

## Storage Layout

Suggested blob keys:

- `signal-snapshots/<yyyy-mm-dd>/<snapshot-id>.json`
- `signal-outcomes/<snapshot-id>.json`
- optional generated summaries: `signal-stats/latest.json`

A compact daily index may be added so dashboard reads do not need to enumerate every blob indefinitely.

## Runtime Flow

1. The scanner completes a deep classification.
2. Eligible positive/observation classes are passed to the outcome recorder.
3. Recorder checks the deduplication bucket.
4. If new, it persists the immutable snapshot.
5. On later API calls, a bounded evaluator checks due pending horizons.
6. Due horizons are resolved from Binance historical klines.
7. Outcome objects are updated separately from snapshots.
8. Aggregates are generated for the performance API/UI.

The evaluation workload must be capped per request to avoid making ordinary scanner requests slow or causing Binance rate-limit spikes.

## API Design

### `GET /api/signal-performance`

Returns:

- class/horizon aggregate statistics
- sample sufficiency state
- most recent evaluated/pending signals
- generated timestamp

Optional query parameters:

- `class`
- `horizon`
- `symbol`
- `limit`

### Internal recording/evaluation integration

Recording is invoked from scanner service after a valid deep scan result is assembled.

Evaluation is performed in small batches and must fail independently. A storage/evaluation failure must never break the existing coin scanner.

## UI Design

Add a Korean `성과 검증` section accessible from the scanner area.

Per class show:

- 분류명
- 표본 수
- 15분 상승 비율 / 평균 수익률
- 1시간 상승 비율 / 평균 수익률
- 4시간 상승 비율 / 평균 수익률
- 24시간 상승 비율 / 평균 수익률
- 중앙값
- 최고 / 최악
- 평가 대기 수
- 표본 상태 (`표본 부족` or `통계 사용 가능`)

Recent-signal rows show:

- ticker
- captured classification
- capture time
- entry price
- horizon returns that are already complete
- remaining horizons as `평가 대기`

All user-facing labels are Korean-first.

## Reliability and Failure Behavior

- Blob failure: scanner continues normally; outcome recording is skipped and an internal error is surfaced only to the performance subsystem.
- Binance historical-data failure: horizon remains pending/unavailable; no estimated result.
- malformed snapshot: excluded from aggregates and logged as invalid.
- stale/failed scanner states: never recorded as positive candidate samples.
- duplicate refreshes: do not increase sample count.

## Calibration Boundary

Version 1 is measurement-only.

Historical hit rates and returns do **not** alter:

- live trade confidence
- scanner class thresholds
- PRE-SURGE logic
- buy/watch/exclude decisions

A later, separately reviewed calibration phase may use accumulated outcomes after enough samples exist. This prevents early overfitting and circular self-validation.

## Test Strategy

TDD coverage must include:

1. snapshot creation for eligible classes;
2. risk/post/stale classes excluded from positive candidate recording;
3. duplicate suppression in the same 30-minute bucket;
4. class transition creates a new snapshot;
5. 15m/1h/4h/24h target timestamps are exact;
6. evaluator refuses to use future horizon before it is due;
7. evaluator never selects a candle timestamp before the target;
8. missing historical data stays pending/unavailable;
9. return calculation correctness;
10. aggregates compute count, positive ratio, mean, median, best, worst correctly;
11. fewer than 30 evaluated samples returns `표본 부족`;
12. storage/evaluator failures do not fail `/api/coin-scan`;
13. Korean UI labels and mobile layout regression coverage;
14. existing scanner and classification tests remain unchanged and passing.

## Rollout

1. Add storage abstraction and pure outcome math.
2. Add recorder and deduplication.
3. Add Binance horizon resolver/evaluator.
4. Add performance aggregation API.
5. Add Korean performance UI.
6. Run full Foundation Verify.
7. Merge only after regression review.
8. Deploy to Netlify and verify a live snapshot can be recorded without affecting scanner operation.
9. Allow time to accumulate real samples before any calibration changes.

## Non-goals

- No automatic trading.
- No position sizing or leverage.
- No claim that historical positive-return ratio predicts future returns.
- No retrospective rewriting of a signal snapshot.
- No training live signal thresholds on tiny samples.
- No fabricated backtest data when a real historical price cannot be resolved.
