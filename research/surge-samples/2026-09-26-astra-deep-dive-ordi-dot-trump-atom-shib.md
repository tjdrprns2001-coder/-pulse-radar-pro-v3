# Astra Deep-Dive Samples — 2026-09-26

- as_of: 2026-09-26T00:53:00Z
- exchange: Binance USDT perpetual + Binance Spot
- policy: confirmed bars only for indicator/RVOL calculation
- pipeline: 527 universe → 117 liquidity/price filter → 117/117 OI scan → 18 OI survivors → deep-dive
- selected samples: ORDI / DOT / TRUMP / ATOM / 1000SHIB
- purpose: preserve distinct pre-surge, ignition, reset, and rebuild states without collapsing them into one bullish label

## ORDI — OI burst → 1H ignition → LTF reset

**DNA:** `OI_BURST_1H_IGNITION_LTF_RESET`

- Futures 24h: +4.096%
- Spot 24h: +4.113% (confirmed)
- OI latest 4h: +5.40%; broader sampled 4h series: +8.74%
- OI sampled 1h-series span: +5.26%
- OI sampled 5m-series span: -0.06%
- Funding: +0.005%
- 1H: RSI 66.4 / RVOL 3.85 / taker 1.53 / MACD histogram rising / MA5>10>20
- 15m: RVOL 1.98 / taker 0.68 / momentum cooling
- 5m: RVOL 0.55 / taker 0.40 / short-term MA structure lost
- recent 15m taker sequence: 0.69 → 3.74 → 1.85 → 0.89 → 1.17 → 1.23 → 1.06 → 0.68
- global L/S: 1.38; top-trader position L/S: 4.19

**Interpretation:** This is not a pristine PRE-SURGE sample anymore. OI, volume and taker already aligned on 1H and produced first ignition. The useful sample is the transition into a lower-timeframe reset while OI remains elevated.

**Re-ignition gate:** hold roughly 4.72–4.76, OI stops unwinding, taker returns >1 and volume re-expands.

**Failure signature:** sustained loss of the reset zone with continued OI contraction.

---

## DOT — late OI turn → taker burst → RVOL still missing

**DNA:** `LATE_OI_TURN_TAKER_BURST_RVOL_WAIT`

- Futures 24h: +4.362%
- Spot 24h: +4.404% (confirmed)
- latest 4H OI step: +1.53%
- broader sampled 4h-series span: -0.56% → recent OI reversal is the important feature
- sampled 1h-series span: +1.17%
- sampled 5m-series span: -0.44%
- Funding: +0.010%
- 4H: RSI 60.7 / RVOL 0.85 / bullish MA alignment
- 1H: RSI 65.7 / bullish MA alignment / prior BSL probe
- 15m: taker 1.33 after 2.12 spike / RVOL 1.23
- 5m: kline taker ratio 3.10 / RVOL 0.88
- global L/S: 1.70; top-trader position L/S: 2.23
- top-20 orderbook snapshot bid/ask quantity ratio: 3.39 (ephemeral supporting evidence only)

**Interpretation:** OI did not build all day. It turned positive late, after the price/HTF structure had already improved. Taker flipped sharply positive, but the decisive RVOL expansion is still absent.

**Ignition gate:** 1.223–1.224 resistance break + 15m RVOL >=3 + taker stays >1 while OI continues building.

**Failure signature:** BSL rejection followed by falling price and OI.

---

## TRUMP — low price displacement → persistent OI accumulation

**DNA:** `QUIET_PRICE_PERSISTENT_OI_COMPRESSION`

- Futures 24h: +0.620%
- Spot 24h: +0.668% (confirmed)
- latest 4H OI step: +1.50%
- broader sampled 4h-series span: +4.53%
- sampled 1h-series span: +2.39%
- sampled 5m-series span: +0.31%
- Funding: +0.005%
- 4H: RSI 55.2 / price above MA20/60/120 / MACD rising
- 1H: RSI 59.5 / bullish MA alignment / prior BSL probe
- 15m: RVOL 1.93 / taker 0.93
- latest 5m kline taker: 1.97
- recent 15m taker: 1.10 → 0.93 → 1.14 → 0.88 → 1.58 → 1.19 → 0.85 → 0.93
- global L/S: 1.70; top-trader position L/S: 2.21

**Interpretation:** Price has barely moved while OI accumulated. This is the cleanest compression/A-pre sample in this batch, but direction is not proven because OI growth can also represent shorts.

**Ignition gate:** 2.135–2.140 break + 15m RVOL >=3 + taker >=1.3 persistently + additional OI expansion.

**Failure signature:** OI keeps rising while price repeatedly rejects 2.14 and begins making lower closes.

---

## ATOM — sell-side shock → lower-timeframe buyer re-entry

**DNA:** `SELL_SHOCK_LTF_REABSORPTION_CONFIRM`

- Futures 24h: +0.955%
- Spot 24h: +1.011% (confirmed)
- latest 4H OI step: +1.14%
- broader sampled 4h-series span: +1.73%
- sampled 1h-series span: +2.05%
- sampled 5m-series span: +0.51%
- Funding: +0.010%
- 4H: RSI 55.2 / RVOL 0.82 / bullish MA alignment
- 1H: taker 1.42 on prior confirmed bar
- 15m: RVOL 2.50 / taker 0.44 — sell-side pressure not yet cleared
- 5m: RSI 60.1 / RVOL 2.00 / taker 2.13 / MACD re-accelerating
- global L/S: 1.24; top-trader position L/S: 3.16

**Interpretation:** A prior heavy sell-side burst was followed by 5m buyer re-entry. The sample is valuable because the 5m recovery has not yet propagated to 15m; it records the exact transition point rather than hindsight-confirming the breakout.

**Confirmation gate:** 15m taker >1 + 15m MACD up + break 1.806; stronger continuation confirmation above ~1.832.

**Failure signature:** 5m buyer pulse fades and 15m remains sell-dominant while OI begins unwinding.

---

## 1000SHIB — OI cleanup/rebuild + high RVOL, direction unresolved

**DNA:** `OI_CLEAN_REBUILD_HIGH_RVOL_DIRECTION_WAIT`

- Futures 24h: +2.518%
- Spot 24h: +2.586% (confirmed)
- latest 4H OI step: +1.73%
- broader sampled 4h-series span: ~0.00% after an internal flush/rebuild
- sampled 1h-series span: +2.29%; latest 1H step +1.12%
- sampled 5m-series span: -0.04%
- Funding: +0.010%
- 1H: RSI 63.9 / bullish MA alignment / prior BSL probe
- 15m: RVOL 4.20 / taker 0.73
- 5m: taker 3.16 / MACD turning up
- global L/S: 1.72; top-trader position L/S: 1.72

**Interpretation:** This is a rebuild sample rather than a clean continuous OI build. The 15m volume requirement is met, but the high-volume bar was still sell-taker dominant. The following 5m buyer response is strong but not yet enough to classify as confirmed ignition.

**Ignition gate:** reclaim/break 0.00599 with 15m taker >=1.2–1.5 and OI continuing to rebuild.

**Failure signature:** repeated high RVOL under 0.00599 with taker <1 → treat as possible distribution instead of absorption.

---

## Cross-sample lessons

1. **OI +1% is only a screen.** ORDI already ignited, DOT is waiting on RVOL, TRUMP is compressed, ATOM is reabsorbing, SHIB is rebuilding.
2. **RVOL needs direction context.** SHIB shows why RVOL >=3 alone is insufficient.
3. **OI timeframe slope matters.** DOT's long-window OI is weak while the latest 4H step turns positive; ORDI is the opposite—large accumulated OI but short-term cooling.
4. **5m recovery must propagate upward.** ATOM and SHIB should not be upgraded until 15m confirms.
5. **Spot confirmation is necessary but not sufficient.** All five available spot pairs track futures closely, yet their ignition states differ materially.
