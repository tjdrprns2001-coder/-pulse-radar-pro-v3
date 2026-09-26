# Surge Reverse-Trace Samples — 2026-09-26

Purpose: reusable reference samples for Astra / PRE-SURGE scanning. These are reverse-traced examples of coins that were already surging, captured to identify what was visible before acceleration.

## Core samples

### RARE-type — quiet OI lead + 15m volume ignition
- 24h surge: +62.0%
- Pre-surge 4h RSI: 40.5
- Pre-surge 4h RVOL: 0.94
- 1h RSI: 59.4
- 1h price: above MA20/60
- 15m RVOL: 2.88
- OI sequence: 1.82M -> 2.98M -> 3.26M -> 3.11M -> 2.85M -> 7.16M
- Pattern: HTF still quiet -> 1h structure recovery -> 15m volume expansion -> OI explosion -> breakout

### ENA-type — stair-step OI accumulation + repeated taker pulses
- 24h surge: +24.3%
- 4h RSI: 53.7
- 1h RSI: 59.4
- 4h/1h: above MA20/60
- OI sequence: 139.5M -> 146.5M -> 154.1M -> 157.2M -> 157.8M -> 159.5M
- Taker pulse cluster: 1.39 -> 1.42 -> 1.20
- Pattern: little visible price overheating, but OI accumulates continuously before price expansion

### SUI-type — HTF oversold + LTF recovery first
- 24h surge: +13.4%
- Pre-surge 4h RSI: 22.9
- 4h: below MA20
- 1h RSI: 48.5
- 1h: above MA20/60
- Taker: 1.21 -> 1.12 -> 1.45 -> 1.50
- OI expansion zone: 148M -> 159M -> 168M
- Pattern: HTF looks weak/oversold while LTF structure and derivatives recover first

### JTO-type — deep pullback reversal
- 24h surge: +13.7%
- Pre-surge 4h RSI: 27.1
- 4h: below MA20/60
- 1h RSI: 65.3
- 1h: above MA20/60
- Taker pulses: 1.69 and 1.71
- OI: 11.3M -> 13.38M
- Pattern: 4h weakness reversed by earlier 1h structure recovery + OI/taker confirmation

## Secondary samples

### ARK-type — RVOL breakout / continuation
- 24h surge: +28.6%
- 4h RVOL: 11.0
- OI: 8.32M -> 9.26M -> 9.64M -> 11.29M -> 12.16M
- Use: continuation / ignition confirmation, not ideal for earliest PRE-SURGE detection

### MUBARAK-type — lower-timeframe re-ignition
- 24h surge: +26.4%
- 1h RVOL: 1.89
- 15m RVOL: 2.37
- Use: identify re-acceleration after an initial move

## Scanner rules derived from samples

1. RARE-type
   - 1h MA20/60 recovery
   - 15m RVOL >= 2.5
   - sharp OI expansion

2. ENA-type
   - price remains relatively quiet
   - stair-step OI increase
   - taker 1.3-1.5 repeated/clustered

3. SUI/JTO-type
   - 4h RSI roughly 20-35
   - 1h structure recovers first
   - OI rises
   - taker pulse appears

4. ARK-type
   - RVOL >= 5-10x
   - OI rising together
   - classify as already-ignited continuation

## Important adjustments

- 15m taker does not always need to stay above 1.5.
- RARE/ARK show that strong RVOL + OI change can matter more than taker alone.
- Preferred pre-surge priority:
  1. OI change
  2. RVOL
  3. 1h structure transition
  4. taker pulse
  5. HTF location

## Current candidate analogs from same scan session
- AKE ~= SUI/JTO-type
- ICP ~= ENA-type
- MOVR ~= early ARK-type

Source session: Binance USDT perpetual market scan, 2026-09-26 KST.
