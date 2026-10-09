"""Period-symmetry / bowl-pattern scanner (independent research module).

Input: Binance-style OHLCV candles [open_time,open,high,low,close,volume,...].
Use only CLOSED daily candles. Never treat a symmetric duration as a trade signal.
No orders are placed. Python standard library only.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Sequence


@dataclass
class BowlSignal:
    stage: str
    decline_bars: int
    base_bars: int
    duration_ratio: float
    decline_pct: float
    base_low: float
    box_top: float
    price: float
    sma112: float
    sma224: float
    sma448: float
    volume_ratio: float
    above_long_ma: bool
    breakout: bool
    notes: str

    def to_dict(self) -> dict:
        return asdict(self)


def _avg(xs: Sequence[float]) -> float:
    return sum(xs) / len(xs)


def scan_bowl(
    candles: Sequence[Sequence],
    *,
    history_closed: bool = True,
    min_decline_pct: float = 0.25,
    min_base_bars: int = 35,
    ratio_watch: float = 0.80,
    base_width_max: float = 0.45,
    breakout_rvol: float = 1.50,
    box_lookback: int = 20,
) -> BowlSignal:
    """Classify PRE / BREAKOUT / RETEST_CANDIDATE / EXTENDED / REJECT.

    Input must contain >= 500 CLOSED 1D candles, oldest to newest.
    Set history_closed=False to exclude a trailing still-open candle.
    Duration is estimated by max-high preceding min-low, then bars since low.
    This deterministic proxy is not proof of institutional accumulation.
    """
    rows = list(candles)
    if not history_closed:
        rows = rows[:-1]
    if len(rows) < 500:
        raise ValueError("At least 500 fully closed daily candles are required")
    rows = rows[-900:]
    highs = [float(r[2]) for r in rows]
    lows = [float(r[3]) for r in rows]
    closes = [float(r[4]) for r in rows]
    vols = [float(r[5]) for r in rows]
    if min(lows) <= 0 or min(closes) <= 0 or min(vols) < 0:
        raise ValueError("Invalid OHLCV data")
    end = len(rows) - 1
    # Anchor a meaningful trough before the most recent potential breakout.
    # Reject ambiguous structures rather than backfilling future candles.
    search_start = max(0, end - 440)
    trough_candidates = range(search_start + 45, end - min_base_bars + 1)
    candidates = []
    for trough in trough_candidates:
        prior_start = max(search_start, trough - 360)
        peak = max(range(prior_start, trough), key=lambda j: highs[j])
        peak_price = highs[peak]
        depth = (peak_price - lows[trough]) / peak_price
        if depth < min_decline_pct or trough - peak < 25:
            continue
        base = lows[trough:end + 1]
        # Base width uses low-to-high range across the base; can be tuned.
        box_high = max(highs[trough:end]) if trough < end else highs[end]
        width = (box_high - min(base)) / min(base)
        if width > base_width_max:
            continue
        ratio = (end - trough) / (trough - peak)
        # Favor more recent and better-balanced bases, not maximum hindsight gain.
        candidates.append((abs(ratio - 1), -trough, peak, trough, depth, ratio))
    if not candidates:
        raise ValueError("No measurable decline/base pattern under specified parameters")
    _, _, peak, trough, depth, ratio = min(candidates)
    p = closes[-1]
    ma112, ma224, ma448 = (_avg(closes[-n:]) for n in (112, 224, 448))
    # Use prior bars only for resistance and volume baselines.
    box_top = max(highs[trough:-1])
    base_low = min(lows[trough:])
    historical_volume = vols[-21:-1]
    rv = vols[-1] / _avg(historical_volume) if _avg(historical_volume) else 0.0
    box_break = p > box_top
    ma_break = p > ma224 and p > ma448
    breakout = box_break and ma_break and rv >= breakout_rvol
    above_long = ma_break
    distance = (p / box_top - 1) if box_top else 0.0
    if ratio < ratio_watch:
        stage, note = "REJECT", "Base duration is shorter than the watch threshold"
    elif breakout and distance > 0.20:
        stage, note = "EXTENDED", "Breakout is already more than 20% above box top"
    elif breakout:
        stage, note = "BREAKOUT", "Closed daily breakout with volume and long-MA confirmation"
    elif p > box_top and not breakout:
        stage, note = "RETEST_CANDIDATE", "Above box top but volume / long-MA breakout gate not met"
    elif p >= box_top * 0.92:
        stage, note = "PRE", "Near box top; wait for closed-candle breakout"
    else:
        stage, note = "REJECT", "Price is far below the box top"
    return BowlSignal(
        stage=stage,
        decline_bars=trough - peak,
        base_bars=end - trough,
        duration_ratio=round(ratio, 3),
        decline_pct=round(depth * 100, 2),
        base_low=round(base_low, 10),
        box_top=round(box_top, 10),
        price=round(p, 10),
        sma112=round(ma112, 10),
        sma224=round(ma224, 10),
        sma448=round(ma448, 10),
        volume_ratio=round(rv, 2),
        above_long_ma=above_long,
        breakout=breakout,
        notes=note,
    )
