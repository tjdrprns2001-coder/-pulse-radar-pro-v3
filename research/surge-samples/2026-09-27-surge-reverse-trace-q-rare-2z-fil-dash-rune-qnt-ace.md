# Surge + Reverse-Trace Samples — 2026-09-27

- as_of: 2026-09-27T00:25:00+09:00
- source: Binance USDT perpetual
- method: current top gainers → 36h 1H kline/OI/taker reverse trace
- goal: separate surge DNA so Astra does not require OI-first for every breakout

## Core positive samples

### FIL — OI/taker lead staircase
DNA: `OI_TAKER_LEAD_STAIRCASE`
- Before acceleration, price climbed gradually around 0.99→1.05 while OI built from ~51.9M toward ~55M.
- Taker pulses >1.1~1.4 appeared before the final acceleration.
- Final expansion: ~1.10→1.17→1.21 with volume expansion.
- Scanner lesson: canonical OI-first PRE-SURGE.

### RUNE — taker first, OI late
DNA: `TAKER_EARLY_OI_LATE`
- Price remained relatively quiet near 0.64~0.66 while taker pulses reached ~2.29, 1.40, 1.54, 1.99.
- OI accelerated later from ~7.9M to ~9.4M as price trend expanded.
- Scanner lesson: allow taker-first lane even when OI is initially neutral.

### Q — volume first, OI after ignition
DNA: `VOLUME_FIRST_PRICE_LEAD`
- Price compressed around 0.024.
- First ignition hour moved ~0.02364→0.02783 with ~67.6M volume.
- OI was not leading; it increased strongly only after ignition (~272M→283M→299M→318M→348M+).
- Scanner lesson: a strict OI>1% prefilter would miss the earliest signal.

### RARE — double ignition clean rebuild
DNA: `DOUBLE_IGNITION_CLEAN_REBUILD`
- First ignition near 0.014→0.0162 occurred with massive volume.
- OI surged afterward from ~135M into ~183M→190M→200M.
- Price reset near 0.015, then OI rebuilt and second ignition pushed ~0.0155→0.0217.
- OI then expanded ~199M→260M→327M→362M+.
- Scanner lesson: preserve first ignition, cleanup, OI retention, and re-ignition as separate states.

## Intermediate positive samples

### 2Z — stealth trend then OI expansion
DNA: `STEALTH_TREND_OI_EXPANSION`
- Price crept upward around 0.055→0.059 before the breakout.
- Initial price/volume ignition preceded the major OI expansion.
- OI later jumped ~50.5M→55.9M→71.4M→87.1M→96.9M.
- Scanner lesson: micro-trend + volume expansion can be enough to promote before OI fully confirms.

### DASH — taker first range break
DNA: `TAKER_FIRST_RANGE_BREAK`
- Long range around 62~64.
- OI stayed mostly flat around 486k~490k before the breakout.
- Taker turned >1 (notably ~1.32, ~1.21) around breakout while price accelerated 63→66→68→70+.
- OI confirmed later toward ~510k→532k.
- Scanner lesson: taker-first breakout lane.

## Control samples

### QNT — price-led control
DNA: `PRICE_LED_CONTROL`
- Price advanced while OI had materially declined from earlier highs.
- Demonstrates that strong price movement can occur without OI-first buildup.
- Use as a control so the scanner does not force every rally into the OI-build archetype.

### ACE — price/volume re-ignition control
DNA: `PRICE_VOLUME_REIGNITION`
- OI stayed comparatively flat near ~40M while price climbed in steps.
- A later volume burst re-accelerated price.
- Use as a control for volume/price-led continuation.

## Scanner implications

Astra should maintain parallel lanes:
1. `OI_FIRST`: price under-extended + OI buildup + taker pulse.
2. `TAKER_FIRST`: price compressed + OI neutral + repeated taker >1.5~2.
3. `VOLUME_FIRST`: OI neutral/negative allowed when RVOL expansion + compressed breakout occurs.
4. `REBUILD_REIGNITION`: first surge → OI retained/rebuilt → price reset → second ignition.

The existing 4H OI > +1% screen remains useful, but should not be a universal mandatory gate for every surge DNA.
