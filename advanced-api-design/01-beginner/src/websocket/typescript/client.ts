/**
 * Basic WebSocket client — connect, chat, ping/pong
 */
import WebSocket from 'ws';

const url = process.env.WS_URL ?? 'ws://localhost:3001/ws';
const ws = new WebSocket(url);

ws.on('open', () => {
  console.log('[client] connected');
  ws.send(JSON.stringify({ type: 'ping', payload: { t: Date.now() } }));
  ws.send(JSON.stringify({ type: 'chat', payload: { text: 'hello from beginner client' } }));
  ws.send(JSON.stringify({ type: 'echo', payload: { demo: true } }));
});

ws.on('message', (data) => {
  console.log('[client] recv:', String(data));
});

ws.on('close', (code, reason) => {
  console.log(`[client] closed code=${code} reason=${reason.toString()}`);
});

ws.on('error', (err) => console.error('[client] error', err.message));

// keep process alive briefly then exit
setTimeout(() => {
  ws.close(1000, 'demo done');
}, 3000);
