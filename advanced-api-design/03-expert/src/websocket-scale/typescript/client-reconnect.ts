/**
 * Client reconnection with exponential backoff + jitter
 * Fallback note: if WS fails repeatedly, switch to SSE/long-poll in production apps
 */
import WebSocket from 'ws';

const URL = process.env.WS_URL || 'ws://localhost:7001/ws';
const BASE_MS = 1000;
const CAP_MS = 30_000;

function delay(attempt: number): number {
  const exp = Math.min(CAP_MS, BASE_MS * 2 ** attempt);
  const jitter = Math.random() * exp * 0.2;
  return exp + jitter;
}

function connect(attempt = 0) {
  console.log(`[connect] attempt=${attempt} url=${URL}`);
  const ws = new WebSocket(URL);

  ws.on('open', () => {
    console.log('[open]');
    attempt = 0;
    ws.send(JSON.stringify({ type: 'echo', payload: { hello: true } }));
  });

  ws.on('message', (d) => console.log('[msg]', String(d)));

  ws.on('close', (code, reason) => {
    console.log(`[close] code=${code} reason=${reason.toString()}`);
    // อย่า retry ถ้าเป็น auth (นโยบายตัวอย่าง: 4401)
    if (code === 4401) {
      console.error('auth failed — stop retrying');
      return;
    }
    const wait = delay(attempt);
    console.log(`[retry] in ${Math.round(wait)}ms`);
    setTimeout(() => connect(attempt + 1), wait);
  });

  ws.on('error', (err) => console.error('[error]', err.message));
}

connect();
