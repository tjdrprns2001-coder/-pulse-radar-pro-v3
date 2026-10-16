#!/usr/bin/env python3
"""Contract smoke test. Fake Router checks adapter behavior; it is NOT real Laya inference."""
import http.client
import importlib.util
import json
import os
import pathlib
import sys
import threading
import types
import unittest
from http.server import ThreadingHTTPServer

class FakeRouter:
    last_model = None
    predictions = 0
    def predict(self, state, questions, model=None):
        assert isinstance(questions, dict) and len(questions) > 0
        FakeRouter.last_model = model
        FakeRouter.predictions += 1
        answers = {}
        for key, q in questions.items():
            if q["type"] == "choice":
                labels = list(q["criteria"])
                answers[key] = {"type": "choice", "choice": labels[0],
                                "confidence": 0.55,
                                "probabilities": {label: 1.0 / len(labels) for label in labels}}
            elif q["type"] == "score":
                answers[key] = {"type": "score", "score": 2.0, "confidence": 0.5}
            else:
                answers[key] = {"type": "noul", "noul": 0.2, "confidence": 0.8}
        return {"routing": {"model": model}, "answers": answers}

sys.modules["laya"] = types.SimpleNamespace(Router=FakeRouter)
os.environ["DECISION_API_KEY"] = "test-only-local-token"
os.environ["LAYA_MODEL"] = "multilingual"
root = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location(
    "pulse_laya_bridge_contract", root / "services/decision-model/laya-bridge.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), module.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)
    def req(self, method, path, payload=None, token=None, content_type="application/json"):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        headers={"Content-Type": content_type}
        if token is not None:
            headers["Authorization"] = "Bearer " + token
        body = None if payload is None else (payload if isinstance(payload, str) else json.dumps(payload))
        conn.request(method, path, body=body, headers=headers)
        r = conn.getresponse()
        status = r.status
        data = json.loads(r.read().decode("utf-8"))
        conn.close()
        return status, data
    def test_01_cold_and_unauthorized(self):
        code, body = self.req("GET", "/health")
        self.assertEqual(code, 200)
        self.assertFalse(body["model_loaded"])
        code, body = self.req("GET", "/health/ready")
        self.assertEqual(code, 503)
        code, body = self.req("POST", "/v1/systemone", {"state": {}, "questions": {"x": {"type": "noul"}}})
        self.assertEqual(code, 401)
        self.assertEqual(FakeRouter.predictions, 0)
    def test_02_auth_and_model(self):
        questions = {
            "marketMode": {"type": "choice", "criteria": {"risk_on": "yes", "selective": "maybe", "defensive": "no", "insufficient": "?"}},
            "ready_AAAUSDT": {"type": "score", "criteria": ["0", "1", "2", "3", "4"]},
            "chase_AAAUSDT": {"type": "noul", "instructions": "Is chasing risky?"},
        }
        code, body = self.req("POST", "/v1/systemone",
                              {"model": "jev-latest", "state": {"market": {}, "candidates": []}, "questions": questions},
                              token="test-only-local-token")
        self.assertEqual(code, 200)
        self.assertEqual(FakeRouter.last_model, "multilingual")
        self.assertEqual(body["answers"]["marketMode"]["choice"], "risk_on")
        self.assertEqual(body["answers"]["ready_AAAUSDT"]["score"], 2.0)
        self.assertEqual(body["answers"]["chase_AAAUSDT"]["noul"], .2)
        code, body = self.req("GET", "/health/ready")
        self.assertEqual(code, 200)
        self.assertTrue(body["model_loaded"])
    def test_03_bad_schema_and_invalid_json(self):
        code, _ = self.req("POST", "/v1/systemone", {"state": {}, "questions": {"bad": {"type": "trade_now"}}}, token="test-only-local-token")
        self.assertEqual(code, 400)
        code, _ = self.req("POST", "/v1/systemone", "not json", token="test-only-local-token")
        self.assertEqual(code, 400)
        code, _ = self.req("POST", "/v1/systemone", {"state": {}, "questions": {}}, token="test-only-local-token")
        self.assertEqual(code, 400)
    def test_04_warmup_real_prediction_semantics(self):
        module.MODEL_READY = False
        module.ROUTER = None
        module.warm_up()
        self.assertTrue(module.MODEL_READY)
        self.assertEqual(FakeRouter.last_model, "multilingual")

if __name__ == "__main__":
    unittest.main()
