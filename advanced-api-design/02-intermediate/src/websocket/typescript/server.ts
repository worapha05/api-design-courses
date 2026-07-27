/**
 * Advanced WebSocket hub:
 * - Protocol-level ping/pong heartbeat (dead client detection)
 * - Room-based broadcast
 * - Redis Pub/Sub adapter for horizontal scaling
 *
 * Run Redis: docker run -p 6379:6379 redis:7-alpine
 * Scale demo: PORT=4001 INSTANCE_ID=n1 npx tsx server.ts
 *  PORT=4002 INSTANCE_ID=n2 npx tsx server.ts
 */
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT) || 4001;
const INSTANCE_ID = process.env.INSTANCE_ID || `node-${process.pid}`;
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const HEARTBEAT_MS = 30_000;
const CHANNEL = 'ws:bus';

type Client = WebSocket & { isAlive?: boolean; rooms?: Set<string>; id?: string };

interface Envelope {
  type: string;
  id: string;
  timestamp: string;
  payload: unknown;
}

interface BusMessage {
  origin: string;
  room: string;
  envelope: Envelope;
}

const rooms = new Map<string, Set<Client>>();
const httpServer = createServer((_req, res) => {
  res.end(`WS hub ${INSTANCE_ID} — ws://localhost:${PORT}/ws\n`);
});
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

const pub = new Redis(REDIS_URL);
const sub = new Redis(REDIS_URL);

function envelope(type: string, payload: unknown): Envelope {
  return {
    type,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    payload,
  };
}

function send(ws: Client, msg: Envelope) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function joinRoom(ws: Client, room: string) {
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room)!.add(ws);
  ws.rooms ??= new Set();
  ws.rooms.add(room);
}

function leaveRoom(ws: Client, room: string) {
  rooms.get(room)?.delete(ws);
  ws.rooms?.delete(room);
}

function leaveAll(ws: Client) {
  if (!ws.rooms) return;
  for (const room of [...ws.rooms]) leaveRoom(ws, room);
}

/** ส่งให้ clients ใน process นี้เท่านั้น */
function localBroadcast(room: string, msg: Envelope) {
  const set = rooms.get(room);
  if (!set) return;
  for (const client of set) send(client, msg);
}

/** ส่ง local + publish ไป Redis ให้ nodes อื่น */
async function broadcast(room: string, type: string, payload: unknown) {
  const msg = envelope(type, payload);
  localBroadcast(room, msg);
  const bus: BusMessage = { origin: INSTANCE_ID, room, envelope: msg };
  await pub.publish(CHANNEL, JSON.stringify(bus));
}

sub.subscribe(CHANNEL);
sub.on('message', (_ch, raw) => {
  const bus = JSON.parse(raw) as BusMessage;
  if (bus.origin === INSTANCE_ID) return; // กัน echo ซ้ำ
  localBroadcast(bus.room, bus.envelope);
});

wss.on('connection', (ws: Client) => {
  ws.id = randomUUID();
  ws.isAlive = true;
  ws.rooms = new Set();

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  send(ws, envelope('welcome', { instanceId: INSTANCE_ID, clientId: ws.id }));

  ws.on('message', async (raw) => {
    let data: { type?: string; payload?: { room?: string; text?: string } };
    try {
      data = JSON.parse(String(raw));
    } catch {
      send(ws, envelope('error', { message: 'invalid JSON' }));
      return;
    }

    switch (data.type) {
      case 'join': {
        const room = data.payload?.room;
        if (!room) {
          send(ws, envelope('error', { message: 'room required' }));
          break;
        }
        joinRoom(ws, room);
        send(ws, envelope('joined', { room }));
        await broadcast(room, 'presence', { event: 'join', clientId: ws.id, room });
        break;
      }
      case 'leave': {
        const room = data.payload?.room;
        if (room) {
          leaveRoom(ws, room);
          send(ws, envelope('left', { room }));
        }
        break;
      }
      case 'chat': {
        const room = data.payload?.room;
        if (!room || !ws.rooms?.has(room)) {
          send(ws, envelope('error', { message: 'join room first' }));
          break;
        }
        await broadcast(room, 'chat', {
          room,
          text: data.payload?.text,
          from: ws.id,
          via: INSTANCE_ID,
        });
        break;
      }
      case 'ping':
        send(ws, envelope('pong', data.payload));
        break;
      default:
        send(ws, envelope('error', { message: `unknown type: ${data.type}` }));
    }
  });

  ws.on('close', () => leaveAll(ws));
});

// Heartbeat: ping → expect pong; else terminate
const hb = setInterval(() => {
  for (const client of wss.clients as Set<Client>) {
    if (client.isAlive === false) {
      leaveAll(client);
      client.terminate();
      continue;
    }
    client.isAlive = false;
    client.ping();
  }
}, HEARTBEAT_MS);

wss.on('close', () => clearInterval(hb));

httpServer.listen(PORT, () => {
  console.log(`WS hub ${INSTANCE_ID} on ws://localhost:${PORT}/ws (Redis: ${REDIS_URL})`);
});
