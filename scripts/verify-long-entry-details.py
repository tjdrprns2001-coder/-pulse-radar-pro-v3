"""Exercise the long-entry card with fixture data in real browsers."""
import copy
import json
import subprocess
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect

OUT = Path("artifacts/long-entry-details")
OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://127.0.0.1:8765"
def stamp(value):
    from datetime import datetime
    return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000)

plan = {
    "status": "NO_LONG_RR", "label": "남은 목표 대비 R:R 부족", "tradeDate": "2026-10-01",
    "asia": {"low": .020457}, "sweep": {"at": stamp("2026-10-01T13:15:00Z"), "low": .020423},
    "reclaimAt": stamp("2026-10-01T13:45:00Z"),
    "mss": {"tf": "5m", "at": stamp("2026-10-01T14:00:00Z")},
    "retestAt": stamp("2026-10-01T14:05:00Z"), "rebreakAt": stamp("2026-10-01T14:10:00Z"),
    "entryZone": {"low": .020423, "high": .020457}, "plannedEntry": .020849,
    "stop": .020196, "invalidation": .020423, "minRr": 1.5, "selectedTarget": None,
    "targets": [{"price": .02140, "label": "ASIA_HIGH", "rr": (.0214-.020849)/(.020849-.020196)}],
    "reasons": ["가용 상단 유동성까지 R:R 1:1.5 미만"]
}
plans = {"RRUSDT": plan, "LEGACYUSDT": copy.deepcopy(plan)}
plans["RRUSDT"]["requiredTarget"] = .020849 + 1.5 * (.020849 - .020196)
plans["RRUSDT"]["nearestTarget"] = plans["RRUSDT"]["targets"][0]
plans["WAITUSDT"] = {"status": "WAIT_SWEEP", "label": "아시아 저점 스윕 대기", "asia": {"low": .020457}}
plans["INVALIDUSDT"] = {
    "status": "INVALID", "label": "스윕 저점 재이탈 · 롱 무효", "tradeDate": "2026-10-01",
    "sweep": plan["sweep"], "reclaimAt": plan["reclaimAt"], "invalidation": .020423,
    "invalidationClose": .020300, "invalidatedAt": stamp("2026-10-01T14:00:00Z")
}
for symbol, status in [("CHASEUSDT", "NO_CHASE"), ("READYUSDT", "LONG_READY")]:
    plans[symbol] = {**copy.deepcopy(plan), "status": status, "entry": .020849,
                     "selectedTarget": {"price": .025, "label": "PREV_DAY_HIGH", "rr": 6.35},
                     "riskReward": 6.35}
plans["WINTERUSDT"] = {"status": "WAIT_RECLAIM", "tradeDate": "2026-12-01",
                       "sweep": {"at": stamp("2026-12-01T14:15:00Z"), "low": .020423}}
plans["REVIEWUSDT"] = {**copy.deepcopy(plan), "status": "BLOCKED_REVIEW", "label": "구조 완성 · 확인 필요", "review": {"economicEvent": "UNKNOWN", "oiFunding": "UNKNOWN", "orderRisk": "UNKNOWN"}, "breakout": {"model": "BREAKOUT_RETEST", "status": "WAIT_BREAKOUT", "label": "돌파 대기"}}
rows = [{"symbol": symbol, "longEntry": value, "verdict": {"key": "WAIT", "reasons": []}}
        for symbol, value in plans.items()]

def route_api(route):
    q = parse_qs(urlparse(route.request.url).query)
    stage = q.get("stage", ["universe"])[0]
    names = q.get("symbols", [""])[0].split(",")
    if stage == "universe":
        data = {"status": "ok", "universeCount": len(rows), "filteredCount": len(rows),
                "items": [{"symbol": r["symbol"]} for r in rows]}
    elif stage == "oi":
        data = {"status": "ok", "items": [{"symbol": s, "pass": True} for s in names]}
    else:
        data = {"status": "ok", "items": [r for r in rows if r["symbol"] in names]}
    route.fulfill(status=200, content_type="application/json", body=json.dumps(data, ensure_ascii=False))

server = subprocess.Popen(["python", "-m", "http.server", "8765", "--bind", "127.0.0.1"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        baseline = None
        for timezone in ["Asia/Seoul", "UTC", "America/New_York"]:
            context = browser.new_context(timezone_id=timezone, viewport={"width": 1440, "height": 1050})
            context.route("**/api/astra-scan?*", route_api)
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(BASE + "/astra-scan.html")
            page.locator("#astraRun").click()
            expect(page.locator("#scanActivity")).to_have_attribute("data-state", "done")
            expect(page.locator(".longEntry")).to_have_count(len(rows) + 1)
            rr = page.locator(".card").filter(has=page.locator(".symbol", has_text="RRUSDT")).locator(".longEntry")
            expect(rr.locator(".longTrigger span")).to_have_text("관찰 트리거 · 진입 금지")
            expect(rr.locator(".longPermission")).to_contain_text("진입 금지")
            expect(rr.locator(".longRequiredTarget")).to_contain_text("1.5R 달성 필요 목표가")
            expect(rr.locator(".longRequiredTarget b")).to_have_text("0.021829")
            expect(rr).to_contain_text("가장 가까운 실제 유동성 목표")
            expect(rr).to_contain_text("0.0214 · 0.84R")
            expect(rr.locator(".longChecks")).to_contain_text("Sweep 10/01, 22:15 KST / 09:15 EDT")
            expect(rr.locator(".longChecks")).to_contain_text("Reclaim 10/01, 22:45 KST / 09:45 EDT")
            events = rr.locator(".longChecks").inner_text()
            assert baseline is None or events == baseline, (timezone, events, baseline)
            baseline = events

            legacy = page.locator(".card").filter(has=page.locator(".symbol", has_text="LEGACYUSDT"))
            expect(legacy.locator(".longRequiredTarget b")).to_have_text("0.021829")
            invalid = page.locator(".longEntry[data-long-status=INVALID]")
            expect(invalid.locator(".longInvalidDetails")).to_contain_text("Sweep Low")
            expect(invalid.locator(".longInvalidDetails")).to_contain_text("무효 기준")
            expect(invalid.locator(".longInvalidDetails")).to_contain_text("무효 발생 종가")
            expect(invalid.locator(".longInvalidDetails b")).to_have_text(["0.020423", "0.020423", "0.0203"])
            expect(invalid.locator(".longInvalidDetails")).to_contain_text("23:00 KST / 10:00 EDT")
            expect(invalid.locator(".longTrigger span")).to_contain_text("진입 금지")
            expect(page.locator(".longEntry[data-long-status=NO_CHASE] .longTrigger span")).to_contain_text("진입 금지")
            expect(page.locator(".longEntry[data-long-status=LONG_READY] .longTrigger span")).to_have_text("진입 트리거")
            expect(page.locator(".longEntry[data-long-status=BLOCKED_REVIEW]")).to_contain_text("경제 일정 UNKNOWN")
            expect(page.locator(".longEntry[data-long-status=BLOCKED_REVIEW] .longTrigger span")).to_contain_text("진입 금지")
            expect(page.locator(".longEntry[data-long-status=WAIT_BREAKOUT]")).to_contain_text("돌파 되돌림")
            wait = page.locator(".longEntry[data-long-status=WAIT_SWEEP]")
            expect(wait.locator(".longTrigger b")).to_have_text("-")
            expect(page.locator(".longEntry[data-long-status=WAIT_RECLAIM] .longChecks")).to_contain_text("23:15 KST / 09:15 EST")
            for viewport, label in [({"width": 1440, "height": 1050}, "desktop"), ({"width": 390, "height": 844}, "mobile")]:
                page.set_viewport_size(viewport)
                assert page.evaluate("document.documentElement.scrollWidth") <= viewport["width"] + 1
                for selector in [".longPriceGrid", ".longInvalidDetails"]:
                    for box in page.locator(selector).all():
                        rect = box.bounding_box()
                        assert rect["x"] >= 0 and rect["x"] + rect["width"] <= viewport["width"] + 1
                if timezone == "Asia/Seoul":
                    page.locator("#astraResults").screenshot(path=str(OUT / (label + ".png")))
            assert not errors, errors
            context.close()
        browser.close()
    print("PASS: KST + NY/DST times, blocked entries, invalidation evidence, RR targets, desktop/mobile.")
finally:
    server.terminate()
    server.wait(timeout=10)
