# Detailed Surge Reverse-Trace Samples — 2026-09-26

This file expands the quick surge sample note with deeper reverse-trace statistics from Binance USDT perpetual data.

## Method
For each core sample, the scan reconstructs the strongest recent forward move and inspects the state immediately before acceleration on 4h, 1h, and 15m. It also records recent 4h open-interest changes and 15m taker buy/sell ratios.

---

## RARE — OI shock ignition

### Pre-surge structure
- 4h pre-close: 0.01309
- 4h RSI: 40.5
- 4h RVOL: 0.94
- 4h above MA20: no
- 4h above MA60: yes
- 4h EMA12 > EMA26: yes
- Subsequent 6x4h move: +67.7%

- 1h pre-close: 0.01626
- 1h RSI: 82.4
- 1h RVOL: 1.43
- 1h above MA20/60: yes/yes
- 1h EMA12 > EMA26: yes
- Subsequent 12h move: +35.0%

- 15m pre-close: 0.01515
- 15m RSI: 31.8
- 15m RVOL: 0.66
- 15m above MA20/60: no/no
- 15m EMA12 > EMA26: no
- Subsequent 4h move: +49.4%

### 4h OI sequence
1.7045M -> 1.7246M -> 1.7183M -> 1.7525M -> 1.8182M -> 2.9805M -> 3.2590M -> 3.1074M -> 2.8487M -> 7.1610M

4h OI changes:
+1.18%, -0.37%, +1.99%, +3.74%, **+63.93%**, +9.34%, -4.65%, -8.32%, **+151.38%**

### 15m taker sequence
0.834, 0.954, 0.882, 1.156, 1.243, 1.064, 1.079, 1.033, 1.152, 1.014, 1.062, 0.920, 1.055, 0.919, 0.972, 1.029

### Interpretation
- Taker was not persistently extreme.
- OI shock was the dominant signal.
- Large move can begin even when the 15m structure itself looks weak.
- **Scanner lesson:** extreme OI delta can override mediocre taker if HTF trend context is still constructive.

---

## ENA — stair-step OI accumulation

### Pre-surge structure
- 4h pre-close: 0.22038
- 4h RSI: 53.7
- 4h RVOL: 0.59
- 4h above MA20/60: yes/yes
- 4h EMA12 > EMA26: yes
- Subsequent 24h move: +23.2%

- 1h pre-close: 0.22038
- 1h RSI: 53.4
- 1h RVOL: 0.50
- 1h above MA20/60: no/yes
- 1h EMA12 > EMA26: yes
- Subsequent 12h move: +18.9%

- 15m pre-close: 0.24449
- 15m RSI: 79.9
- 15m RVOL: 1.14
- 15m above MA20/60: yes/yes
- 15m EMA12 > EMA26: yes
- Subsequent 4h move: +7.3%

### 4h OI sequence
125.45M -> 126.49M -> 125.96M -> 122.71M -> 139.55M -> 146.48M -> 154.09M -> 157.16M -> 157.76M -> 159.50M

4h OI changes:
+0.83%, -0.42%, -2.58%, **+13.72%**, +4.96%, +5.19%, +2.00%, +0.38%, +1.10%

### 15m taker sequence
1.181, 0.818, 1.065, 0.986, 0.877, 0.733, **1.376**, 0.860, 0.877, **1.394, 1.417, 1.199**, 0.687, 1.081, 0.598, 1.038

### Interpretation
- This is the cleanest gradual build sample.
- OI accumulated in several consecutive 4h steps rather than one terminal shock.
- Taker pulses appeared repeatedly but were not permanent.
- **Scanner lesson:** persistent OI build + healthy 4h trend can be more useful than waiting for RVOL explosion.

---

## SUI — trend continuation with derivatives expansion

### Pre-surge structure
- 4h pre-close: 0.8223
- 4h RSI: 56.9
- 4h RVOL: 0.89
- 4h above MA20/60: yes/yes
- 4h EMA12 > EMA26: yes
- Subsequent 24h move: +23.5%

- 1h pre-close: 1.0297
- 1h RSI: 56.7
- 1h RVOL: 0.78
- 1h above MA20/60: yes/yes
- 1h EMA12 > EMA26: yes
- Subsequent 12h move: +13.4%

- 15m pre-close: 1.1365
- 15m RSI: 73.5
- 15m RVOL: 0.49
- 15m above MA20/60: yes/yes
- 15m EMA12 > EMA26: yes
- Subsequent 4h move: +6.3%

### 4h OI sequence
135.71M -> 132.85M -> 131.87M -> 132.75M -> 152.72M -> 148.34M -> 159.07M -> 168.30M -> 164.36M -> 163.72M

4h OI changes:
-2.10%, -0.74%, +0.67%, **+15.05%**, -2.87%, +7.23%, +5.80%, -2.34%, -0.39%

### 15m taker sequence
0.758, 0.629, 0.931, 0.856, 0.549, 0.591, 0.773, 0.681, 0.970, **1.207, 1.115, 1.446, 1.502**, 0.699, 1.155, 1.107

### Interpretation
- Unlike the earlier rough sample classification, the stronger reconstructed pre-surge window shows 4h and 1h structure already healthy.
- The decisive feature is **OI expansion followed by clustered taker >1.2-1.5**.
- **Scanner lesson:** SUI is better treated as a structured continuation/re-acceleration sample than a pure oversold-reversal sample in this reconstructed window.

---

## JTO — deep 4h weakness, 1h reversal first

### Pre-surge structure
- 4h pre-close: 0.4561
- 4h RSI: 27.1
- 4h RVOL: 0.88
- 4h above MA20/60: no/no
- 4h EMA12 > EMA26: no
- Subsequent 24h move: +18.8%

- 1h pre-close: 0.4900
- 1h RSI: 71.8
- 1h RVOL: 0.73
- 1h above MA20/60: yes/yes
- 1h EMA12 > EMA26: yes
- Subsequent 12h move: +11.7%

- 15m pre-close: 0.5408
- 15m RSI: 43.5
- 15m RVOL: 0.49
- 15m above MA20/60: yes/yes
- 15m EMA12 > EMA26: yes
- Subsequent 4h move: +5.9%

### 4h OI sequence
9.790M -> 9.669M -> 9.760M -> 9.975M -> 11.739M -> 11.356M -> 13.385M -> 13.157M -> 13.333M -> 13.327M

4h OI changes:
-1.24%, +0.95%, +2.20%, **+17.69%**, -3.27%, **+17.87%**, -1.71%, +1.34%, -0.05%

### 15m taker sequence
1.018, 0.885, 0.465, 0.802, 1.181, 0.860, 0.864, **1.692**, 1.023, 0.847, 0.866, 0.767, **1.712**, 0.691, 0.733, 0.994

### Interpretation
- 4h remained deeply weak while 1h and 15m had already repaired.
- Two separate +17% OI expansion pulses appeared.
- Two isolated taker spikes near 1.7 appeared around the build.
- **Scanner lesson:** do not reject a candidate only because 4h is below MA20/60 if 1h structure has flipped bullish and OI is expanding aggressively.

---

# Cross-sample findings

## 1. OI behavior is not one-dimensional
Three useful OI regimes appear:

- **Shock OI:** RARE (+63.9%, later +151.4%)
- **Stair-step OI:** ENA (+13.7%, +5.0%, +5.2%, then smaller continuation)
- **Pulse OI:** JTO (+17.7%, reset, +17.9%)

The scanner should distinguish these instead of using only one 4h OI threshold.

## 2. Taker is best treated as a pulse detector
- RARE surged without persistent high taker.
- ENA showed clustered 1.3-1.4 readings.
- SUI showed a clean 1.2 -> 1.45 -> 1.50 cluster.
- JTO showed isolated 1.69 and 1.71 spikes.

Suggested features:
- max taker over last N bars
- count of taker >1.2
- count of taker >1.5
- persistence score
- pulse-with-OI alignment

## 3. Multi-timeframe recovery order matters
Useful sequence classes:
- **JTO reversal:** 4h weak -> 1h recovers -> OI pulse -> price expansion
- **ENA accumulation:** 4h healthy -> OI staircase -> taker cluster -> expansion
- **RARE shock:** HTF constructive -> OI shock -> rapid ignition
- **SUI continuation:** 4h/1h healthy -> OI expansion -> taker cluster -> continuation

## 4. Proposed scanner sample labels
- SURGE_OI_SHOCK
- SURGE_OI_STAIRCASE
- SURGE_OI_PULSE_REVERSAL
- SURGE_REACCELERATION
- SURGE_ALREADY_IGNITED

## 5. Suggested PRE-SURGE feature additions
- oi_4h_change_max_3
- oi_4h_change_sum_3
- oi_4h_positive_streak
- oi_shock_flag (e.g. single 4h jump >= 10-15%)
- taker_15m_max_8
- taker_15m_gt_1_2_count
- taker_15m_gt_1_5_count
- ltf_recovery_before_htf_flag
- rvol_15m_spike
- ma20_60_reclaim_order

These should first be evaluated in shadow mode and backtested before affecting live ranking.

Source: Binance USDT perpetual market data, reverse-traced on 2026-09-26 KST.
