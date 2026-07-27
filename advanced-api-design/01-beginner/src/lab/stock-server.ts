import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT) || 3099;

interface Stock {
  symbol: string;
  price: number;
  change: number;
}

interface Envelope {
  type: string;
  id?: string;
  timestamp?: string;
  payload?: unknown;
}

const stocks = new Map<string, Stock>([
  ['AAPL', { symbol: 'AAPL', price: 178.5, change: 1.2 }],
  ['GOOG', { symbol: 'GOOG', price: 141.8, change: -0.3 }],
  ['TSLA', { symbol: 'TSLA', price: 245.6, change: 3.1 }],
  ['AMZN', { symbol: 'AMZN', price: 185.2, change: 0.8 }],
]);

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Stock WebSocket: ws://localhost:' + PORT + '\n');
});

const wss = new WebSocketServer({ server: httpServer });

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

wss.on('connection', (ws) => {
  console.log(`[connect] clients=${wss.clients.size}`);
  send(ws, { type: 'stocks', payload: { stocks: [...stocks.values()] } });

  ws.on('message', (raw) => {
    let msg: Envelope;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      send(ws, { type: 'error', payload: { message: 'invalid JSON' } });
      return;
    }
    switch (msg.type) {
      case 'getStocks':
        send(ws, { type: 'stocks', payload: { stocks: [...stocks.values()] } });
        break;
      case 'getStock': {
        const symbol = (msg.payload as { symbol?: string })?.symbol;
        const stock = symbol ? stocks.get(symbol.toUpperCase()) : undefined;
        if (stock) send(ws, { type: 'stock', payload: stock });
        else send(ws, { type: 'error', payload: { message: `unknown symbol: ${symbol}` } });
        break;
      }
      default:
        send(ws, { type: 'error', payload: { message: `unknown type: ${msg.type}` } });
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Stock server listening on ws://localhost:${PORT}`);
});
