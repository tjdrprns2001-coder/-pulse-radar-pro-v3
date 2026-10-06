from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path

import aiohttp
from aiohttp import web

from validate import collect_once


SINK_URL = os.getenv("OOS_SINK_URL", "").strip()
TOKEN = os.getenv("OOS_VALIDATION_TOKEN", "").strip()
COOLDOWN_HOURS = float(os.getenv("OOS_COOLDOWN_HOURS", "24"))
COLLECT_ON_START = os.getenv("OOS_COLLECT_ON_START", "1") != "0"
# 기본 배포는 selector-runtime의 15분 외부 트리거를 사용한다.
# 독립 실행 환경에서만 OOS_COLLECT_LOOP_ENABLED=1로 내부 루프를 켠다.
COLLECT_LOOP_ENABLED = os.getenv("OOS_COLLECT_LOOP_ENABLED", "0") != "0"
COLLECT_INTERVAL_SECONDS = max(
    300, int(os.getenv("OOS_COLLECT_INTERVAL_SECONDS", "900"))
)

state = {
    "active": False,
    "last_started_at": None,
    "last_finished_at": None,
    "next_run_at": None,
    "last_status": "IDLE",
    "last_error": None,
    "last_result": None,
    "dashboard": {},
}


def authorized(request: web.Request) -> bool:
    if not TOKEN:
        return False
    raw = request.headers.get("authorization", "")
    return raw.lower().startswith("bearer ") and raw[7:].strip() == TOKEN


async def run_collection() -> None:
    if state["active"]:
        return
    state["active"] = True
    state["last_started_at"] = int(time.time())
    state["last_status"] = "RUNNING"
    state["last_error"] = None
    try:
        if not SINK_URL:
            raise RuntimeError("OOS_SINK_URL is required")
        result = await collect_once(
            None,
            COOLDOWN_HOURS,
            sink_url=SINK_URL,
            sink_token=TOKEN,
        )
        dashboard = result.pop("_dashboard", {}) if isinstance(result, dict) else {}
        state["dashboard"] = dashboard
        state["last_result"] = result
        if str(result.get("status", "")).lower() == "degraded":
            state["last_status"] = "DEGRADED"
            state["last_error"] = result.get("error") or "sink unavailable"
        else:
            state["last_status"] = "OK"
    except Exception as exc:
        # 상세 예외는 서버 로그에만 남기고 공개 API에는 일반화된 상태만 노출한다.
        state["last_error"] = "collection failed"
        state["last_status"] = "FAILED"
        print(
            f"OOS collection failed: {type(exc).__name__}: {exc}",
            flush=True,
        )
    finally:
        state["active"] = False
        state["last_finished_at"] = int(time.time())


def public_result() -> dict | None:
    result = state.get("last_result")
    if not isinstance(result, dict):
        return None
    allowed = {
        "status",
        "prices",
        "added",
        "lag_seconds",
        "fresh",
        "scanner_errors",
    }
    return {key: result.get(key) for key in allowed if key in result}


async def health(_: web.Request) -> web.Response:
    payload = {
        "status": "ok",
        "service": "preignition-oos-scanner",
        "sink_configured": bool(SINK_URL),
        "token_configured": bool(TOKEN),
        "active": state["active"],
        "last_started_at": state["last_started_at"],
        "last_finished_at": state["last_finished_at"],
        "next_run_at": state["next_run_at"],
        "last_status": state["last_status"],
        "last_error": state["last_error"],
        "last_result": public_result(),
    }
    return web.json_response(payload)


async def sink_get(action: str) -> dict:
    if not SINK_URL or not TOKEN:
        return {"status": "unavailable"}
    headers = {"authorization": f"Bearer {TOKEN}"}
    timeout = aiohttp.ClientTimeout(total=30)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(
                SINK_URL,
                params={"action": action},
                headers=headers,
            ) as response:
                text = await response.text()
                if response.status >= 300:
                    return {
                        "status": "error",
                        "http_status": response.status,
                        "error": "sink request failed",
                    }
                try:
                    payload = json.loads(text)
                except json.JSONDecodeError:
                    return {"status": "error", "error": "invalid JSON"}
                if not isinstance(payload, dict):
                    return {"status": "error", "error": "invalid payload"}
                return payload
    except Exception:
        return {"status": "error", "error": "sink request failed"}


async def dashboard_data(_: web.Request) -> web.Response:
    stats_result, report_result = await asyncio.gather(
        sink_get("stats"),
        sink_get("report"),
    )
    scanner = {
        "active": state["active"],
        "last_started_at": state["last_started_at"],
        "last_finished_at": state["last_finished_at"],
        "last_status": state["last_status"],
        "last_error": state["last_error"],
        "last_result": public_result(),
        "next_run_at": state["next_run_at"],
        "dashboard": state["dashboard"],
    }
    return web.json_response({
        "status": "ok",
        "scanner": scanner,
        "stats": stats_result,
        "report": report_result,
        "updated_at": int(time.time()),
    })


async def dashboard(_: web.Request) -> web.Response:
    path = Path(__file__).with_name("dashboard.html")
    return web.Response(
        text=path.read_text(encoding="utf-8"),
        content_type="text/html",
    )


async def collect(request: web.Request) -> web.Response:
    if not authorized(request):
        return web.json_response(
            {"status": "error", "error": "unauthorized"}, status=401
        )
    if state["active"]:
        return web.json_response(
            {"status": "accepted", "active": True}, status=202
        )
    asyncio.create_task(run_collection())
    return web.json_response(
        {"status": "accepted", "active": True}, status=202
    )


async def periodic_collection() -> None:
    await asyncio.sleep(3)
    while True:
        started = time.monotonic()
        await run_collection()
        elapsed = time.monotonic() - started
        delay = max(0.0, COLLECT_INTERVAL_SECONDS - elapsed)
        state["next_run_at"] = int(time.time() + delay)
        await asyncio.sleep(delay)


async def startup(_: web.Application) -> None:
    if not (SINK_URL and TOKEN):
        return

    if COLLECT_LOOP_ENABLED:
        asyncio.create_task(periodic_collection())
        return

    if COLLECT_ON_START:
        async def delayed_start():
            await asyncio.sleep(3)
            await run_collection()
        asyncio.create_task(delayed_start())


app = web.Application()
app.router.add_get("/", dashboard)
app.router.add_get("/dashboard", dashboard)
app.router.add_get("/health", health)
app.router.add_get("/api/dashboard-data", dashboard_data)
app.router.add_post("/collect", collect)
app.on_startup.append(startup)


if __name__ == "__main__":
    web.run_app(app, host="0.0.0.0", port=int(os.getenv("PORT", "10000")))
