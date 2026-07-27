"""Basic WebSocket client (Python)."""
from __future__ import annotations

import asyncio
import json
import os
import time

import websockets


async def main() -> None:
    url = os.getenv("WS_URL", "ws://localhost:3001")
    async with websockets.connect(url) as ws:
        print("[client] connected")
        await ws.send(json.dumps({"type": "ping", "payload": {"t": int(time.time() * 1000)}}))
        await ws.send(json.dumps({"type": "chat", "payload": {"text": "hello from python client"}}))
        await ws.send(json.dumps({"type": "echo", "payload": {"demo": True}}))

        try:
            for _ in range(5):
                msg = await asyncio.wait_for(ws.recv(), timeout=1.0)
                print("[client] recv:", msg)
        except asyncio.TimeoutError:
            pass


if __name__ == "__main__":
    asyncio.run(main())
