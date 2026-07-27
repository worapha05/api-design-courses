/**
 * Basic WebSocket server — demonstrates HTTP Upgrade + full-duplex messaging
 * Message envelope: { type, id?, timestamp?, payload }
 */
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT) || 3001;

interface Envelope {
  type: string;
  id?: string;
  timestamp?: string;
  payload?: unknown;
}

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WebSocket endpoint: ws://localhost:' + PORT + '/ws\n');
});

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

function send(ws: WebSocket, msg: Envelope) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(
    JSON.stringify({
      ...msg,
      id: msg.id ?? randomUUID(),
      timestamp: msg.timestamp ?? new Date().toISOString(),
    }),
  );
}

function broadcast(msg: Envelope, except?: WebSocket) {
  for (const client of wss.clients) {
    if (client !== except && client.readyState === WebSocket.OPEN) {
      send(client, msg);
    }
  }
}

wss.on('connection', (ws, req) => {
  const remote = req.socket.remoteAddress;
  console.log(`[open] connection from ${remote} (clients=${wss.clients.size})`);

  send(ws, {
    type: 'welcome',
    payload: {
      message: 'Connected. Send {"type":"chat","payload":{"text":"hi"}}',
      clients: wss.clients.size,
    },
  });

  broadcast({ type: 'presence', payload: { event: 'join', clients: wss.clients.size } }, ws);

  ws.on('message', (raw) => {
    let msg: Envelope;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      send(ws, { type: 'error', payload: { message: 'invalid JSON' } });
      return;
    }

    if (!msg.type || typeof msg.type !== 'string') {
      send(ws, { type: 'error', payload: { message: 'missing type' } });
      return;
    }

    switch (msg.type) {
      case 'ping':
        send(ws, { type: 'pong', payload: msg.payload });
        break;
      case 'chat':
        broadcast({
          type: 'chat',
          payload: { ...(msg.payload as object), from: remote },
        });
        break;
      case 'echo':
        send(ws, { type: 'echo', payload: msg.payload });
        break;
      default:
        send(ws, { type: 'error', payload: { message: `unknown type: ${msg.type}` } });
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[close] code=${code} reason=${reason.toString()} (clients=${wss.clients.size})`);
    broadcast({ type: 'presence', payload: { event: 'leave', clients: wss.clients.size } });
  });

  ws.on('error', (err) => console.error('[error]', err.message));
});

httpServer.listen(PORT, () => {
  console.log(`WebSocket server listening on ws://localhost:${PORT}/ws`);
  console.log('HTTP Upgrade handshake handled by ws library under the hood');
});
