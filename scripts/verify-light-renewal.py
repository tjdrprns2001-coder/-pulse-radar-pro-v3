"""Browser feature checks and fixture-only screenshots for the light dashboard."""
import json
import subprocess
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect

OUT = Path("artifacts/light-renewal")
OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://127.0.0.1:8765"
SYMBOLS = ["CELRUSDT", "QNTUSDT", "MOVRUSDT", "BTCUSDT"]
ROWS = []
for symbol, stage, kind, extended in zip(
    SYMBOLS, ["A+B", "PRE", "A", "INCOMPLETE"], ["A+B", "PRE", "C", "PRE"], [False, False, False, True]
):
    ROWS.append({
        "symbol": symbol, "priceChange24h": 3.2, "quoteVolume24h": 1000000,
        "oi4hPct": 1.5, "oi8hPct": 2.4, "taker15m": 1.3, "taker5m": 1.2,
        "tf": {k: {"rvol": 1.8, "rsi14": 54, "above20": True} for k in ["1d", "4h", "1h", "15m", "5m"]},
        "verdict": {"key": "WATCH_PRIORITY", "label": "관찰 우선", "score": 72, "reasons": ["브라우저 검증용 합성 데이터"]},
        "integratedSurge": {
            "stage": stage, "type": kind, "extended": extended,
            "volumeEcho": {"state": "VOLUME-ECHO"}, "oi": {"known": True, "change1hPct": 1.2},
            "setup4h": {"compressionPct": 3.4},
            "gate15m": {"flow": "FLOW-SUSTAIN", "passed": True},
            "gate5m": {"passed": False}, "coverage": {"missing": []}
        }
    })


def check_layout(page, name):
    page.wait_for_timeout(250)
    width = page.viewport_size["width"]
    assert page.evaluate("document.documentElement.scrollWidth") <= width + 1, name + " horizontal overflow"
    color = page.evaluate("getComputedStyle(document.body).backgroundColor")
    assert color == "rgb(245, 247, 250)", (name, color)
    page.screenshot(path=str(OUT / (name + ".png")), full_page=True)


def fixtures(route):
    url = urlparse(route.request.url)
    if url.path.startswith("/api/"):
        q = parse_qs(url.query)
        if url.path == "/api/astra-scan":
            stage = q.get("stage", ["universe"])[0]
            if stage == "universe":
                assert q.get("minQuoteVolume") == ["0"], q
                data = {"status": "ok", "universeCount": 4, "filteredCount": 4,
                        "items": [{"symbol": s} for s in SYMBOLS], "asOf": 1790835000000,
                        "marketState": {"regime": "NEUTRAL", "total": 4, "up": 3, "down": 1,
                                        "breadthRatio": .75, "btc24hChange": 2.1, "eth24hChange": 1.4}}
            elif stage == "oi":
                names = q.get("symbols", [""])[0].split(",")
                data = {"status": "ok", "requested": len(names), "success": len(names), "failed": 0,
                        "missing": 0, "items": [{"symbol": s, "pass": True, "status": "SUCCESS",
                                               "oi4hPct": 1.5, "oiValueUsdt": 10000000} for s in names]}
            else:
                names = q.get("symbols", [""])[0].split(",")
                data = {"status": "ok", "items": [r for r in ROWS if r["symbol"] in names]}
        elif url.path == "/api/market":
            data = {"ok": True, "coreFuturesCount": 4, "total": 4,
                    "results": [{"symbol": "BTCUSDT", "price": 100000, "change24": 2.1},
                                {"symbol": "ETHUSDT", "price": 3000, "change24": 1.4}]}
        elif url.path == "/api/coin-scan":
            data = {"ok": True, "status": "ok", "scanCount": 4, "items": [],
                    "marketBreadth": {"median": 1.4, "up": 3, "down": 1}}
        elif url.path == "/api/pulse-ai":
            data = {"ok": True, "summary": "브라우저 검증용 합성 브리핑", "watch": [], "dataWarnings": [],
                    "eventCatalysts": [], "aiGenerated": False}
        else:
            data = {"ok": True, "status": "ok", "items": [], "results": [], "data": [],
                    "summary": {}, "health": {}, "progress": {}}
        route.fulfill(status=200, content_type="application/json", body=json.dumps(data, ensure_ascii=False))
    elif url.hostname not in ["127.0.0.1", "localhost"]:
        route.abort()
    else:
        route.continue_()


server = subprocess.Popen(["python", "-m", "http.server", "8765", "--bind", "127.0.0.1"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={"width": 1440, "height": 1050})
        context.route("**/*", fixtures)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        requests = []
        page.on("request", lambda r: requests.append(r.url) if "/api/astra-scan?" in r.url else None)
        page.goto(BASE + "/astra-scan.html")
        expect(page.locator("#quoteVolumeFilter")).to_have_value("0")
        expect(page.locator("#scanMethod option")).to_have_count(6)
        check_layout(page, "astra-desktop-idle")
        page.locator("#astraRun").click()
        expect(page.locator("#scanActivity")).to_have_attribute("data-state", "done")
        expect(page.locator("#astraResults article")).to_have_count(4)
        expect(page.locator("#scanProgress")).to_have_attribute("aria-valuenow", "100")
        expect(page.locator("#resultCount")).to_have_text("4 / 4")
        assert len(requests) == 4, requests
        check_layout(page, "astra-desktop-results")
        count_before_filter = len(requests)
        page.locator("#resultSearch").fill("celr")
        expect(page.locator("#astraResults article")).to_have_count(1)
        expect(page.locator("#astraResults")).to_contain_text("CELRUSDT")
        page.locator("#resultSearch").fill("")
        for value, symbol in [("A+B", "CELRUSDT"), ("C", "MOVRUSDT"), ("extended", "BTCUSDT"), ("INCOMPLETE", "BTCUSDT")]:
            page.locator("#stageFilter").select_option(value)
            expect(page.locator("#astraResults article")).to_have_count(1)
            expect(page.locator("#astraResults")).to_contain_text(symbol)
        page.locator("#stageFilter").select_option("all")
        page.locator("#resultSearch").fill("NONEXISTENT")
        expect(page.locator("#astraResults article")).to_have_count(0)
        expect(page.locator("#astraResults")).to_contain_text("검색 조건에 맞는 후보가 없습니다")
        page.locator("#resultSearch").fill("")
        assert len(requests) == count_before_filter, "Filtering must not make API calls"
        page.set_viewport_size({"width": 390, "height": 844})
        check_layout(page, "astra-mobile-results")
        for mode in ["manus", "perplexity", "grok", "gemini", "claude", "astra"]:
            page.locator("#scanMethod").select_option(mode)
            page.locator("#astraRun").click()
            expect(page.locator("#scanActivity")).to_have_attribute("data-state", "done")
            expect(page.locator("#astraResults article")).to_have_count(4)
        assert not errors, errors

        # A retry deadline must pause execution and remain a failure, not an empty success.
        def blocked(route):
            route.fulfill(status=200, content_type="application/json", body=json.dumps({
                "status": "error", "error": "Binance 418",
                "sourceState": {"futuresBlockedUntil": int(time.time() * 1000) + 600000}
            }))
        page.route("**/api/astra-scan?*", blocked)
        page.reload()
        before = len(requests)
        page.locator("#astraRun").click()
        expect(page.locator("#scanActivity")).to_have_attribute("data-state", "error")
        expect(page.locator("#astraRun")).to_be_disabled()
        expect(page.locator("#astraStatus")).to_contain_text("Binance 요청 제한")
        assert len(requests) == before + 1, "Cooldown must not fall back to a second host"
        check_layout(page, "astra-mobile-cooldown")
        page.close()

        # Shell navigation and the primary homepage call to action must load Astra.
        page = context.new_page()
        shell_errors = []
        page.on("pageerror", lambda error: shell_errors.append(str(error)))
        page.goto(BASE + "/pulse-unified.html")
        expect(page.frame_locator("#frame").locator(".deskCallout")).to_be_visible()
        assert page.locator(".navBtn[data-view]").count() == 33
        check_layout(page, "main-desktop")
        page.frame_locator("#frame").locator(".deskCallout button").click()
        expect(page.frame_locator("#frame").locator("#astraRun")).to_be_visible()
        expect(page.locator("#pageTitle")).to_have_text("Astra 자동스캔")
        page.set_viewport_size({"width": 390, "height": 844})
        page.locator(".mBtn[data-view=home]").click()
        expect(page.frame_locator("#frame").locator(".deskCallout")).to_be_visible()
        check_layout(page, "main-mobile")
        page.locator("#menuBtn").click()
        expect(page.locator("#side")).to_have_class(__import__("re").compile(r".*\bopen\b.*"))
        page.locator("#side .navBtn[data-view=astra]").click()
        expect(page.frame_locator("#frame").locator("#astraRun")).to_be_visible()
        assert not shell_errors, shell_errors
        page.close()

        # Other scanner pages retain their own controls and receive the shared palette.
        modules = ["workspace-home", "coin-scan", "trader-scan", "assistant-scan", "full-scan",
                   "ignition-bridge", "preignition-oos", "radar", "index"]
        for module in modules:
            for width, label in [(1440, "desktop"), (390, "mobile")]:
                page = context.new_page(viewport={"width": width, "height": 1050 if width == 1440 else 844})
                page.goto(BASE + "/" + module + ".html", wait_until="domcontentloaded")
                expect(page.locator("body")).to_be_visible()
                check_layout(page, module + "-" + label)
                page.close()
        browser.close()
    print("PASS: light dashboard navigation, all six Astra methods, client filters, cooldown, desktop/mobile layout.")
    print("Screenshots contain test fixtures only: artifacts/light-renewal")
finally:
    server.terminate()
    server.wait(timeout=10)
