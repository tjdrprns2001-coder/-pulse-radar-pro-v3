#!/usr/bin/env python3
"""Opt-in CPU Laya bridge. Not a mock: requires installed laya checkpoints."""
import hmac
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from laya import Router

HOST = os.environ.get("LAYA_HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", os.environ.get("LAYA_PORT", "8088")))
TOKEN = os.environ.get("DECISION_API_KEY", "")
MODEL = os.environ.get("LAYA_MODEL", "multilingual").strip().lower()
if MODEL not in ("multilingual", "english", "typed-decisions"):
    raise SystemExit("LAYA_MODEL must be multilingual, english or typed-decisions")
MAX_BYTES = 131072
MAX_QUESTIONS = 17
LOCK = threading.Lock()
ROUTER = None
MODEL_READY = False


class Handler(BaseHTTPRequestHandler):
    server_version = "PulseDecision/1.0"

    def reply(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def authorize(self):
        supplied = self.headers.get("Authorization", "")
        if not TOKEN or not hmac.compare_digest(supplied, "Bearer " + TOKEN):
            self.reply(401, {"detail": "unauthorized"})
            return False
        return True

    def do_GET(self):
        if self.path == "/health":
            self.reply(200, {"status": "ok", "engine": "laya", "model_loaded": MODEL_READY,
                             "checkpoint": MODEL})
        elif self.path == "/health/ready":
            self.reply(200 if MODEL_READY else 503,
                       {"status": "ready" if MODEL_READY else "warming", "model_loaded": MODEL_READY})
        else:
            self.reply(404, {"detail": "not found"})

    def do_POST(self):
        global ROUTER, MODEL_READY
        if self.path != "/v1/systemone":
            return self.reply(404, {"detail": "not found"})
        if not self.authorize():
            return
        try:
            length = int(self.headers.get("Content-Length", "-1"))
        except ValueError:
            return self.reply(400, {"detail": "invalid length"})
        if length < 0 or length > MAX_BYTES:
            return self.reply(413, {"detail": "payload too large"})
        try:
            payload = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeDecodeError):
            return self.reply(400, {"detail": "invalid json"})
        if not isinstance(payload, dict) or not isinstance(payload.get("questions"), dict):
            return self.reply(400, {"detail": "state and questions are required"})
        questions = payload["questions"]
        if len(questions) == 0 or len(questions) > MAX_QUESTIONS:
            return self.reply(400, {"detail": "invalid question count"})
        if not all(isinstance(q, dict) and q.get("type") in ("choice", "score", "noul") for q in questions.values()):
            return self.reply(400, {"detail": "invalid question type"})
        if "state" not in payload:
            return self.reply(400, {"detail": "missing state"})
        try:
            # Router checkpoints are lazily loaded. One inference per worker.
            with LOCK:
                if ROUTER is None:
                    ROUTER = Router()
                answer = ROUTER.predict(payload["state"], questions, model=MODEL)
            if not isinstance(answer, dict) or not isinstance(answer.get("answers"), dict):
                return self.reply(502, {"detail": "invalid laya response"})
            MODEL_READY = True
            name = str(answer.get("routing", {}).get("model") or MODEL)
            self.reply(200, {"model": name, "answers": answer["answers"], "usage": answer.get("usage")})
        except Exception:
            # Never expose raw state, tokens, stack traces, or remote error text.
            self.reply(503, {"detail": "inference unavailable"})

    def log_message(self, format, *args):
        # No request bodies, keys, or user-submitted state in logs.
        return


def warm_up():
    """Optional real inference, not a synthetic readiness assertion."""
    global ROUTER, MODEL_READY
    try:
        with LOCK:
            if ROUTER is None:
                ROUTER = Router()
            result = ROUTER.predict(
                "PulseRadar startup model warmup.",
                {"warmup": {"type": "noul", "instructions": "Is this a startup warmup?"}},
                model=MODEL,
            )
            MODEL_READY = isinstance(result, dict) and isinstance(result.get("answers"), dict)
    except Exception:
        MODEL_READY = False


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("DECISION_API_KEY required")
    if os.environ.get("LAYA_WARMUP", "0") == "1":
        threading.Thread(target=warm_up, name="laya-warmup", daemon=True).start()
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
