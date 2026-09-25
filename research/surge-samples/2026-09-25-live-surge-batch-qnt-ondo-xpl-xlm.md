# 2026-09-25 Live Surge Sample Batch

Source: Binance USDⓈ-M perpetual raw market data sampled on 2026-09-25.

## Positive / structural samples

- QNT — OI-led explosive ignition: 24h +34.883%, OI 8h +40.136%, OI 4h +24.823%, taker max 1.303, 1h RVOL 3.56x.
- ONDO — price-led / low-OI expansion: 24h +27.067%, OI 8h +2.911%, OI 4h +0.937%, taker max 1.217. Important exception: a hard OI threshold would miss this pattern.
- XPL — OI + price coincident ignition: 24h +29.078%, OI 8h +14.342%, OI 4h +7.604%, taker max 1.227.
- XLM — quiet OI accumulation: 24h +10.131%, OI 8h +10.978%, OI 4h +4.202%, taker max 1.109, 1h recent 8h price +4.49%.

## Reset / negative-control samples

- XAI — post-surge OI liquidation: 24h +16.629%, OI 8h -31.786%, OI 4h -18.443%.
- FET — post-surge re-ignition: 24h +15.381%, OI 8h -0.585%, taker 1.100.
- LDO — post-surge taker re-ignition: 24h +10.728%, OI 8h -2.504%, taker 1.462.

## Scanner implications

1. Keep OI-led build as a strong positive signal, but do not require it universally.
2. Add a price/spot-led route for ONDO-like moves where OI remains modest.
3. Separate post-surge OI liquidation/re-ignition from true PRE-SURGE positives.
4. Preserve quiet accumulation logic for XLM-like cases where OI outpaces price before acceleration.
