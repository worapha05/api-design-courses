"""
API Gateway (Python / Flask): reverse proxy + token bucket + header transform
Requires upstream on :5001 (use the TypeScript upstream.ts or any mock).
"""
from __future__ import annotations

import base64
import time
import uuid
from threading import Lock

import requests
from flask import Flask, Response, jsonify, request

app = Flask(__name__)
UPSTREAM = "http://127.0.0.1:5001"
CAPACITY = 10.0
REFILL = 2.0

_buckets: dict[str, dict] = {}
_lock = Lock()


def take_token(key: str) -> bool:
    now = time.time()
    with _lock:
        b = _buckets.get(key)
        if not b:
            b = {"tokens": CAPACITY, "updated": now}
            _buckets[key] = b
        elapsed = now - b["updated"]
        b["tokens"] = min(CAPACITY, b["tokens"] + elapsed * REFILL)
        b["updated"] = now
        if b["tokens"] < 1:
            return False
        b["tokens"] -= 1
        return True


def parse_demo_token(auth: str | None) -> str | None:
    if not auth or not auth.startswith("Bearer "):
        return None
    try:
        raw = base64.b64decode(auth[7:]).decode()
        kind, user_id = raw.split(":", 1)
        if kind != "user" or not user_id:
            return None
        return user_id
    except Exception:
        return None


@app.get("/health")
def health():
    return jsonify(status="ok", role="gateway")


@app.route("/v1/orders", defaults={"path": ""}, methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"])
@app.route("/v1/orders/<path:path>", methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"])
def proxy_orders(path: str):
    if request.method == "OPTIONS":
        resp = Response()
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, PUT, DELETE, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, X-Request-Id"
        resp.headers["Access-Control-Max-Age"] = "86400"
        return resp
    user_id = parse_demo_token(request.headers.get("Authorization"))
    if not user_id:
        return jsonify(title="Unauthorized", status=401, detail="Bearer token required"), 401
    if not take_token(user_id):
        resp = jsonify(title="Too Many Requests", status=429, detail="rate limit exceeded")
        resp.status_code = 429
        resp.headers["Retry-After"] = "1"
        return resp

    target = f"{UPSTREAM}/orders" + (f"/{path}" if path else "")
    if request.query_string:
        target += "?" + request.query_string.decode()

    headers = {
        "X-User-Id": user_id,
        "X-Request-Id": request.headers.get("X-Request-Id") or str(uuid.uuid4()),
        "Content-Type": request.headers.get("Content-Type", "application/json"),
    }
    upstream = requests.request(
        method=request.method,
        url=target,
        headers=headers,
        data=request.get_data(),
        timeout=5,
    )
    return Response(upstream.content, status=upstream.status_code, content_type=upstream.headers.get("Content-Type"))


if __name__ == "__main__":
    demo = base64.b64encode(b"user:alice").decode()
    print("API Gateway (Python) on :8080")
    print(f"Demo token: Bearer {demo}")
    app.run(port=8080)
