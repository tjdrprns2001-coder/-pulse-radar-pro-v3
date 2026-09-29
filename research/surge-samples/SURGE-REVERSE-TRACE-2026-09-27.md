# Current Surge + Reverse-Trace Sample Batch — 2026-09-27

## Scope

- Market: Binance USDⓈ-M Futures
- Snapshot: 2026-09-27 KST
- Current surge universe: 33 symbols with 24H change >= +10%
- Core sample cohort: top 20 with quote volume >= $10M
- Research only: these are already-successful movers and are not a validation cohort.

## 20-symbol sample table

| Symbol | 24H | T0 RVOL | OI -24H→T0 | OI -6H→T0 | OI T0→+3H | Probe age | Probe RVOL | Post-probe vol | Route note |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Q | +56.0% | 13.03x | -2.28% | 0.07% | 9.62% | 19.25H | 12.78x | 30.9% | FLOW/DELEVERAGING |
| RARE | +52.0% | 7.64x | 47.84% | 0.91% | 82.02% | 14.75H | 54.47x | 30.3% | OI_LEAD |
| 2Z | +27.1% | 32.89x | 4.22% | 11.13% | 55.80% | 0.75H | 9.92x | 110.5% | MICRO_FLOW+OI_CHASE |
| BEAT | +25.2% | 9.39x | 3.61% | 3.75% | 2.81% | 5.00H | 7.33x | 58.3% | MIXED |
| US | +23.2% | 4.56x | -0.08% | 0.14% | -0.82% | 16.25H | 8.72x | 31.3% | MIXED |
| BR | +21.5% | 3.25x | -4.36% | -3.21% | -1.01% | 4.50H | 4.72x | 44.1% | MIXED |
| FIL | +19.7% | 4.91x | 7.84% | 0.20% | 3.88% | 7.50H | 4.45x | 40.0% | PROBE→BOS |
| SPELL | +19.4% | 24.70x | 8.83% | 0.48% | 7.12% | 19.00H | 18.89x | 13.6% | MIXED |
| ARK | +17.8% | 2.96x | 34.26% | 9.49% | 18.06% | 9.50H | 12.97x | 27.2% | OI_LEAD |
| WLD | +17.1% | 5.02x | -0.35% | 0.34% | 0.88% | 24.00H | 10.60x | 9.3% | FLOW/DELEVERAGING |
| RUNE | +16.4% | 6.18x | 5.31% | 5.80% | 18.07% | 9.75H | 3.73x | 108.6% | MIXED |
| DASH | +16.2% | 6.08x | 4.55% | 2.76% | 9.43% | 2.50H | 4.69x | 46.3% | MIXED |
| KMNO | +15.7% | 6.61x | 2.77% | 2.02% | 5.61% | 8.50H | 5.84x | 52.7% | MIXED |
| PROM | +15.5% | 7.61x | 0.90% | 2.68% | -1.05% | 2.50H | 5.39x | 27.8% | MIXED |
| QNT | +15.3% | 6.89x | 6.13% | 2.06% | 7.48% | 2.00H | 6.34x | 49.8% | MIXED |
| VELODROME | +14.6% | 8.80x | 0.47% | -0.42% | 3.83% | 10.50H | 5.06x | 44.6% | MIXED |
| ACE | +14.3% | 9.46x | -8.32% | 0.37% | -8.35% | 23.00H | 10.23x | 9.9% | FLOW/DELEVERAGING |
| KAS | +14.3% | 11.09x | 7.12% | 3.19% | 1.86% | 9.75H | 6.70x | 21.8% | PROBE→BOS |
| EIGEN | +13.9% | 4.50x | 3.72% | -0.60% | 3.25% | 5.25H | 3.20x | 41.0% | MIXED |
| LYN | +13.4% | 64.22x | 7.88% | 4.72% | 25.97% | 0.50H | 27.72x | 197.7% | MICRO_FLOW+OI_CHASE |

## New representative reverse-trace samples

### Q — Deep recompression + micro-flow + OI chase

- 24H: +56.0%
- T0 1H RVOL: 13.03x
- OI T-24H→T0: -2.28%
- OI T0→+3H: +9.62%
- 19.25H-old 15m probe: RVOL 12.78x
- post-probe average volume: 30.9% of probe
- max drawdown after probe: -11.34%
- 1m buy-share >=70%: 22 bars
- >=90%: 6 bars
- >=95%: 3 bars
- max buy-share: 98.9%
- 5m BOS at 06:20 UTC with RVOL 24.59x

DNA:
`DEEP_RECOMPRESSION → MICRO_FLOW_CLUSTER → CLOSE_BOS → OI_CHASE`

### FIL — Probe memory + raid/BOS split + moderate OI lead

- 24H: +19.7%
- OI T-24H→T0: +7.84%
- 7.5H-old probe RVOL 4.45x
- post-probe volume: 40.0%
- 14:00 UTC raid above reference high
- 14:10 UTC close-BOS
- BOS candle itself RVOL only 0.88x

Important:
single BOS-candle RVOL is not a universal requirement; pre-BOS flow/volume context matters.

DNA:
`PROBE_MEMORY → FLOW_BUILD → RAID → CLOSE_BOS → OI_CONTINUATION`

### WLD — Flow/RVOL-first with almost no OI lead

- OI T-24H→T0: -0.35%
- OI T0→+3H: +0.88%
- 24H-old probe RVOL 10.60x
- post-probe volume only 9.3% of probe
- 5m BOS RVOL 4.02x
- no extreme micro buy cluster required

DNA:
`OLD_PROBE_MEMORY → EXTREME_VOLUME_DRY → RVOL_REIGNITION → BOS`

### ACE — Deleveraging / non-OI surge

- OI T-24H→T0: -8.32%
- OI T0→+3H: -8.35%
- 23H-old probe RVOL 10.23x
- post-probe volume 9.9%
- price held and later BOS despite OI continuing to fall
- 5m raid and BOS split by one bar

DNA:
`DELEVERAGING → VOLUME_DRY → PRICE_RESILIENCE → RAID → CLOSE_BOS`

This is a critical anti-filter sample: strong negative OI must not automatically reject every long candidate.

### KAS — OI build + micro-flow + low-RVOL BOS

- OI T-24H→T0: +7.12%
- probe age: 9.75H
- post-probe volume 21.8%
- 1m buy-share >=70%: 18 bars
- >=90%: 2 bars
- 5m BOS RVOL only ~0.81x

DNA:
`OI_BUILD → PROBE_MEMORY → MICRO_FLOW → LOW_RVOL_CLOSE_BOS`

### LYN — Immediate expansion / high-energy flow

- 1H T0 body: +56.98%
- 1H RVOL: 64.22x
- OI T-24H→T0: +7.88%
- OI T0→+3H: +25.97%
- probe only 30m before T0
- post-probe volume stayed ~198% of probe
- 1m buy-share >=70%: 21 bars
- >=90%: 5 bars
- 5m raid 16:00 UTC, close-BOS 16:05 UTC

DNA:
`IMMEDIATE_PROBE → EXTREME_FLOW → RAID → CLOSE_BOS → OI_CHASE`

## Cross-sample takeaways

1. **OI lead is route-specific, not universal.**
   - RARE/ARK/FIL/KAS show useful OI build.
   - Q/WLD/ACE show that price/flow can lead or OI can even fall.

2. **Probe memory keeps repeating.**
   - Most samples had a prior abnormal 15m volume event before the main expansion.

3. **Post-probe volume dry is common in delayed routes.**
   - SPELL 13.6%, WLD 9.3%, ACE 9.9%, KAS 21.8%, ARK 27.2%, RARE/Q ~30%.

4. **T0 taker does not need to be strongly >1.**
   - Several successful samples had T0 1H taker below or near 1.
   - Pre-T0 pulse windows and lower-TF structure are more informative.

5. **Raid and close-BOS must stay separate.**
   - FIL/ACE/KAS/LYN show that wick raid can precede confirmed close-BOS.

6. **BOS candle RVOL can be low.**
   - FIL/KAS are direct counterexamples to a strict high-RVOL BOS gate.

## Validation requirement

This is a success-only post-event cohort. Before production weighting, collect matched failed controls for:

- OI build without BOS
- probe + volume dry without follow-through
- micro buy-pulse cluster rejected at resistance
- deleveraging without recovery
- raid without close-BOS

Then compare MFE/MAE, follow-through, probe age, OI slope, taker pulse timing, and post-BOS OI behavior.
