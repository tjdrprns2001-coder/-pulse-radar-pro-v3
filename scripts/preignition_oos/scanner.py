from __future__ import annotations

import argparse
import asyncio
import json
import os
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

import aiohttp
import numpy as np
import pandas as pd


BASE_URL = "https://fapi.binance.com"
SPOT_BASE_URL = "https://api.binance.com"
EMA_PERIODS = (14, 28, 57, 92)
LONG_SMA_PERIODS = (112, 224, 448)
TF_MS = {
    "1d": 86_400_000,
    "4h": 14_400_000,
    "1h": 3_600_000,
    "15m": 900_000,
    "5m": 300_000,
}


@dataclass(frozen=True)
class Config:
    # EMA92 + 최근 구조 계산 + 5m 24H 변화율을 위한 충분한 봉 확보.
    bars: int = 520
    workers: int = 6
    rvol_window: int = 20

    # TF별 최소 이력. 신규 상장 종목을 150일 일괄 컷하지 않는다.
    min_bars_1d: int = 40
    min_bars_4h: int = 120
    min_bars_1h: int = 100
    min_bars_15m: int = 100
    min_bars_5m: int = 100

    # 4H 기본 셋업.
    compression_max: float = 0.10
    compression_strong: float = 0.05
    historical_rvol: float = 2.0
    pre_ema14_tolerance: float = 0.02

    # 다중 TF 압축 cascade 기준.
    cascade_4h: float = 0.05
    cascade_1h: float = 0.03
    cascade_15m: float = 0.02
    cascade_5m: float = 0.015
    cascade_min_count: int = 3

    # OI 유형.
    oi_a_pct: float = 1.0
    oi_pre_pct: float = 0.20
    oi_cleanup_pct: float = -2.0
    oi_rebuild_pct: float = 0.30

    # Taker flow.
    flow_sustain: float = 1.15
    flow_ignition: float = 1.50
    flow_spike: float = 2.50

    # 15m = 점화 핵심. 5m RVOL은 더 이상 hard gate가 아니다.
    ignition_rvol: float = 1.50
    entry_rvol_info: float = 1.20
    breakout_bars: int = 12
    hold_tolerance: float = 0.005

    # 상승 후 눌림 → EMA14 재회복 기본값.
    pullback_min: float = 0.02
    pullback_max: float = 0.15
    prior_rally_min: float = 0.05

    # Volume Echo: 3~72시간 전 스파이크 + 현재 가격 유지.
    echo_quiet_max_rvol: float = 1.20
    echo_active_max_rvol: float = 3.00
    echo_price_floor: float = 0.97
    echo_volume_decay: float = 0.70

    # 과열 별도 분리 기준.
    extended_24h_pct: float = 20.0
    extended_daily_ema_pct: float = 18.0
    extended_4h_ema_pct: float = 10.0

    # 주식단테 공개 규칙 기반 112·224·448 + 구름대 단계.
    # 거래대금(quote volume)은 hard filter로 사용하지 않는다.
    dante_gap_min_pct: float = -20.0
    dante_gap_max_pct: float = -8.0
    dante_near_112_pct: float = 6.0
    dante_near_224_pct: float = 3.0
    dante_near_cloud_pct: float = 3.0
    dante_near_448_pct: float = 8.0
    dante_deep_limit: int = 16

    # 기본적으로 거래대금 필터를 적용하지 않는다.
    min_quote_volume: float = 0.0


class BinanceError(RuntimeError):
    pass


def spot_symbol_candidates(symbol: str) -> list[tuple[str, float]]:
    """Return spot symbols that preserve percentage structure for multiplier futures."""
    symbol = symbol.upper()
    candidates = [(symbol, 1.0)]
    for prefix in ("1000000", "1000"):
        if symbol.startswith(prefix) and symbol.endswith("USDT"):
            alias = symbol[len(prefix):]
            if alias and alias != symbol:
                candidates.append((alias, float(prefix)))
            break
    return candidates


class RateGate:
    """동시 요청 사이에도 최소 시작 간격을 보장한다."""

    def __init__(self, interval: float):
        self.interval = interval
        self.lock = asyncio.Lock()
        self.next_start = 0.0

    async def acquire(self):
        async with self.lock:
            delay = self.next_start - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)
            self.next_start = time.monotonic() + self.interval


class Binance:
    def __init__(self, session: aiohttp.ClientSession):
        self.session = session
        self.proxy_url = os.getenv("BINANCE_PROXY_URL", "").rstrip("/")
        self.proxy_token = os.getenv("BINANCE_PROXY_TOKEN", "")
        self.kline_mode = os.getenv("BINANCE_KLINE_MODE", "futures").lower()
        self.kline_fallback = os.getenv("BINANCE_KLINE_FALLBACK", "spot").lower()
        self.http_gate = RateGate(0.25)
        # OI 통계 API는 더 보수적으로 호출한다.
        self.oi_gate = RateGate(0.40)
        self.blocked = False
        self.candle_cache = {}

    async def get(self, path: str, base_url: str = BASE_URL, **params):
        is_oi = path.startswith("/futures/data/")
        max_attempts = 6 if self.proxy_url else 4
        for attempt in range(max_attempts):
            if self.blocked:
                raise BinanceError("API 차단 상태: 추가 요청 중단")

            if is_oi:
                await self.oi_gate.acquire()
            await self.http_gate.acquire()

            if self.blocked:
                raise BinanceError("API 차단 상태: 추가 요청 중단")

            try:
                request_url = base_url + path
                request_params = params
                request_headers = None
                if self.proxy_url:
                    query = urlencode(params)
                    target = request_url + (("?" + query) if query else "")
                    request_url = self.proxy_url + "/fetch"
                    request_params = {"url": target}
                    request_headers = {
                        "Authorization": f"Bearer {self.proxy_token}"
                    }

                async with self.session.get(
                    request_url,
                    params=request_params,
                    headers=request_headers,
                ) as response:
                    if response.status == 418:
                        if not self.proxy_url:
                            self.blocked = True
                        raise BinanceError(f"HTTP 418: IP 차단, 요청 중단 ({path})")

                    if response.status == 429:
                        if attempt == max_attempts - 1:
                            raise BinanceError(
                                f"HTTP 429: 재시도 한도 초과 ({path})"
                            )
                        retry_after = response.headers.get("Retry-After", "60")
                        try:
                            delay = max(float(retry_after), 1.0)
                        except ValueError:
                            delay = 60.0
                        await asyncio.sleep(delay)
                        continue

                    if response.status >= 500:
                        if attempt == max_attempts - 1:
                            raise BinanceError(
                                f"HTTP {response.status} ({path})"
                            )
                        delay = (
                            min(60.0, 5.0 * (2 ** attempt))
                            if self.proxy_url
                            else float(2 ** attempt)
                        )
                        await asyncio.sleep(delay)
                        continue

                    if response.status != 200:
                        body = (await response.text())[:200]
                        raise BinanceError(f"HTTP {response.status}: {body}")

                    data = await response.json()
                    if isinstance(data, dict) and data.get("code", 0) < 0:
                        raise BinanceError(str(data))
                    return data

            except (aiohttp.ClientError, asyncio.TimeoutError):
                if attempt == max_attempts - 1:
                    raise
                delay = (
                    min(60.0, 5.0 * (2 ** attempt))
                    if self.proxy_url
                    else float(2 ** attempt)
                )
                await asyncio.sleep(delay)

        raise BinanceError("API 요청 실패")

    async def spot_klines(
        self, symbol: str, interval: str, asof: int, cfg: Config
    ):
        last_error = None
        for spot_symbol, scale in spot_symbol_candidates(symbol):
            try:
                raw = await self.get(
                    "/api/v3/klines",
                    base_url=SPOT_BASE_URL,
                    symbol=spot_symbol,
                    interval=interval,
                    endTime=asof - 1,
                    limit=cfg.bars,
                )
                return raw, spot_symbol, scale
            except BinanceError as exc:
                last_error = exc
                if "Invalid symbol" not in str(exc):
                    raise
        if last_error is not None:
            raise last_error
        raise BinanceError(f"{symbol}: usable spot candle symbol 없음")

    async def candles(
        self, symbol: str, interval: str, asof: int, cfg: Config
    ) -> pd.DataFrame:
        cache_key = (symbol, interval, int(asof), self.kline_mode, self.kline_fallback, cfg.bars)
        cached = self.candle_cache.get(cache_key)
        if cached is not None:
            return cached

        source = "BINANCE_FUTURES"
        spot_symbol = symbol
        spot_scale = 1.0
        if self.kline_mode == "spot":
            raw, spot_symbol, spot_scale = await self.spot_klines(
                symbol, interval, asof, cfg
            )
            source = (
                "BINANCE_SPOT_FALLBACK"
                if spot_symbol == symbol
                else f"BINANCE_SPOT_ALIAS:{spot_symbol}*{spot_scale:g}"
            )
        else:
            try:
                raw = await self.get(
                    "/fapi/v1/klines",
                    symbol=symbol,
                    interval=interval,
                    endTime=asof - 1,
                    limit=cfg.bars,
                )
            except Exception:
                if self.kline_fallback != "spot":
                    raise
                raw, spot_symbol, spot_scale = await self.spot_klines(
                    symbol, interval, asof, cfg
                )
                source = (
                    "BINANCE_SPOT_FALLBACK"
                    if spot_symbol == symbol
                    else f"BINANCE_SPOT_ALIAS:{spot_symbol}*{spot_scale:g}"
                )
        columns = [
            "open_time", "open", "high", "low", "close", "volume",
            "close_time", "quote_volume", "trades",
            "taker_buy_base", "taker_buy_quote", "ignore",
        ]
        df = pd.DataFrame(raw, columns=columns)
        if df.empty:
            raise ValueError(f"{symbol} {interval}: 봉 데이터 없음")

        for col in columns:
            df[col] = pd.to_numeric(df[col], errors="raise")

        # Multiplier futures such as 1000PEPEUSDT can reuse PEPEUSDT spot
        # percentage structure. Rescale OHLC/base volume so price/VWAP stay
        # in the futures contract's nominal units.
        if spot_scale != 1.0:
            for col in ("open", "high", "low", "close"):
                df[col] *= spot_scale
            df["volume"] /= spot_scale
            df["taker_buy_base"] /= spot_scale

        df = (
            df.loc[df.close_time < asof]
            .sort_values("open_time")
            .drop_duplicates("open_time")
            .reset_index(drop=True)
        )

        required = min_bars_for(interval, cfg)
        if len(df) < required:
            raise ValueError(
                f"{symbol} {interval}: 이력 부족 {len(df)}봉 < {required}"
            )
        if not (df.open_time.diff().dropna() == TF_MS[interval]).all():
            raise ValueError(f"{symbol} {interval}: 봉 누락 발견")
        if asof - int(df.close_time.iloc[-1]) > TF_MS[interval]:
            raise ValueError(f"{symbol} {interval}: 최신 봉 지연")
        if not np.isfinite(df[columns].to_numpy()).all():
            raise ValueError(f"{symbol} {interval}: 비정상 수치")

        out = indicators(df, cfg)
        out.attrs["source"] = source
        out.attrs["history_bars"] = len(df)
        out.attrs["short_history"] = bool(interval == "1d" and len(df) < 448)
        self.candle_cache[cache_key] = out
        return out


def min_bars_for(interval: str, cfg: Config) -> int:
    return {
        "1d": cfg.min_bars_1d,
        "4h": cfg.min_bars_4h,
        "1h": cfg.min_bars_1h,
        "15m": cfg.min_bars_15m,
        "5m": cfg.min_bars_5m,
    }[interval]


def indicators(df: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    df = df.copy()
    for period in EMA_PERIODS:
        df[f"ema{period}"] = df.close.ewm(
            span=period, adjust=False
        ).mean()

    # 이 전략은 사용자가 제공한 문서의 '일선' 의미를 보존하기 위해
    # 112/224/448을 SMA로 계산한다. 기존 Astra EMA 계열과 분리한다.
    for period in LONG_SMA_PERIODS:
        df[f"sma{period}"] = df.close.rolling(
            period, min_periods=period
        ).mean()

    # 표준 일목균형표: 전환 9, 기준 26, 선행2 52, 구름은 26봉 선행.
    high9 = df.high.rolling(9, min_periods=9).max()
    low9 = df.low.rolling(9, min_periods=9).min()
    high26 = df.high.rolling(26, min_periods=26).max()
    low26 = df.low.rolling(26, min_periods=26).min()
    high52 = df.high.rolling(52, min_periods=52).max()
    low52 = df.low.rolling(52, min_periods=52).min()
    df["tenkan"] = (high9 + low9) / 2
    df["kijun"] = (high26 + low26) / 2
    df["senkou_a"] = ((df["tenkan"] + df["kijun"]) / 2).shift(26)
    df["senkou_b"] = ((high52 + low52) / 2).shift(26)
    df["cloud_top"] = pd.concat(
        [df["senkou_a"], df["senkou_b"]], axis=1
    ).max(axis=1)
    df["cloud_bottom"] = pd.concat(
        [df["senkou_a"], df["senkou_b"]], axis=1
    ).min(axis=1)

    macd = (
        df.close.ewm(span=12, adjust=False).mean()
        - df.close.ewm(span=26, adjust=False).mean()
    )
    df["hist"] = macd - macd.ewm(span=9, adjust=False).mean()

    # 현재 평가 봉을 RVOL 기준 평균에 포함하지 않는다.
    baseline = (
        df.volume.shift(1)
        .rolling(cfg.rvol_window, min_periods=cfg.rvol_window)
        .mean()
        .replace(0, np.nan)
    )
    df["rvol"] = df.volume / baseline

    sell = (df.quote_volume - df.taker_buy_quote).clip(lower=0)
    floor = (df.quote_volume.abs() * 1e-9).clip(lower=1e-12)
    df["taker"] = df.taker_buy_quote / sell.where(sell > 0, floor)
    df.loc[df.quote_volume <= 0, "taker"] = np.nan

    ema_cols = [f"ema{x}" for x in EMA_PERIODS]

    # 역추적 표 정의와 동일하게 맞춘다:
    # (EMA 최댓값 - EMA 최솟값) / 종가. 내부에서는 비율로 보관한다.
    close_nonzero = df.close.replace(0, np.nan)
    df["compression"] = (
        df[ema_cols].max(axis=1) - df[ema_cols].min(axis=1)
    ) / close_nonzero

    # 종가 대비 MACD histogram %. 자산 가격 수준이 달라도 비교 가능하게 한다.
    # 기존 raw histogram은 정보 출력과 부호 확인을 위해 그대로 유지한다.
    df["hist_pct"] = df["hist"] / close_nonzero * 100

    # UTC 일별 누적 VWAP. 하루 초반에는 짧은 표본이라는 한계가 있다.
    day = pd.to_datetime(df.open_time, unit="ms", utc=True).dt.floor("D")
    daily_quote = df.quote_volume.groupby(day).cumsum()
    daily_base = df.volume.groupby(day).cumsum().replace(0, np.nan)
    df["vwap"] = daily_quote / daily_base
    return df


def _finite(value) -> bool:
    try:
        return bool(np.isfinite(float(value)))
    except (TypeError, ValueError):
        return False


def _distance_pct(price, level):
    if not (_finite(price) and _finite(level)) or float(level) == 0:
        return None
    return (float(price) / float(level) - 1) * 100


def _recent_cross(close: pd.Series, line: pd.Series, lookback: int = 6) -> bool:
    start = max(1, len(close) - lookback)
    for i in range(start, len(close)):
        if not (_finite(line.iloc[i]) and _finite(line.iloc[i - 1])):
            continue
        if close.iloc[i] >= line.iloc[i] and close.iloc[i - 1] < line.iloc[i - 1]:
            return True
    return False


def dante_ma_cloud_cycle(df: pd.DataFrame, cfg: Config) -> dict:
    """Classify the public 112/224/448 + Ichimoku A→F lifecycle.

    Price/MA/cloud logic is a structural screen. Candle RVOL may raise the
    score, but 24h quote volume never rejects a symbol here.
    """
    row = df.iloc[-1]
    history = len(df)
    price = float(row.close)
    m112 = float(row.sma112) if _finite(row.sma112) else None
    m224 = float(row.sma224) if _finite(row.sma224) else None
    m448 = float(row.sma448) if _finite(row.sma448) else None
    cloud_top = float(row.cloud_top) if _finite(row.cloud_top) else None
    cloud_bottom = float(row.cloud_bottom) if _finite(row.cloud_bottom) else None
    kijun = float(row.kijun) if _finite(row.kijun) else None

    d112 = _distance_pct(price, m112)
    d224 = _distance_pct(price, m224)
    d448 = _distance_pct(price, m448)
    gap = _distance_pct(m224, m112) if m112 is not None and m224 is not None else None

    above112 = bool(m112 is not None and price > m112)
    above224 = bool(m224 is not None and price > m224)
    above448 = bool(m448 is not None and price > m448)
    above_cloud = bool(cloud_top is not None and price > cloud_top)
    below_cloud = bool(cloud_bottom is not None and price < cloud_bottom)
    inside_cloud = bool(
        cloud_top is not None and cloud_bottom is not None
        and cloud_bottom <= price <= cloud_top
    )

    cross112 = bool(
        m112 is not None
        and _recent_cross(df.close, df.sma112, 6)
    )
    cross224 = bool(
        m224 is not None
        and _recent_cross(df.close, df.sma224, 6)
    )

    near112 = d112 is not None and abs(d112) <= cfg.dante_near_112_pct
    near224 = d224 is not None and abs(d224) <= cfg.dante_near_224_pct
    near_cloud = bool(
        cloud_top is not None
        and abs(_distance_pct(price, cloud_top)) <= cfg.dante_near_cloud_pct
    )
    gap_recovery = bool(
        gap is not None
        and cfg.dante_gap_min_pct <= gap <= cfg.dante_gap_max_pct
    )

    lows = df.low.iloc[-5:]
    low5 = float(lows.min())
    retest224 = bool(
        m224 is not None and price > m224
        and low5 <= m224 * (1 + cfg.dante_near_224_pct / 100)
    )
    retest_cloud = bool(
        cloud_top is not None and price > cloud_top
        and low5 <= cloud_top * (1 + cfg.dante_near_cloud_pct / 100)
    )

    def hold_line(name: str) -> bool:
        line = df[name]
        count = 0
        for i in range(max(0, len(df) - 3), len(df)):
            if _finite(line.iloc[i]) and df.close.iloc[i] > line.iloc[i]:
                count += 1
        return count >= 2

    hold112 = above112 and hold_line("sma112")
    hold224 = above224 and hold_line("sma224")

    prior_above224 = False
    prior_above_cloud = False
    for i in range(max(0, len(df) - 8), len(df) - 1):
        if _finite(df.sma224.iloc[i]) and df.close.iloc[i] > df.sma224.iloc[i]:
            prior_above224 = True
        if (
            _finite(df.cloud_top.iloc[i])
            and df.close.iloc[i] > df.cloud_top.iloc[i]
        ):
            prior_above_cloud = True

    failed224 = bool(m224 is not None and price < m224 and prior_above224)
    failed_cloud = bool((inside_cloud or below_cloud) and prior_above_cloud)
    aligned = bool(
        m112 is not None and m224 is not None and m448 is not None
        and m112 > m224 > m448
    )

    # Pullback volume: the newest 3 closed candles should contract versus
    # the preceding 3. It is a quality bonus, not a volume gate.
    volumes = df.volume.iloc[-6:].to_numpy(dtype=float)
    pullback_volume_decreasing = bool(
        len(volumes) == 6
        and np.mean(volumes[-3:]) <= np.mean(volumes[:3]) * 0.90
    )
    rvol = float(row.rvol) if _finite(row.rvol) else None

    stage = "PRE"
    score = 20
    matched = False
    if failed224 or failed_cloud:
        stage, score = "F", 5
    elif (
        d448 is not None
        and -cfg.dante_near_448_pct <= d448 <= cfg.dante_near_448_pct
        and m448 is not None and m224 is not None and m448 > m224
    ):
        stage, score = "E", 35
    elif above224 and above_cloud and (retest224 or retest_cloud) and hold224:
        stage, score, matched = "D", 90, True
    elif aligned and near112 and above_cloud:
        stage, score, matched = "TREND_PULLBACK", 84, True
    elif above112 and not above224 and (inside_cloud or near224 or near_cloud):
        stage, score = "C", 58
    elif above112 and not above224 and near112 and hold112:
        stage, score, matched = "B", 82, True
    elif above112 and not above224 and gap_recovery and cross112:
        stage, score = "A", 70
    elif above112 and not above224 and gap_recovery:
        stage, score = "A_WAIT", 62
    elif above224 and above_cloud:
        stage, score = "D_HOLD", 72

    if rvol is not None and rvol >= 1.5:
        score += 6
    if pullback_volume_decreasing and stage in {"B", "D", "TREND_PULLBACK"}:
        score += 5
    if cross224 and above224:
        score += 4
    score = int(max(0, min(100, round(score))))

    stage_labels = {
        "A": "A · 112 돌파",
        "A_WAIT": "A · 112 회복 대기",
        "B": "B · 112 눌림",
        "C": "C · 구름/224 저항",
        "D": "D · 224 재테스트",
        "D_HOLD": "D · 224 안착",
        "E": "E · 448 접근",
        "F": "F · 돌파 실패",
        "TREND_PULLBACK": "정배열 · 112 눌림",
        "PRE": "PRE",
    }
    candidate = stage in {
        "A", "A_WAIT", "B", "C", "D", "D_HOLD", "TREND_PULLBACK"
    }
    manage = stage in {"E", "F"}
    return {
        "stage": stage,
        "stage_label": stage_labels[stage],
        "score": score,
        "matched": matched,
        "candidate": candidate,
        "manage": manage,
        "price": price,
        "history_bars": history,
        "lines": {"112": m112, "224": m224, "448": m448},
        "distance_pct": {"112": d112, "224": d224, "448": d448},
        "gap_112_224_pct": gap,
        "cloud": {
            "position": (
                "ABOVE" if above_cloud else "INSIDE" if inside_cloud
                else "BELOW" if below_cloud else "N/A"
            ),
            "top": cloud_top,
            "bottom": cloud_bottom,
            "kijun": kijun,
        },
        "rvol": rvol,
        "flags": {
            "cross112": cross112,
            "cross224": cross224,
            "hold112": hold112,
            "hold224": hold224,
            "retest224": retest224,
            "retest_cloud": retest_cloud,
            "aligned": aligned,
            "pullback_volume_decreasing": pullback_volume_decreasing,
        },
        "targets": {
            "next": (
                "224" if stage in {"A", "A_WAIT", "B", "C"}
                else "448" if stage in {"D", "D_HOLD"}
                else "MANAGE" if stage == "E"
                else "OBSERVE"
            )
        },
    }


def above_all(df: pd.DataFrame) -> bool:
    row = df.iloc[-1]
    return bool(all(row.close > row[f"ema{x}"] for x in EMA_PERIODS))


def aligned(row: pd.Series) -> bool:
    return bool(row.ema14 > row.ema28 > row.ema57 > row.ema92)


def macd_improving(df: pd.DataFrame) -> bool:
    hist = df["hist_pct"].iloc[-3:]
    if len(hist) < 3 or not np.isfinite(hist).all():
        return False

    # 음수 histogram의 축소도 개선으로 인정한다.
    return bool(
        hist.iloc[-1] > hist.iloc[-2]
        and hist.iloc[-1] > hist.iloc[0]
    )


def macd_state(df: pd.DataFrame) -> str:
    # 상태 분류도 같은 정규화 histogram을 사용한다.
    hist = df["hist_pct"].iloc[-3:].to_numpy(dtype=float)
    if len(hist) < 3 or not np.isfinite(hist).all():
        return "UNKNOWN"

    h0, h1, h2 = hist
    rising = h2 > h1 > h0
    falling = h2 < h1 < h0

    if h2 < 0 and rising:
        return "NEGATIVE_RISING"
    if h2 < 0 and abs(h2 - h1) < abs(h1 - h0):
        return "NEGATIVE_FLATTENING"
    if h2 < 0 and falling:
        return "NEGATIVE_EXPANDING"
    if h2 >= 0 and rising:
        return "POSITIVE_RISING"
    if h2 >= 0 and falling:
        return "POSITIVE_WEAKENING"
    return "MIXED"


def hold_or_hl(df: pd.DataFrame, cfg: Config) -> bool:
    recent_low = float(df.low.iloc[-3:].min())
    prior_low = float(df.low.iloc[-6:-3].min())
    return recent_low >= prior_low * (1 - cfg.hold_tolerance)


def break_or_reclaim(df: pd.DataFrame, cfg: Config) -> dict:
    row = df.iloc[-1]
    prev = df.iloc[-2]
    level = float(df.high.iloc[-cfg.breakout_bars - 1:-1].max())

    breakout = bool(prev.close <= level < row.close)
    reclaim = bool(row.low <= level < row.close)
    return {
        "confirmed": breakout or reclaim,
        "breakout": breakout,
        "reclaim": reclaim,
        "level": level,
    }


def flow_label(values, cfg: Config) -> str:
    values = np.asarray(list(values), dtype=float)
    if len(values) < 4 or not np.isfinite(values[-4:]).all():
        return "UNKNOWN"

    x = values[-4:]
    if x[:-1].max() >= cfg.flow_spike and x[-1] < 1.0:
        return "FLOW-SPIKE-FAIL"

    if np.all(x[-3:] >= cfg.flow_sustain):
        return "FLOW-SUSTAIN"

    if (
        x[-1] >= cfg.flow_ignition
        and x[0] <= 1.0
        and np.all(np.diff(x) >= 0)
    ):
        return "FLOW-IGNITION"

    if x[-1] >= cfg.flow_ignition:
        return "FLOW-SPIKE"
    return "FLOW-WAIT"


def good_flow(label: str) -> bool:
    return label in {"FLOW-SUSTAIN", "FLOW-IGNITION"}


def compression_tier(value: float) -> str:
    if value <= 0.02:
        return "ULTRA"
    if value <= 0.05:
        return "STRONG"
    if value <= 0.10:
        return "NORMAL"
    if value <= 0.20:
        return "LOOSE"
    return "EXPANDED"


def setup_4h(df: pd.DataFrame, cfg: Config) -> dict:
    row = df.iloc[-1]
    above14 = bool(row.close > row.ema14)
    near14 = bool(row.close >= row.ema14 * (1 - cfg.pre_ema14_tolerance))
    state = macd_state(df)
    constructive_macd = macd_improving(df) or bool(row["hist"] > 0)

    compression = float(row.compression)
    compressed = compression <= cfg.compression_max

    peak_window = df.iloc[-12:-2]
    peak_idx = peak_window.high.idxmax()
    peak = float(df.loc[peak_idx, "high"])
    base = float(df.low.iloc[-24:peak_idx + 1].min())
    post_peak = df.loc[peak_idx + 1:]
    trough = float(post_peak.low.min())
    prior_rally = peak / base - 1
    pullback_depth = 1 - trough / peak
    recent = df.iloc[-3:]

    reclaim14 = bool((recent.close <= recent.ema14).any() and above14)
    pullback = bool(
        prior_rally >= cfg.prior_rally_min
        and cfg.pullback_min <= pullback_depth <= cfg.pullback_max
        and reclaim14
        and hold_or_hl(df, cfg)
    )

    max_rvol_72h = float(df.rvol.iloc[-18:].max())
    return {
        # PRE는 EMA14 바로 아래까지 허용. READY 이후에서 회복 여부를 다시 본다.
        "valid": bool(near14 and constructive_macd and (compressed or pullback)),
        "above_ema14": above14,
        "near_ema14": near14,
        "compression_pct": compression * 100,
        "compression_tier": compression_tier(compression),
        "strong_compression": compression <= cfg.compression_strong,
        "pullback_recovery": pullback,
        "macd_improving": macd_improving(df),
        "macd_state": state,
        "macd_hist_pct": float(row["hist_pct"]),
        "historical_rvol": max_rvol_72h >= cfg.historical_rvol,
        "max_rvol_72h": max_rvol_72h,
    }


def volume_echo(df: pd.DataFrame, cfg: Config) -> dict:
    # 최신 1H 봉을 기준으로 3~72시간 전 스파이크를 찾는다.
    current = df.iloc[-1]
    age = (current.open_time - df.open_time) / TF_MS["1h"]
    past = df.loc[
        age.between(3, 72) & (df.rvol >= cfg.historical_rvol)
    ]

    if past.empty:
        return {
            "detected": False,
            "mode": "NONE",
            "anchor_time": None,
        }

    for idx in reversed(past.index.tolist()):
        anchor = df.loc[idx]
        since = df.loc[idx + 1:]
        current_low = float(df.low.iloc[-3:].min())

        maintained = bool(
            current_low >= anchor.low * cfg.echo_price_floor
            and current.close >= anchor.close * cfg.echo_price_floor
        )
        reduced = bool(current.volume < anchor.volume * cfg.echo_volume_decay)
        alive = bool(
            current.close > current.ema14
            and hold_or_hl(df, cfg)
            and float(since.close.min()) >= anchor.low * cfg.echo_price_floor
        )

        if not (maintained and reduced and alive):
            continue

        if current.rvol <= cfg.echo_quiet_max_rvol:
            mode = "ECHO-QUIET"
        elif current.rvol <= cfg.echo_active_max_rvol:
            mode = "ECHO-ACTIVE"
        else:
            continue

        return {
            "detected": True,
            "mode": mode,
            "anchor_time": int(anchor.open_time),
            "anchor_rvol": float(anchor.rvol),
            "current_rvol": float(current.rvol),
        }

    return {
        "detected": False,
        "mode": "NONE",
        "anchor_time": None,
    }


def volume_context(
    h4: pd.DataFrame,
    h1: pd.DataFrame,
    m15: pd.DataFrame,
    cfg: Config,
) -> dict:
    """Volume Echo와 최근 선행 거래량을 분리해서 기록한다.

    recent_preload는 거래량 유입 사실만 뜻하며 B형 승격 조건은 아니다.
    B형은 기존 taker FLOW 조건에서만 결정한다.
    """
    echo = volume_echo(h1, cfg)

    structure_alive = bool(
        setup_4h(h4, cfg)["valid"]
        and h1.close.iloc[-1] > h1.ema14.iloc[-1]
        and hold_or_hl(h1, cfg)
    )

    # 최근 3시간의 1H 또는 최근 1시간의 15m 거래량 유입.
    # 입력 DF는 모두 현재 평가시점 이전에 종료된 확정봉만 포함한다.
    h1_recent_max = float(h1.rvol.iloc[-3:].max())
    m15_recent_max = float(m15.rvol.iloc[-4:].max())

    recent_preload = bool(
        structure_alive
        and (
            h1_recent_max >= cfg.historical_rvol
            or m15_recent_max >= cfg.historical_rvol
        )
    )

    echo_confirmed = bool(structure_alive and echo["detected"])

    if echo_confirmed and recent_preload:
        state = "ECHO+RECENT-PRELOAD"
    elif echo_confirmed:
        state = "VOLUME-ECHO"
    elif recent_preload:
        state = "RECENT-PRELOAD"
    else:
        state = "QUIET"

    return {
        **echo,
        "detected": echo_confirmed,
        "state": state,
        "recent_preload": recent_preload,
        "structure_alive": structure_alive,
        "recent_1h_max_rvol": h1_recent_max,
        "recent_15m_max_rvol": m15_recent_max,
    }


def ready_1h(df: pd.DataFrame, cfg: Config) -> dict:
    row = df.iloc[-1]
    above14 = bool(row.close > row.ema14)
    near14 = bool(row.close >= row.ema14 * (1 - cfg.pre_ema14_tolerance))
    hold = hold_or_hl(df, cfg)
    improving = macd_improving(df)
    flow = flow_label(df.taker.iloc[-4:], cfg)

    return {
        "ready": above14 and hold and improving,
        "near_ema14": near14,
        "above_ema14": above14,
        "above_all_emas": above_all(df),
        "hold_or_hl": hold,
        "macd_improving": improving,
        "macd_state": macd_state(df),
        "macd_hist_pct": float(row["hist_pct"]),
        "compression_pct": float(row.compression) * 100,
        "compression_tier": compression_tier(float(row.compression)),
        "break": break_or_reclaim(df, cfg),
        "flow": flow,
    }


def gate_15m(df: pd.DataFrame, cfg: Config) -> dict:
    row = df.iloc[-1]
    prev = df.iloc[-2]
    flow = flow_label(df.taker.iloc[-4:], cfg)
    brk = break_or_reclaim(df, cfg)

    alignment_transition = bool(
        row.ema14 > row.ema28
        and row.ema14 > prev.ema14
        and (row.ema14 - row.ema28) > (prev.ema14 - prev.ema28)
    )
    rvol_up = bool(
        row.rvol >= cfg.ignition_rvol and row.rvol > prev.rvol
    )

    # 15m이 점화 메인 트리거.
    passed = bool(
        row.close > row.ema14
        and (aligned(row) or alignment_transition)
        and brk["confirmed"]
        and rvol_up
        and good_flow(flow)
    )
    return {
        "passed": passed,
        "above_all_emas": above_all(df),
        "aligned": aligned(row),
        "alignment_transition": alignment_transition,
        "compression_pct": float(row.compression) * 100,
        "compression_tier": compression_tier(float(row.compression)),
        "macd_state": macd_state(df),
        "macd_hist_pct": float(row["hist_pct"]),
        "break": brk,
        "rvol": float(row.rvol),
        "rvol_increasing": rvol_up,
        "flow": flow,
        "taker_sequence": df.taker.iloc[-4:].tolist(),
    }


def gate_5m(df: pd.DataFrame, cfg: Config) -> dict:
    row = df.iloc[-1]
    prev = df.iloc[-2]
    brk = break_or_reclaim(df, cfg)
    hold = hold_or_hl(df, cfg)

    ema_reclaim = bool(prev.close <= prev.ema14 and row.close > row.ema14)
    vwap_reclaim = bool(prev.close <= prev.vwap and row.close > row.vwap)
    vwap_confirmed = bool(row.close > row.vwap or ema_reclaim)

    # 5m RVOL은 정보로만 남기고 hard gate에서 제거.
    rvol_info = bool(row.rvol >= cfg.entry_rvol_info and row.rvol > prev.rvol)
    taker_reentry = bool(
        row.taker >= cfg.flow_sustain
        and (
            row.taker > prev.taker
            or good_flow(flow_label(df.taker.iloc[-4:], cfg))
        )
    )

    mss_proxy = brk["confirmed"] and hold
    structure_confirmed = bool(above_all(df) or mss_proxy or ema_reclaim)

    passed = bool(
        row.close > row.ema14
        and hold
        and vwap_confirmed
        and structure_confirmed
        and taker_reentry
    )

    return {
        "passed": passed,
        "above_all_emas": above_all(df),
        "hold_or_hl": hold,
        "vwap_confirmed": vwap_confirmed,
        "vwap_reclaim": vwap_reclaim,
        "ema_reclaim": ema_reclaim,
        "structure_confirmed": structure_confirmed,
        "mss_proxy": mss_proxy,
        "break": brk,
        "compression_pct": float(row.compression) * 100,
        "compression_tier": compression_tier(float(row.compression)),
        "rvol": float(row.rvol),
        "rvol_info_only": rvol_info,
        "taker_reentry": taker_reentry,
        "macd_state": macd_state(df),
        "macd_hist_info_only": float(row["hist"]),
        "macd_hist_pct_info_only": float(row["hist_pct"]),
    }


def compression_cascade(
    h4: pd.DataFrame,
    h1: pd.DataFrame,
    m15: pd.DataFrame,
    m5: pd.DataFrame,
    cfg: Config,
) -> dict:
    values = {
        "4h": float(h4.compression.iloc[-1]),
        "1h": float(h1.compression.iloc[-1]),
        "15m": float(m15.compression.iloc[-1]),
        "5m": float(m5.compression.iloc[-1]),
    }
    thresholds = {
        "4h": cfg.cascade_4h,
        "1h": cfg.cascade_1h,
        "15m": cfg.cascade_15m,
        "5m": cfg.cascade_5m,
    }
    passed = {tf: values[tf] <= thresholds[tf] for tf in values}
    count = sum(passed.values())
    label = (
        "FULL" if count == 4
        else "TIGHT" if count == 3
        else "PARTIAL" if count == 2
        else "LOOSE"
    )
    return {
        "count": count,
        "total": 4,
        "qualified": count >= cfg.cascade_min_count,
        "label": label,
        "passed": passed,
        "compression_pct": {tf: values[tf] * 100 for tf in values},
        "tiers": {tf: compression_tier(values[tf]) for tf in values},
    }


def pct_change(current: float, previous: float) -> float:
    if previous <= 0:
        raise ValueError("변화율 기준값이 0 이하")
    return (current / previous - 1) * 100


async def taker_series(
    api: Binance, symbol: str, period: str, asof: int
) -> dict:
    try:
        period_ms = TF_MS[period]
        cutoff = (asof // period_ms) * period_ms - 1
        raw = await api.get(
            "/futures/data/takerlongshortRatio",
            symbol=symbol,
            period=period,
            limit=8,
            endTime=cutoff,
        )
        df = pd.DataFrame(raw)
        if df.empty:
            raise ValueError("taker 데이터 없음")

        df["timestamp"] = pd.to_numeric(df.timestamp)
        df["buy"] = pd.to_numeric(df.buyVol)
        df["sell"] = pd.to_numeric(df.sellVol)
        df = (
            df.loc[df.timestamp <= cutoff]
            .sort_values("timestamp")
            .drop_duplicates("timestamp")
        )
        if len(df) < 4:
            raise ValueError("taker 이력 부족")

        # 마지막 4개 taker 버킷이 실제 최신 확정봉 4개와 연속적으로
        # 정렬되는지 검증한다. 누락/지연 데이터를 최신 캔들에 억지로
        # 덮어쓰면 FLOW-SUSTAIN/IGNITION이 잘못 승격될 수 있다.
        tail = df.iloc[-4:].copy()
        buckets = (
            tail["timestamp"].to_numpy(dtype=np.int64) // period_ms
        ) * period_ms
        if not np.all(np.diff(buckets) == period_ms):
            raise ValueError("taker 구간 누락 또는 비연속")

        expected_latest = (
            (asof // period_ms) * period_ms - period_ms
        )
        if int(buckets[-1]) != int(expected_latest):
            raise ValueError(
                "taker 최신 데이터 지연 "
                f"{int(buckets[-1])} != {int(expected_latest)}"
            )

        floor = np.maximum(tail.sell.to_numpy(dtype=float), 1e-12)
        ratios = tail.buy.to_numpy(dtype=float) / floor
        if not np.isfinite(ratios).all():
            raise ValueError("taker 비정상 수치")

        return {
            "known": True,
            "period": period,
            "values": ratios.tolist(),
            "timestamps": tail.timestamp.astype("int64").tolist(),
            "timestamp": int(tail.timestamp.iloc[-1]),
            "source": "BINANCE_FUTURES_TAKER_DATA",
            "error": None,
        }
    except Exception as exc:
        return {
            "known": False,
            "period": period,
            "values": [],
            "source": "N/A",
            "error": str(exc),
        }


def apply_futures_taker(df: pd.DataFrame, feature: dict) -> pd.DataFrame:
    out = df.copy()
    tail = out.index[-4:]
    out.loc[tail, "taker"] = np.nan
    values = feature.get("values", []) if feature.get("known") else []
    if len(values) >= 4:
        out.loc[tail, "taker"] = np.asarray(values[-4:], dtype=float)
    out.attrs.update(df.attrs)
    out.attrs["taker_source"] = feature.get("source", "N/A")
    return out


async def oi_features(
    api: Binance, symbol: str, asof: int, cfg: Config
) -> dict:
    try:
        raw = await api.get(
            "/futures/data/openInterestHist",
            symbol=symbol,
            period="5m",
            limit=48,
            # 캔들과 동일하게 평가 경계 이전 데이터만 요청.
            endTime=asof - 1,
        )
        df = pd.DataFrame(raw)
        if df.empty:
            raise ValueError("OI 데이터 없음")

        df["timestamp"] = pd.to_numeric(df.timestamp)
        df["oi"] = pd.to_numeric(df.sumOpenInterest)
        df = (
            df.loc[df.timestamp < asof]
            .sort_values("timestamp")
            .drop_duplicates("timestamp")
        )
        if not np.isfinite(df.oi).all() or (df.oi <= 0).any():
            raise ValueError("OI 비정상 수치")

        latest_time = int(df.timestamp.iloc[-1])
        if asof - latest_time > 2 * TF_MS["5m"]:
            raise ValueError("OI 최신 데이터 지연")

        def value_at(target: int) -> float:
            subset = df.loc[df.timestamp <= target]
            if subset.empty:
                raise ValueError("OI 기준 시점 이력 부족")
            row = subset.iloc[-1]
            if target - int(row.timestamp) > TF_MS["5m"]:
                raise ValueError("OI 기준 시점 데이터 누락")
            return float(row.oi)

        now = value_at(latest_time)
        p15 = value_at(latest_time - 15 * 60_000)
        p30 = value_at(latest_time - 30 * 60_000)
        p60 = value_at(latest_time - 60 * 60_000)
        p180 = value_at(latest_time - 180 * 60_000)

        delta15 = pct_change(now, p15)
        delta60 = pct_change(now, p60)

        building = now > p15 > p30
        a = delta60 >= cfg.oi_a_pct
        a_pre = (
            delta60 >= cfg.oi_pre_pct
            and delta15 > 0
            and building
        )

        cleanup = pct_change(p60, p180)
        c = (
            cleanup <= cfg.oi_cleanup_pct
            and delta60 >= cfg.oi_rebuild_pct
            and delta15 > 0
        )
        return {
            "known": True,
            "timestamp": latest_time,
            "change_15m_pct": delta15,
            "change_1h_pct": delta60,
            "cleanup_pct": cleanup,
            "building": building,
            "a": a,
            "a_pre": a_pre,
            "c_rebuild": c,
            "error": None,
        }
    except Exception as exc:
        return {
            "known": False,
            "a": False,
            "a_pre": False,
            "c_rebuild": False,
            "error": str(exc),
        }


def classify_type(oi: dict, flow: bool, c_type: bool) -> str:
    # type은 A/B/A+B/C만 담당. 진행 상태와 섞지 않는다.
    if c_type:
        return "C"
    if oi.get("known") and oi.get("a") and flow:
        return "A+B"
    if oi.get("known") and (oi.get("a") or oi.get("a_pre")):
        return "A"
    if flow:
        return "B"
    return "N/A"


def classify_stage(
    oi: dict,
    candidate_type: str,
    cascade: dict,
    ready: bool,
    armed_signal: bool,
    gate15: bool,
    gate5: bool,
    extended: bool,
) -> str:
    # stage는 진행도만 담당한다.
    if extended:
        return "EXTENDED"

    early_ignition = bool(
        candidate_type == "A+B"
        and oi.get("known")
        and oi.get("change_15m_pct", 0) > 0
        and ready
        and gate15
        and gate5
    )
    if early_ignition:
        return "EARLY_IGNITION"
    if gate15 and gate5:
        return "CONFIRM"
    if gate15:
        return "IGNITION"
    if ready and armed_signal:
        return "ARMED"
    if cascade["qualified"]:
        return "COMPRESSED"
    return "PRE"


async def dante_daily_scan(
    api: Binance, universe: set[str], asof: int, cfg: Config
) -> tuple[list[dict], list[dict]]:
    """Run the daily A→F screen over the full futures universe."""
    queue = asyncio.Queue()
    for symbol in sorted(universe):
        queue.put_nowait(symbol)
    rows, errors = [], []

    async def worker():
        while True:
            try:
                symbol = queue.get_nowait()
            except asyncio.QueueEmpty:
                return
            try:
                daily = await api.candles(symbol, "1d", asof, cfg)
                cycle = dante_ma_cloud_cycle(daily, cfg)
                if cycle["stage"] != "PRE":
                    rows.append({"symbol": symbol, **cycle})
            except Exception as exc:
                errors.append({"symbol": symbol, "error": str(exc)})
            finally:
                queue.task_done()

    await asyncio.gather(*(worker() for _ in range(cfg.workers)))
    return rows, errors


async def dante_deep_context(
    api: Binance, symbol: str, asof: int, cfg: Config
) -> dict:
    """Attach lower-TF execution and futures flow to a top Dante candidate."""
    h1, m15, m5, oi, taker_h1, taker_m15, taker_m5 = await asyncio.gather(
        api.candles(symbol, "1h", asof, cfg),
        api.candles(symbol, "15m", asof, cfg),
        api.candles(symbol, "5m", asof, cfg),
        oi_features(api, symbol, asof, cfg),
        taker_series(api, symbol, "1h", asof),
        taker_series(api, symbol, "15m", asof),
        taker_series(api, symbol, "5m", asof),
    )
    h1 = apply_futures_taker(h1, taker_h1)
    m15 = apply_futures_taker(m15, taker_m15)
    m5 = apply_futures_taker(m5, taker_m5)
    ready = ready_1h(h1, cfg)
    g15 = gate_15m(m15, cfg)
    g5 = gate_5m(m5, cfg)
    return {
        "ready_1h": ready,
        "oi": oi,
        "gate_15m": g15,
        "gate_5m": g5,
        "taker": {
            "1h": taker_h1,
            "15m": taker_m15,
            "5m": taker_m5,
        },
    }


async def analyze(
    api: Binance, symbol: str, asof: int, cfg: Config
) -> dict | None:
    # 4H 셋업부터 확인하여 하위 TF 요청량을 줄인다.
    h4 = await api.candles(symbol, "4h", asof, cfg)
    setup = setup_4h(h4, cfg)
    if not setup["valid"]:
        return None

    daily, h1 = await asyncio.gather(
        api.candles(symbol, "1d", asof, cfg),
        api.candles(symbol, "1h", asof, cfg),
    )
    m15, m5, oi, taker_h1, taker_m15, taker_m5 = await asyncio.gather(
        api.candles(symbol, "15m", asof, cfg),
        api.candles(symbol, "5m", asof, cfg),
        oi_features(api, symbol, asof, cfg),
        taker_series(api, symbol, "1h", asof),
        taker_series(api, symbol, "15m", asof),
        taker_series(api, symbol, "5m", asof),
    )

    h1 = apply_futures_taker(h1, taker_h1)
    m15 = apply_futures_taker(m15, taker_m15)
    m5 = apply_futures_taker(m5, taker_m5)

    ready = ready_1h(h1, cfg)
    echo = volume_context(h4, h1, m15, cfg)
    g15 = gate_15m(m15, cfg)
    g5 = gate_5m(m5, cfg)
    cascade = compression_cascade(h4, h1, m15, m5, cfg)

    # B형은 1H 선행 FLOW 또는 15m 재유입으로 확인.
    flow = good_flow(ready["flow"]) or good_flow(g15["flow"])

    price = float(m5.close.iloc[-1])
    d = daily.iloc[-1]
    day_distance = (price / float(d.ema14) - 1) * 100
    h4_distance = (price / float(h4.ema14.iloc[-1]) - 1) * 100

    # 24시간 전 확정 종가를 조회한다.
    # 5m 이력이 짧으면 1H를 사용하며, 기준시점이 최대 1시간 차이 날 수 있다.
    target = asof - 24 * TF_MS["1h"]
    reference = m5.loc[m5.close_time < target]
    if reference.empty:
        reference = h1.loc[h1.close_time < target]
    if reference.empty:
        raise ValueError(f"{symbol}: 24시간 변화율 계산 이력 부족")

    change24 = pct_change(price, float(reference.close.iloc[-1]))
    extended_reasons = []
    if change24 >= cfg.extended_24h_pct:
        extended_reasons.append("24H 상승폭 과대")
    if day_distance >= cfg.extended_daily_ema_pct:
        extended_reasons.append("1D EMA14 이격 과대")
    if h4_distance >= cfg.extended_4h_ema_pct:
        extended_reasons.append("4H EMA14 이격 과대")
    extended = bool(extended_reasons)

    daily_above = bool(d.close > d.ema14)
    daily_recovery = bool(
        d.close >= d.ema14 * 0.99
        and d.close > daily.close.iloc[-2]
    )

    environment = {
        "above_ema14": daily_above,
        "recovery_attempt": daily_recovery,
        "macd_improving": macd_improving(daily),
        "macd_state": macd_state(daily),
        "macd_hist_pct": float(d["hist_pct"]),
        "macd_positive": bool(d["hist"] > 0),
        "recent_daily_rvol": float(daily.rvol.iloc[-3:].max()),
        "recent_4h_rvol": setup["max_rvol_72h"],
        "ema14_distance_pct": day_distance,
        "compression_pct": float(d.compression) * 100,
        "compression_tier": compression_tier(float(d.compression)),
    }

    c_type = bool(
        oi["known"] and oi["c_rebuild"]
        and ready["above_ema14"] and ready["hold_or_hl"]
    )
    candidate_type = classify_type(oi, flow, c_type)

    # ARMED는 1H 준비 + 선행 단서(Echo/OI/FLOW) 중 하나.
    armed_signal = bool(
        echo["detected"]
        or (oi.get("known") and (oi.get("a") or oi.get("a_pre") or oi.get("c_rebuild")))
        or flow
    )

    stage = classify_stage(
        oi=oi,
        candidate_type=candidate_type,
        cascade=cascade,
        ready=ready["ready"],
        armed_signal=armed_signal,
        gate15=g15["passed"],
        gate5=g5["passed"],
        extended=extended,
    )

    # 순위용 휴리스틱. 확률/수익률 의미 없음.
    score = 20
    score += 3 * cascade["count"]
    score += 8 * int(cascade["qualified"])
    score += 8 * int(setup["pullback_recovery"])
    score += 8 * int(setup["historical_rvol"])
    score += 8 * int(daily_above or daily_recovery)
    score += 5 * int(environment["macd_improving"])
    score += 10 * int(ready["ready"])
    score += 5 * int(ready["above_all_emas"])
    score += 10 * int(echo["detected"])
    score += 2 * int(echo.get("mode") == "ECHO-ACTIVE")
    score += 10 * int(oi.get("a", False))
    score += 8 * int(c_type)
    score += 10 * int(flow)
    score += 14 * int(g15["passed"])
    score += 8 * int(g5["passed"])
    score -= 8 * int(not (daily_above or daily_recovery))
    score -= 8 * int(day_distance > 12)
    score -= 10 * int(g15["flow"] == "FLOW-SPIKE-FAIL")
    score -= 20 * int(extended)

    warnings = []
    if daily.attrs.get("short_history"):
        warnings.append(
            f"1D 이력 짧음({daily.attrs.get('history_bars')}봉): EMA92 참고치"
        )
    candle_sources = {
        "1d": daily.attrs.get("source", "UNKNOWN"),
        "4h": h4.attrs.get("source", "UNKNOWN"),
        "1h": h1.attrs.get("source", "UNKNOWN"),
        "15m": m15.attrs.get("source", "UNKNOWN"),
        "5m": m5.attrs.get("source", "UNKNOWN"),
    }
    taker_sources = {
        "1h": taker_h1.get("source", "N/A"),
        "15m": taker_m15.get("source", "N/A"),
        "5m": taker_m5.get("source", "N/A"),
    }
    if any(
        str(source).startswith("BINANCE_SPOT")
        for source in candle_sources.values()
    ):
        warnings.append("가격/거래량 Binance Spot fallback")
    if not all(x.get("known") for x in (taker_h1, taker_m15, taker_m5)):
        warnings.append("Futures taker 일부 미확인")
    if not oi["known"]:
        warnings.append("OI 미확인")
    if not ready["ready"]:
        warnings.append("1H 준비 미완료")
    if g15["flow"] == "FLOW-SPIKE-FAIL":
        warnings.append("15m FLOW 스파이크 실패")
    if not (daily_above or daily_recovery):
        warnings.append("1D 환경 약함")

    return {
        "symbol": symbol,
        "price": price,
        "type": candidate_type,
        "stage": stage,
        "score": score,
        "change_24h_pct": change24,
        "extended": extended,
        "extended_reasons": extended_reasons,
        "compression_cascade": cascade,
        "data_sources": {
            "candles": candle_sources,
            "taker": taker_sources,
            "oi": "BINANCE_FUTURES_OI" if oi.get("known") else "N/A",
        },
        "volume_echo": echo,
        "echo_reignition": bool(
            echo["detected"]
            and ready["ready"]
            and g15["passed"]
            and g5["passed"]
            and not extended
        ),
        "environment_1d": environment,
        "setup_4h": setup,
        "ready_1h": ready,
        "oi": oi,
        "gate_15m": g15,
        "gate_5m": g5,
        "warnings": warnings,
    }


async def futures_clock(api: Binance) -> int:
    try:
        clock = await api.get("/fapi/v1/time")
        return int(clock["serverTime"])
    except Exception:
        return int(time.time() * 1000)


async def futures_universe(api: Binance) -> set[str]:
    try:
        exchange = await api.get("/fapi/v1/exchangeInfo")
        return {
            item["symbol"]
            for item in exchange.get("symbols", [])
            if item.get("status") == "TRADING"
            and item.get("contractType") == "PERPETUAL"
            and item.get("quoteAsset") == "USDT"
        }
    except Exception:
        tickers = await api.get("/fapi/v1/ticker/24hr")
        return {
            str(item.get("symbol", "")).upper()
            for item in tickers
            if str(item.get("symbol", "")).upper().endswith("USDT")
            and "_" not in str(item.get("symbol", ""))
        }


async def scan(args, cfg: Config) -> dict:
    timeout = aiohttp.ClientTimeout(total=30)
    connector = aiohttp.TCPConnector(limit=20)
    async with aiohttp.ClientSession(
        timeout=timeout, connector=connector
    ) as session:
        api = Binance(session)

        server_time, universe = await asyncio.gather(
            futures_clock(api),
            futures_universe(api),
        )

        # 한 스캔 전체에 같은 기준시점 적용.
        asof = ((server_time - 5_000) // TF_MS["5m"]) * TF_MS["5m"]

        if args.symbols:
            requested = {s.upper() for s in args.symbols}
            invalid = requested - universe
            if invalid:
                raise ValueError(
                    "거래 중인 USDT 무기한이 아님: "
                    + ", ".join(sorted(invalid))
                )
            universe &= requested

        if cfg.min_quote_volume > 0:
            tickers = await api.get("/fapi/v1/ticker/24hr")
            liquid = {
                item["symbol"]
                for item in tickers
                if float(item["quoteVolume"]) >= cfg.min_quote_volume
            }
            universe &= liquid

        # 거래대금과 무관하게 전체 USDT 무기한에 일봉 DANTE 사이클을 먼저 적용한다.
        dante_rows, dante_errors = await dante_daily_scan(
            api, set(universe), asof, cfg
        )

        queue = asyncio.Queue()
        for symbol in sorted(universe):
            queue.put_nowait(symbol)

        rows, errors = [], []
        rejected_symbols = []

        async def worker():
            while True:
                try:
                    symbol = queue.get_nowait()
                except asyncio.QueueEmpty:
                    return
                try:
                    row = await analyze(api, symbol, asof, cfg)
                    if row is None:
                        rejected_symbols.append(symbol)
                    else:
                        rows.append(row)
                except Exception as exc:
                    errors.append({"symbol": symbol, "error": str(exc)})
                finally:
                    queue.task_done()

        await asyncio.gather(*(worker() for _ in range(cfg.workers)))

        dante_rank = {
            "B": 8,
            "D": 7,
            "A": 6,
            "C": 5,
            "D_HOLD": 4,
            "TREND_PULLBACK": 3,
            "A_WAIT": 2,
            "E": 1,
            "F": 0,
        }
        dante_rows.sort(
            key=lambda row: (dante_rank.get(row["stage"], -1), row["score"]),
            reverse=True,
        )
        deep_by_symbol = {row["symbol"]: row for row in rows}
        top_candidates = [r for r in dante_rows if r["candidate"]][
            :cfg.dante_deep_limit
        ]
        for row in top_candidates:
            existing = deep_by_symbol.get(row["symbol"])
            if existing is not None:
                row["deep"] = {
                    "source": "PREIGNITION_REUSE",
                    "type": existing.get("type"),
                    "stage": existing.get("stage"),
                    "ready_1h": existing.get("ready_1h"),
                    "oi": existing.get("oi"),
                    "gate_15m": existing.get("gate_15m"),
                    "gate_5m": existing.get("gate_5m"),
                }
                continue
            try:
                row["deep"] = {
                    "source": "DANTE_DEEP",
                    **await dante_deep_context(api, row["symbol"], asof, cfg),
                }
            except Exception as exc:
                row["deep"] = {
                    "source": "DANTE_DEEP",
                    "error": str(exc),
                }

    stage_rank = {
        "EARLY_IGNITION": 6,
        "CONFIRM": 5,
        "IGNITION": 4,
        "ARMED": 3,
        "COMPRESSED": 2,
        "PRE": 1,
        "EXTENDED": 0,
    }
    rows.sort(
        key=lambda row: (stage_rank[row["stage"]], row["score"]),
        reverse=True,
    )

    return {
        "asof_utc": datetime.fromtimestamp(
            asof / 1000, timezone.utc
        ).isoformat(),
        "universe_count": len(universe),
        "universe_symbols": sorted(universe),
        "rejected_4h_count": len(rejected_symbols),
        "rejected_symbols": sorted(rejected_symbols),
        "config": asdict(cfg),
        "candidates": [r for r in rows if not r["extended"]],
        "extended": [r for r in rows if r["extended"]],
        "errors": errors,
        "dante_scan": {
            "method": "SMA112_224_448_ICHIMOKU_A_F",
            "quote_volume_filter": False,
            "screened": len(universe),
            "classified": len(dante_rows),
            "candidate_count": sum(1 for r in dante_rows if r["candidate"]),
            "manage_count": sum(1 for r in dante_rows if r["manage"]),
            "deep_limit": cfg.dante_deep_limit,
            "errors": len(dante_errors),
        },
        "dante_candidates": [r for r in dante_rows if r["candidate"]],
        "dante_manage": [r for r in dante_rows if r["manage"]],
        "dante_errors": dante_errors,
    }


def self_test():
    cfg = Config()

    assert min_bars_for("1d", cfg) == 40
    assert cfg.bars >= 448
    assert cfg.min_quote_volume == 0.0
    assert spot_symbol_candidates("1000PEPEUSDT") == [
        ("1000PEPEUSDT", 1.0),
        ("PEPEUSDT", 1000.0),
    ]
    assert spot_symbol_candidates("1000000MOGUSDT") == [
        ("1000000MOGUSDT", 1.0),
        ("MOGUSDT", 1000000.0),
    ]

    assert flow_label([1.2, 1.3, 1.2, 1.4], cfg) == "FLOW-SUSTAIN"
    assert flow_label([0.7, 0.8, 1.0, 1.8], cfg) == "FLOW-IGNITION"
    assert flow_label([4.5, 0.8, 1.5, 0.3], cfg) == "FLOW-SPIKE-FAIL"
    assert flow_label([0.8, 0.9, 0.7, 4.5], cfg) == "FLOW-SPIKE"

    unknown_oi = {"known": False, "a": False, "a_pre": False}
    assert classify_type(unknown_oi, True, False) == "B"

    known_oi = {
        "known": True,
        "a": True,
        "a_pre": True,
        "change_15m_pct": 0.5,
    }
    assert classify_type(known_oi, True, False) == "A+B"

    cascade = {
        "count": 4,
        "total": 4,
        "qualified": True,
    }
    assert classify_stage(
        known_oi, "A+B", cascade, True, True, True, True, False
    ) == "EARLY_IGNITION"
    assert classify_stage(
        known_oi, "A+B", cascade, True, True, True, True, True
    ) == "EXTENDED"
    assert classify_stage(
        unknown_oi, "B", cascade, True, True, False, False, False
    ) == "ARMED"

    # RVOL 분모에 평가 봉 거래량이 들어가지 않는지 확인.
    count = 160
    frame = pd.DataFrame({
        "open_time": np.arange(count) * TF_MS["5m"],
        "close": np.full(count, 100.0),
        "volume": np.full(count, 100.0),
        "quote_volume": np.full(count, 10_000.0),
        "taker_buy_quote": np.full(count, 6_000.0),
    })
    frame.loc[count - 1, "volume"] = 300.0
    calculated = indicators(frame, cfg)
    assert np.isclose(calculated.rvol.iloc[-1], 3.0)

    # 압축폭은 (EMA max - EMA min) / 종가 정의를 사용한다.
    expected_compression = (
        calculated[[f"ema{x}" for x in EMA_PERIODS]].iloc[-1].max()
        - calculated[[f"ema{x}" for x in EMA_PERIODS]].iloc[-1].min()
    ) / calculated.close.iloc[-1]
    assert np.isclose(calculated.compression.iloc[-1], expected_compression)
    assert np.isclose(
        calculated.hist_pct.iloc[-1],
        calculated["hist"].iloc[-1] / calculated.close.iloc[-1] * 100,
    )

    # 5m은 RVOL이 낮아도 가격/VWAP/HL/taker 구조가 맞으면 통과.
    n = 40
    entry = pd.DataFrame({
        "close": np.full(n, 100.0),
        "low": np.full(n, 98.0),
        "high": np.full(n, 101.0),
        "ema14": np.full(n, 99.0),
        "ema28": np.full(n, 98.5),
        "ema57": np.full(n, 98.0),
        "ema92": np.full(n, 97.0),
        "compression": np.full(n, 0.02),
        "vwap": np.full(n, 99.0),
        "rvol": np.full(n, 0.5),
        "taker": np.full(n, 1.2),
        "hist": np.full(n, -0.2),
        "hist_pct": np.full(n, -0.2),
    })
    entry.loc[n - 1, ["close", "high", "rvol", "taker", "hist", "hist_pct"]] = [
        102.0, 103.0, 0.7, 1.4, -0.1, -0.1
    ]
    assert gate_5m(entry, cfg)["passed"]

    # 음수 MACD가 상승 중이면 NEGATIVE_RISING.
    macd_frame = pd.DataFrame({"hist_pct": [-0.3, -0.2, -0.1]})
    assert macd_state(macd_frame) == "NEGATIVE_RISING"

    # 과거 거래량 폭발 후 감소 + 가격 유지 → Echo Quiet.
    n = 160
    echo_frame = pd.DataFrame({
        "open_time": np.arange(n) * TF_MS["1h"],
        "close": np.full(n, 100.0),
        "low": np.full(n, 99.0),
        "ema14": np.full(n, 98.0),
        "volume": np.full(n, 100.0),
        "rvol": np.full(n, 1.0),
    })
    echo_frame.loc[n - 25, ["volume", "rvol"]] = [400.0, 4.0]
    echo = volume_echo(echo_frame, cfg)
    assert echo["detected"] and echo["mode"] == "ECHO-QUIET"

    # 같은 스파이크가 있어도 가격이 무너지면 Echo 취소.
    echo_frame.loc[n - 1, ["close", "low"]] = [90.0, 89.0]
    assert not volume_echo(echo_frame, cfg)["detected"]

    # 112/224/448 + 구름대: 224/구름 돌파 후 눌림은 D, 재이탈은 F.
    n = 500
    close = np.r_[np.full(474, 100.0), np.full(23, 103.0), [102.4, 102.6, 102.8]]
    daily_frame = pd.DataFrame({
        "open_time": np.arange(n) * TF_MS["1d"],
        "high": close + 0.8,
        "low": close - 0.8,
        "close": close,
        "volume": np.full(n, 100.0),
        "quote_volume": np.full(n, 10_000.0),
        "taker_buy_quote": np.full(n, 6_000.0),
    })
    daily_frame.loc[n - 3:, "low"] = [100.4, 100.5, 100.6]
    daily_calc = indicators(daily_frame, cfg)
    dante = dante_ma_cloud_cycle(daily_calc, cfg)
    assert dante["stage"] == "D", dante
    assert dante["flags"]["retest224"]

    failed_frame = daily_frame.copy()
    failed_frame.loc[n - 1, ["close", "low", "high", "volume"]] = [99.1, 98.7, 100.2, 220.0]
    failed = dante_ma_cloud_cycle(indicators(failed_frame, cfg), cfg)
    assert failed["stage"] == "F", failed

    print("self-test passed")


def json_safe(value):
    """NaN/Infinity가 JSON에 들어가지 않도록 정리한다."""
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    if isinstance(value, np.generic):
        return json_safe(value.item())
    if isinstance(value, float) and not np.isfinite(value):
        return None
    return value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbols", nargs="*")
    parser.add_argument("--output", default="scan.json")
    parser.add_argument("--min-quote-volume", type=float, default=0.0)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return

    cfg = Config(min_quote_volume=args.min_quote_volume)
    result = json_safe(asyncio.run(scan(args, cfg)))
    Path(args.output).write_text(
        json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False),
        encoding="utf-8",
    )

    print(f"기준시점: {result['asof_utc']}")
    print(
        f"대상 {result['universe_count']} | "
        f"후보 {len(result['candidates'])} | "
        f"과열 {len(result['extended'])} | "
        f"조회/데이터 오류 {len(result['errors'])}"
    )
    for row in result["candidates"][:30]:
        echo = row["volume_echo"].get("mode", "NONE")
        oi = row["oi"].get("change_1h_pct")
        oi_text = "미확인" if oi is None else f"{oi:+.2f}%"
        cascade = row["compression_cascade"]
        print(
            f"{row['symbol']:14} "
            f"TYPE={row['type']:3} "
            f"STAGE={row['stage']:15} "
            f"score={row['score']:3} "
            f"CMP={cascade['count']}/4 "
            f"OI1H={oi_text:>8} "
            f"15m={row['gate_15m']['flow']:17} "
            f"{echo}"
        )
    print(f"상세 결과: {args.output}")


if __name__ == "__main__":
    main()
