# Live Candidate Snapshot — 2026-09-27

## Purpose

This file records **pre-outcome live candidates** from the scanner before knowing whether they subsequently surge or fail.

Unlike the success-only reverse-trace files, this snapshot is intended to reduce survivorship bias.

- snapshot time: 2026-09-27 KST, shortly after 00:55
- market: Binance USDⓈ-M Futures
- universe: Binance USDT futures, alt-focused
- first-stage filter: liquid alts, generally 24H change between -8% and +10%
- current +10% movers were separated as already-progressed / success-sample candidates
- production scanner weights were not changed by this snapshot

## Current progressed group excluded from PRE-SURGE ranking

At the snapshot, examples already above +10% included:

- RARE
- Q
- MUBARAK
- 2Z
- ARK
- VELODROME
- JELLYJELLY
- SPELL
- PROM
- AERO
- OPG
- ENA
- BEAT
- LYN
- ACE
- PHA
- RUNE
- KMNO
- CC
- US
- TNSR

These belong in post-event sampling / reverse-trace work rather than the live pre-surge shortlist.

---

# Live candidate observations

## GALAUSDT

- 24H change at market-universe snapshot: +3.648%
- 4H OI change: **+3.76%**
- latest confirmed 1H price used in follow-up: ~0.002201
- recent 4H price change: ~+0.64%
- 1H RVOL: ~2.15x
- recent 1H taker sequence: **0.56 → 1.28 → 0.93**
- prior 15m volume probe:
  - age: ~2.75H
  - RVOL: ~4.89x
  - taker-buy share: ~44.4%
- post-probe average volume / probe volume: ~55.3%
- distance to recent 6H high: ~2.86%

Interpretation at snapshot:

```
OI_BUILD
→ recent volume probe
→ partial cooling
→ taker pulse occurred
→ current flow not yet sustained
```

Status:

`WATCH / OI_BUILD_WITH_FLOW_CONFIRMATION_PENDING`

Risk note:

Earlier follow-up had shown periods where long positioning increased while lower-TF taker weakened. Do not upgrade merely because OI is rising.

---

## WLDUSDT

- 24H change: +6.261%
- 4H OI change: **+2.70%**
- confirmed 1H price: ~0.4887
- recent 4H price change: ~+1.16%
- 1H RVOL: ~0.78x
- recent 1H taker: **0.80 → 1.27 → 1.16**
- no qualifying 15m RVOL>=3 probe found inside the sampled 24H window
- distance to recent 6H high: **~0.16%**

Interpretation:

```
OI_BUILD
→ FLOW_RECOVERY
→ NEAR_LOCAL_HIGH
→ no strong probe-memory evidence
```

Status:

`BOS_WAIT / OI_FLOW_ASSISTED`

Important:

WLD is useful as a counterexample to making `VOLUME_PROBE_MEMORY` universal. It can reach a breakout boundary without a qualifying recent probe.

---

## KAITOUSDT

- 24H change: +2.884%
- 4H OI change: **+2.17%**
- confirmed 1H price: ~0.3619
- recent 4H price change: ~-1.68%
- 1H RVOL: ~0.63x
- recent taker: **0.71 → 0.88 → 0.66**
- 15m probe:
  - age: ~16H
  - RVOL: ~4.76x
  - buy share: ~46.5%
- post-probe average volume / probe: **~17.3%**
- distance to recent 6H high: ~2.79%

Interpretation:

```
OLD_PROBE_MEMORY
→ STRONG_VOLUME_DRY
→ OI_BUILD
→ PRICE_SOFT
→ TAKER<1
```

Status:

`CROWDED_BUILD_RISK / WAIT_FLOW_RECOVERY`

This is a high-value live control candidate because it has several success-sample ingredients but lacks present buy flow.

---

## PENGUUSDT

- 24H change: +1.240%
- 4H OI change: **+1.95%**
- confirmed 1H price: ~0.010159
- recent 4H price change: ~-0.66%
- 1H RVOL: ~0.51x
- recent taker: **0.66 → 1.60 → 0.63**
- 15m probe:
  - age: ~7.25H
  - RVOL: ~3.83x
  - buy share: ~32.7%
- post-probe average volume / probe: **~25.5%**
- distance to recent 6H high: ~1.00%

Interpretation:

```
PROBE_MEMORY
→ VOLUME_DRY
→ OI_BUILD
→ isolated taker pulse
→ current taker fades
```

Status:

`PROBE_MEMORY / BOS_WAIT / FLOW_NOT_CONFIRMED`

PENGU is especially useful for later success-vs-failure comparison because the structural ingredients are present while current flow is weak.

---

## ONDOUSDT

- 24H change: -0.274%
- 4H OI change: **+1.49%**
- quote volume at universe snapshot: ~$246M

Interpretation:

```
PRICE_QUIET
→ OI_BUILD
```

Status:

`EARLY_OI_BUILD / REQUIRES_FLOW_AND_STRUCTURE_CONFIRMATION`

The lower-timeframe follow-up was not completed before this snapshot file was written, so taker/probe/BOS fields are intentionally left unresolved rather than inferred.

---

## FILUSDT

- 24H change: +5.758%
- 4H OI change: **+1.25%**
- quote volume: ~$120M

Prior same-session scanner context:

- had already produced a recent close-based BOS
- previously showed short-term OI build
- had periods of taker >1
- later entered a re-compression / re-ignition watch state

Status:

`IGNITION_EARLY / RECOMPRESSION`

Important:

FIL should not be treated as a pristine pre-surge candidate because it had already completed part of the breakout sequence earlier in the session.

---

## HYPEUSDT

- 24H change: -1.147%
- 4H OI change: **+0.93%**
- quote volume: ~$466M

Prior same-session observations:

- earlier probe-memory structure
- negative funding / negative basis at one point in the scan
- relatively low crowding compared with some other candidates
- lower-TF taker had cooled after an earlier recovery

Status:

`REIGNITION_WAIT`

This remains interesting because price is still subdued while derivative participation is not collapsing.

---

## ICPUSDT

- 24H change: +0.282%
- 4H OI change: **+0.82%**
- quote volume: ~$39.5M

Prior same-session observations:

- earlier flow build and near-BOS behavior
- later taker weakened
- general L/S and top-trader position L/S had shown crowding risk

Status:

`WATCH / CROWDING_CHECK`

Do not promote without renewed taker and a confirmed close-based break.

---

# Snapshot ranking by current evidence

This is not a predictive ranking or trade recommendation. It is a research ordering by how much of the scanner evidence was present at snapshot time.

### Strongest pre-outcome structures to follow

- WLD — near local high + OI build + taker recovery, but no probe memory
- GALA — strongest OI build among the live candidates, but flow not yet sustained
- PENGU — probe memory + volume dry + OI build, current flow weak
- KAITO — strong volume dry + OI build, but taker persistently below 1
- ONDO — quiet price + OI build; lower-TF evidence incomplete
- HYPE — subdued price + derivative participation; re-ignition pending
- ICP — prior near-BOS candidate, now needs crowding/flow reset
- FIL — already partly progressed, better classified as ignition/recompression than PRE-SURGE

---

# Forward-label plan

Do not edit these observations after seeing the outcome.

Later, attach:

- outcome timestamp
- next-open basis
- Hit_6H_8pct
- Hit_24H_12pct
- 6H / 24H MFE
- 6H / 24H MAE
- whether close-BOS occurred
- whether OI expanded or flushed after BOS
- whether taker re-accelerated
- final outcome class:
  - SURGE
  - CONTROL
  - FAILED_BOS
  - NO_TRIGGER

This snapshot should be preserved unchanged and evaluated later against the same success criteria used by the historical replay framework.
