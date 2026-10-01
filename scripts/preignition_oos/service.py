from __future__ import annotations

import asyncio
import os
import time

from aiohttp import web

from validate import collect_once


SINK_URL = os.getenv("OOS_SINK_URL", "").strip()
TOKEN = os.getenv("OOS_VALIDATION_TOKEN", "").strip()
COOLDOWN_HOURS = float(os.getenv("OOS_COOLDOWN_HOURS", "24"))
COLLECT_ON_START = os.getenv("OOS_COLLECT_ON_START", "1") != "0"

state = {
    "active": False,
    "last_started_at": None,
    "last_finished_at": None,
    "last_status": "IDLE",
    "last_error": None,
    "last_result": None,
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
        state["last_result"] = result
        state["last_status"] = "OK"
    except Exception as exc:
        state["last_error"] = str(exc)
        state["last_status"] = "FAILED"
        print(f"OOS collection failed: {exc}", flush=True)
    finally:
        state["active"] = False
        state["last_finished_at"] = int(time.time())


async def health(_: web.Request) -> web.Response:
    payload = {
        "status": "ok",
        "service": "preignition-oos-scanner",
        "sink_configured": bool(SINK_URL),
        "token_configured": bool(TOKEN),
        **state,
    }
    return web.json_response(payload)


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


async def startup(_: web.Application) -> None:
    if COLLECT_ON_START and SINK_URL and TOKEN:
        async def delayed_start():
            await asyncio.sleep(3)
            await run_collection()
        asyncio.create_task(delayed_start())


app = web.Application()
app.router.add_get("/", health)
app.router.add_get("/health", health)
app.router.add_post("/collect", collect)
app.on_startup.append(startup)


if __name__ == "__main__":
    web.run_app(app, host="0.0.0.0", port=int(os.getenv("PORT", "10000")))
