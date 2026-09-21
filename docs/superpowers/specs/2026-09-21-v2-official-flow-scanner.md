# PulseRadar Official v2 Flow Scanner

Date: 2026-09-21

## Authority
This is the official scan path for "전체스캔 / 다시 스캔 / 원점 스캔".

## Universe
- Binance USDT perpetual futures, TRADING only.
- Broad first pass, then deep scan candidates.
- Deep TF order: 1W → 3D → 1D → 12H → 4H → 1H → 15m → 5m.

## Fixed parameters
- OI_BUILD: OI 4H > +1.0%.
- OI 8H is auxiliary only and cannot promote BUILD alone.
- true taker weak < 0.8.
- true taker dead band 0.8–1.2 => direction=none.
- improve > 1.2, strong >= 1.5.
- long confirmation: OI_BUILD + at least 2 of the latest 3 1H true-taker ratios > 1.2.
- HTF discount <=35%, premium >=80%.
- RVOL: 1.5–3 PRE-SPARK, 3–10 IGNITION, >10 EXPANSION.
- unavailable required values remain N/A/null; no estimation.

## Flow types
A-pre, A, A→A+B, A+B, B, C, NFB, NFB-SQ, NFB-SC, incomplete.

Type and timing stage are separate.
Stages: observe, preparing, ignition-wait, ignition-early, progressed, overheated, failure/distribution risk.

## Samples
Legacy sample DNA remains active. The library includes prior learned patterns and adds PTB OI-led neutral-taker reignition plus DRIFT, STRK, APT, WLD, TIA, DYDX, ZK, ETHFI, SKY, OP, DOT, SUI, TAO, PENDLE, LSK, BOME, PEPE, DOGE, BONK, SHIB, XLM, LINK families.

PTB subtype phases:
- PTB_OI_LED_BUILD: OI leads while true taker remains neutral; volume shock/pre-spark may precede price expansion.
- PTB_OI_LED_RELOAD: after the first shock, price holds while OI remains near its peak and RVOL cools.
- PTB_OI_LED_REIGNITION: retained OI + price hold + 15m/5m RVOL reacceleration.

Neutral true taker (0.8–1.2) does not invalidate the PTB path when OI lead/retention conditions are satisfied.

## Output contract
Deep items expose:
- v2Flow / v2Type / v2Stage
- direction / deadBand
- oi4hChangePct / oi8hChangePct
- trueTakerRatio / fundingRate
- sampleSubtype
- stageTransition / isTransitionEvent
- v2Csv with next_open, ret_24h_pct, ret_72h_pct, mae_72h_pct empty at signal time
- paramSet=v2_taker_0.8_1.2

Legacy scanClass remains for UI/backward compatibility; v2Flow is authoritative for flow classification.
