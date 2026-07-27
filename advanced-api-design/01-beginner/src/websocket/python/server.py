"""Basic WebSocket server (Python / websockets) — HTTP Upgrade + full-duplex."""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone

import websockets
from websockets.asyncio.server import ServerConnection

CLIENTS: set[ServerConnection] = set()


def envelope(msg_type: str, payload=None) -> str:
    return json.dumps(
        {
            "type": msg_type,
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "payload": payload,
        }
    )


async def broadcast(message: str, except_ws: ServerConnection | None = None) -> None:
    dead: list[ServerConnection] = []
    for ws in CLIENTS:
        if ws is except_ws:
            continue
        try:
            await ws.send(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        CLIENTS.discard(ws)


async def handler(ws: ServerConnection) -> None:
    CLIENTS.add(ws)
    print(f"[open] clients={len(CLIENTS)}")
    await ws.send(
        envelope(
            "welcome",
            {
                "message": 'Connected. Send {"type":"chat","payload":{"text":"hi"}}',
                "clients": len(CLIENTS),
            },
        )
    )
    await broadcast(envelope("presence", {"event": "join", "clients": len(CLIENTS)}), except_ws=ws)

    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send(envelope("error", {"message": "invalid JSON"}))
                continue

            typ = msg.get("type")
            if not typ:
                await ws.send(envelope("error", {"message": "missing type"}))
                continue

            if typ == "ping":
                await ws.send(envelope("pong", msg.get("payload")))
            elif typ == "echo":
                await ws.send(envelope("echo", msg.get("payload")))
            elif typ == "chat":
                await broadcast(envelope("chat", msg.get("payload")))
            else:
                await ws.send(envelope("error", {"message": f"unknown type: {typ}"}))
    finally:
        CLIENTS.discard(ws)
        await broadcast(envelope("presence", {"event": "leave", "clients": len(CLIENTS)}))
        print(f"[close] clients={len(CLIENTS)}")


async def main() -> None:
    async with websockets.serve(handler, "0.0.0.0", 3001):
        print("WebSocket server on ws://localhost:3001")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
