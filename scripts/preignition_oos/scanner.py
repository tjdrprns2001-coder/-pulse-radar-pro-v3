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
    bars: int = 400
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
        out.attrs["short_history"] = bool(interval == "1d" and len(df) < 100)
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
    return {
        "count": count,
        "total": 4,
        "qualified": count >= cfg.cascade_min_count,
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

        floor = np.maximum(df.sell.to_numpy(dtype=float), 1e-12)
        ratios = df.buy.to_numpy(dtype=float) / floor
        if not np.isfinite(ratios[-4:]).all():
            raise ValueError("taker 비정상 수치")

        return {
            "known": True,
            "period": period,
            "values": ratios[-4:].tolist(),
            "timestamp": int(df.timestamp.iloc[-1]),
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
    if "BINANCE_SPOT_FALLBACK" in candle_sources.values():
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

        queue = asyncio.Queue()
        for symbol in sorted(universe):
            queue.put_nowait(symbol)

        rows, errors = [], []
        rejected = 0

        async def worker():
            nonlocal rejected
            while True:
                try:
                    symbol = queue.get_nowait()
                except asyncio.QueueEmpty:
                    return
                try:
                    row = await analyze(api, symbol, asof, cfg)
                    if row is None:
                        rejected += 1
                    else:
                        rows.append(row)
                except Exception as exc:
                    errors.append({"symbol": symbol, "error": str(exc)})
                finally:
                    queue.task_done()

        await asyncio.gather(*(worker() for _ in range(cfg.workers)))

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
        "rejected_4h_count": rejected,
        "config": asdict(cfg),
        "candidates": [r for r in rows if not r["extended"]],
        "extended": [r for r in rows if r["extended"]],
        "errors": errors,
    }


def self_test():
    cfg = Config()

    assert min_bars_for("1d", cfg) == 40
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
