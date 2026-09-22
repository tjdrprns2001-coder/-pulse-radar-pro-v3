# PRE-SURGE Research Schema v1

This file defines the standard research schema for all future surge / pre-surge samples.

## Goal

Every sample must preserve four independent layers:

1. **Book Structure Layer**
2. **SMC / ICT Layer**
3. **Derivatives DNA Layer**
4. **Ignition Confirmation Layer**

The purpose is not to force every successful surge into one pattern. The purpose is to classify multiple valid surge paths without survivorship bias.

---

## 1. Book Structure Layer

Record:

- support / resistance
- volume profile / supply-demand zone
- trendline structure
- moving-average structure
- flag
- triangle
- wedge
- double bottom
- inverse head-and-shoulders
- candlestick reversal/continuation patterns
- RSI divergence
- MACD / oscillator divergence
- trend continuation vs reversal context

Book-derived interpretation rules:

- recent support/resistance matters more than distant levels
- a resistance break gains quality when accompanied by strong volume
- a broken resistance can become support
- thick overhead supply can delay expansion
- thin supply zones can permit faster directional travel
- decreasing volume during consolidation can be constructive if breakout volume later expands
- divergence is supporting evidence, not a standalone prediction

---

## 2. SMC / ICT Layer

Record:

- BSL
- SSL
- liquidity sweep
- BOS
- CHoCH
- MSS
- order block
- FVG
- BPR
- premium / discount
- displacement
- CISD candidate
- ERL / IRL context
- draw on liquidity
- HTF → LTF alignment

Confirmation should prefer close-based structure breaks over wick-only events.

---

## 3. Derivatives DNA Layer

Every sample must be assigned to one or more observed DNA routes.

### A. OI Lead

```
Price compression
→ OI expansion
→ Taker support
→ Liquidity break
→ Expansion
```

Known examples:
- FIL
- KERNEL

### B. Deleveraging Ignition

```
Price weakness/compression
→ OI cleanup
→ Volume drying
→ Taker reversal
→ Liquidity break
→ OI re-expansion
```

Known examples:
- FF
- ONE
- FORM
- WIF

### C. Pure Taker Accumulation

```
Price flat/weak
→ OI neutral or unhelpful
→ Taker persistently > 1
→ Taker acceleration
→ Breakout
```

Known examples:
- COOKIE
- FET
- ALCH

### D. OI Build → Flush → Ignition

```
24–72H OI build
→ Leverage flush
→ Price holds structure
→ Taker recovers
→ Breakout
```

Known examples:
- ZETA
- PEPE
- NIL

### E. Slow Accumulation / HTF Build

```
Slow multi-window OI build
→ Price structure holds
→ Compression
→ Delayed ignition
```

Known examples:
- GRASS
- TAO
- PHA

### F. Short Build → Squeeze

```
Price down
→ OI up
→ Taker sell-dominant
→ Downside stops progressing
→ Sweep / bullish divergence / structure reversal
→ Short squeeze
```

Known example:
- STAR

---

## 4. Ignition Confirmation Layer

Do not mark a sample as confirmed ignition unless enough of the following are observed:

- 5m → 15m → 1H taker propagation
- RVOL expansion
- resistance break on close
- displacement candle
- BOS / MSS confirmation
- OI stops falling or begins expanding after ignition
- broken resistance acts as support
- liquidity above is consumed rather than only wicked
- post-break pullback volume is weaker than breakout volume

---

## Time-window standard

Every sample should preserve:

- T-72H
- T-48H
- T-24H
- T-12H
- T-6H
- T-3H
- T-1H
- T0
- T+1H
- T+4H
- T+12H
- T+24H
- T+72H when available

For each point/window, record where available:

- close
- return
- volume
- RVOL
- OI
- OI change
- taker buy/sell ratio
- funding
- long/short ratio
- top-trader long/short ratio
- RSI
- MACD state
- OBV state
- structure state
- liquidity level touched/broken

---

## Required classification

Each sample must include:

- `pattern_primary`
- `pattern_secondary`
- `book_structure_tags`
- `ict_smc_tags`
- `derivatives_tags`
- `ignition_state`
- `invalidations`
- `outcome_label`

Suggested outcome labels:

- `HISTORICAL_SUCCESS_SAMPLE`
- `HISTORICAL_FAILED_SAMPLE`
- `PENDING`
- `IGNITION_EARLY`
- `ALREADY_PROGRESSING`
- `OVERHEATED`

Do not delete failed or duplicate samples.

---

## Anti-bias rules

1. Do not require OI to increase before every surge.
2. Do not treat taker > 1 alone as sufficient.
3. Do not treat divergence alone as confirmation.
4. Do not classify wick-only liquidity grabs as confirmed BOS.
5. Do not use incomplete-candle RVOL without elapsed-time adjustment.
6. Keep duplicate pattern instances when they differ in timing, event context, exchange behavior, or failure mode.
7. Store failed candidates to avoid survivorship bias.
8. Distinguish event-driven samples from non-event samples.
9. Distinguish pre-event positioning from post-event re-accumulation.
10. Separate observed fact from interpretation.

---

## Scanner routing

The scanner should evaluate all routes in parallel:

```
BOOK STRUCTURE
      ↓
SMC / ICT
      ↓
DERIVATIVES DNA
      ↓
IGNITION CONFIRMATION
```

Parallel DNA routes:

```
OI_LEAD
DELEVERAGING_IGNITION
PURE_TAKER_ACCUMULATION
OI_BUILD_FLUSH_IGNITION
SLOW_ACCUMULATION
SHORT_BUILD_SQUEEZE
```

A candidate can match more than one route.

---

## Current research principle

The chart/book layer answers:

> **Where can price react?**

The derivatives layer answers:

> **Who is positioning first?**

The ignition layer answers:

> **Has the move actually started?**

All three questions must remain separate in storage and scoring.
