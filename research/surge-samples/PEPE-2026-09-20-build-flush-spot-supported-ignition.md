# PEPE Surge Sample — 2026-09-20

## Classification
- pattern_primary: OI_BUILD_FLUSH_IGNITION
- pattern_secondary: SPOT_SUPPORTED_IGNITION
- T0: IGNITION_T0
- outcome_label: HISTORICAL_SUCCESS_SAMPLE

## Observed surge
- reference T0: 2026-09-20 15:00 UTC
- futures symbol: 1000PEPEUSDT
- spot symbol: PEPEUSDT (spot price scaled x1000 for basis comparison)
- T0 futures close: 0.0039551
- sampled 24H surge: +28.70%
- sampled 24H endpoint: 0.0050904

## Reverse checkpoints

| Point | Close | OI value | Taker B/S | Volume |
|---|---:|---:|---:|---:|
| T-72H | 0.0036440 | 63,964,967.76 | 0.9775 | 4,234,938,862 |
| T-48H | 0.0038201 | 72,582,941.70 | 1.0648 | 4,023,327,717 |
| T-24H | 0.0038467 | 72,699,895.64 | 0.8666 | 3,390,904,507 |
| T-12H | 0.0040326 | 87,912,152.44 | 1.5525 | 5,084,300,331 |
| T-6H | 0.0039531 | 86,748,347.16 | 0.9333 | 2,835,732,692 |
| T-3H | 0.0039849 | 84,539,851.60 | 1.4096 | 2,652,334,828 |
| T-1H | 0.0038903 | 82,969,215.05 | 0.8014 | 5,155,610,069 |
| T0 | 0.0039551 | 81,158,557.50 | 1.4352 | 4,175,036,057 |

## Derivatives DNA

Observed sequence:

```
48–72H OI build
→ additional OI expansion into T-12H
→ local leverage flush
→ funding reset
→ taker alternation / shakeout
→ taker re-acceleration at T0
→ expansion
```

Key observations:

- OI rose from ~63.96M at T-72H to ~87.91M at T-12H.
- From T-12H to T0, OI fell to ~81.16M, a meaningful leverage cleanup.
- Taker B/S moved 1.5525 → 0.9333 → 1.4096 → 0.8014 → 1.4352.
- The final T-1H sell-dominant reading was followed by a strong T0 taker reversal.

## LTF ignition

### 5m at T0
- RSI: 46.9
- RVOL: 2.73x
- buy share: 64%
- candle body: 97.4%

### 15m at T0
- RSI: 48.2
- RVOL: 2.72x
- buy share: 60%

### 1H at T0
- RSI: 39.8
- RVOL: 1.10x
- buy share: 59%
- candle body: 89.5%
- EMA20: 0.0039726
- EMA50: 0.0039103

Interpretation:
- HTF structure remained constructive.
- LTF momentum had reset.
- Ignition first appeared through 5m/15m RVOL and taker acceleration before full higher-timeframe expansion.

## Spot / futures basis

Binance spot PEPEUSDT was scaled x1000 to compare directly with 1000PEPEUSDT futures.

| Point | Basis |
|---|---:|
| T-72H | -0.164% |
| T-48H | +0.003% |
| T-24H | +0.174% |
| T-12H | -0.183% |
| T-6H | +0.078% |
| T-3H | -0.128% |
| T-1H | -0.249% |
| T0 | -0.124% |

Key observation:
- Futures traded at a discount to spot into the final ignition window.
- This is consistent with spot support rather than a purely futures-premium-driven move.

## Spot vs futures turnover

| Window | Spot share of Binance spot+futures turnover |
|---|---:|
| T-72→48H | 11.2% |
| T-48→24H | 11.2% |
| T-24→12H | 12.3% |
| T-12→6H | 10.8% |
| T-6→0H | 9.6% |

Spot participation increased into the T-24→12H build phase while OI also expanded.

## Funding

Observed funding path around the setup:
- mostly around +0.010%
- one expansion near +0.028%
- later reset through neutral and briefly negative territory before ignition

Interpretation:
- long crowding expanded during the build
- leverage was subsequently cleaned
- funding reset reduced one source of long-crowding pressure before T0

## Long / short positioning

### Global account L/S
- T-72H: 1.6274
- T-48H: 1.8944
- T-24H: 1.8506
- T-12H: 1.8670
- T-6H: 1.8539
- T-3H: 1.9223
- T-1H: 1.9551
- T0: 1.9842

### Top trader position L/S
- T-72H: 2.4141
- T-48H: 2.1858
- T-24H: 2.1019
- T-12H: 2.4390
- T-6H: 2.3932
- T-3H: 2.3653
- T-1H: 2.2535
- T0: 2.2934

Interpretation:
- general accounts remained long-biased
- top-trader position ratio stayed long-biased but did not accelerate into T0
- this supports a cleanup / reset interpretation rather than a fresh crowded-long blowoff

## Book structure tags
- HTF trend intact
- pullback / consolidation
- volume re-expansion at ignition
- resistance reclaim / breakout confirmation required
- divergence and momentum should remain supporting evidence only

## ICT / SMC tags
- liquidity reset / SSL sweep candidate
- LTF displacement candidate
- MSS / CHoCH before full HTF breakout
- close-based BOS confirmation preferred
- spot-supported draw on upper liquidity

## Scanner rule proposal

High-value PEPE-like candidate:

```
HTF structure intact
AND 24–72H OI build
AND recent 3–12H OI flush
AND price holds/reclaims structure
AND basis <= 0 or near neutral
AND taker flips from <1 to >1.2
AND 5m/15m RVOL >= 2x
AND 5m/15m buy share >= 60%
```

Optional quality boosts:
- funding reset
- spot price stronger than futures
- top-trader L/S not accelerating with retail crowding
- 1H RSI in reset zone (~35–50)

## Failure / invalidation
- OI rises while price loses structure and taker remains sell-dominant
- basis turns strongly positive before price confirmation and funding overheats
- 5m/15m RVOL spike fails to reclaim structure
- liquidity sweep occurs without close-based MSS/BOS
- HTF support breaks decisively

## Research takeaway

PEPE is a strong benchmark for:

```
OI Build
→ Leverage Flush
→ Funding Reset
→ Spot Strength / Futures Discount
→ Taker Reversal
→ 5m/15m RVOL Ignition
→ Expansion
```

This sample demonstrates why a scanner should not reject falling OI near T0 if the preceding build exists and spot/basis/taker/LTF volume confirm a constructive reset.
