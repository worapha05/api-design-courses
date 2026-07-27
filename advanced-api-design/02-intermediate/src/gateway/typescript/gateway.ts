/**
 * Minimal API Gateway:
 * - Reverse proxy routing
 * - Token-bucket rate limiting per API key
 * - Request transformation (strip Authorization → X-User-Id)
 * - Simple JWT-like demo token (base64 payload) — NOT for production crypto
 *
 * Upstream mock: run `npx tsx upstream.ts` on :5001
 * Gateway: npx tsx gateway.ts on :8080
 */
import express, { Request, Response, NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT) || 8080;
const UPSTREAM = process.env.UPSTREAM || 'http://127.0.0.1:5001';

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();
const CAPACITY = 10;
const REFILL_PER_SEC = 2;

function takeToken(key: string): boolean {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: CAPACITY, updatedAt: now };
    buckets.set(key, b);
  }
  const elapsed = (now - b.updatedAt) / 1000;
  b.tokens = Math.min(CAPACITY, b.tokens + elapsed * REFILL_PER_SEC);
  b.updatedAt = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

/** Demo token: "user:<id>" base64 — replace with real JWT verify in production */
function parseDemoToken(auth?: string): { userId: string } | null {
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    const raw = Buffer.from(auth.slice(7), 'base64').toString('utf8');
    const [kind, userId] = raw.split(':');
    if (kind !== 'user' || !userId) return null;
    return { userId };
  } catch {
    return null;
  }
}

function authAndLimit(req: Request, res: Response, next: NextFunction) {
  const identity = parseDemoToken(req.header('authorization') ?? undefined);
  if (!identity) {
    return res.status(401).type('application/problem+json').json({
      title: 'Unauthorized',
      status: 401,
      detail: "Bearer token required (demo: base64 of 'user:<id>')",
    });
  }

  const key = identity.userId;
  if (!takeToken(key)) {
    res.setHeader('Retry-After', '1');
    return res.status(429).type('application/problem+json').json({
      title: 'Too Many Requests',
      status: 429,
      detail: 'rate limit exceeded',
    });
  }

  // Transformation: never forward raw Authorization to internal services
  req.headers['x-user-id'] = identity.userId;
  req.headers['x-request-id'] = req.header('x-request-id') || randomUUID();
  delete req.headers['authorization'];
  next();
}

const app = express();

app.get('/health', (_req, res) => res.json({ status: 'ok', role: 'gateway' }));

// External path /v1/orders/* → internal /orders/*
app.use(
  '/v1/orders',
  authAndLimit,
  createProxyMiddleware({
    target: UPSTREAM,
    changeOrigin: true,
    pathRewrite: { '^/v1/orders': '/orders' },
    on: {
      proxyReq: (proxyReq, req) => {
        const r = req as Request;
        if (r.headers['x-user-id']) proxyReq.setHeader('X-User-Id', String(r.headers['x-user-id']));
        if (r.headers['x-request-id'])
          proxyReq.setHeader('X-Request-Id', String(r.headers['x-request-id']));
      },
    },
  }),
);

app.listen(PORT, () => {
  const demo = Buffer.from('user:alice').toString('base64');
  console.log(`API Gateway on :${PORT} → ${UPSTREAM}`);
  console.log(`Demo token: Bearer ${demo}`);
  console.log(`Try: curl -H "Authorization: Bearer ${demo}" http://localhost:${PORT}/v1/orders`);
});
