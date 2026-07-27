/**
 * High-performance oriented WebSocket server demo:
 * - Bounded send queue / bufferedAmount backpressure
 * - Connection metrics
 * - Graceful drain for blue-green (SIGTERM)
 */
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT) || 7001;
const MAX_BUFFERED = Number(process.env.MAX_BUFFERED) || 512_000;
const MAX_QUEUE = 32;

type Client = WebSocket & {
  id?: string;
  queue?: string[];
  draining?: boolean;
};

let accepting = true;
const metrics = { connections: 0, messagesIn: 0, messagesOut: 0, dropped: 0, kicked: 0 };

const httpServer = createServer((req, res) => {
  if (req.url === '/metrics') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ...metrics, accepting }, null, 2));
    return;
  }
  res.end(`WS scale demo ws://localhost:${PORT}/ws — metrics at /metrics\n`);
});

const wss = new WebSocketServer({
  server: httpServer,
  path: '/ws',
  maxPayload: 64 * 1024,
  perMessageDeflate: false, // CPU vs bandwidth trade-off; often off at huge fan-in
});

function safeSend(ws: Client, raw: string) {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (ws.bufferedAmount > MAX_BUFFERED) {
    metrics.dropped++;
    metrics.kicked++;
    ws.close(1008, 'backpressure');
    return;
  }
  ws.queue ??= [];
  if (ws.queue.length >= MAX_QUEUE) {
    metrics.dropped++;
    return; // lossy under pressure — หรือเลือก kick แทน
  }
  ws.queue.push(raw);
  flush(ws);
}

function flush(ws: Client) {
  if (!ws.queue?.length || ws.readyState !== WebSocket.OPEN) return;
  if (ws.bufferedAmount > MAX_BUFFERED / 2) return; // wait for drain
  const msg = ws.queue.shift()!;
  ws.send(msg);
  metrics.messagesOut++;
}

wss.on('connection', (ws: Client, req) => {
  if (!accepting) {
    ws.close(1013, 'draining');
    return;
  }
  ws.id = randomUUID();
  ws.queue = [];
  metrics.connections++;

  ws.send(JSON.stringify({ type: 'welcome', payload: { id: ws.id } }));

  ws.on('message', (data) => {
    metrics.messagesIn++;
    let msg: { type?: string; payload?: unknown };
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (msg.type === 'echo') {
      safeSend(ws, JSON.stringify({ type: 'echo', payload: msg.payload }));
    }
  });

  const iv = setInterval(() => flush(ws), 50);

  ws.on('close', () => {
    clearInterval(iv);
    metrics.connections--;
  });

  // demo load from query ?flood=1
  if (new URL(req.url || '', 'http://x').searchParams.get('flood') === '1') {
    const blast = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return clearInterval(blast);
      safeSend(ws, JSON.stringify({ type: 'tick', payload: { t: Date.now() } }));
    }, 1);
  }
});

function drain() {
  console.log('SIGTERM — draining: stop accepting, close clients gracefully');
  accepting = false;
  for (const client of wss.clients) {
    client.close(1001, 'server going away');
  }
  setTimeout(() => process.exit(0), 3000);
}

process.on('SIGTERM', drain);
process.on('SIGINT', drain);

httpServer.listen(PORT, () => {
  console.log(`WS scale demo on :${PORT}/ws`);
  console.log(`Tune OS: ulimit -n 65535 | MAX_BUFFERED=${MAX_BUFFERED}`);
});
